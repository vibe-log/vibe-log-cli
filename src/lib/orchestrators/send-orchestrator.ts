import { requireAuth, getToken } from '../auth/token';
import { readClaudeSessions } from '../readers/claude';
import { apiClient, Session } from '../api-client';
import { 
  getProjectSyncData,
  updateProjectSyncBoundaries,
  setLastSyncSummary
} from '../config';
import { parseProjectName } from '../ui/project-display';
import { VibelogError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { MessageSanitizer } from '../message-sanitizer';
import { logHookError } from '../hook-utils';
import { SessionData } from '../readers/types';
import { SelectedSessionInfo } from '../ui/session-selector';
import { analyzeProject } from '../claude-core';
import path from 'path';
import fs from 'fs/promises';
import { filterImageContent } from '../readers/image-filter';

export interface SendOptions {
  dry?: boolean;
  all?: boolean;
  silent?: boolean;
  hookTrigger?: string;
  hookVersion?: string;
  test?: boolean;
  background?: boolean;
  selectedSessions?: SelectedSessionInfo[];
  skipActionMenu?: boolean;
  claudeProjectDir?: string;
  fromMenu?: boolean;  // Indicates call is from interactive menu
  isInitialSync?: boolean;  // Indicates this is initial sync during hook setup
}

// Use Session type from api-client for consistency
export type ApiSession = Session;

export class SendOrchestrator {
  private sanitizer = new MessageSanitizer();

  async execute(options: SendOptions): Promise<void> {
    // Authenticate
    await this.authenticate(options);

    // Load sessions
    const sessions = await this.loadSessions(options);

    if (sessions.length === 0) {
      this.handleNoSessions(options);
      return;
    }

    // Sanitize and transform sessions
    const apiSessions = await this.sanitizeSessions(sessions, options);

    // Handle dry run
    if (options.dry) {
      this.handleDryRun(options);
      return;
    }

    // Upload sessions
    const results = await this.uploadSessions(apiSessions, options);

    // Update sync state
    await this.updateSyncState(sessions, options);

    // Log results
    this.logResults(results, options);
  }

  async authenticate(options: SendOptions): Promise<void> {
    if (options.silent) {
      const token = await getToken();
      if (!token) {
        await logHookError('Auth check', new Error('No authentication token found'));
        logger.error('No auth token, skipping silent send');
        throw new VibelogError('Not authenticated', 'AUTH_REQUIRED');
      }
    } else {
      await requireAuth();
    }
  }

  async loadSessions(options: SendOptions): Promise<SessionData[]> {
    // Handle pre-selected sessions
    if (options.selectedSessions && options.selectedSessions.length > 0) {
      return this.readSelectedSessions(options.selectedSessions);
    }

    // IMPORTANT: --all flag takes precedence over claudeProjectDir
    // This ensures global hooks capture all projects regardless of CLAUDE_PROJECT_DIR
    if (options.all) {
      // For --all mode, don't use project-specific date filtering
      const sessions = await readClaudeSessions({ since: undefined });
      return sessions;
    }

    // Determine date filter only for non-all modes
    const sinceDate = this.determineSinceDate(options);

    // Handle explicit Claude project directory (only when --all is not set)
    if (options.claudeProjectDir && options.claudeProjectDir.trim() !== '') {
      return this.loadProjectSessions(options.claudeProjectDir, sinceDate);
    }

    // Load all sessions and filter to current directory (default behavior)
    const sessions = await readClaudeSessions({ since: sinceDate });
    const currentDir = process.cwd();
    return sessions.filter(session => {
      const sessionPath = path.normalize(session.projectPath).toLowerCase();
      const currentPath = path.normalize(currentDir).toLowerCase();
      return sessionPath === currentPath || sessionPath.startsWith(currentPath + path.sep);
    });
  }

  private determineSinceDate(options: SendOptions): Date | undefined {
    if (options.hookTrigger && options.claudeProjectDir) {
      const claudeFolderName = parseProjectName(options.claudeProjectDir);
      const projectSync = getProjectSyncData(claudeFolderName);
      
      if (projectSync?.newestSyncedTimestamp) {
        return new Date(projectSync.newestSyncedTimestamp);
      }
      
      // First sync - default to 30 days
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Manual sync - no date filter
    return undefined;
  }

  private async loadProjectSessions(claudeProjectDir: string, sinceDate?: Date): Promise<SessionData[]> {
    const dirName = parseProjectName(claudeProjectDir);
    const project = await analyzeProject(claudeProjectDir, dirName);
    
    if (!project) {
      logger.warn('Invalid Claude project directory provided');
      return [];
    }
    
    return readClaudeSessions({
      since: sinceDate,
      projectPath: project.actualPath
    });
  }

  private async readSelectedSessions(selectedInfo: SelectedSessionInfo[]): Promise<SessionData[]> {
    const sessions: SessionData[] = [];
    const failedFiles: string[] = [];
    
    for (const info of selectedInfo) {
      try {
        const filePath = path.join(info.projectPath, info.sessionFile);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        
        const messages: any[] = [];
        let metadata: any = null;
        const editedFiles = new Set<string>();
        const languages = new Set<string>();
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const data = JSON.parse(line);
            
            if (!metadata && data.sessionId && data.cwd && data.timestamp) {
              metadata = {
                id: data.sessionId,
                projectPath: data.cwd,
                timestamp: new Date(data.timestamp),
              };
            }
            
            if (data.message && data.timestamp) {
              const filteredContent = filterImageContent(data.message.content);
              
              messages.push({
                role: data.message.role,
                content: filteredContent,
                timestamp: new Date(data.timestamp),
              });
            }
            
            if (data.toolUseResult && (data.toolUseResult.type === 'create' || data.toolUseResult.type === 'update')) {
              const filePath = data.toolUseResult.filePath;
              if (filePath) {
                editedFiles.add(filePath);
                const ext = path.extname(filePath).slice(1).toLowerCase();
                if (ext) {
                  languages.add(ext);
                }
              }
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
        
        if (metadata && messages.length > 0) {
          const duration = messages.length >= 2
            ? Math.max(0, Math.floor((messages[messages.length - 1].timestamp.getTime() - messages[0].timestamp.getTime()) / 1000))
            : 0;
          
          sessions.push({
            ...metadata,
            messages,
            duration,
            tool: 'claude_code',
            metadata: {
              files_edited: editedFiles.size,
              languages: Array.from(languages),
            },
          });
        }
      } catch (error) {
        failedFiles.push(info.sessionFile);
        logger.warn(`Skipping corrupted session file ${info.sessionFile}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    if (failedFiles.length > 0) {
      logger.warn(`Failed to read ${failedFiles.length} session file(s). Continuing with ${sessions.length} valid sessions.`);
    }
    
    return sessions;
  }

  async sanitizeSessions(sessions: SessionData[], options?: SendOptions): Promise<ApiSession[]> {
    const apiSessions: ApiSession[] = [];
    const MIN_DURATION_SECONDS = 240; // 4 minutes minimum as required by server
    
    // Track filtered sessions for logging
    let filteredCount = 0;
    
    for (const session of sessions) {
      // Filter out sessions that are too short
      if (session.duration < MIN_DURATION_SECONDS) {
        filteredCount++;
        logger.debug(`Filtering out short session (${session.duration}s < ${MIN_DURATION_SECONDS}s) from ${session.projectPath}`);
        continue;
      }
      
      const sanitizedMessages = this.sanitizer.sanitizeMessages(session.messages);
      const projectName = parseProjectName(session.projectPath);
      
      apiSessions.push({
        tool: session.tool,
        timestamp: session.timestamp.toISOString(),
        duration: session.duration,
        data: {
          projectName,
          messageSummary: JSON.stringify(sanitizedMessages),
          messageCount: session.messages.length,
          metadata: {
            files_edited: session.metadata?.files_edited || 0,
            languages: session.metadata?.languages || [],
          },
        },
      });
    }
    
    // Log if sessions were filtered
    if (filteredCount > 0) {
      logger.info(`Filtered out ${filteredCount} session(s) shorter than 4 minutes`);
      
      // If all sessions were filtered
      if (apiSessions.length === 0) {
        // During initial sync from hooks setup, don't throw error
        if (options?.isInitialSync) {
          logger.info('No sessions longer than 4 minutes found for initial sync');
          return apiSessions; // Return empty array, let calling code handle it gracefully
        }
        
        // For regular sync, throw error
        throw new VibelogError(
          `All ${filteredCount} session(s) were shorter than 4 minutes. Sessions must be at least 4 minutes long to upload.`,
          'VALIDATION_ERROR'
        );
      }
    }
    
    return apiSessions;
  }

  async uploadSessions(
    apiSessions: ApiSession[], 
    options: SendOptions,
    onProgress?: (current: number, total: number, sizeKB?: number) => void
  ): Promise<any> {
    try {
      if (process.env.VIBELOG_DEBUG === 'true') {
        console.log('[DEBUG] SendOrchestrator.uploadSessions called with', apiSessions.length, 'sessions');
      }
      logger.debug(`Uploading ${apiSessions.length} sessions to API`);
      const result = await apiClient.uploadSessions(apiSessions, onProgress);
      if (process.env.VIBELOG_DEBUG === 'true') {
        console.log('[DEBUG] Upload completed successfully');
      }
      return result;
    } catch (error) {
      if (process.env.VIBELOG_DEBUG === 'true') {
        console.log('[DEBUG] SendOrchestrator upload error:', error);
      }
      if (options.silent) {
        await logHookError('Upload sessions', error);
        logger.error('Failed to upload sessions');
      }
      throw error;
    }
  }

  async updateSyncState(sessions: SessionData[], options: SendOptions): Promise<void> {
    if (sessions.length === 0) return;
    
    const sortedSessions = [...sessions].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    const oldestSession = sortedSessions[0];
    const newestSession = sortedSessions[sortedSessions.length - 1];
    
    if (options.claudeProjectDir) {
      const claudeFolderName = parseProjectName(options.claudeProjectDir);
      const projectName = parseProjectName(process.cwd());
      
      updateProjectSyncBoundaries(
        claudeFolderName,
        oldestSession.timestamp.toISOString(),
        newestSession.timestamp.toISOString(),
        projectName,
        sessions.length
      );
      
      setLastSyncSummary(projectName);
    } else if (options.all) {
      setLastSyncSummary('all projects');
    } else {
      const projectName = parseProjectName(process.cwd());
      setLastSyncSummary(projectName);
    }
  }

  private handleNoSessions(options: SendOptions): void {
    if (options.silent) {
      logger.info('No sessions found');
      return;
    }
    
    // Logged warnings handled by UI layer
    logger.debug('No sessions to upload');
  }

  private handleDryRun(options: SendOptions): void {
    if (options.silent) {
      logger.info('Dry run - no data sent');
    } else {
      logger.debug('Dry run mode - skipping upload');
    }
  }

  private logResults(results: any, options: SendOptions): void {
    if (options.silent) {
      logger.info('Sessions uploaded successfully');
    } else {
      logger.debug('Upload completed', { results });
    }
  }
}