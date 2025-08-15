import { requireAuth } from '../lib/auth/token';
import { showHooksManagementMenu } from '../lib/ui/hooks-menu';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Manage Claude Code hooks - main entry point
 */
export async function hooksManage(): Promise<void> {
  try {
    // Require authentication first
    await requireAuth();
    
    // Show the hooks management menu
    await showHooksManagementMenu();
    
  } catch (error) {
    logger.error('Failed to manage hooks', error);
    
    if (error instanceof VibelogError) {
      throw error;
    }
    
    throw new VibelogError(
      'Failed to manage hooks. Please try again.',
      'HOOKS_MANAGE_FAILED'
    );
  }
}