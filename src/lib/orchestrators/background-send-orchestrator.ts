import { logger } from '../../utils/logger';
import { logHookError } from '../hook-utils';
import { SendOptions } from './send-orchestrator';
import { checkForUpdate, shouldSpawnLatestForHook, spawnLatestVersion } from '../../utils/version-check';

export class BackgroundSendOrchestrator {
  async execute(options: SendOptions): Promise<void> {
    if (!options.hookTrigger) {
      logger.error('Background mode requires hook trigger');
      return;
    }

    const { spawnDetached, isUploadRunning } = await import('../../utils/spawn');

    // Check if an upload is already running
    if (await isUploadRunning()) {
      logger.debug('Background upload already in progress, skipping');
      return;
    }

    // Check for version updates and use @latest if needed
    // Skip if we're already running from @latest spawn to prevent infinite loops
    if (!process.env.VIBE_LOG_SPAWNED_LATEST) {
      try {
        const currentVersion = process.env.SIMULATE_OLD_VERSION || require('../../../package.json').version;
        const versionCheck = await checkForUpdate(currentVersion);

        if (shouldSpawnLatestForHook(versionCheck, options.hookTrigger)) {
          logger.debug(`Background spawn using latest version: current=${versionCheck.currentVersion}, latest=${versionCheck.latestVersion}`);

          // Build args for the latest version spawn
          const args = ['send', '--silent', '--background', `--hook-trigger=${options.hookTrigger}`];

          if (options.hookVersion) {
            args.push(`--hook-version=${options.hookVersion}`);
          }

          if (options.claudeProjectDir) {
            args.push(`--claude-project-dir=${options.claudeProjectDir}`);
          }

          if (options.all) {
            args.push('--all');
          }

          // Use the new spawn method with @latest
          await spawnLatestVersion(args, {
            detached: true,
            silent: true,
            env: {
              ...process.env,
              VIBE_LOG_SPAWNED_LATEST: '1' // Prevent infinite loops
            }
          });

          logger.debug('Background upload process spawned with @latest successfully');
          return;
        }
      } catch (error) {
        // If version check fails, continue with current version
        logger.debug('Version check failed for background spawn, using current version:', error);
      }
    }

    // Fallback: Use current version (original logic)
    // Get the CLI executable path
    const cliPath = process.argv[0]; // node executable
    const scriptPath = process.argv[1]; // vibe-log script

    // Build args for the background process (without --background flag)
    const args = [scriptPath, 'send', '--silent', `--hook-trigger=${options.hookTrigger}`];

    if (options.hookVersion) {
      args.push(`--hook-version=${options.hookVersion}`);
    }

    if (options.claudeProjectDir) {
      args.push('--claude-project-dir', options.claudeProjectDir);
    }

    if (options.all) {
      args.push('--all');
    }

    try {
      await spawnDetached(cliPath, args);
      logger.debug('Background upload process spawned successfully (current version)');
    } catch (error) {
      await logHookError('Background spawn', error);
      logger.error('Failed to spawn background upload process');
    }
  }
}