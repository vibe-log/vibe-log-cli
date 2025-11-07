import chalk from 'chalk';
import { CursorHookInstaller } from '../lib/cursor/hook-installer';
import { getPushUpChallengeConfig } from '../lib/config';

/**
 * Manually install Cursor push-up hook (for debugging/testing)
 */
export async function cursorHooksInstall(): Promise<void> {
  console.log(chalk.blue('\n💪 Installing Cursor Push-Up Hook\n'));

  // Check if push-up challenge is enabled
  const config = getPushUpChallengeConfig();
  if (!config.enabled) {
    console.log(chalk.yellow('⚠️  Push-up challenge is not enabled first\n'));
    console.log(chalk.cyan('Enable it with: npx vibe-log-cli pushup enable\n'));
    return;
  }

  console.log(chalk.cyan('Step 1: Initializing hooks file...'));
  CursorHookInstaller.initializeHooksFile();
  console.log(chalk.green('✅ Hooks file ready\n'));

  console.log(chalk.cyan('Step 2: Installing push-up hook...'));
  await CursorHookInstaller.installPushUpHook();
  console.log(chalk.green('✅ Hook installed\n'));

  console.log(chalk.cyan('Step 3: Verifying installation...'));
  const installed = CursorHookInstaller.getInstalledHooks();

  if (installed.pushup) {
    console.log(chalk.green('✅ Cursor push-up hook is installed and ready!\n'));
    console.log(chalk.cyan('Test it:'));
    console.log(chalk.gray('  1. Open Cursor IDE'));
    console.log(chalk.gray('  2. Ask a question'));
    console.log(chalk.gray('  3. If Claude says "you\'re absolutely right" → debt increases'));
    console.log(chalk.gray('  4. Check: npx vibe-log-cli pushup stats\n'));
  } else {
    console.log(chalk.red('❌ Installation verification failed\n'));
  }
}
