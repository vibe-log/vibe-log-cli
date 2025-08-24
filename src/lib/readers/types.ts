export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ModelUsageStats {
  models: string[];                    // All unique models used
  primaryModel: string | null;         // Most frequently used model
  modelUsage: Record<string, number>;  // Model ID -> message count
  modelSwitches: number;                // Number of times model changed
}

export interface SessionMetadata {
  id: string;
  projectPath: string;
  timestamp: Date;
  claudeSessionId?: string;  // Claude's unique session identifier
}

export interface SessionData extends SessionMetadata {
  messages: Message[];
  duration: number;
  tool: 'claude_code' | 'cursor' | 'vscode';
  metadata?: {
    files_edited: number;
    languages: string[];
  };
  modelInfo?: ModelUsageStats;  // Model usage information
  // Source file information for re-reading if needed
  sourceFile?: {
    claudeProjectPath: string;  // e.g., ~/.claude/projects/-Users-danny-vibe-log
    sessionFile: string;         // e.g., session-123.jsonl
  };
}

export interface ReaderOptions {
  since?: Date;
  projectPath?: string;
  limit?: number;
}