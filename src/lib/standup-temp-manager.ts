/**
 * Manages temporary directory for standup analysis
 * Handles creation, file copying, and cleanup
 *
 * IMPORTANT: Cross-platform compatible
 * - Uses path.join() for all path operations
 * - Uses os.homedir() for user home directory
 * - Stores in ~/.vibe-log/temp-standup for consistency
 */

import { SessionData } from './readers/types';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { getDayName, groupSessionsByProject } from './standup-utils';

export class StandupTempManager {
  private tempDir: string | null = null;
  private readonly baseDir = path.join(os.homedir(), '.vibe-log', 'temp-standup');

  /**
   * Create temp directory and prepare session files
   */
  async prepareTempDirectory(
    sessions: SessionData[],
    targetDate: Date
  ): Promise<string> {
    // Ensure base directory exists
    await fs.mkdir(this.baseDir, { recursive: true });

    // Create timestamped subdirectory within .vibe-log/temp-standup
    const timestamp = Date.now();
    this.tempDir = path.join(this.baseDir, `session-${timestamp}`);
    await fs.mkdir(this.tempDir, { recursive: true });

    // Group sessions by project
    const sessionsByProject = groupSessionsByProject(sessions);

    // Log date info for debugging
    logger.debug(`Preparing standup for target date: ${targetDate.toISOString()}`);
    logger.debug(`Today's date: ${new Date().toISOString()}`);

    // Create manifest - targetDate should be yesterday's working day
    const manifest = {
      targetDate: targetDate.toISOString(),
      targetDateDisplay: targetDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      }),
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

    // Clean up all other temp directories
    await this.cleanupOldTempDirs();

    // Clean up Claude project folders for temp directories
    await this.cleanupClaudeProjectFolders();
  }

  /**
   * Clean up all temp directories
   * Since users don't run multiple standups in parallel, we clean everything
   */
  private async cleanupOldTempDirs(): Promise<void> {
    try {
      const files = await fs.readdir(this.baseDir);

      for (const file of files) {
        if (file.startsWith('session-')) {
          const dirPath = path.join(this.baseDir, file);
          try {
            await fs.rm(dirPath, { recursive: true, force: true });
            logger.debug(`Cleaned up temp directory: ${dirPath}`);
          } catch (err) {
            logger.debug(`Could not clean up directory ${dirPath}: ${err}`);
          }
        }
      }
    } catch (err) {
      // Ignore errors - cleanup is best effort
      logger.debug(`Could not clean up temp directories: ${err}`);
    }
  }

  /**
   * Clean up Claude project folders created for temp directories
   * Claude creates project folders when we run it from a directory
   */
  private async cleanupClaudeProjectFolders(): Promise<void> {
    try {
      const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
      const files = await fs.readdir(claudeProjectsDir);

      for (const file of files) {
        // Look for URL-encoded temp directory names
        // Format: C--Users-username--vibe-log-temp-standup-session-*
        // This matches our temp directory pattern but URL-encoded
        if (file.includes('--vibe-log-temp-standup-session-')) {
          const projectPath = path.join(claudeProjectsDir, file);
          try {
            await fs.rm(projectPath, { recursive: true, force: true });
            logger.debug(`Cleaned up Claude project folder: ${projectPath}`);
          } catch (err) {
            logger.debug(`Could not clean up Claude project folder ${projectPath}: ${err}`);
          }
        }
      }
    } catch (err) {
      // Ignore errors - Claude projects directory might not exist
      logger.debug(`Could not clean up Claude project folders: ${err}`);
    }
  }

  /**
   * Get the temp directory path
   */
  getTempDir(): string | null {
    return this.tempDir;
  }
}