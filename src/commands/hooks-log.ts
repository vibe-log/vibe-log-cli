import chalk from 'chalk';
import { readHooksLog, getHooksLogPath, clearHooksLog } from '../lib/hook-utils';
import { showWarning, showSuccess, showInfo } from '../lib/ui';
import { logger } from '../utils/logger';
import inquirer from 'inquirer';

interface HooksLogOptions {
  clear?: boolean;
  lines?: string;
}

/**
 * View or manage hook execution logs
 */
export async function hooksLog(options: HooksLogOptions): Promise<void> {
  try {
    if (options.clear) {
      // Ask for confirmation
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Clear all hook logs?',
          default: false,
        },
      ]);
      
      if (confirm) {
        await clearHooksLog();
        showSuccess('Hook logs cleared!');
      } else {
        showWarning('Operation cancelled.');
      }
      return;
    }
    
    // Read and display logs
    const lines = options.lines ? parseInt(options.lines, 10) : 50;
    const logs = await readHooksLog(lines);
    
    console.log(chalk.cyan('\n📋 Hook Execution Logs'));
    console.log(chalk.gray(`Location: ${getHooksLogPath()}`));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(logs);
    console.log(chalk.gray('─'.repeat(80)));
    
    if (logs === 'No hook logs found.') {
      showInfo('No errors have been logged. Hooks are running successfully!');
    } else {
      showInfo(`Showing last ${lines} lines. Use --lines=N to see more.`);
      showInfo('Use --clear to clear the log file.');
    }
  } catch (error) {
    logger.error('Failed to read hook logs', error);
    throw error;
  }
}