import { browserAuth, validateAndStoreToken } from '../lib/auth/browser';
import { showSuccess } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';
import { validateAuthToken } from '../lib/input-validator';

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
      throw error;
    }
    
    logger.error('Re-authentication failed', error);
    throw new VibelogError(
      'Re-authentication failed. Please try again.',
      'AUTH_FAILED'
    );
  }
}