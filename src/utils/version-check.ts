import { logger } from './logger';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { spawn, SpawnOptions } from 'child_process';

/**
 * Version comparison result
 */
export interface VersionCheckResult {
  isOutdated: boolean;
  currentVersion: string;
  latestVersion: string;
  shouldUpdate: boolean;
  error?: string;
}

/**
 * Cache entry for version check
 */
interface VersionCache {
  latestVersion: string;
  timestamp: number;
}

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;

/**
 * Get the version cache file path
 */
function getVersionCachePath(): string {
  const vibelogDir = path.join(os.homedir(), '.vibe-log');
  return path.join(vibelogDir, 'version-cache.json');
}

/**
 * Get the update log file path
 */
function getUpdateLogPath(): string {
  const vibelogDir = path.join(os.homedir(), '.vibe-log');
  return path.join(vibelogDir, 'update.log');
}

/**
 * Log update events for debugging
 */
async function logUpdateEvent(message: string): Promise<void> {
  try {
    const vibelogDir = path.join(os.homedir(), '.vibe-log');
    await fs.mkdir(vibelogDir, { recursive: true });

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    await fs.appendFile(getUpdateLogPath(), logEntry);
  } catch (error) {
    // Silently ignore logging errors
    logger.debug('Failed to log update event:', error);
  }
}

/**
 * Read cached version information
 */
async function readVersionCache(): Promise<VersionCache | null> {
  try {
    const cacheFile = getVersionCachePath();
    const data = await fs.readFile(cacheFile, 'utf8');
    const cache: VersionCache = JSON.parse(data);

    // Check if cache is still valid
    const now = Date.now();
    if (now - cache.timestamp < CACHE_DURATION) {
      return cache;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Write version cache
 */
async function writeVersionCache(latestVersion: string): Promise<void> {
  try {
    const vibelogDir = path.join(os.homedir(), '.vibe-log');
    await fs.mkdir(vibelogDir, { recursive: true });

    const cache: VersionCache = {
      latestVersion,
      timestamp: Date.now()
    };

    const cacheFile = getVersionCachePath();
    await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2));
  } catch (error) {
    logger.debug('Failed to write version cache:', error);
  }
}

/**
 * Fetch latest version from npm registry
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    // Use node's built-in https module for better reliability
    const https = await import('https');

    return new Promise((resolve) => {
      const req = https.get('https://registry.npmjs.org/vibe-log-cli/latest', {
        timeout: 5000,
        headers: {
          'User-Agent': 'vibe-log-cli-version-check'
        }
      }, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const pkg = JSON.parse(data);
            resolve(pkg.version);
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => {
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  } catch {
    return null;
  }
}

/**
 * Compare two semantic versions
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const cleanA = a.replace(/^v/, '');
  const cleanB = b.replace(/^v/, '');

  const partsA = cleanA.split('.').map(x => parseInt(x, 10));
  const partsB = cleanB.split('.').map(x => parseInt(x, 10));

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }

  return 0;
}

/**
 * Check if CLI version is outdated and needs update
 */
export async function checkForUpdate(currentVersion: string): Promise<VersionCheckResult> {
  await logUpdateEvent(`Checking version: current=${currentVersion}`);

  // Skip update check if environment variable is set
  if (process.env.VIBE_LOG_SKIP_UPDATE === '1') {
    await logUpdateEvent('Skipping version check due to VIBE_LOG_SKIP_UPDATE=1');
    return {
      isOutdated: false,
      currentVersion,
      latestVersion: currentVersion,
      shouldUpdate: false
    };
  }

  try {
    // Try to read from cache first
    let latestVersion: string | null = null;
    const cache = await readVersionCache();

    if (cache) {
      latestVersion = cache.latestVersion;
      await logUpdateEvent(`Using cached version: ${latestVersion}`);
    } else {
      // Fetch from npm registry
      await logUpdateEvent('Fetching latest version from npm...');
      latestVersion = await fetchLatestVersion();

      if (latestVersion) {
        await writeVersionCache(latestVersion);
        await logUpdateEvent(`Fetched latest version: ${latestVersion}`);
      } else {
        await logUpdateEvent('Failed to fetch latest version from npm');
      }
    }

    // If we couldn't get latest version, don't update
    if (!latestVersion) {
      return {
        isOutdated: false,
        currentVersion,
        latestVersion: currentVersion,
        shouldUpdate: false,
        error: 'Could not fetch latest version'
      };
    }

    // Compare versions
    const comparison = compareVersions(currentVersion, latestVersion);
    const isOutdated = comparison < 0;

    // Determine if we should force update
    // For now, update on any version difference
    const shouldUpdate = isOutdated;

    await logUpdateEvent(`Version comparison: ${currentVersion} vs ${latestVersion}, outdated=${isOutdated}, shouldUpdate=${shouldUpdate}`);

    return {
      isOutdated,
      currentVersion,
      latestVersion,
      shouldUpdate
    };

  } catch (error) {
    await logUpdateEvent(`Version check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    logger.debug('Version check failed:', error);

    return {
      isOutdated: false,
      currentVersion,
      latestVersion: currentVersion,
      shouldUpdate: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Spawn a process using npx vibe-log-cli@latest
 * This ensures we always use the latest version
 */
export async function spawnLatestVersion(
  args: string[],
  options?: {
    detached?: boolean;
    silent?: boolean;
    env?: NodeJS.ProcessEnv;
  }
): Promise<void> {
  await logUpdateEvent(`Spawning latest version with args: ${args.join(' ')}`);

  // Build command - use npx to get latest version
  const command = 'npx';
  const spawnArgs = ['vibe-log-cli@latest', ...args];

  const spawnOptions: SpawnOptions = {
    detached: options?.detached || false,
    stdio: options?.silent ? ['ignore', 'ignore', 'ignore'] : 'inherit',
    env: { ...process.env, ...options?.env }
  };

  // On Windows, use shell mode
  if (process.platform === 'win32') {
    spawnOptions.shell = true;
    if (options?.detached) {
      spawnOptions.windowsHide = true;
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, spawnArgs, spawnOptions);

    if (options?.detached) {
      // For detached processes, unref and resolve immediately
      child.unref();
      resolve();
      return;
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Check if we should attempt to spawn latest version for hook execution
 */
export function shouldSpawnLatestForHook(versionCheck: VersionCheckResult, hookTrigger?: string): boolean {
  // Only auto-update for hook executions
  if (!hookTrigger) {
    return false;
  }

  // Don't update if check failed
  if (versionCheck.error) {
    return false;
  }

  // Update if we're outdated
  return versionCheck.shouldUpdate;
}