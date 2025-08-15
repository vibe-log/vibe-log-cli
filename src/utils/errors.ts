import chalk from 'chalk';

export class VibelogError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'VibelogError';
  }
}

export function handleError(error: unknown): void {
  if (error instanceof VibelogError) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    
    switch (error.code) {
      case 'AUTH_REQUIRED':
        console.log(chalk.yellow('💡 Run: npx vibe-log'));
        break;
      case 'AUTH_EXPIRED':
      case 'AUTH_FAILED':
      case 'INVALID_TOKEN':
        console.log(chalk.yellow('💡 Run: npx vibe-log and authenticate'));
        break;
      case 'AUTH_NOT_COMPLETED':
        console.log(chalk.yellow('💡 Complete the authentication in your browser, then try again'));
        break;
      case 'AUTH_CHECK_FAILED':
        console.log(chalk.yellow('💡 Try running: npx vibe-log and re-authenticate'));
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