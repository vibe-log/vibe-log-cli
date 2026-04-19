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

    // Copy session files first so the manifest points at the exact temp filenames.
    const copiedFiles = await this.copySessionFiles(sessions);

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
      copiedSessions: copiedFiles.length,
      projects: Object.keys(sessionsByProject),
      sessionsPerProject: Object.entries(sessionsByProject).map(([project, sessions]) => ({
        project,
        count: sessions.length,
        files: sessions
          .map(s => copiedFiles.find(file => file.sessionId === s.id)?.filename)
          .filter(Boolean)
      }))
    };

    await fs.writeFile(
      path.join(this.tempDir, 'standup-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    return this.tempDir;
  }

  private getTempSessionFilename(session: SessionData, index: number): string {
    const source = session.source || (session.tool === 'codex' ? 'codex' : 'claude');
    const originalFilename = session.sourceFile?.sessionFile || `${session.id}.jsonl`;
    const safeFilename = path.basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const prefix = String(index + 1).padStart(3, '0');
    return `${prefix}-${source}-${safeFilename}`;
  }

  /**
   * Copy session files to temp directory
   */
  private async copySessionFiles(sessions: SessionData[]): Promise<Array<{ sessionId: string; filename: string }>> {
    if (!this.tempDir) return [];

    const copiedFiles: Array<{ sessionId: string; filename: string }> = [];
    for (const [index, session] of sessions.entries()) {
      // Use the sourceFile info if available, otherwise fall back to id
      const filename = session.sourceFile?.sessionFile || `${session.id}.jsonl`;
      const projectPath = session.sourceFile?.claudeProjectPath || session.projectPath;

      const sourcePath = session.sourceFile?.fullPath || path.join(projectPath, filename);
      const tempFilename = this.getTempSessionFilename(session, index);
      const destPath = path.join(this.tempDir, tempFilename);

      try {
        await fs.copyFile(sourcePath, destPath);
        copiedFiles.push({ sessionId: session.id, filename: tempFilename });
      } catch (err) {
        logger.debug(`Could not copy session file ${filename}: ${err}`);
      }
    }

    logger.debug(`Copied ${copiedFiles.length} of ${sessions.length} session files`);
    return copiedFiles;
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
