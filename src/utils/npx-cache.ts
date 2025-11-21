import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger';

/**
 * Clear NPX cache for vibe-log-cli (VERIFIED APPROACH)
 * Forces NPX to download fresh version on next run
 *
 * This uses surgical deletion: removes only vibe-log-cli from NPX cache
 * while leaving other packages intact.
 *
 * Research: See NPX_CACHE_RESEARCH.md
 * Verified: scripts/test-npx-cache-clearing.sh
 *
 * Key Finding: `npm cache clean vibe-log-cli --force` does NOT work
 * for NPX cache (GitHub Issue npm/cli#6664). Manual deletion is required.
 */
export async function clearNpxCache(): Promise<void> {
  try {
    const npxCacheDir = path.join(os.homedir(), '.npm', '_npx');

    // Check if NPX cache directory exists
    try {
      await fs.access(npxCacheDir);
    } catch {
      logger.debug('NPX cache directory not found, skipping clear');
      return;
    }

    // Find all vibe-log-cli directories in NPX cache
    // They're stored in hash-based subdirectories like:
    // ~/.npm/_npx/b0924ccdd23ad3b4/node_modules/vibe-log-cli
    const entries = await fs.readdir(npxCacheDir).catch(() => []);

    let removedCount = 0;
    for (const entry of entries) {
      const vibeLogPath = path.join(npxCacheDir, entry, 'node_modules', 'vibe-log-cli');

      try {
        // Check if vibe-log-cli exists in this cache entry
        await fs.access(vibeLogPath);

        // Remove it
        await fs.rm(vibeLogPath, { recursive: true, force: true });
        logger.debug(`Removed NPX cache entry: ${vibeLogPath}`);
        removedCount++;
      } catch {
        // This cache entry doesn't have vibe-log-cli, skip
      }
    }

    if (removedCount > 0) {
      logger.debug(`Cleared ${removedCount} vibe-log-cli entry/entries from NPX cache`);
    } else {
      logger.debug('No vibe-log-cli found in NPX cache');
    }
  } catch (error) {
    logger.debug(`Failed to clear NPX cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
    // Non-fatal, continue - update may still work
  }
}

/**
 * Check NPX cache health
 * Returns true if cache looks healthy
 *
 * Detects orphaned temp directories that indicate cache corruption
 * from failed concurrent NPX executions.
 */
export async function checkNpxCacheHealth(): Promise<boolean> {
  try {
    const npxCacheDir = path.join(os.homedir(), '.npm', '_npx');
    const entries = await fs.readdir(npxCacheDir).catch(() => []);

    // Look for orphaned temp directories (start with '.')
    const orphanedTemps = entries.filter(entry => entry.startsWith('.'));

    if (orphanedTemps.length > 5) {
      logger.debug(`Found ${orphanedTemps.length} orphaned temp directories in NPX cache`);
      return false;
    }

    return true;
  } catch {
    // If can't check, assume healthy
    return true;
  }
}

/**
 * Get cached version of vibe-log-cli (if any)
 * Returns version string or null if not cached
 */
export async function getCachedVersion(): Promise<string | null> {
  try {
    const npxCacheDir = path.join(os.homedir(), '.npm', '_npx');
    const entries = await fs.readdir(npxCacheDir).catch(() => []);

    for (const entry of entries) {
      const packageJsonPath = path.join(
        npxCacheDir,
        entry,
        'node_modules',
        'vibe-log-cli',
        'package.json'
      );

      try {
        const packageJson = await fs.readFile(packageJsonPath, 'utf8');
        const pkg = JSON.parse(packageJson);
        return pkg.version;
      } catch {
        // This entry doesn't have vibe-log-cli, continue
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Force clear entire NPX cache (nuclear option)
 * Use only for debugging or when cache is severely corrupted
 *
 * WARNING: This clears ALL cached NPX packages, not just vibe-log-cli
 */
export async function clearEntireNpxCache(): Promise<void> {
  try {
    const npxCacheDir = path.join(os.homedir(), '.npm', '_npx');

    await fs.rm(npxCacheDir, { recursive: true, force: true });
    logger.debug('Cleared entire NPX cache (nuclear option)');
  } catch (error) {
    logger.debug(`Failed to clear entire NPX cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
