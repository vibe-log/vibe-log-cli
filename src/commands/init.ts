import inquirer from 'inquirer';
import chalk from 'chalk';
import { browserAuth, validateAndStoreToken } from '../lib/auth/browser';
import { getToken } from '../lib/auth/token';
import { showWelcome, showSuccess, showInfo } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';
import { validateAuthToken } from '../lib/input-validator';

interface InitOptions {
  token?: string;
}

export async function init(options: InitOptions): Promise<void> {
  showWelcome();
  
  // Check if already authenticated
  const existingToken = await getToken();
  if (existingToken && !options.token) {
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'You are already authenticated. Would you like to re-authenticate?',
        default: false,
      },
    ]);
    
    if (!proceed) {
      showInfo('Authentication cancelled. You are still logged in.');
      return;
    }
  }
  
  logger.debug('Starting authentication process', { hasToken: !!options.token });
  
  try {
    if (options.token) {
      // Manual token provided - validate it first
      console.log(chalk.cyan('\n🔑 Using provided token...'));
      const validatedToken = validateAuthToken(options.token);
      await validateAndStoreToken(validatedToken);
    } else {
      // Browser-based flow
      console.log(chalk.gray('\n📝 What is vibe-log?'));
      console.log(chalk.gray('   vibe-log tracks your coding sessions and helps you maintain'));
      console.log(chalk.gray('   a building streak. It analyzes your work patterns and provides'));
      console.log(chalk.gray('   insights to help you stay productive.\n'));
      
      const { ready } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'ready',
          message: 'Ready to authenticate with vibe-log?',
          default: true,
        },
      ]);
      
      if (!ready) {
        console.log(chalk.yellow('\nAuthentication cancelled.'));
        return;
      }
      
      await browserAuth();
    }
    
    showSuccess('Authentication successful!');
    
    console.log(chalk.gray('\n📋 Next steps:'));
    console.log(chalk.gray('   1. Use Claude Code to work on your projects'));
    console.log(chalk.gray('   2. Run `npx vibe-log` to access all features'));
    console.log(chalk.gray('   3. Track your progress and maintain your streak'));
    
    console.log(chalk.cyan('\n💡 Tip: Use the interactive menu to sync sessions and check your stats!'));
  } catch (error) {
    if (error instanceof VibelogError) {
      // Connection errors are already displayed with helpful messages in browserAuth
      throw error;
    }
    
    // Check for network errors that might not have been caught
    if (error instanceof Error) {
      const errorCode = (error as any).code;
      if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT') {
        // The error was already displayed in browserAuth, just throw it
        throw new VibelogError(
          'Could not connect to authentication server',
          'CONNECTION_FAILED'
        );
      }
    }
    
    logger.error('Authentication failed', error);
    throw new VibelogError(
      'Authentication failed. Please try again.',
      'AUTH_FAILED'
    );
  }
}