import chalk from 'chalk';
import { countCursorMessages } from '../lib/readers/cursor';
import { createSpinner } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
  getPushUpChallengeConfig,
  checkAndUpdateCursorPushUps
} from '../lib/config';

export async function cursorStats(): Promise<void> {
  const spinner = createSpinner('Fetching Cursor IDE stats...').start();

  try {
    const stats = await countCursorMessages();

    spinner.succeed('Cursor stats loaded!');

    // Check if push-up challenge is enabled and update debt
    const pushUpConfig = getPushUpChallengeConfig();
    let cursorPushUpResult;

    if (pushUpConfig.enabled) {
      cursorPushUpResult = await checkAndUpdateCursorPushUps();
    }

    console.log(chalk.cyan('\n💬 Your Cursor IDE Stats'));
    console.log(chalk.gray('═══════════════════════════════\n'));

    console.log(chalk.cyan(`📊 Total Conversations: ${chalk.bold(stats.conversationCount)}`));
    console.log(chalk.cyan(`💬 Total Messages: ${chalk.bold(stats.totalMessages)}`));
    console.log(chalk.gray(`   • User Messages: ${chalk.bold(stats.userMessages)}`));
    console.log(chalk.gray(`   • Assistant Messages: ${chalk.bold(stats.assistantMessages)}`));

    // Calculate some interesting stats
    if (stats.conversationCount > 0) {
      const avgMessagesPerConvo = Math.round(stats.totalMessages / stats.conversationCount);
      const assistantRatio = Math.round((stats.assistantMessages / stats.totalMessages) * 100);

      console.log(chalk.gray('\n═══════════════════════════════\n'));
      console.log(chalk.cyan('📈 Insights:'));
      console.log(chalk.gray(`   • Average messages per conversation: ${chalk.bold(avgMessagesPerConvo)}`));
      console.log(chalk.gray(`   • Assistant response ratio: ${chalk.bold(assistantRatio + '%')}`));
    }

    console.log(chalk.gray('\n═══════════════════════════════\n'));

    // Show push-up challenge results if enabled
    if (pushUpConfig.enabled && cursorPushUpResult) {
      console.log(chalk.cyan('💪 Push-Up Challenge:'));
      console.log(chalk.gray(`   Tracking: ${chalk.bold('Validation phrases in assistant responses')}`));

      if (cursorPushUpResult.pushUpsAdded > 0) {
        console.log(chalk.yellow('\n   📊 Validations Detected:'));
        console.log(chalk.gray(`   • New messages scanned: ${chalk.bold(cursorPushUpResult.newMessages)}`));
        console.log(chalk.red(`   • Validation phrases found: ${chalk.bold(cursorPushUpResult.validationPhrasesDetected?.length || 0)}`));
        if (cursorPushUpResult.validationPhrasesDetected && cursorPushUpResult.validationPhrasesDetected.length > 0) {
          console.log(chalk.gray(`   • Phrases: ${chalk.dim(cursorPushUpResult.validationPhrasesDetected.slice(0, 3).join(', '))}${cursorPushUpResult.validationPhrasesDetected.length > 3 ? '...' : ''}`));
        }
        console.log(chalk.red(`   • Push-ups added: ${chalk.bold(cursorPushUpResult.pushUpsAdded)}`));
        console.log(chalk.yellow(`   • Total debt: ${chalk.bold(cursorPushUpResult.totalDebt)}`));
      } else if (cursorPushUpResult.newMessages > 0) {
        console.log(chalk.green(`\n   ✅ No validations detected (${cursorPushUpResult.newMessages} messages scanned)`));
      } else {
        console.log(chalk.gray(`\n   No new messages since last check`));
      }

      // Show time-based statistics
      if (cursorPushUpResult.timeStats) {
        const stats = cursorPushUpResult.timeStats;
        console.log(chalk.cyan('\n   📅 Time-Based Stats:'));
        console.log(chalk.gray(`   • This week: ${chalk.bold(stats.thisWeek)} push-ups`));
        console.log(chalk.gray(`   • Last week: ${chalk.bold(stats.lastWeek)} push-ups`));
        console.log(chalk.gray(`   • This month: ${chalk.bold(stats.thisMonth)} push-ups`));
        console.log(chalk.gray(`   • This year: ${chalk.bold(stats.thisYear)} push-ups`));
      }

      console.log(chalk.gray('\n═══════════════════════════════\n'));
    }

    // Motivational message based on usage
    if (stats.conversationCount === 0) {
      console.log(chalk.yellow('💡 Start coding with Cursor to track your conversations!'));
    } else if (stats.conversationCount < 10) {
      console.log(chalk.cyan('🌱 Getting started with Cursor! Keep exploring.'));
    } else if (stats.conversationCount < 100) {
      console.log(chalk.green('🚀 Building momentum! You\'re learning fast.'));
    } else if (stats.conversationCount < 1000) {
      console.log(chalk.magenta('⚡ Power user! You\'re mastering AI-assisted development.'));
    } else {
      console.log(chalk.red('🔥 LEGENDARY! You\'re an AI-coding expert!'));
    }

    console.log('');

  } catch (error) {
    spinner.fail('Failed to fetch Cursor stats');

    if (error instanceof VibelogError) {
      if (error.code === 'CURSOR_NOT_FOUND') {
        console.log(chalk.yellow('\n💡 Cursor IDE not detected on this system.'));
        console.log(chalk.gray('   Install Cursor to track your AI conversations.'));
        console.log(chalk.gray('   Download: https://cursor.sh\n'));
        return;
      }
      throw error;
    }

    logger.error('Failed to fetch Cursor stats', error);
    throw new VibelogError(
      'Failed to fetch Cursor statistics. Please try again.',
      'CURSOR_STATS_FAILED'
    );
  }
}
