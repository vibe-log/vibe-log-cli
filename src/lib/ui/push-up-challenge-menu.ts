import inquirer from 'inquirer';
import chalk from 'chalk';
import { colors } from './styles';
import {
  getPushUpChallengeConfig,
  getPushUpStats,
  setPushUpChallengeEnabled
} from '../config';
import { claudeSettingsManager } from '../claude-settings-manager';

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
