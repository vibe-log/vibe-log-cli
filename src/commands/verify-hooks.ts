import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { parseProjectName } from '../lib/ui/project-display';
import { exec } from 'child_process';
import { promisify } from 'util';
import { showSuccess, showWarning, showInfo, showError } from '../lib/ui';
import { getToken } from '../lib/auth/token';
import { getProjectTrackingMode, getTrackedProjects, getCliPath } from '../lib/config';
import { logger } from '../utils/logger';
import { getHookStatus, validateHookCommands, readClaudeSettings } from '../lib/hooks-manager';

const execAsync = promisify(exec);

/**
 * Test hook execution
 */
async function testHookExecution(): Promise<boolean> {
  try {
    // Get the CLI command path
    const cliCommand = getCliPath();
    // Try to execute the hook command in dry-run mode
    const { stdout, stderr } = await execAsync(`${cliCommand} send --dry --silent`, {
      timeout: 5000,
      env: { ...process.env }
    });
    
    logger.debug('Hook test output', { stdout, stderr });
    return true;
  } catch (error) {
    logger.error('Hook test failed', error);
    return false;
  }
}

/**
 * Verify that vibe-log hooks are properly installed and configured
 */
export async function verifyHooks(): Promise<void> {
  console.log(chalk.cyan('🔍 Verifying Vibe-Log Hooks...\n'));
  
  // 1. Check authentication
  console.log(chalk.gray('1. Checking authentication...'));
  const token = await getToken();
  if (token) {
    showSuccess('  ✓ Authenticated');
  } else {
    showWarning('  ⚠ Not authenticated (hooks will skip sending)');
    showInfo('    Run "npx vibe-log" and authenticate');
  }
  
  // 2. Check hooks installation
  console.log(chalk.gray('\n2. Checking hook installation...'));
  const hookStatus = await getHookStatus();
  
  if (!hookStatus.installed) {
    showError('  ✗ No hooks installed');
    showInfo('    Run "vibe-log install-hooks" to install');
    return;
  }
  
  if (hookStatus.settingsPath) {
    showSuccess(`  ✓ Hooks found at: ${hookStatus.settingsPath}`);
  }
  
  // Show configured CLI path
  const cliPath = getCliPath();
  console.log(chalk.gray(`  CLI command: ${cliPath}`));
  
  
  if (hookStatus.preCompactHook) {
    showSuccess('  ✓ PreCompact hook installed');
    if (hookStatus.hookCommands.preCompact) {
      console.log(chalk.gray(`    Command: ${hookStatus.hookCommands.preCompact}`));
    }
  } else {
    showWarning('  ⚠ PreCompact hook not installed');
  }
  
  // Check for disableAllHooks setting
  const { merged: settings } = await readClaudeSettings();
  if (settings?.disableAllHooks) {
    showError('  ✗ All hooks are DISABLED (disableAllHooks: true)');
    showInfo('    Remove this setting from settings file to enable hooks');
  }
  
  // 3. Check project tracking configuration
  console.log(chalk.gray('\n3. Checking project tracking...'));
  const trackingMode = getProjectTrackingMode();
  const trackedProjects = getTrackedProjects();
  
  if (trackingMode === 'all') {
    showSuccess('  ✓ Tracking ALL projects');
    console.log(chalk.gray('    All Claude Code sessions will be synced'));
  } else if (trackingMode === 'selected' && trackedProjects.length > 0) {
    showSuccess(`  ✓ Tracking ${trackedProjects.length} selected project(s):`);
    trackedProjects.forEach(project => {
      const projectName = parseProjectName(project);
      console.log(chalk.gray(`    • ${projectName} (${project})`));
    });
  } else if (trackingMode === 'none' || trackedProjects.length === 0) {
    showWarning('  ⚠ No projects are being tracked');
    showInfo('    Use "vibe-log projects" to select projects to track');
    console.log(chalk.yellow('    Hooks will run but won\'t send any data'));
  }
  
  // 4. Test hook execution
  console.log(chalk.gray('\n4. Testing hook execution...'));
  const canExecute = await testHookExecution();
  if (canExecute) {
    showSuccess('  ✓ Hook command can execute');
  } else {
    showWarning('  ⚠ Hook command test failed');
    showInfo('    This might be normal if vibe-log is not in PATH');
  }
  
  // Validate hook commands
  const validation = await validateHookCommands();
  if (!validation.valid && validation.errors.length > 0) {
    showWarning('  ⚠ Hook validation issues:');
    validation.errors.forEach(error => {
      console.log(chalk.yellow(`    • ${error}`));
    });
  }
  
  // 5. Check for hook logs
  console.log(chalk.gray('\n5. Checking hook logs...'));
  const logPath = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.vibe-log',
    'hooks.log'
  );
  
  try {
    const stats = await fs.stat(logPath);
    if (stats.size > 0) {
      showWarning(`  ⚠ Hook errors logged at: ${logPath}`);
      showInfo('    Run "vibe-log hooks-log" to view errors');
    } else {
      showSuccess('  ✓ No hook errors');
    }
  } catch {
    showSuccess('  ✓ No hook errors (no log file)');
  }
  
  // Summary
  console.log(chalk.cyan('\n📊 Summary:'));
  if (hookStatus.installed && !settings?.disableAllHooks && token && 
      (trackingMode === 'all' || (trackingMode === 'selected' && trackedProjects.length > 0))) {
    showSuccess('  Hooks are properly configured and ready to sync sessions!');
  } else {
    showWarning('  Hooks need configuration. See issues above.');
  }
  
  console.log('');
  console.log(chalk.gray('For more help: https://docs.vibe-log.dev/cli/hooks'));
}