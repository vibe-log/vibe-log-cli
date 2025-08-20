import { browserAuth, validateAndStoreToken } from '../lib/auth/browser';
import { showSuccess } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';
import { validateAuthToken } from '../lib/input-validator';
import { isNetworkError, createNetworkError } from '../lib/errors/network-errors';
import chalk from 'chalk';

interface AuthOptions {
  token?: string;
  wizardMode?: boolean; // Silent mode when called from wizard
}

export async function auth(options: AuthOptions): Promise<void> {
  // Only show re-auth message if not in wizard mode
  if (!options.wizardMode) {
    console.log('\n🔐 Re-authenticating with vibe-log...\n');
  }
  
  try {
    if (options.token) {
      // Manual token provided - validate it first
      const validatedToken = validateAuthToken(options.token);
      await validateAndStoreToken(validatedToken);
    } else {
      // Browser-based flow
      await browserAuth(options.wizardMode);
    }
    
    // Only show success messages if not in wizard mode
    if (!options.wizardMode) {
      showSuccess('Authentication successful!');
      console.log('\n✨ Cloud mode is now active!');
    }
  } catch (error) {
    if (error instanceof VibelogError) {
      // For connection errors, the browserAuth function already displayed detailed messages
      // Just re-throw to let the menu handle it
      if (error.code === 'CONNECTION_REFUSED' || 
          error.code === 'SERVER_NOT_FOUND' || 
          error.code === 'TIMEOUT' ||
          error.code === 'NETWORK_ERROR') {
        throw error;
      }
      // For other VibelogErrors, throw as-is
      throw error;
    }
    
    // For unexpected errors, log and throw a generic message
    logger.error('Re-authentication failed', error);
    
    // If it's a recognizable network error that wasn't caught in browserAuth
    if (error instanceof Error && isNetworkError(error)) {
      console.error(chalk.red('\n❌ Failed to connect to the authentication server'));
      console.error(chalk.yellow('Please check that the server is running and accessible.'));
      throw createNetworkError(error);
    }
    
    throw new VibelogError(
      'Re-authentication failed. Please try again.',
      'AUTH_FAILED'
    );
  }
}