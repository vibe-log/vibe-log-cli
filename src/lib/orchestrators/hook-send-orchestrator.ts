import { logger } from '../../utils/logger';
import { logHookError } from '../hook-utils';
import { HookLock } from '../hook-lock';
import { SendOptions, SendOrchestrator } from './send-orchestrator';

export class HookSendOrchestrator {
  private sendOrchestrator = new SendOrchestrator();

  async execute(options: SendOptions): Promise<void> {
    // Test mode - handle immediately
    if (options.test) {
      console.log('Hook test successful');
      process.exit(0);
    }

    let hookLock: HookLock | undefined;
    let uploadLockCreated = false;

    try {
      // Create upload lock for non-background processes
      if (!options.background) {
        const { createUploadLock } = await import('../../utils/spawn');
        await createUploadLock();
        uploadLockCreated = true;
      }
      
      // Acquire hook lock
      hookLock = new HookLock();
      const lockAcquired = await hookLock.acquire();
      
      if (!lockAcquired) {
        await logHookError('Lock acquisition', new Error('Another hook execution is already in progress'));
        logger.debug('Skipping hook execution - already running');
        return;
      }

      // Execute send with silent mode
      const hookOptions: SendOptions = {
        ...options,
        silent: true
      };

      await this.sendOrchestrator.execute(hookOptions);

    } catch (error) {
      await logHookError('Hook send', error);
      logger.error('Failed to execute hook send');
      // In hook mode, never throw - just exit gracefully
    } finally {
      // Always release the lock if we acquired one
      if (hookLock) {
        await hookLock.release();
      }
      
      // Remove upload lock for non-background processes
      if (uploadLockCreated) {
        const { removeUploadLock } = await import('../../utils/spawn');
        await removeUploadLock();
      }
    }
  }
}