import inquirer from 'inquirer';
import chalk from 'chalk';
import { colors } from './styles';
import {
  getPushUpChallengeConfig,
  getPushUpStats,
  setPushUpChallengeEnabled,
  recordPushUpsCompleted,
  incrementPushUpDebt,
  resetPushUpStats
} from '../config';
import { claudeSettingsManager } from '../claude-settings-manager';
import { displayReceiptWithCopyOption } from './push-up-receipt';
import { syncPushUpStats } from '../push-up-sync';

/**
 * Simplified push-up challenge menu (silent mode only)
 */
export async function showPushUpChallengeMenu(firstTime: boolean = false): Promise<void> {
  const config = getPushUpChallengeConfig();
  const stats = getPushUpStats();

  if (firstTime) {
    await showFirstTimeSetup();
    return;
  }

  console.clear();
  console.log(chalk.bold('\n💪 Push-Up Challenge'));
  console.log(colors.muted('Do push-ups when Claude validates you! (Silent mode)\n'));

  if (config.enabled) {
    console.log(colors.success('✅ Active'));
    console.log(colors.muted(`   Rate: ${config.pushUpsPerTrigger} push-ups per validation\n`));
    console.log(chalk.bold('📊 Stats:'));
    console.log(colors.muted('   Today: ') + chalk.cyan(`${stats.todayCompleted} done / ${stats.todayDebt} owed`));
    console.log(colors.muted('   Total Debt: ') + chalk.red(stats.debt.toString()));
    console.log(colors.muted('   Total Completed: ') + chalk.green(stats.completed.toString()));
  } else {
    console.log(colors.warning('❌ Disabled'));
  }

  console.log();

  const choices = config.enabled
    ? [
        ...(stats.debt > 0
          ? [{ name: '💰 Settle debt', value: 'settle' }]
          : []
        ),
        { name: '🔄 Reset challenge', value: 'reset' },
        { name: '❌ Disable', value: 'disable' },
        { name: '🔙 Back', value: 'back' }
      ]
    : [
        { name: '✅ Enable', value: 'enable' },
        { name: '🔙 Back', value: 'back' }
      ];

  const { action } = await inquirer.prompt([{ type: 'list', name: 'action', message: 'Choose:', choices }]);

  if (action === 'enable') {
    await enableChallenge();
    await showPushUpChallengeMenu(false);
  } else if (action === 'disable') {
    await disableChallenge();
    await showPushUpChallengeMenu(false);
  } else if (action === 'settle') {
    await settleDebt();
    await showPushUpChallengeMenu(false);
  } else if (action === 'reset') {
    await resetChallenge();
    await showPushUpChallengeMenu(false);
  }
}

async function showFirstTimeSetup(): Promise<void> {
  console.clear();
  console.log(chalk.bold('\n💪 Push-Up Challenge Setup'));
  console.log(colors.muted('Do push-ups when Claude validates you!\n'));

  const { enable } = await inquirer.prompt([
    { type: 'confirm', name: 'enable', message: 'Enable push-up challenge?', default: false }
  ]);

  if (enable) {
    await enableChallenge();
  }
}

async function enableChallenge(): Promise<void> {
  const answers = await (inquirer.prompt as any)([
    {
      type: 'number',
      name: 'pushUpsPerTrigger',
      message: 'Push-ups per validation?',
      default: 1,
      validate: (v: number) => (!v || v < 1 || v > 100 ? 'Enter 1-100' : true)
    }
  ]);

  setPushUpChallengeEnabled(true, answers.pushUpsPerTrigger);
  await claudeSettingsManager.installPushUpChallengeHook();
  console.log(colors.success('\n✅ Enabled!'));
}

async function disableChallenge(): Promise<void> {
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'Disable?', default: false }
  ]);

  if (confirm) {
    setPushUpChallengeEnabled(false);
    await claudeSettingsManager.uninstallPushUpChallengeHook();
    console.log(colors.success('\n✅ Disabled'));
  }
}

async function settleDebt(): Promise<void> {
  const stats = getPushUpStats();
  const totalDebt = stats.debt;

  if (totalDebt <= 0) {
    console.log(colors.success('\n✅ No debt to settle! You\'re all caught up!'));
    return;
  }

  console.clear();
  console.log(chalk.bold('\n💰 Settle Debt'));
  console.log(colors.muted(`Total debt: ${totalDebt} push-ups\n`));

  const { amount } = await (inquirer.prompt as any)([
    {
      type: 'number',
      name: 'amount',
      message: 'How many push-ups did you complete?',
      default: totalDebt,
      validate: (v: number) => {
        if (!v || isNaN(v)) return 'Please enter a valid number';
        if (v < 0) return 'Amount must be 0 or greater';
        if (v > totalDebt) return `Cannot settle more than your debt (${totalDebt})`;
        return true;
      }
    }
  ]);

  if (amount > 0) {
    // Mark push-ups as completed and reduce debt
    recordPushUpsCompleted(amount);
    incrementPushUpDebt(-amount);
    await syncPushUpStats();

    console.log(colors.success(`\n✅ Marked ${amount} push-ups as completed!`));
    console.log();

    // Display the awesome receipt with clipboard copy
    await displayReceiptWithCopyOption(amount);

    console.log();
    console.log(chalk.gray('Press Enter to continue...'));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
  } else {
    console.log(colors.warning('\n📝 No debt settled.'));
  }
}

async function resetChallenge(): Promise<void> {
  const stats = getPushUpStats();

  console.clear();
  console.log(chalk.bold('\n🔄 Reset Challenge'));
  console.log(colors.warning('This will reset all your stats (debt, completed, streak).\n'));
  console.log(chalk.gray('Current stats:'));
  console.log(colors.muted('   Total debt: ') + chalk.red(stats.debt));
  console.log(colors.muted('   Total completed: ') + chalk.green(stats.completed));
  console.log(colors.muted('   Streak: ') + chalk.yellow(`${stats.streakDays} days 🔥\n`));

  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'Are you sure you want to reset?', default: false }
  ]);

  if (confirm) {
    // Reset all stats
    resetPushUpStats();
    await syncPushUpStats();
    console.log(colors.success('\n✅ Challenge reset! Starting fresh.'));
  } else {
    console.log(colors.muted('\n❌ Reset cancelled.'));
  }
}
