import { logger } from '../../utils/logger';
import { logHookError } from '../hook-utils';
import { SendOptions } from './send-orchestrator';

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
      logger.debug('Background upload process spawned successfully');
    } catch (error) {
      await logHookError('Background spawn', error);
      logger.error('Failed to spawn background upload process');
    }
  }
}