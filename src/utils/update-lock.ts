import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const UPDATE_LOCK_PATH = path.join(os.homedir(), '.vibe-log', 'update.lock');
const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export interface UpdateLock {
  release: () => Promise<void>;
}

interface LockData {
  pid: number;
  timestamp: number;
  version: string;
}

/**
 * Try to acquire update lock (non-blocking)
 * Returns lock object if acquired, null if busy
 *
 * Uses atomic file operations (wx flag) to ensure only one process
 * can acquire the lock at a time. This prevents concurrent NPX updates
 * that cause cache corruption.
 */
export async function tryAcquireUpdateLock(): Promise<UpdateLock | null> {
  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(UPDATE_LOCK_PATH), { recursive: true });

    // Try to create lock file (wx flag = exclusive write)
    // This is atomic - only one process can succeed
    const lockData: LockData = {
      pid: process.pid,
      timestamp: Date.now(),
      version: require('../../package.json').version
    };

    await fs.writeFile(
      UPDATE_LOCK_PATH,
      JSON.stringify(lockData, null, 2),
      { flag: 'wx' }
    );

    // Lock acquired!
    return {
      release: async () => {
        try {
          await fs.unlink(UPDATE_LOCK_PATH);
        } catch {
          // Ignore errors on release (file may already be gone)
        }
      }
    };
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      // Lock already exists - check if stale
      const isStale = await isLockStale();
      if (isStale) {
        // Remove stale lock and retry once
        await fs.unlink(UPDATE_LOCK_PATH).catch(() => {});
        return tryAcquireUpdateLock();
      }
      // Lock is active, return null
      return null;
    }
    // Other errors (permissions, etc.) - throw
    throw error;
  }
}

/**
 * Check if lock file is stale (older than LOCK_TIMEOUT)
 * Stale locks are from crashed processes or hung updates
 */
async function isLockStale(): Promise<boolean> {
  try {
    const lockData = await fs.readFile(UPDATE_LOCK_PATH, 'utf8');
    const lock: LockData = JSON.parse(lockData);
    const age = Date.now() - lock.timestamp;
    return age > LOCK_TIMEOUT;
  } catch {
    // If we can't read/parse it, consider it stale
    return true;
  }
}

/**
 * Force release lock (for cleanup/debugging)
 * Use with caution - may interrupt active update
 */
export async function forceReleaseUpdateLock(): Promise<void> {
  try {
    await fs.unlink(UPDATE_LOCK_PATH);
  } catch {
    // Ignore if lock doesn't exist
  }
}

/**
 * Check if an update is currently in progress
 * Returns true if lock exists and is not stale
 */
export async function isUpdateInProgress(): Promise<boolean> {
  try {
    await fs.access(UPDATE_LOCK_PATH);
    const isStale = await isLockStale();
    return !isStale;
  } catch {
    return false;
  }
}
