import path from 'path';
import { logger } from '../utils/logger';
import { parseProjectName } from './ui/project-display';
import { readCodexSessions } from './readers/codex';

export interface CodexProject {
  name: string;
  codexPath: string;
  actualPath: string;
  sessions: number;
  lastActivity: Date | null;
  isActive: boolean;
  size: number;
}

export async function discoverCodexProjects(): Promise<CodexProject[]> {
  try {
    const sessions = await readCodexSessions();
    const grouped = new Map<string, CodexProject>();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const session of sessions) {
      const actualPath = path.normalize(session.projectPath);
      const existing = grouped.get(actualPath);
      const lastActivity = existing?.lastActivity && existing.lastActivity > session.timestamp
        ? existing.lastActivity
        : session.timestamp;

      grouped.set(actualPath, {
        name: parseProjectName(actualPath),
        codexPath: actualPath,
        actualPath,
        sessions: (existing?.sessions || 0) + 1,
        lastActivity,
        isActive: lastActivity > thirtyDaysAgo,
        size: existing?.size || 0,
      });
    }

    return [...grouped.values()].sort((a, b) => {
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return b.lastActivity.getTime() - a.lastActivity.getTime();
    });
  } catch (error) {
    logger.debug('Error discovering Codex projects:', error);
    return [];
  }
}
