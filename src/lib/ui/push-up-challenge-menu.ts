import inquirer from 'inquirer';
import chalk from 'chalk';
import { colors } from './styles';
import {
  getPushUpChallengeConfig,
  getPushUpStats,
  setPushUpChallengeEnabled,
  setCursorIntegrationEnabled,
  recordPushUpsCompleted,
  incrementPushUpDebt,
  resetPushUpStats,
  getDashboardUrl,
  checkAndUpdateCursorPushUps
} from '../config';
import { isCursorInstalled } from '../readers/cursor';
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

  // Auto-scan for new Cursor messages if integration is enabled
  if (config.enabled && config.cursorIntegrationEnabled) {
    try {
      const result = await checkAndUpdateCursorPushUps();
      if (result.pushUpsAdded > 0) {
        console.log(colors.info(`\n💬 Cursor IDE: Found ${result.validationPhrasesDetected?.length || 0} new validation(s) - added ${result.pushUpsAdded} push-ups to debt\n`));
      }
    } catch (error) {
      // Silently fail - don't block menu if Cursor scanning fails
    }
  }

  console.clear();
  console.log(chalk.bold('\n💪 You\'re Absolutely Right - Push-Up Challenge\n'));
  console.log();
  console.log(chalk.bold('The Rule: Every "You are absolutely right" from Claude = 1 push-up'));
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

    case 'open-email-dashboard':
      // Open dashboard settings page directly
      try {
        const open = (await import('open')).default;
        const dashboardUrl = getDashboardUrl();
        const settingsUrl = `${dashboardUrl}/settings`;
        console.log(colors.info(`\nOpening dashboard: ${settingsUrl}`));
        await open(settingsUrl);
      } catch (error) {
        console.log(colors.warning('\nCould not open browser automatically.'));
        const dashboardUrl = getDashboardUrl();
        console.log(colors.muted(`Please visit: ${dashboardUrl}/settings\n`));
      }
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
    // Authenticated users - show configure action without repeating benefits
    choices.push(new inquirer.Separator('📧 Push-ups tracked in daily emails'));
    choices.push(new inquirer.Separator(''));

    // Selectable action to open dashboard
    choices.push({
      name: '🌐 Open dashboard to configure email settings',
      value: 'open-email-dashboard'
    });
    // Show what can be configured
    choices.push(new inquirer.Separator('   • Change delivery time'));
    choices.push(new inquirer.Separator('   • Toggle daily/weekly emails'));
    choices.push(new inquirer.Separator('   • Update preferences'));
  } else {
    // Non-authenticated users - show selectable setup option with benefits
    choices.push({
      name: '📧 Track this in your daily standup email',
      value: 'setup-daily-email'
    });

  }

  choices.push(new inquirer.Separator());
  choices.push({ name: '↩️ Back to main menu', value: 'back' });

  return choices;
}

async function showFirstTimeSetup(): Promise<void> {
  console.clear();
  console.log(chalk.bold('\n💪 Push-Up Challenge Setup\n'));
 
  console.log(chalk.bold('The Rule: Every "You are absolutely right" from Claude = 1 push-up'));
  console.log();

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
      name: 'enableCursorIntegration',
      message: 'Enable Cursor IDE integration? (detect validations in Cursor conversations)',
      default: true
    },
    {
      type: 'confirm',
      name: 'installStatusline',
      message: 'Install challenge statusline in Claude Code?',
      default: true
    }
  ]);

  setPushUpChallengeEnabled(true, answers.pushUpsPerTrigger);

  // Enable Cursor integration if requested
  if (answers.enableCursorIntegration) {
    // Check if Cursor is actually installed (cross-platform)
    const cursorInstalled = isCursorInstalled();

    if (!cursorInstalled) {
      console.log(colors.warning('\n⚠️  Cursor IDE not detected on this system'));
      console.log(chalk.gray('   Cursor integration will be enabled, but no validations will be tracked'));
      console.log(chalk.gray('   Install Cursor at https://cursor.sh and restart the CLI to start tracking\n'));
    }

    setCursorIntegrationEnabled(true);

    // Install Cursor hooks
    if (cursorInstalled) {
      try {
        const { CursorHookInstaller } = await import('../cursor/hook-installer');
        // Initialize hooks file first if it doesn't exist
        CursorHookInstaller.initializeHooksFile();
        await CursorHookInstaller.installPushUpHook();
      } catch (error) {
        console.log(colors.warning('⚠️  Could not install Cursor hook, but integration is enabled'));
      }
    }
  }

  await claudeSettingsManager.installPushUpChallengeHook();

  // Check authentication status once for both sync and email setup
  const { isAuthenticated } = await import('../auth/token');
  const isLoggedIn = await isAuthenticated();

  // Sync to server only if authenticated
  if (isLoggedIn) {
    await syncPushUpStats();
  }

  console.log(colors.success('\n✅ Challenge enabled!'));

  // If Cursor integration was enabled, scan immediately
  if (answers.enableCursorIntegration) {
    console.log(colors.info('💬 Scanning Cursor IDE for validations...'));
    try {
      const result = await checkAndUpdateCursorPushUps();
      if (result.pushUpsAdded > 0) {
        console.log(colors.info(`   Found ${result.validationPhrasesDetected?.length || 0} validation(s) - added ${result.pushUpsAdded} push-ups`));
      } else {
        console.log(colors.muted('   No validations found in Cursor'));
      }
    } catch (error) {
      console.log(colors.warning('   Could not scan Cursor (may not be installed)'));
    }
  }

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

  // If not authenticated, offer email setup
  if (!isLoggedIn) {
    const { setupEmail } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'setupEmail',
        message: 'Want daily emails with your push-up stats and coding session summaries for standups?',
        default: true
      }
    ]);

    if (setupEmail) {
      await setupDailyEmail();
    }
  }
}

async function disableChallenge(): Promise<void> {
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'Disable?', default: false }
  ]);

  if (confirm) {
    // Disable the challenge
    setPushUpChallengeEnabled(false);
    await claudeSettingsManager.uninstallPushUpChallengeHook();

    // Remove challenge statusline if installed
    try {
      await claudeSettingsManager.removeChallengeStatusLineFeature();
    } catch (error) {
      // Silently fail - statusline might not be installed
    }

    // Disable cursor integration
    setCursorIntegrationEnabled(false);

    // Uninstall Cursor hooks
    try {
      const { CursorHookInstaller } = await import('../cursor/hook-installer');
      const installed = CursorHookInstaller.getInstalledHooks();
      if (installed.pushup) {
        await CursorHookInstaller.uninstallHooks('pushup');
      }
    } catch (error) {
      // Silently fail - hook might not be installed
    }

    // Sync to server only if authenticated
    const { isAuthenticated } = await import('../auth/token');
    const isLoggedIn = await isAuthenticated();
    if (isLoggedIn) {
      await syncPushUpStats();
    }

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

    // Sync to server only if authenticated
    const { isAuthenticated } = await import('../auth/token');
    const isLoggedIn = await isAuthenticated();
    if (isLoggedIn) {
      await syncPushUpStats();
    }

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

    // Sync to server only if authenticated
    const { isAuthenticated } = await import('../auth/token');
    const isLoggedIn = await isAuthenticated();
    if (isLoggedIn) {
      await syncPushUpStats();
    }

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
 * Note: guidedCloudSetup() handles all success/cancellation messages
 */
async function setupDailyEmail(): Promise<void> {
  try {
    const { guidedCloudSetup } = await import('./cloud-setup-wizard');
    await guidedCloudSetup();
    // No additional messages needed - wizard shows its own success/cancellation messages
  } catch (error) {
    // Only show error if there's an unexpected exception
    console.log(colors.warning('\nCloud setup failed unexpectedly.'));
    console.log(colors.muted('You can try again from the push-up menu\n'));
  }
}

