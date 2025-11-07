import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CursorHookInstaller } from '../lib/cursor/hook-installer';

/**
 * Show Cursor hooks installation status
 */
export async function cursorHooksStatus(): Promise<void> {
  console.log(chalk.blue('\n🔍 Cursor Hooks Installation Status\n'));

  const hooksPath = path.join(os.homedir(), '.cursor', 'hooks.json');
  const cursorDir = path.join(os.homedir(), '.cursor');

  // Check if .cursor directory exists
  if (!fs.existsSync(cursorDir)) {
    console.log(chalk.red('❌ Cursor directory not found'));
    console.log(chalk.gray(`   Expected at: ${cursorDir}`));
    console.log(chalk.yellow('\n💡 Make sure Cursor IDE is installed\n'));
    return;
  }

  console.log(chalk.green('✅ Cursor directory found'));
  console.log(chalk.gray(`   Location: ${cursorDir}\n`));

  // Check if hooks.json exists
  if (!fs.existsSync(hooksPath)) {
    console.log(chalk.yellow('⚠️  No hooks.json file found'));
    console.log(chalk.gray(`   Expected at: ${hooksPath}\n`));

    console.log(chalk.cyan('Creating empty hooks.json file...'));
    try {
      CursorHookInstaller.initializeHooksFile();
      console.log(chalk.green('✅ Created hooks.json file'));
      console.log(chalk.gray('   Ready for hook installation\n'));
    } catch (error) {
      console.log(chalk.red('❌ Failed to create hooks.json'));
      console.log(chalk.gray(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
    }
  } else {
    console.log(chalk.green('✅ hooks.json file found\n'));

    // Show contents
    try {
      const content = fs.readFileSync(hooksPath, 'utf-8');
      const config = JSON.parse(content);

      console.log(chalk.cyan('📄 Hook Configuration:'));
      console.log(chalk.gray(JSON.stringify(config, null, 2)));
      console.log();
    } catch (error) {
      console.log(chalk.red('❌ Failed to read hooks.json'));
      console.log(chalk.gray(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
    }
  }

  // Check installation status using our API
  const installed = CursorHookInstaller.getInstalledHooks();

  console.log(chalk.cyan('📋 Hook Status:'));
  console.log(chalk.gray('   Push-up challenge: ') + (installed.pushup ? chalk.green('✅ Installed') : chalk.red('❌ Not installed')));
  console.log(chalk.gray('   Smart upload: ') + (installed.upload ? chalk.green('✅ Installed') : chalk.red('❌ Not installed')));
  console.log();
}
