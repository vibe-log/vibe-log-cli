/**
 * Manages temporary directory for standup analysis
 * Handles creation, file copying, and cleanup
 */

import { SessionData } from './readers/types';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { getDayName, groupSessionsByProject } from './standup-utils';

export class StandupTempManager {
  private tempDir: string | null = null;

  /**
   * Create temp directory and prepare session files
   */
  async prepareTempDirectory(
    sessions: SessionData[],
    targetDate: Date
  ): Promise<string> {
    // Create temp directory
    this.tempDir = path.join(os.tmpdir(), `.vibe-log-standup-${Date.now()}`);
    await fs.mkdir(this.tempDir, { recursive: true });

    // Group sessions by project
    const sessionsByProject = groupSessionsByProject(sessions);

    // Create manifest
    const manifest = {
      targetDate: targetDate.toISOString(),
      dayOfWeek: getDayName(targetDate),
      totalSessions: sessions.length,
      projects: Object.keys(sessionsByProject),
      sessionsPerProject: Object.entries(sessionsByProject).map(([project, sessions]) => ({
        project,
        count: sessions.length,
        files: sessions.map(s => `${s.id}.jsonl`)
      }))
    };

    await fs.writeFile(
      path.join(this.tempDir, 'standup-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Copy session files
    await this.copySessionFiles(sessions);

    return this.tempDir;
  }

  /**
   * Copy session files to temp directory
   */
  private async copySessionFiles(sessions: SessionData[]): Promise<number> {
    if (!this.tempDir) return 0;

    let copiedCount = 0;
    for (const session of sessions) {
      // Use the sourceFile info if available, otherwise fall back to id
      const filename = (session as any).sourceFile?.sessionFile || `${session.id}.jsonl`;
      const projectPath = (session as any).sourceFile?.claudeProjectPath || session.projectPath;

      const sourcePath = path.join(projectPath, filename);
      const destPath = path.join(this.tempDir, filename);

      try {
        await fs.copyFile(sourcePath, destPath);
        copiedCount++;
      } catch (err) {
        logger.debug(`Could not copy session file ${filename}: ${err}`);
      }
    }

    logger.debug(`Copied ${copiedCount} of ${sessions.length} session files`);
    return copiedCount;
  }

  /**
   * Clean up temp directory
   */
  async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        await fs.rm(this.tempDir, { recursive: true, force: true });
        logger.debug(`Cleaned up temp directory: ${this.tempDir}`);
      } catch (err) {
        logger.debug(`Could not clean up temp directory: ${err}`);
      }
      this.tempDir = null;
    }
  }

  /**
   * Get the temp directory path
   */
  getTempDir(): string | null {
    return this.tempDir;
  }
}