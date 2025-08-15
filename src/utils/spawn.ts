import { spawn, SpawnOptions } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger';

/**
 * Get the upload log file path
 */
export function getUploadLogPath(): string {
  const vibelogDir = path.join(os.homedir(), '.vibe-log');
  return path.join(vibelogDir, 'upload.log');
}

/**
 * Ensure the .vibe-log directory exists
 */
async function ensureVibelogDir(): Promise<void> {
  const vibelogDir = path.join(os.homedir(), '.vibe-log');
  await fs.mkdir(vibelogDir, { recursive: true });
}

/**
 * Spawn a detached process that runs in the background
 * Cross-platform support for Windows and Unix systems
 */
export async function spawnDetached(
  command: string,
  args: string[],
  options?: {
    logFile?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<void> {
  await ensureVibelogDir();
  
  const logFile = options?.logFile || getUploadLogPath();
  
  // Write timestamp header
  const timestamp = new Date().toISOString();
  await fs.appendFile(logFile, `\n=== Upload started at ${timestamp} ===\n`);
  
  const spawnOptions: SpawnOptions = {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, ...options?.env, VIBE_LOG_OUTPUT: logFile }
  };
  
  // On Windows, we need to use shell mode for proper detachment
  if (process.platform === 'win32') {
    spawnOptions.shell = true;
    spawnOptions.windowsHide = true;
  }
  
  const child = spawn(command, args, spawnOptions);
  
  // Unref the child process so parent can exit independently
  child.unref();
  
  logger.debug(`Spawned background process with PID: ${child.pid}`);
}

/**
 * Check if a background upload process is already running
 * This prevents duplicate uploads
 */
export async function isUploadRunning(): Promise<boolean> {
  const lockFile = path.join(os.homedir(), '.vibe-log', 'upload.lock');
  
  try {
    const stats = await fs.stat(lockFile);
    const now = Date.now();
    const lockAge = now - stats.mtimeMs;
    
    // If lock is older than 5 minutes, consider it stale
    if (lockAge > 5 * 60 * 1000) {
      await fs.unlink(lockFile).catch(() => {});
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a lock file for upload process
 */
export async function createUploadLock(): Promise<void> {
  await ensureVibelogDir();
  const lockFile = path.join(os.homedir(), '.vibe-log', 'upload.lock');
  await fs.writeFile(lockFile, process.pid.toString());
}

/**
 * Remove the upload lock file
 */
export async function removeUploadLock(): Promise<void> {
  const lockFile = path.join(os.homedir(), '.vibe-log', 'upload.lock');
  await fs.unlink(lockFile).catch(() => {});
}