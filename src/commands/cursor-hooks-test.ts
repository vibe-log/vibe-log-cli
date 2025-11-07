import chalk from 'chalk';
import { CursorHookInstaller } from '../lib/cursor/hook-installer';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Test Cursor hooks installation (for debugging)
 */
export async function cursorHooksTest(): Promise<void> {
  console.log(chalk.blue('\n🧪 Testing Cursor Hooks Installation\n'));

  try {
    console.log(chalk.cyan('Step 1: Installing push-up hook...'));
    await CursorHookInstaller.installPushUpHook();
    console.log(chalk.green('✅ Installation completed\n'));

    console.log(chalk.cyan('Step 2: Verifying installation...'));
    const hooksPath = path.join(os.homedir(), '.cursor', 'hooks.json');

    if (fs.existsSync(hooksPath)) {
      const content = fs.readFileSync(hooksPath, 'utf-8');
      const config = JSON.parse(content);

      console.log(chalk.green('✅ hooks.json created successfully\n'));
      console.log(chalk.cyan('📄 File contents:'));
      console.log(chalk.gray(JSON.stringify(config, null, 2)));
      console.log();

      console.log(chalk.cyan('Step 3: Checking hook status...'));
      const installed = CursorHookInstaller.getInstalledHooks();
      console.log(chalk.gray('   Push-up challenge: ') + (installed.pushup ? chalk.green('✅ Installed') : chalk.red('❌ Not installed')));
      console.log();

      console.log(chalk.green('✅ Test completed successfully!\n'));
      console.log(chalk.cyan('Cleanup: Uninstalling test hook...'));
      await CursorHookInstaller.uninstallHooks('pushup');
      console.log(chalk.green('✅ Cleanup completed\n'));
    } else {
      console.log(chalk.red('❌ hooks.json was not created'));
      console.log(chalk.gray(`   Expected at: ${hooksPath}\n`));
    }
  } catch (error) {
    console.log(chalk.red('\n❌ Test failed'));
    console.log(chalk.gray(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
    throw error;
  }
}
