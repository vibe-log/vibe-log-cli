import chalk from 'chalk';
import { isNetworkError, getNetworkErrorMessage } from '../lib/errors/network-errors';

export class VibelogError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'VibelogError';
  }
}

/**
 * Display error without exiting the process - for interactive mode
 */
export function displayError(error: unknown): void {
  if (error instanceof VibelogError) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    
    switch (error.code) {
      case 'AUTH_REQUIRED':
        console.log(chalk.yellow('💡 Try: Authenticate from the main menu'));
        break;
      case 'AUTH_EXPIRED':
      case 'AUTH_FAILED':
      case 'INVALID_TOKEN':
        console.log(chalk.yellow('💡 Your authentication has expired. Please re-authenticate from the menu'));
        break;
      case 'AUTH_NOT_COMPLETED':
        console.log(chalk.yellow('💡 Complete the authentication in your browser, then try again'));
        break;
      case 'AUTH_CHECK_FAILED':
        console.log(chalk.yellow('💡 Try re-authenticating from the menu'));
        break;
      case 'NETWORK_ERROR':
        console.log(chalk.yellow('💡 Check your internet connection and try again'));
        break;
      case 'RATE_LIMITED':
        console.log(chalk.yellow('💡 You\'ve hit the rate limit. Please wait a minute and try again'));
        break;
      case 'CLAUDE_NOT_FOUND':
        console.log(chalk.yellow('💡 Make sure Claude Code is installed'));
        console.log(chalk.gray('   Visit: https://claude.ai/download'));
        break;
      case 'SEND_FAILED':
        console.log(chalk.yellow('💡 The upload failed. Please check your connection and try again'));
        break;
      case 'VALIDATION_ERROR':
        console.log(chalk.yellow('💡 Some sessions couldn\'t be processed. Try selecting different sessions'));
        break;
      case 'ACCESS_DENIED':
        console.log(chalk.yellow('💡 Access denied. Please check your permissions'));
        break;
      case 'SERVER_ERROR':
        console.log(chalk.yellow('💡 The server is having issues. Please try again later'));
        break;
      case 'SERVICE_UNAVAILABLE':
        console.log(chalk.yellow('💡 Service temporarily unavailable. Try again in a few moments'));
        break;
      case 'CONNECTION_REFUSED':
        console.log(chalk.yellow('💡 Connection refused. Check if your firewall is blocking the connection'));
        break;
      case 'TIMEOUT':
        console.log(chalk.yellow('💡 Request timed out. Check your connection speed'));
        break;
      case 'ENDPOINT_NOT_FOUND':
        console.log(chalk.yellow('💡 API endpoint not found. You might need to update your CLI'));
        break;
    }
  } else if (error instanceof Error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    
    // Network-specific errors
    if (isNetworkError(error)) {
      const message = getNetworkErrorMessage(error);
      console.log(chalk.yellow(`💡 ${message}`));
    } else if (error.message.includes('ENOSPC')) {
      console.log(chalk.yellow('💡 Your disk is full. Free up some space and try again'));
    } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
      console.log(chalk.yellow('💡 Permission denied. Check file permissions'));
    }
    
    if (process.env.DEBUG || process.env.VIBELOG_DEBUG) {
      console.error(chalk.gray('\nStack trace:'));
      console.error(chalk.gray(error.stack));
    }
  } else {
    console.error(chalk.red('\n❌ An unexpected error occurred'));
    
    if (process.env.DEBUG || process.env.VIBELOG_DEBUG) {
      console.error(error);
    }
  }
  
  console.log(chalk.gray('\n💬 Press Enter to return to the menu...'));
}

/**
 * Fatal error handler - exits the process (for CLI commands)
 */
export function handleError(error: unknown): void {
  if (error instanceof VibelogError) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    
    switch (error.code) {
      case 'AUTH_REQUIRED':
        console.log(chalk.yellow('💡 Run: npx vibe-log-cli'));
        break;
      case 'AUTH_EXPIRED':
      case 'AUTH_FAILED':
      case 'INVALID_TOKEN':
        console.log(chalk.yellow('💡 Run: npx vibe-log-cli and authenticate'));
        break;
      case 'AUTH_NOT_COMPLETED':
        console.log(chalk.yellow('💡 Complete the authentication in your browser, then try again'));
        break;
      case 'AUTH_CHECK_FAILED':
        console.log(chalk.yellow('💡 Try running: npx vibe-log-cli and re-authenticate'));
        break;
      case 'NETWORK_ERROR':
        console.log(chalk.yellow('💡 Check your internet connection'));
        break;
      case 'RATE_LIMITED':
        console.log(chalk.yellow('💡 Please wait a few minutes and try again'));
        break;
      case 'CLAUDE_NOT_FOUND':
        console.log(chalk.yellow('💡 Make sure Claude Code is installed'));
        console.log(chalk.gray('   Visit: https://claude.ai/download'));
        break;
    }
  } else if (error instanceof Error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    
    if (process.env.DEBUG || process.env.VIBELOG_DEBUG) {
      console.error(chalk.gray('\nStack trace:'));
      console.error(chalk.gray(error.stack));
    }
  } else {
    console.error(chalk.red('\n❌ An unknown error occurred'));
    
    if (process.env.DEBUG || process.env.VIBELOG_DEBUG) {
      console.error(error);
    }
  }
  
  console.log(chalk.gray('\n💬 Need help? Visit: https://vibe-log.dev/help'));
  
  process.exit(1);
}

export function logDebug(message: string, data?: any): void {
  if (process.env.DEBUG || process.env.VIBELOG_DEBUG) {
    console.log(chalk.gray(`[DEBUG] ${message}`));
    if (data) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }
}