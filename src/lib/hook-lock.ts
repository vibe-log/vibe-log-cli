import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger';

/**
 * Simple file-based lock mechanism for preventing concurrent hook executions
 */
export class HookLock {
  private lockPath: string;
  private lockTimeout: number = 60000; // 60 seconds max lock time

  constructor() {
    this.lockPath = path.join(homedir(), '.vibe-log', 'hook.lock');
  }

  /**
   * Attempt to acquire a lock
   * @returns true if lock acquired, false if already locked
   */
  async acquire(): Promise<boolean> {
    try {
      const lockDir = path.dirname(this.lockPath);
      await fs.mkdir(lockDir, { recursive: true });

      // Check if lock exists and is still valid
      try {
        const lockContent = await fs.readFile(this.lockPath, 'utf-8');
        const lockData = JSON.parse(lockContent);
        const lockAge = Date.now() - lockData.timestamp;

        // If lock is older than timeout, consider it stale
        if (lockAge < this.lockTimeout) {
          logger.debug('Hook execution already in progress', { pid: lockData.pid, age: lockAge });
          return false;
        } else {
          logger.debug('Removing stale lock', { pid: lockData.pid, age: lockAge });
        }
      } catch {
        // Lock doesn't exist or is invalid, we can proceed
      }

      // Create new lock
      const lockData = {
        pid: process.pid,
        timestamp: Date.now(),
        host: process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown'
      };

      await fs.writeFile(this.lockPath, JSON.stringify(lockData));
      logger.debug('Hook lock acquired', lockData);
      return true;
    } catch (error) {
      logger.error('Failed to acquire hook lock', error);
      return false;
    }
  }

  /**
   * Release the lock
   */
  async release(): Promise<void> {
    try {
      await fs.unlink(this.lockPath);
      logger.debug('Hook lock released');
    } catch (error) {
      // Lock might already be removed, that's ok
      logger.debug('Failed to release hook lock', error);
    }
  }

  /**
   * Force clear any existing lock (for troubleshooting)
   */
  async forceClear(): Promise<void> {
    try {
      await fs.unlink(this.lockPath);
      logger.info('Hook lock forcefully cleared');
    } catch (error) {
      logger.debug('No lock to clear');
    }
  }
}