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
import { readGlobalSettings } from '../claude-settings-reader';

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
  console.log(chalk.bold('\n💪 You\'re Absolutely Right - Push-Up Challenge\n'));

  if (config.enabled) {
    // Detect current statusline status
    const settings = await readGlobalSettings();
    let statuslineStatus = '❌';
    if (settings?.statusLine?.command) {
      if (settings.statusLine.command.includes('statusline-challenge')) {
        statuslineStatus = '✅';
      } else if (settings.statusLine.command.includes('statusline')) {
        statuslineStatus = '⚠️';
      } else {
        statuslineStatus = '⚠️';
      }
    }

    // Simple single-line display
    console.log(colors.muted('Active • ') +
      chalk.white(`${config.pushUpsPerTrigger} per validation`) +
      colors.muted(' • Debt: ') +
      chalk.white(`${stats.debt}`) +
      colors.muted(' • Done: ') +
      chalk.white(`${stats.completed}`) +
      colors.muted(' • Statusline: ') +
      statuslineStatus);
  } else {
    console.log(colors.warning('❌ Disabled'));
  }

  console.log();

  // Build choices with statusline management
  const choices = config.enabled
    ? await buildEnabledMenuChoices(stats)
    : [
        { name: '✅ Enable', value: 'enable' },
        { name: '↩️ Back to main menu', value: 'back' }
      ];

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'Choose:',
    choices,
    pageSize: 30  // Show all menu items including benefit details without pagination
  }]);

  // Handle actions using switch statement (like main menu)
  switch (action) {
    case 'enable':
      await enableChallenge();
      break;

    case 'disable':
      await disableChallenge();
      break;

    case 'settle':
      await settleDebt();
      break;

    case 'reset':
      await resetChallenge();
      break;

    case 'install-statusline':
      await installChallengeStatusline();
      break;

    case 'switch-statusline':
      await switchToChallengeStatusline();
      break;

    case 'restore-statusline':
      await restorePreviousStatusline();
      break;

    case 'uninstall-statusline':
      await uninstallChallengeStatusline();
      break;

    case 'setup-daily-email':
      await setupDailyEmail();
      break;

    case 'email-settings':
      await showEmailSettings();
      break;

    case 'back':
      // Just return without calling menu again
      return;
  }

  // Show menu again (unless it was 'back', which already returned)
  await showPushUpChallengeMenu(false);
}

async function buildEnabledMenuChoices(stats: any): Promise<any[]> {
  // Detect current statusline status for menu options
  const settings = await readGlobalSettings();
  let currentStatusline = 'none';
  if (settings?.statusLine?.command) {
    if (settings.statusLine.command.includes('statusline-challenge')) {
      currentStatusline = 'challenge';
    } else if (settings.statusLine.command.includes('statusline')) {
      currentStatusline = 'prompt-analysis';
    } else {
      currentStatusline = 'other';
    }
  }

  const choices: any[] = [
    ...(stats.debt > 0
      ? [{ name: '💰 Settle debt', value: 'settle' }]
      : []
    ),
    new inquirer.Separator(),
    { name: '🔄 Reset challenge', value: 'reset' },
    { name: '❌ Disable', value: 'disable' },
    new inquirer.Separator(),
  ];

  // Add statusline management options based on current state
  if (currentStatusline === 'none') {
    choices.push({ name: '📥 Install challenge statusline', value: 'install-statusline' });
  } else if (currentStatusline === 'challenge') {
    choices.push({ name: '♻️ Restore previous statusline', value: 'restore-statusline' });
    choices.push({ name: '❌ Uninstall challenge statusline', value: 'uninstall-statusline' });
  } else if (currentStatusline === 'prompt-analysis') {
    choices.push({ name: '🔄 Switch to challenge statusline', value: 'switch-statusline' });
  } else if (currentStatusline === 'other') {
    choices.push({ name: '📥 Install challenge statusline (replace current)', value: 'install-statusline' });
  }

  choices.push(new inquirer.Separator());

  // Check if user is authenticated for daily email option
  const { isAuthenticated } = await import('../auth/token');
  const isLoggedIn = await isAuthenticated();

  if (isLoggedIn) {
    // Authenticated users - simple option
    choices.push({
      name: '📧 Push-ups tracked in daily emails',
      value: 'email-settings'
    });
  } else {
    // Non-authenticated users - show selectable option with benefits
    choices.push({
      name: '📧 Track this in your daily standup email',
      value: 'setup-daily-email'
    });
    // Add non-selectable benefit details below
    choices.push(new inquirer.Separator('   Wake up every morning with an email containing:'));
    choices.push(new inquirer.Separator('   ✅ Yesterday\'s accomplishments with metrics'));
    choices.push(new inquirer.Separator('   💪 Your push-up stats and streaks'));
    choices.push(new inquirer.Separator('   🎯 Strategic focus for today'));
    choices.push(new inquirer.Separator('   📊 Productivity insights over time'));
    choices.push(new inquirer.Separator(''));
    choices.push(new inquirer.Separator('   Perfect for team standups, status reports,'));
    choices.push(new inquirer.Separator('   and never forgetting what you built.'));
    choices.push(new inquirer.Separator('   (Requires free cloud sync)'));
  }

  choices.push(new inquirer.Separator());
  choices.push({ name: '↩️ Back to main menu', value: 'back' });

  return choices;
}

async function showFirstTimeSetup(): Promise<void> {
  console.clear();
  console.log(chalk.bold('\n💪 Push-Up Challenge Setup'));
  console.log(colors.muted('Do push-ups when Claude validates you!\n'));

  const { enable } = await inquirer.prompt([
    { type: 'confirm', name: 'enable', message: 'Enable push-up challenge?', default: true }
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
    },
    {
      type: 'confirm',
      name: 'installStatusline',
      message: 'Install challenge statusline in Claude Code?',
      default: true
    }
  ]);

  setPushUpChallengeEnabled(true, answers.pushUpsPerTrigger);
  await claudeSettingsManager.installPushUpChallengeHook();

  // Sync to server
  await syncPushUpStats();

  console.log(colors.success('\n✅ Challenge enabled!'));

  // Optionally install statusline
  if (answers.installStatusline) {
    try {
      await claudeSettingsManager.installChallengeStatusLineFeature();
      console.log(colors.success('✅ Challenge statusline installed!'));
      console.log(chalk.cyan('💡 Your push-up progress is now visible in Claude Code statusline\n'));
    } catch (error) {
      console.log(colors.warning('⚠️  Could not install statusline, but challenge is enabled\n'));
    }
  } else {
    console.log();
  }
}

async function disableChallenge(): Promise<void> {
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'Disable?', default: false }
  ]);

  if (confirm) {
    setPushUpChallengeEnabled(false);
    await claudeSettingsManager.uninstallPushUpChallengeHook();

    // Sync to server
    await syncPushUpStats();

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

async function installChallengeStatusline(): Promise<void> {
  try {
    await claudeSettingsManager.installChallengeStatusLineFeature();
    console.log(colors.success('\n✅ Challenge statusline installed!'));
    console.log(chalk.cyan('💡 Your push-up progress is now visible in Claude Code statusline\n'));
  } catch (error) {
    console.log(colors.error('\n❌ Failed to install statusline'));
    console.error(error);
    console.log();
  }
}

async function switchToChallengeStatusline(): Promise<void> {
  try {
    await claudeSettingsManager.removeStatusLineFeature();
    await claudeSettingsManager.installChallengeStatusLineFeature();
    console.log(colors.success('\n✅ Switched to challenge statusline!'));
    console.log(chalk.cyan('💡 Your push-up progress is now visible in Claude Code statusline\n'));
  } catch (error) {
    console.log(colors.error('\n❌ Failed to switch statusline'));
    console.error(error);
    console.log();
  }
}

async function restorePreviousStatusline(): Promise<void> {
  try {
    await claudeSettingsManager.removeChallengeStatusLineFeature(true);
    console.log(colors.success('\n✅ Previous statusline restored!\n'));
  } catch (error) {
    console.log(colors.error('\n❌ Failed to restore statusline'));
    console.error(error);
    console.log();
  }
}

async function uninstallChallengeStatusline(): Promise<void> {
  const { confirmUninstall } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmUninstall',
    message: 'Remove challenge statusline? (Stats will be preserved)',
    default: false
  }]);

  if (confirmUninstall) {
    try {
      await claudeSettingsManager.removeChallengeStatusLineFeature();
      console.log(colors.success('\n✅ Challenge statusline uninstalled!'));
      console.log(chalk.gray('   Your challenge stats are still preserved\n'));
    } catch (error) {
      console.log(colors.error('\n❌ Failed to uninstall statusline'));
      console.error(error);
      console.log();
    }
  } else {
    console.log(chalk.yellow('\n❌ Cancelled\n'));
  }
}

/**
 * Setup daily email for non-authenticated users
 * Launches cloud setup wizard directly
 */
async function setupDailyEmail(): Promise<void> {
  try {
    const { guidedCloudSetup } = await import('./cloud-setup-wizard');
    await guidedCloudSetup();

    console.log(colors.success('\n✅ Daily emails enabled!'));
    console.log('Your first daily standup email arrives tomorrow morning.');
    console.log('It will include your push-up stats! 💪\n');

    console.log(chalk.gray('Press Enter to continue...'));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
  } catch (error) {
    console.log(colors.warning('\nCloud setup cancelled or failed.'));
    console.log(colors.muted('You can try again from the push-up menu\n'));
  }
}

/**
 * Show email settings for authenticated users
 * Links to web dashboard email settings
 */
async function showEmailSettings(): Promise<void> {
  console.clear();
  console.log(colors.success('\n✅ You\'re all set!\n'));
  console.log('Your push-up stats are automatically included');
  console.log('in your daily standup emails.\n');

  console.log(colors.muted('📧 Your daily email includes:'));
  console.log(colors.subdued('   • Yesterday\'s coding accomplishments'));
  console.log(colors.subdued('   • Push-up stats and streaks 💪'));
  console.log(colors.subdued('   • Productivity insights'));
  console.log(colors.subdued('   • Strategic focus for today'));
  console.log();

  const settingsUrl = 'https://app.vibe-log.dev/settings/email';
  console.log(colors.muted('⚙️  Manage your email settings:'));
  console.log(chalk.cyan(`   ${settingsUrl}`));
  console.log(colors.subdued('   • Change delivery time'));
  console.log(colors.subdued('   • Toggle daily/weekly emails'));
  console.log(colors.subdued('   • Update preferences'));
  console.log();

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: '🌐 Open email settings in browser', value: 'open' },
      { name: '← Back to menu', value: 'back' }
    ]
  }]);

  if (action === 'open') {
    try {
      const open = (await import('open')).default;
      await open(settingsUrl);
      console.log(colors.muted('\nOpening browser...\n'));
    } catch (error) {
      console.log(colors.warning(`\nPlease visit: ${settingsUrl}\n`));
    }
  }
}
