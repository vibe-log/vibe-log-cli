import chalk from 'chalk';
import inquirer from 'inquirer';
import { requireAuth } from '../lib/auth/token';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';
import { showSuccess, showWarning, showInfo } from '../lib/ui';
import { getCliPath } from '../lib/config';
import { 
  getHookStatus, 
  installVibeLogHooks, 
  uninstallVibeLogHooks
} from '../lib/hooks-manager';
import { getGlobalSettingsPath } from '../lib/claude-core';

interface InstallHooksOptions {
  uninstall?: boolean;
  force?: boolean;
  silent?: boolean;
}

/**
 * Install Vibe-Log hooks into Claude Code settings
 */
export async function installHooks(options: InstallHooksOptions = {}): Promise<void> {
  // Require authentication first
  await requireAuth();
  
  const settingsPath = getGlobalSettingsPath();
  
  // Show important information about global hooks
  if (!options.silent && !options.uninstall) {
    console.log('');
    console.log(chalk.cyan('ℹ️  About Vibe-Log Hooks:'));
    console.log(chalk.gray('  • Hooks will be installed globally for ALL Claude Code projects'));
    console.log(chalk.gray('  • Only tracked projects will send data (respecting your privacy)'));
    console.log(chalk.gray('  • Use "vibe-log projects" to manage which projects are tracked'));
    console.log('');
    console.log(chalk.dim('Target file: ' + settingsPath));
    console.log('');
  }
  
  try {
    if (options.uninstall) {
      // Uninstall hooks
      await uninstallVibeLogHooks();
      
      showSuccess('Global hooks uninstalled successfully!');
      console.log('');
      console.log(chalk.gray('Your sessions will no longer be automatically synced.'));
      console.log(chalk.gray('To reinstall: vibe-log install-hooks'));
      return;
    }
    
    // Check if hooks already exist
    const hookStatus = await getHookStatus();
    if (hookStatus.installed && !options.force) {
      showWarning('Hooks already installed!');
      showInfo('Use --force to overwrite existing hooks');
      
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Overwrite existing hooks?',
          default: false,
        },
      ]);
      
      if (!proceed) {
        console.log(chalk.yellow('Installation cancelled.'));
        return;
      }
    }
    
    // Install hooks using the centralized manager
    await installVibeLogHooks(options.force);
    
    // Log the file being modified
    console.log('');
    console.log(chalk.gray('📝 Hooks written to:'));
    console.log(chalk.yellow(`   ${settingsPath}`));
    console.log('');
    
    // Confirm file was written
    console.log(chalk.green('✓ Settings file updated successfully'));
    
    // We don't track mode anymore - hooks in settings.json are the source of truth
    
    // Show CLI command being used
    const cliCommand = getCliPath();
    console.log(chalk.gray(`\nUsing CLI command: ${cliCommand}`));
    
    // Success!
    showSuccess('Global hooks installed successfully!');
    console.log('');
    console.log(chalk.cyan('📋 Installed hooks (globally):'));
    console.log(chalk.gray('  • Stop       - Syncs sessions when Claude Code stops'));
    console.log(chalk.gray('  • PreCompact - Syncs sessions before context compression'));
    console.log('');
    
    // Show that global hooks are installed
    console.log(chalk.cyan('📊 Hook configuration:'));
    console.log(chalk.green('  ✓ Global hooks installed - tracking ALL projects'));
    
    // The old code had conditional logic based on tracking mode
    // Now we know global hooks mean all projects are tracked
    
    console.log('');
    console.log(chalk.green('✨ Your coding sessions will now be automatically synced!'));
    console.log('');
    console.log(chalk.gray('Commands:'));
    console.log(chalk.gray('  • vibe-log projects        - Manage tracked projects'));
    console.log(chalk.gray('  • vibe-log verify-hooks    - Check if hooks are working'));
    console.log(chalk.gray('  • vibe-log install-hooks --uninstall - Remove hooks'));
    console.log('');
    console.log(chalk.gray('Note: To change CLI path, run:'));
    console.log(chalk.gray('  vibe-log config set cliPath "/path/to/vibe-log.js"'));
    
  } catch (error) {
    logger.error('Failed to install hooks', error);
    
    if (error instanceof Error) {
      if (error.message.includes('EACCES')) {
        throw new VibelogError(
          'Permission denied. Make sure you have write access to the .claude directory.',
          'PERMISSION_DENIED'
        );
      }
      
      // Pass through error messages from hooks-manager
      if (error.message.includes('already installed')) {
        throw new VibelogError(error.message, 'HOOKS_ALREADY_INSTALLED');
      }
    }
    
    throw new VibelogError(
      'Failed to install hooks. Please try again.',
      'INSTALL_FAILED'
    );
  }
}