import path from 'path';
import crypto from 'crypto';
import { SessionData, Message, ModelUsageStats, PlanningModeInfo } from '../readers/types';

/**
 * Cursor-specific message interface (from cursor reader)
 */
export interface CursorMessage {
  text: string;
  type: number; // 1 = user, 2 = assistant
  bubbleId?: string;
  timestamp: number; // Unix timestamp in milliseconds
}

/**
 * Cursor conversation metadata
 */
export interface CursorConversation {
  composerId: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  workspacePath?: string;
  messages: CursorMessage[];
}

/**
 * Result of converting Cursor sessions to SessionData format
 */
export interface ConversionResult {
  sessions: SessionData[];
  skippedSessions: {
    composerId: string;
    reason: string;
  }[];
  totalProcessed: number;
}

/**
 * Convert Cursor conversations to vibe-log SessionData format
 */
export class CursorSessionConverter {
  private static readonly MIN_DURATION_SECONDS = 240; // 4 minutes minimum
  private static readonly MAX_GAP_MINUTES = 15; // Max gap between messages
  private static readonly MAX_SESSION_HOURS = 8; // Cap session duration

  /**
   * Convert multiple Cursor conversations to SessionData format
   */
  public static convertConversations(
    conversations: CursorConversation[]
  ): ConversionResult {
    const sessions: SessionData[] = [];
    const skippedSessions: { composerId: string; reason: string }[] = [];
    let totalProcessed = 0;

    for (const conversation of conversations) {
      totalProcessed++;

      try {
        const session = this.convertSingleConversation(conversation);

        // Skip sessions that don't meet minimum duration
        if (session.duration < this.MIN_DURATION_SECONDS) {
          skippedSessions.push({
            composerId: conversation.composerId,
            reason: `Duration ${session.duration}s below minimum ${this.MIN_DURATION_SECONDS}s`,
          });
          continue;
        }

        sessions.push(session);
      } catch (error) {
        skippedSessions.push({
          composerId: conversation.composerId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      sessions,
      skippedSessions,
      totalProcessed,
    };
  }

  /**
   * Convert a single Cursor conversation to SessionData
   */
  private static convertSingleConversation(
    conversation: CursorConversation
  ): SessionData {
    // Validate conversation has messages
    if (!conversation.messages || conversation.messages.length === 0) {
      throw new Error('Conversation has no messages');
    }

    // Convert messages to vibe-log format
    const messages = this.convertMessages(conversation.messages);

    // Calculate session duration from conversation timestamps (not message timestamps)
    // Modern Cursor format: all messages have same timestamp, so use createdAt/lastUpdatedAt
    const duration = this.calculateDurationFromConversation(conversation);

    // Extract metadata
    const metadata = this.extractMetadata(conversation.messages);

    // Extract model info (Cursor may not have this data)
    const modelInfo = this.extractModelInfo(conversation.messages);

    // Extract project information
    const projectPath = conversation.workspacePath || 'unknown-cursor-project';

    // Determine timestamp (earliest message)
    const timestamp = new Date(
      Math.min(...conversation.messages.map((m) => m.timestamp))
    );

    // Generate unique session ID
    const sessionId = this.generateSessionId(conversation.composerId, timestamp);

    return {
      id: sessionId,
      projectPath,
      timestamp,
      claudeSessionId: conversation.composerId, // Map composerId to claudeSessionId
      messages,
      duration,
      tool: 'cursor',
      metadata: {
        files_edited: metadata.filesEdited,
        languages: metadata.languages,
      },
      modelInfo,
      planningModeInfo: this.createEmptyPlanningInfo(), // Cursor doesn't have planning mode
      gitBranch: undefined, // Cursor DB doesn't track git branch
    };
  }

  /**
   * Convert Cursor messages to vibe-log Message format
   */
  private static convertMessages(cursorMessages: CursorMessage[]): Message[] {
    return cursorMessages.map((msg) => ({
      role: msg.type === 1 ? 'user' : msg.type === 2 ? 'assistant' : 'system',
      content: msg.text,
      timestamp: new Date(msg.timestamp),
    }));
  }

  /**
   * Calculate session duration from message timestamps
   * Same logic as Claude Code sessions - excludes gaps > 15 min, caps at 8 hours
   */
  private static calculateDuration(messages: CursorMessage[]): number {
    if (messages.length === 0) return 0;
    if (messages.length === 1) return 60; // Default 1 minute for single message

    const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);
    let totalDuration = 0;
    const maxGapMs = this.MAX_GAP_MINUTES * 60 * 1000;

    for (let i = 1; i < sortedMessages.length; i++) {
      const gap = sortedMessages[i].timestamp - sortedMessages[i - 1].timestamp;

      // Skip gaps longer than MAX_GAP_MINUTES (likely idle time)
      if (gap <= maxGapMs) {
        totalDuration += gap;
      }
    }

    // Convert to seconds
    let durationSeconds = Math.floor(totalDuration / 1000);

    // Cap at MAX_SESSION_HOURS
    const maxSeconds = this.MAX_SESSION_HOURS * 60 * 60;
    if (durationSeconds > maxSeconds) {
      durationSeconds = maxSeconds;
    }

    // Ensure at least 60 seconds for multi-message sessions
    return Math.max(60, durationSeconds);
  }

  /**
   * Calculate session duration from conversation timestamps
   * Uses createdAt and lastUpdatedAt from the conversation metadata
   * This is more reliable for modern Cursor format where all messages have the same timestamp
   */
  private static calculateDurationFromConversation(conversation: CursorConversation): number {
    // If we have both timestamps, use them
    if (conversation.createdAt && conversation.lastUpdatedAt) {
      const durationMs = conversation.lastUpdatedAt - conversation.createdAt;
      let durationSeconds = Math.floor(durationMs / 1000);

      // Cap at MAX_SESSION_HOURS
      const maxSeconds = this.MAX_SESSION_HOURS * 60 * 60;
      if (durationSeconds > maxSeconds) {
        durationSeconds = maxSeconds;
      }

      // Return at least 60 seconds if we have multiple messages
      return conversation.messages.length > 1 ? Math.max(60, durationSeconds) : durationSeconds;
    }

    // Fallback to message-based calculation (for legacy format)
    return this.calculateDuration(conversation.messages);
  }

  /**
   * Extract metadata from messages (files, commands, languages)
   * Parses message text for file mentions and command executions
   */
  private static extractMetadata(messages: CursorMessage[]): {
    filesEdited: number;
    languages: string[];
  } {
    const files = new Set<string>();
    const languages = new Set<string>();

    // Parse messages for file mentions and language indicators
    for (const msg of messages) {
      // Extract file paths from common patterns
      const fileMatches = [
        ...msg.text.matchAll(/(?:file|path):\s*([^\s,;]+\.[a-zA-Z0-9]+)/gi),
        ...msg.text.matchAll(/`([^`]+\.[a-zA-Z0-9]+)`/g),
        ...msg.text.matchAll(/edited?\s+([^\s,;]+\.[a-zA-Z0-9]+)/gi),
      ];

      for (const match of fileMatches) {
        const filePath = match[1];
        if (filePath) {
          files.add(filePath);

          // Extract language from file extension
          const ext = path.extname(filePath).toLowerCase().slice(1);
          const language = this.mapExtensionToLanguage(ext);
          if (language) {
            languages.add(language);
          }
        }
      }

      // Extract languages from code blocks
      const codeBlockMatches = msg.text.matchAll(/```(\w+)/g);
      for (const match of codeBlockMatches) {
        const lang = match[1].toLowerCase();
        if (lang && lang !== 'text' && lang !== 'plaintext') {
          languages.add(lang);
        }
      }
    }

    return {
      filesEdited: files.size,
      languages: Array.from(languages),
    };
  }

  /**
   * Extract model information from messages
   * Note: Cursor DB may not track model info, returns empty if not available
   */
  private static extractModelInfo(_messages: CursorMessage[]): ModelUsageStats | undefined {
    // Cursor database doesn't typically store model information
    // Could be enhanced in future if Cursor adds this data
    return undefined;
  }

  /**
   * Map file extension to language name
   */
  private static mapExtensionToLanguage(ext: string): string | null {
    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      kt: 'kotlin',
      swift: 'swift',
      c: 'c',
      cpp: 'cpp',
      cc: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      php: 'php',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
      sql: 'sql',
      sh: 'shell',
      bash: 'bash',
      zsh: 'zsh',
    };

    return languageMap[ext] || null;
  }

  /**
   * Create empty planning mode info (Cursor doesn't have planning mode)
   */
  private static createEmptyPlanningInfo(): PlanningModeInfo {
    return {
      hasPlanningMode: false,
      planningCycles: 0,
      exitPlanTimestamps: [],
    };
  }

  /**
   * Generate unique session ID from composerId and timestamp
   */
  private static generateSessionId(composerId: string, timestamp: Date): string {
    const hash = crypto
      .createHash('sha256')
      .update(`cursor-${composerId}-${timestamp.toISOString()}`)
      .digest('hex');

    return `cursor-${hash.slice(0, 16)}`;
  }
}
