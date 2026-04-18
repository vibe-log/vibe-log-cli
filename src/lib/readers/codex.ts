import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SessionData, Message, ReaderOptions } from './types';
import { VibelogError } from '../../utils/errors';
import { extractLanguagesFromSession, getLanguageFromExtension, LANGUAGE_MAPPINGS } from '../language-extractor';

interface CodexReaderOptions extends ReaderOptions {
  codexHome?: string;
  includeArchived?: boolean;
}

interface CodexLogEntry {
  type?: string;
  timestamp?: string;
  payload?: any;
}

export function getCodexHomePath(): string {
  return process.env.VIBELOG_CODEX_HOME || path.join(os.homedir(), '.codex');
}

function getCodexSessionsPath(codexHome = getCodexHomePath()): string {
  return path.join(codexHome, 'sessions');
}

function getCodexArchivedSessionsPath(codexHome = getCodexHomePath()): string {
  return path.join(codexHome, 'archived_sessions');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function walkJsonlFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  if (!await pathExists(dir)) {
    return files;
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkJsonlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function quickExtractTimestamp(filePath: string): Promise<Date | null> {
  try {
    const fd = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
    await fd.close();

    const content = buffer.toString('utf8', 0, bytesRead);
    for (const line of content.split('\n').slice(0, 20)) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as CodexLogEntry;
        const timestamp = parsed.payload?.timestamp || parsed.timestamp;
        if (timestamp) {
          return new Date(timestamp);
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function extractCodexSessionId(filePath: string, payload?: any): string {
  if (typeof payload?.id === 'string' && payload.id.trim()) {
    return payload.id.trim();
  }

  const filename = path.basename(filePath, '.jsonl');
  const uuidMatch = filename.match(/([0-9a-f]{8}-[0-9a-f-]{27,})$/i);
  return uuidMatch?.[1] || filename;
}

function normalizeTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => normalizeTextContent(item))
      .filter(Boolean)
      .join('\n');
  }

  if (content && typeof content === 'object') {
    const item = content as Record<string, unknown>;
    if (typeof item.text === 'string') return item.text;
    if (typeof item.message === 'string') return item.message;
    if (typeof item.content === 'string' || Array.isArray(item.content)) {
      return normalizeTextContent(item.content);
    }
  }

  return '';
}

function extractMessage(entry: CodexLogEntry): Message | null {
  const payload = entry.payload || {};
  const timestamp = payload.timestamp || entry.timestamp;
  if (!timestamp) return null;

  if (entry.type === 'event_msg') {
    if (payload.type === 'user_message') {
      const content = normalizeTextContent(
        payload.message || payload.text || payload.text_elements || payload.content
      ).trim();
      if (!content) return null;
      return { role: 'user', content, timestamp: new Date(timestamp) };
    }

    if (payload.type === 'agent_message') {
      const content = normalizeTextContent(payload.message || payload.text || payload.content).trim();
      if (!content) return null;
      return { role: 'assistant', content, timestamp: new Date(timestamp) };
    }
  }

  if (entry.type === 'response_item' && payload.type === 'message') {
    const role = payload.role === 'assistant' ? 'assistant' : payload.role === 'user' ? 'user' : null;
    if (!role) return null;

    const content = normalizeTextContent(payload.content).trim();
    if (!content) return null;
    return { role, content, timestamp: new Date(timestamp) };
  }

  return null;
}

function extractEditedFilesFromPatch(argumentsValue: unknown, editedFiles: Set<string>): void {
  const text = typeof argumentsValue === 'string'
    ? argumentsValue
    : argumentsValue ? JSON.stringify(argumentsValue) : '';

  if (!text) return;

  for (const match of text.matchAll(/\*\*\* (?:Add|Update|Delete) File: ([^\n]+)/g)) {
    editedFiles.add(match[1].trim());
  }
}

function updateModelStats(model: string | undefined, stats: Record<string, number>): void {
  if (!model) return;
  stats[model] = (stats[model] || 0) + 1;
}

function buildModelInfo(modelStats: Record<string, number>): SessionData['modelInfo'] {
  const models = Object.keys(modelStats);
  if (models.length === 0) return undefined;

  const primaryModel = models.reduce((a, b) => modelStats[a] > modelStats[b] ? a : b);
  return {
    models,
    primaryModel,
    modelUsage: modelStats,
    modelSwitches: 0,
  };
}

function calculateDuration(messages: Message[]): number {
  if (messages.length < 2) return 0;

  let totalActiveTime = 0;
  const MAX_IDLE_GAP = 15 * 60;
  const MAX_SESSION_DURATION = 8 * 60 * 60;

  for (let i = 1; i < messages.length; i++) {
    const gapSeconds = Math.floor(
      (messages[i].timestamp.getTime() - messages[i - 1].timestamp.getTime()) / 1000
    );

    if (gapSeconds > 0 && gapSeconds <= MAX_IDLE_GAP) {
      totalActiveTime += gapSeconds;
    }
  }

  return Math.min(totalActiveTime, MAX_SESSION_DURATION);
}

function extractLanguagesFromFiles(files: Set<string>): string[] {
  const languages = new Set<string>();

  for (const file of files) {
    const basename = path.basename(file).toLowerCase();
    const basenameLanguage = LANGUAGE_MAPPINGS[basename];
    if (basenameLanguage) {
      languages.add(basenameLanguage);
      continue;
    }

    const ext = path.extname(file).slice(1).toLowerCase();
    if (!ext) continue;

    const language = getLanguageFromExtension(ext);
    if (language) {
      languages.add(language);
    }
  }

  return Array.from(languages).sort();
}

export async function parseCodexSessionFile(filePath: string): Promise<SessionData | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n');

    const messages: Message[] = [];
    const editedFiles = new Set<string>();
    const modelStats: Record<string, number> = {};
    let sessionId = '';
    let projectPath = '';
    let timestamp: Date | null = null;

    for (const line of lines) {
      if (!line.trim()) continue;

      let entry: CodexLogEntry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const payload = entry.payload || {};
      const entryTimestamp = payload.timestamp || entry.timestamp;
      if (!timestamp && entryTimestamp) {
        timestamp = new Date(entryTimestamp);
      }

      if (entry.type === 'session_meta') {
        sessionId = extractCodexSessionId(filePath, payload);
        if (typeof payload.cwd === 'string') {
          projectPath = payload.cwd;
        }
        continue;
      }

      if (entry.type === 'turn_context') {
        if (typeof payload.cwd === 'string' && !projectPath) {
          projectPath = payload.cwd;
        }
        if (typeof payload.model === 'string') {
          updateModelStats(payload.model, modelStats);
        }
        continue;
      }

      if (entry.type === 'response_item' && payload.type === 'function_call') {
        if (payload.name === 'apply_patch') {
          extractEditedFilesFromPatch(payload.arguments, editedFiles);
        }
      }

      const message = extractMessage(entry);
      if (message) {
        messages.push(message);
      }
    }

    if (!sessionId) {
      sessionId = extractCodexSessionId(filePath);
    }

    if (!timestamp && messages.length > 0) {
      timestamp = messages[0].timestamp;
    }

    if (!projectPath || !timestamp || messages.length === 0) {
      return null;
    }

    const languages = Array.from(new Set([
      ...extractLanguagesFromSession(lines),
      ...extractLanguagesFromFiles(editedFiles),
    ])).sort();
    const duration = calculateDuration(messages);

    return {
      id: sessionId,
      projectPath,
      timestamp,
      claudeSessionId: `codex:${sessionId}`,
      messages,
      duration,
      tool: 'codex',
      source: 'codex',
      metadata: {
        files_edited: editedFiles.size,
        languages,
      },
      modelInfo: buildModelInfo(modelStats),
      sourceFile: {
        source: 'codex',
        claudeProjectPath: path.dirname(filePath),
        sessionFile: path.basename(filePath),
        fullPath: filePath,
      },
    };
  } catch {
    return null;
  }
}

export async function readCodexSessions(
  options: CodexReaderOptions = {}
): Promise<SessionData[]> {
  const codexHome = options.codexHome || getCodexHomePath();
  const sessionsRoot = getCodexSessionsPath(codexHome);
  const archivedRoot = getCodexArchivedSessionsPath(codexHome);

  if (!await pathExists(codexHome)) {
    throw new VibelogError(
      'Codex data not found. Make sure Codex is installed and you have used it at least once.',
      'CODEX_NOT_FOUND'
    );
  }

  const files = [
    ...await walkJsonlFiles(sessionsRoot),
    ...(options.includeArchived === false ? [] : await walkJsonlFiles(archivedRoot)),
  ];

  const sessions: SessionData[] = [];

  for (const filePath of files) {
    if (options.since) {
      const stat = await fs.stat(filePath);
      if (stat.mtime < options.since) {
        continue;
      }

      const sessionTimestamp = await quickExtractTimestamp(filePath);
      if (sessionTimestamp && sessionTimestamp < options.since) {
        continue;
      }
    }

    const session = await parseCodexSessionFile(filePath);
    if (!session) continue;

    if (options.since && session.timestamp < options.since) continue;
    if (options.projectPath) {
      const normalizedSessionPath = path.normalize(session.projectPath).toLowerCase();
      const normalizedFilterPath = path.normalize(options.projectPath).toLowerCase();
      if (normalizedSessionPath !== normalizedFilterPath &&
          !normalizedSessionPath.startsWith(normalizedFilterPath + path.sep)) {
        continue;
      }
    }

    sessions.push(session);
    if (options.limit && sessions.length >= options.limit) {
      break;
    }
  }

  return sessions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
