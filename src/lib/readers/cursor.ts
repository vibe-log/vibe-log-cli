import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { VibelogError } from '../../utils/errors';

interface CursorConversation {
  composerId: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  conversation?: Array<{
    type: number; // 1 = user, 2 = assistant
    text: string;
    timestamp?: string;
  }>;
  fullConversationHeadersOnly?: Array<{
    bubbleId: string;
    type: number;
  }>;
  _v?: number; // Modern format has version field
}

interface CursorMessageCount {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  conversationCount: number;
}

/**
 * Get the Cursor database path based on platform
 */
function getCursorDatabasePath(): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
  } else if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming');
    return path.join(appData, 'Cursor/User/globalStorage/state.vscdb');
  } else {
    // Linux
    return path.join(os.homedir(), '.config/Cursor/User/globalStorage/state.vscdb');
  }
}

/**
 * Check if Cursor is installed on this system (cross-platform)
 * @returns true if Cursor database exists, false otherwise
 */
export function isCursorInstalled(): boolean {
  try {
    const dbPath = getCursorDatabasePath();
    return fs.existsSync(dbPath);
  } catch (error) {
    return false;
  }
}

/**
 * Check if conversation is legacy format
 */
function isLegacyConversation(conversation: any): boolean {
  return conversation &&
    typeof conversation.composerId === 'string' &&
    Array.isArray(conversation.conversation) &&
    !conversation._v;
}

/**
 * Check if conversation is modern format
 */
function isModernConversation(conversation: any): boolean {
  return conversation &&
    typeof conversation.composerId === 'string' &&
    typeof conversation._v === 'number' &&
    Array.isArray(conversation.fullConversationHeadersOnly);
}

/**
 * Count messages from Cursor IDE conversations
 * @param options Optional filters (e.g., since date)
 */
interface CursorMessage {
  text: string;
  type: number; // 1 = user, 2 = assistant
  bubbleId?: string;
  timestamp: number; // Unix timestamp in milliseconds
}

export interface CursorMessagesResult {
  messages: CursorMessage[]; // New messages since last check
  allMessages: CursorMessage[]; // All messages for time-based stats
  totalCount: number;
  maxTimestamp: number; // Latest message timestamp for next check
}

/**
 * Get Cursor messages since a specific timestamp
 * @param sinceTimestamp Unix timestamp in milliseconds (0 = get all messages)
 */
/**
 * Get Cursor conversations with full metadata (composerId, timestamps)
 * This preserves conversation structure instead of flattening messages
 */
export async function getCursorConversations(
  sinceTimestamp: number
): Promise<{
  conversations: Array<{
    composerId: string;
    messages: CursorMessage[];
    createdAt: number;
    lastUpdatedAt: number;
    workspacePath?: string;
  }>;
  totalCount: number;
}> {
  const dbPath = getCursorDatabasePath();
  let db: Database.Database | null = null;

  try {
    db = new Database(dbPath, { readonly: true });

    const sql = `
      SELECT value FROM cursorDiskKV
      WHERE key LIKE 'composerData:%'
      AND length(value) > 1000
    `;

    const stmt = db.prepare(sql);
    const rows = stmt.all() as Array<{ value: string }>;

    const conversations: Array<{
      composerId: string;
      messages: CursorMessage[];
      createdAt: number;
      lastUpdatedAt: number;
      workspacePath?: string;
    }> = [];
    let totalMessageCount = 0;

    for (const row of rows) {
      try {
        const conversation = JSON.parse(row.value) as CursorConversation;
        const messages: CursorMessage[] = [];

        if (isLegacyConversation(conversation)) {
          // Legacy format
          const convMessages = conversation.conversation || [];
          for (const message of convMessages) {
            let timestamp: number;
            if (message.timestamp) {
              timestamp = new Date(message.timestamp).getTime();
            } else {
              timestamp = Date.now();
            }

            // Filter by sinceTimestamp
            if (timestamp > sinceTimestamp) {
              messages.push({
                text: message.text,
                type: message.type,
                timestamp
              });
            }
          }
        } else if (isModernConversation(conversation)) {
          // Modern format
          const composerId = conversation.composerId;
          const headers = conversation.fullConversationHeadersOnly || [];
          const conversationTimestamp = conversation.createdAt || conversation.lastUpdatedAt || Date.now();

          // Filter conversation by timestamp
          if (conversationTimestamp > sinceTimestamp) {
            for (const header of headers) {
              // Process both user and assistant messages
              if (header.bubbleId) {
                const bubbleKey = `bubbleId:${composerId}:${header.bubbleId}`;

                try {
                  const bubbleQuery = db!.prepare('SELECT value FROM cursorDiskKV WHERE key = ?');
                  const bubbleRow = bubbleQuery.get(bubbleKey) as { value: string } | undefined;

                  if (bubbleRow) {
                    const bubble = JSON.parse(bubbleRow.value);
                    if (bubble.text) {
                      messages.push({
                        text: bubble.text,
                        type: header.type,
                        bubbleId: header.bubbleId,
                        timestamp: conversationTimestamp
                      });
                    }
                  }
                } catch (bubbleError) {
                  continue;
                }
              }
            }
          }
        }

        // Only include conversations with messages
        if (messages.length > 0) {
          conversations.push({
            composerId: conversation.composerId,
            messages,
            createdAt: conversation.createdAt || Date.now(),
            lastUpdatedAt: conversation.lastUpdatedAt || conversation.createdAt || Date.now(),
            workspacePath: undefined // Cursor DB doesn't store this
          });
          totalMessageCount += messages.length;
        }
      } catch (error) {
        continue;
      }
    }

    return {
      conversations,
      totalCount: totalMessageCount
    };
  } finally {
    if (db) {
      db.close();
    }
  }
}

export async function getCursorMessagesSince(
  sinceTimestamp: number
): Promise<CursorMessagesResult> {
  const dbPath = getCursorDatabasePath();
  let db: Database.Database | null = null;

  try {
    db = new Database(dbPath, { readonly: true });

    const sql = `
      SELECT value FROM cursorDiskKV
      WHERE key LIKE 'composerData:%'
      AND length(value) > 1000
    `;

    const stmt = db.prepare(sql);
    const rows = stmt.all() as Array<{ value: string }>;

    const allMessages: CursorMessage[] = [];

    for (const row of rows) {
      try {
        const conversation = JSON.parse(row.value) as CursorConversation;

        if (isLegacyConversation(conversation)) {
          // Legacy format - messages have text directly
          const messages = conversation.conversation || [];

          for (const message of messages) {
            let timestamp: number;

            if (message.timestamp) {
              timestamp = new Date(message.timestamp).getTime();
            } else {
              timestamp = Date.now();
            }

            allMessages.push({
              text: message.text,
              type: message.type,
              timestamp
            });
          }
        } else if (isModernConversation(conversation)) {
          // Modern format - need to look up bubble text separately
          const composerId = conversation.composerId;
          const headers = conversation.fullConversationHeadersOnly || [];

          // Use composer's createdAt as the conversation timestamp
          const conversationTimestamp = conversation.createdAt || conversation.lastUpdatedAt || Date.now();

          for (const header of headers) {
            // Only process assistant messages (type 2)
            if (header.type === 2 && header.bubbleId) {
              const bubbleKey = `bubbleId:${composerId}:${header.bubbleId}`;

              try {
                const bubbleQuery = db.prepare('SELECT value FROM cursorDiskKV WHERE key = ?');
                const bubbleRow = bubbleQuery.get(bubbleKey) as { value: string } | undefined;

                if (bubbleRow) {
                  const bubble = JSON.parse(bubbleRow.value);
                  if (bubble.text) {
                    allMessages.push({
                      text: bubble.text,
                      type: 2, // assistant
                      bubbleId: header.bubbleId,
                      timestamp: conversationTimestamp
                    });
                  }
                }
              } catch (bubbleError) {
                // Skip bubbles that can't be read
                continue;
              }
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    // Filter messages by timestamp (more reliable than array slicing)
    const newMessages = allMessages.filter(msg => msg.timestamp > sinceTimestamp);

    // Find the maximum timestamp for next check
    const maxTimestamp = allMessages.length > 0
      ? Math.max(...allMessages.map(m => m.timestamp))
      : sinceTimestamp;

    return {
      messages: newMessages,
      allMessages: allMessages, // Include all messages for time-based stats
      totalCount: allMessages.length,
      maxTimestamp: maxTimestamp
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new VibelogError(
        'Cursor IDE data not found.',
        'CURSOR_NOT_FOUND'
      );
    }
    throw new VibelogError(
      `Failed to read Cursor messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CURSOR_READ_ERROR'
    );
  } finally {
    if (db) {
      db.close();
    }
  }
}

export async function countCursorMessages(options?: {
  since?: Date;
}): Promise<CursorMessageCount> {
  const dbPath = getCursorDatabasePath();

  let db: Database.Database | null = null;

  try {
    // Open database in read-only mode
    db = new Database(dbPath, { readonly: true });

    // Query for all conversation data
    const sql = `
      SELECT value FROM cursorDiskKV
      WHERE key LIKE 'composerData:%'
      AND length(value) > 1000
    `;

    const stmt = db.prepare(sql);
    const rows = stmt.all() as Array<{ value: string }>;

    let totalMessages = 0;
    let userMessages = 0;
    let assistantMessages = 0;
    let conversationCount = 0;

    for (const row of rows) {
      try {
        const conversation = JSON.parse(row.value) as CursorConversation;

        let hasValidMessages = false;

        if (isLegacyConversation(conversation)) {
          // Legacy format - messages are in conversation array
          const messages = conversation.conversation || [];

          for (const message of messages) {
            // Apply date filter if provided
            if (options?.since && message.timestamp) {
              const messageDate = new Date(message.timestamp);
              if (messageDate < options.since) {
                continue;
              }
            }

            hasValidMessages = true;
            totalMessages++;

            if (message.type === 1) {
              userMessages++;
            } else {
              assistantMessages++;
            }
          }
        } else if (isModernConversation(conversation)) {
          // Modern format - messages are stored separately
          // For now, just count the headers (actual messages would require additional queries)
          const headers = conversation.fullConversationHeadersOnly || [];

          for (const header of headers) {
            hasValidMessages = true;
            totalMessages++;

            if (header.type === 1) {
              userMessages++;
            } else {
              assistantMessages++;
            }
          }
        }

        if (hasValidMessages) {
          conversationCount++;
        }
      } catch (error) {
        // Skip invalid JSON or parsing errors
        continue;
      }
    }

    return {
      totalMessages,
      userMessages,
      assistantMessages,
      conversationCount,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new VibelogError(
        'Cursor IDE data not found. Make sure Cursor is installed and you have used it at least once.',
        'CURSOR_NOT_FOUND'
      );
    }

    throw new VibelogError(
      `Failed to read Cursor database: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CURSOR_READ_ERROR'
    );
  } finally {
    // Close database connection
    if (db) {
      db.close();
    }
  }
}
