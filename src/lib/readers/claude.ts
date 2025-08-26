import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SessionData, Message, ReaderOptions } from './types';
import { VibelogError } from '../../utils/errors';
import { filterImageContent } from './image-filter';
import { extractLanguagesFromSession } from '../language-extractor';

interface ClaudeMessage {
  role: string;
  content: string | any[];  // Content can be string or array of content items
  timestamp: string;
  model?: string;  // Model ID for assistant messages
}

interface ClaudeLogEntry {
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  message?: ClaudeMessage;
  type?: string;
  files?: string[];
  toolUseResult?: {
    type: string;
    filePath?: string;
  };
}

/**
 * Quickly extract session timestamp from first few lines of JSONL file
 * Returns null if no timestamp found or file can't be read
 */
async function quickExtractTimestamp(filePath: string): Promise<Date | null> {
  try {
    // Read only first 2KB of file (should contain timestamp in first few lines)
    const fd = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(2048);
    const { bytesRead } = await fd.read(buffer, 0, 2048, 0);
    await fd.close();
    
    if (bytesRead === 0) return null;
    
    // Convert buffer to string and split into lines
    const content = buffer.toString('utf-8', 0, bytesRead);
    const lines = content.split('\n').slice(0, 10); // Check first 10 lines max
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const data = JSON.parse(line);
        if (data.timestamp) {
          return new Date(data.timestamp);
        }
      } catch {
        // Invalid JSON line, skip
        continue;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

export async function readClaudeSessions(
  options: ReaderOptions = {}
): Promise<SessionData[]> {
  const claudePath = path.join(os.homedir(), '.claude', 'projects');

  try {
    await fs.access(claudePath);
  } catch (error) {
    throw new VibelogError(
      'Claude Code data not found. Make sure Claude Code is installed and you have used it at least once.',
      'CLAUDE_NOT_FOUND'
    );
  }

  const sessions: SessionData[] = [];
  const projects = await fs.readdir(claudePath);

  for (const project of projects) {
    const projectPath = path.join(claudePath, project);
    const stat = await fs.stat(projectPath);
    
    if (!stat.isDirectory()) continue;

    const files = await fs.readdir(projectPath);
    const logFiles = files.filter((f) => f.endsWith('.jsonl'));

    for (const file of logFiles) {
      const filePath = path.join(projectPath, file);
      
      // OPTIMIZATION 1: Skip files older than the since date
      if (options.since) {
        const fileStat = await fs.stat(filePath);
        if (fileStat.mtime < options.since) {
          // File hasn't been modified since our cutoff date, skip it entirely
          continue;
        }
        
        // OPTIMIZATION 2: Quick check of session timestamp
        const sessionTimestamp = await quickExtractTimestamp(filePath);
        if (sessionTimestamp && sessionTimestamp < options.since) {
          // Session started before our cutoff date, skip it
          continue;
        }
      }
      
      // Now read and parse the full file
      const session = await parseSessionFile(filePath);
      
      if (session) {
        // Apply filters (timestamp check now redundant but kept for safety)
        if (options.since && session.timestamp < options.since) continue;
        // Filter by project path - include exact matches and subdirectories
        if (options.projectPath) {
          const normalizedSessionPath = path.normalize(session.projectPath).toLowerCase();
          const normalizedFilterPath = path.normalize(options.projectPath).toLowerCase();
          
          // Check if session is in the target directory or a subdirectory
          if (!normalizedSessionPath.startsWith(normalizedFilterPath)) {
            continue;
          }
        }
        
        // Add source file information for re-reading
        session.sourceFile = {
          claudeProjectPath: projectPath,
          sessionFile: file
        };
        
        sessions.push(session);
        
        if (options.limit && sessions.length >= options.limit) {
          break;
        }
      }
    }
    
    if (options.limit && sessions.length >= options.limit) {
      break;
    }
  }

  return sessions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

async function parseSessionFile(filePath: string): Promise<SessionData | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    const messages: Message[] = [];
    let metadata: {
      id: string;
      projectPath: string;
      timestamp: Date;
      claudeSessionId?: string;
    } | null = null;
    const editedFiles = new Set<string>();
    
    // Model tracking variables
    const modelStats: Record<string, number> = {};
    let lastModel: string | null = null;
    let modelSwitches = 0;
    
    // Planning mode tracking variables
    const exitPlanTimestamps: Date[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const data: ClaudeLogEntry = JSON.parse(line);

        // Extract session metadata from first valid entry
        if (!metadata && data.sessionId && data.cwd && data.timestamp) {
          metadata = {
            id: data.sessionId,
            projectPath: data.cwd,
            timestamp: new Date(data.timestamp),
            claudeSessionId: data.sessionId,  // Store the Claude session ID
          };
        }

        // Extract messages and track model usage
        if (data.message && data.timestamp) {
          // Check for ExitPlanMode tool usage in message content
          if (data.message.content && Array.isArray(data.message.content)) {
            for (const item of data.message.content) {
              if (item.type === 'tool_use' && item.name === 'ExitPlanMode') {
                exitPlanTimestamps.push(new Date(data.timestamp));
              }
            }
          }
          
          // Filter images from content before adding to messages
          const filteredContent = filterImageContent(data.message.content);
          
          messages.push({
            role: data.message.role as 'user' | 'assistant',
            content: filteredContent,
            timestamp: new Date(data.timestamp),
          });
          
          // Track model usage for assistant messages
          if (data.message.role === 'assistant' && data.message.model) {
            modelStats[data.message.model] = (modelStats[data.message.model] || 0) + 1;
            
            // Track model switches
            if (lastModel && lastModel !== data.message.model) {
              modelSwitches++;
            }
            lastModel = data.message.model;
          }
        }

        // Track edited files from toolUseResult (for backward compatibility)
        if (data.toolUseResult && (data.toolUseResult.type === 'create' || data.toolUseResult.type === 'update')) {
          const filePath = data.toolUseResult.filePath;
          if (filePath) {
            editedFiles.add(filePath);
          }
        }
      } catch (err) {
        // Skip invalid JSON lines
        continue;
      }
    }

    if (!metadata || messages.length === 0) return null;

    const duration = calculateDuration(messages);
    
    // Use the language extractor to get all languages used in the session
    const languages = extractLanguagesFromSession(lines);
    
    // Prepare model info if models were detected
    let modelInfo: SessionData['modelInfo'] = undefined;
    if (Object.keys(modelStats).length > 0) {
      const models = Object.keys(modelStats);
      const primaryModel = models.reduce((a, b) => 
        modelStats[a] > modelStats[b] ? a : b
      );
      
      modelInfo = {
        models,
        primaryModel,
        modelUsage: modelStats,
        modelSwitches,
      };
    }
    
    // Prepare planning mode info if detected
    let planningModeInfo: SessionData['planningModeInfo'] = undefined;
    if (exitPlanTimestamps.length > 0) {
      planningModeInfo = {
        hasPlanningMode: true,
        planningCycles: exitPlanTimestamps.length,
        exitPlanTimestamps: exitPlanTimestamps,
      };
    }

    return {
      ...metadata,
      messages,
      duration,
      tool: 'claude_code',
      metadata: {
        files_edited: editedFiles.size,
        languages: languages,
      },
      modelInfo,
      planningModeInfo,
    };
  } catch (error) {
    console.error(`Error parsing session file ${filePath}:`, error);
    return null;
  }
}

function calculateDuration(messages: Message[]): number {
  if (messages.length < 2) return 0;

  const firstTimestamp = messages[0].timestamp.getTime();
  const lastTimestamp = messages[messages.length - 1].timestamp.getTime();

  // Ensure duration is never negative (can happen if timestamps are out of order)
  return Math.max(0, Math.floor((lastTimestamp - firstTimestamp) / 1000)); // Convert to seconds
}