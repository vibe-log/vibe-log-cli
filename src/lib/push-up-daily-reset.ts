import chalk from 'chalk';
import Conf from 'conf';
import {
  getPushUpChallengeConfig,
  getPushUpStats,
  incrementStreak,
  resetStreak
} from './config';
import { syncPushUpStats } from './push-up-sync';
import { logger } from '../utils/logger';

// Import the config store instance
const configStore = new Conf({ projectName: 'vibe-log' });

/**
 * Check if daily reset is needed and perform it
 * Called at midnight or first command of new day
 */
export async function checkDailyReset(): Promise<boolean> {
  const config = getPushUpChallengeConfig();

  if (!config.enabled) {
    return false;
  }

  const today = new Date().toISOString().split('T')[0];

  if (config.lastResetDate === today) {
    return false; // Already reset today
  }

  logger.debug('Performing daily reset for push-up challenge');

  // Show summary of yesterday if there was activity
  if (config.todayDebt > 0 || config.todayCompleted > 0) {
    showDailySummary(config);
  }

  // Update streak logic
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = yesterday.toISOString().split('T')[0];

  if (config.todayCompleted > 0) {
    // User completed push-ups yesterday - increment streak
    incrementStreak();
    logger.debug(`Streak incremented to ${config.streakDays + 1} days`);
  } else if (config.totalDebt > 0 && config.lastCompletedDate !== yesterdayDate) {
    // Missed a day with debt - break streak
    if (config.streakDays > 0) {
      logger.debug('Streak broken - user missed a day with debt');
      resetStreak();
    }
  }

  // Reset daily counters
  configStore.set('pushUpChallenge', {
    ...config,
    todayDebt: 0,
    todayCompleted: 0,
    lastResetDate: today,
    pendingPrompts: [], // Clear batch queue
  });

  // Sync to backend
  await syncPushUpStats().catch(err => {
    logger.debug('Failed to sync after daily reset', err);
  });

  return true;
}

/**
 * Show summary of yesterday's activity
 */
function showDailySummary(yesterdayConfig: ReturnType<typeof getPushUpChallengeConfig>): void {
  console.log('\n' + chalk.bold('📊 Yesterday\'s Push-Up Challenge Summary:'));
  console.log(chalk.gray('   Debt added: ') + chalk.red(`${yesterdayConfig.todayDebt} push-ups`));
  console.log(chalk.gray('   Completed: ') + chalk.green(`${yesterdayConfig.todayCompleted} push-ups`));

  const net = yesterdayConfig.todayDebt - yesterdayConfig.todayCompleted;
  const netColor = net > 0 ? chalk.red : chalk.green;
  const netSymbol = net > 0 ? '+' : '';
  console.log(chalk.gray('   Net: ') + netColor(`${netSymbol}${net}`));
  console.log(chalk.gray('   Total debt: ') + chalk.yellow(yesterdayConfig.totalDebt));

  // Show streak info
  if (yesterdayConfig.streakDays > 0) {
    console.log(chalk.gray('   Streak: ') + chalk.cyan(`${yesterdayConfig.streakDays} days 🔥`));
  }

  console.log('');
}

/**
 * Get days since challenge started
 */
export function getDaysSinceStart(): number {
  const config = getPushUpChallengeConfig();

  if (!config.enabledDate) {
    return 0;
  }

  const start = new Date(config.enabledDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Check if it's a new day since last reset
 * Useful for checking if daily reset is needed
 */
export function isNewDay(): boolean {
  const config = getPushUpChallengeConfig();
  const today = new Date().toISOString().split('T')[0];

  return config.lastResetDate !== today;
}

/**
 * Format today's summary for display
 */
export function formatTodaySummary(): string {
  const stats = getPushUpStats();
  const config = getPushUpChallengeConfig();

  if (!config.enabled) {
    return '';
  }

  const lines: string[] = [];

  lines.push(chalk.bold.cyan('💪 Today\'s Push-Up Challenge:'));
  lines.push(chalk.gray('   Debt added: ') + chalk.red(`${stats.todayDebt}`));
  lines.push(chalk.gray('   Completed: ') + chalk.green(`${stats.todayCompleted}`));

  const outstanding = stats.todayDebt - stats.todayCompleted;
  if (outstanding > 0) {
    lines.push(chalk.gray('   Outstanding: ') + chalk.yellow(`${outstanding}`));
  } else if (outstanding < 0) {
    lines.push(chalk.gray('   Extra: ') + chalk.green(`${Math.abs(outstanding)}`));
  } else {
    lines.push(chalk.gray('   Status: ') + chalk.green('✅ Caught up!'));
  }

  lines.push(chalk.gray('   Total debt: ') + chalk.red(`${stats.debt}`));

  if (stats.streakDays > 0) {
    lines.push(chalk.gray('   Streak: ') + chalk.cyan(`${stats.streakDays} days 🔥`));
  }

  return lines.join('\n');
}
