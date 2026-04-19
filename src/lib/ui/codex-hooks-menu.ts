import inquirer from 'inquirer';
import path from 'path';
import { colors, box } from './styles';
import { showSuccess, showWarning, showError, showInfo } from '../ui';
import { sendWithTimeout } from '../../commands/send';
import { parseProjectName } from './project-display';
import { discoverCodexProjects, CodexProject } from '../codex-core';
import {
  getCodexHooksStatus,
  installGlobalCodexHooks,
  installSelectiveCodexProjectHooks,
  uninstallAllCodexHooks,
  CodexProjectHookConfig,
  CodexHooksStatus,
} from '../hooks/codex-hooks-provider';
import { testCodexHook, testAllCodexHooks, displayTestResult } from '../hooks/hooks-tester';

export async function showCodexHooksManagementMenu(guidedMode: boolean = false): Promise<boolean | void> {
  let shouldContinue = true;
  let hooksWereInstalled = false;

  while (shouldContinue) {
    console.clear();

    const status = await getCodexHooksStatus();
    const mode = getCodexModeFromStatus(status);
    displayCodexHeader(mode, status);

    const choices = [
      {
        name: '[1] Track current and future Codex projects - Install global hooks',
        value: 'track-all',
      },
      {
        name: '[2] Select specific Codex projects - Install repo-local hooks',
        value: 'track-selected',
      },
      {
        name: '[3] Disable Codex tracking - Remove Vibe-Log Codex hooks',
        value: 'track-none',
      },
      new inquirer.Separator(),
    ];

    if (status.sessionStartHook.installed || status.stopHook.installed || (status.trackedProjects?.length || 0) > 0) {
      choices.push({
        name: '[4] Test Codex hooks',
        value: 'test',
      });
    }

    choices.push(
      {
        name: '[5] View Codex hook status',
        value: 'detailed-status',
      },
      new inquirer.Separator(),
      {
        name: `[B] ${guidedMode ? '← Back' : 'Back to provider menu'}`,
        value: 'back',
      }
    );

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Choose an option:',
        choices,
        pageSize: 10,
      },
    ]);

    switch (action) {
      case 'track-all':
        await configureCodexTrackAll();
        hooksWereInstalled = true;
        break;
      case 'track-selected':
        if (await configureCodexTrackSelected()) {
          hooksWereInstalled = true;
        }
        break;
      case 'track-none':
        await disableCodexTracking(status);
        break;
      case 'test':
        await testCodexHooksMenu();
        await promptToContinue();
        break;
      case 'detailed-status':
        await showCodexDetailedStatus(status);
        await promptToContinue();
        break;
      case 'back':
        shouldContinue = false;
        break;
    }
  }

  if (guidedMode) {
    return hooksWereInstalled;
  }
}

function displayCodexHeader(mode: 'all' | 'selected' | 'none', status: CodexHooksStatus): void {
  console.log(colors.accent('\n🔧 Codex Auto-sync Configuration\n'));
  console.log(colors.subdued('Codex hooks are experimental. Vibe-Log uses them only for background session sync.\n'));

  console.log(colors.info('We use the following Codex hooks:'));
  console.log('  📍 ' + colors.accent('SessionStart') + colors.subdued(' - Syncs recent Codex sessions when work starts'));
  console.log('  🔚 ' + colors.accent('Stop') + colors.subdued(' - Syncs after Codex finishes responding'));
  console.log(colors.subdued('  No ACP, prompt coach, or statusline is installed for Codex hooks.\n'));

  if (status.unsupported) {
    console.log(colors.warning(status.unsupportedReason || 'Codex hooks are unsupported on this platform.'));
    console.log('');
    return;
  }

  console.log(box.horizontal.repeat(60));
  console.log('');

  if (mode === 'all') {
    console.log('Current Status: ' + colors.success('✅ Tracking Codex globally'));
  } else if (mode === 'selected') {
    const projectCount = status.trackedProjects?.length || 0;
    console.log('Current Status: ' + colors.warning(`📍 Tracking ${projectCount} Codex project${projectCount !== 1 ? 's' : ''}`));
  } else {
    console.log('Current Status: ' + colors.error('❌ Not tracking Codex'));
  }

  console.log('');
}

function getCodexModeFromStatus(status: CodexHooksStatus): 'all' | 'selected' | 'none' {
  if (status.sessionStartHook.installed || status.stopHook.installed) {
    return 'all';
  }
  if ((status.trackedProjects?.length || 0) > 0) {
    return 'selected';
  }
  return 'none';
}

async function configureCodexTrackAll(): Promise<void> {
  console.clear();
  console.log(colors.accent('\n✅ Global Codex Hook Configuration\n'));
  console.log(colors.subdued('This saves hooks to ~/.codex/hooks.json and enables [features].codex_hooks in ~/.codex/config.toml.\n'));
  console.log(colors.info('Installed hooks:'));
  console.log(colors.subdued('• SessionStart: Sync current project Codex sessions when work starts'));
  console.log(colors.subdued('• Stop: Sync current project Codex sessions after Codex stops\n'));

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Install Codex hooks globally?',
      default: true,
    },
  ]);

  if (!confirm) {
    showWarning('Installation cancelled');
    await promptToContinue();
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const spinner = require('ora')('Installing Codex hooks...').start();

  try {
    await installGlobalCodexHooks();
    spinner.succeed('Codex hooks configured successfully!');
    console.log('');
    showSuccess('✅ Codex SessionStart hook installed');
    showSuccess('✅ Codex Stop hook installed');
    showInfo('Codex sessions for the active project will now auto-sync in the background.');
    await offerCodexInitialSync();
  } catch (error) {
    spinner.fail('Failed to configure Codex hooks');
    showError(error instanceof Error ? error.message : 'Unknown error');
  }

  await promptToContinue();
}

async function configureCodexTrackSelected(): Promise<boolean> {
  console.clear();
  console.log(colors.accent('\n📁 Configure Codex Project Tracking\n'));
  console.log(colors.subdued('Select Codex cwd projects to receive repo-local .codex hooks.\n'));

  const status = await getCodexHooksStatus();
  const selectedProjects = await showCodexProjectSelector(status.trackedProjects || []);

  if (selectedProjects.length === 0) {
    showWarning('No Codex projects selected');
    await promptToContinue();
    return false;
  }

  console.log('\n' + colors.info('Configuration Summary:'));
  selectedProjects.forEach((project) => {
    console.log(`  • ${project.name}: SessionStart, Stop`);
  });

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Apply this Codex hook configuration?',
      default: true,
    },
  ]);

  if (!confirm) {
    showWarning('Configuration cancelled');
    await promptToContinue();
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const spinner = require('ora')('Configuring Codex project hooks...').start();

  try {
    const configs: CodexProjectHookConfig[] = selectedProjects.map((project) => ({
      path: project.actualPath,
      actualPath: project.actualPath,
      name: project.name,
      sessionStart: true,
      stop: true,
    }));

    await installSelectiveCodexProjectHooks(configs);
    spinner.succeed('Codex project hooks configured successfully!');
    console.log('');
    showSuccess(`✅ Hooks configured for ${selectedProjects.length} Codex project${selectedProjects.length !== 1 ? 's' : ''}`);
    await offerCodexInitialSync(selectedProjects);
  } catch (error) {
    spinner.fail('Failed to configure Codex project hooks');
    showError(error instanceof Error ? error.message : 'Unknown error');
    await promptToContinue();
    return false;
  }

  await promptToContinue();
  return true;
}

async function showCodexProjectSelector(trackedProjects: string[]): Promise<CodexProject[]> {
  const projects = await discoverCodexProjects();

  if (projects.length === 0) {
    console.log(colors.warning('No Codex projects found.'));
    return [];
  }

  const tracked = new Set(trackedProjects.map((projectPath) => path.normalize(projectPath)));
  console.log(colors.subdued('Choose which Codex cwd projects should have auto-sync enabled:'));
  console.log(colors.subdued('✅ = currently tracked | Space toggles selection\n'));

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select Codex projects:',
      choices: projects.map((project) => ({
        name: formatCodexProjectChoice(project),
        value: project,
        checked: tracked.has(path.normalize(project.actualPath)),
      })),
      pageSize: 15,
    },
  ]);

  return selected;
}

function formatCodexProjectChoice(project: CodexProject): string {
  const lastActivity = project.lastActivity ? formatRelativeDate(project.lastActivity) : 'unknown';
  return `${project.name} ${colors.subdued(`(${project.sessions} session${project.sessions === 1 ? '' : 's'}, ${lastActivity})`)}`;
}

function formatRelativeDate(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

async function disableCodexTracking(status: CodexHooksStatus): Promise<void> {
  console.clear();
  console.log(colors.warning('\n⚠️ Disable Codex Auto-sync\n'));
  console.log('This removes only Vibe-Log commands from Codex hooks.json files.');
  console.log('Third-party Codex hooks are preserved.\n');

  if (status.sessionStartHook.installed || status.stopHook.installed) {
    console.log(colors.subdued('Global hooks to remove:'));
    if (status.sessionStartHook.installed) console.log('  • SessionStart');
    if (status.stopHook.installed) console.log('  • Stop');
    console.log('');
  }

  if (status.trackedProjects && status.trackedProjects.length > 0) {
    console.log(colors.subdued('Repo-local projects with hooks:'));
    status.trackedProjects.forEach((projectPath) => console.log(`  • ${parseProjectName(projectPath)}`));
    console.log('');
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Remove Vibe-Log Codex hooks?',
      default: false,
    },
  ]);

  if (!confirm) {
    showWarning('Uninstallation cancelled');
    await promptToContinue();
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const spinner = require('ora')('Removing Codex hooks...').start();

  try {
    const result = await uninstallAllCodexHooks();
    spinner.succeed(`Successfully removed ${result.removedCount} Codex hook(s)`);
    showInfo('Manual Codex sync remains available from the sync menu.');
  } catch (error) {
    spinner.fail('Failed to remove Codex hooks');
    showError(error instanceof Error ? error.message : 'Unknown error');
  }

  await promptToContinue();
}

async function showCodexDetailedStatus(status: CodexHooksStatus): Promise<void> {
  console.clear();
  console.log(colors.accent('\n📊 Codex Hook Status\n'));

  const mode = getCodexModeFromStatus(status);
  console.log(colors.info('Tracking Mode:'));
  if (mode === 'all') {
    console.log('  ✅ Tracking Codex globally');
  } else if (mode === 'selected') {
    console.log(`  📍 Tracking ${status.trackedProjects?.length || 0} Codex project${(status.trackedProjects?.length || 0) !== 1 ? 's' : ''}`);
  } else {
    console.log('  ❌ Not tracking Codex');
  }

  if (status.unsupported) {
    console.log('\n' + colors.warning(status.unsupportedReason || 'Codex hooks are unsupported on this platform.'));
  }

  console.log('\n' + colors.info('Hook Installation:'));
  console.log(`  SessionStart: ${status.sessionStartHook.installed ? colors.success('✅ Installed') : colors.muted('❌ Not Installed')}`);
  if (status.sessionStartHook.installed) {
    console.log(`    Version: ${status.sessionStartHook.version}`);
  }

  console.log(`  Stop: ${status.stopHook.installed ? colors.success('✅ Installed') : colors.muted('❌ Not Installed')}`);
  if (status.stopHook.installed) {
    console.log(`    Version: ${status.stopHook.version}`);
  }

  if (status.trackedProjects && status.trackedProjects.length > 0) {
    console.log('\n' + colors.info('Repo-local Projects:'));
    status.trackedProjects.forEach((projectPath) => console.log(`  • ${parseProjectName(projectPath)} ${colors.subdued(projectPath)}`));
  }

  console.log('\n' + colors.info('Configuration:'));
  console.log(`  Hooks file: ${status.hooksPath}`);
  console.log(`  Config file: ${status.configPath}`);
  console.log(`  CLI path: ${status.cliPath}`);
}

async function testCodexHooksMenu(): Promise<void> {
  console.clear();
  console.log(colors.accent('\n🧪 Test Codex Hooks\n'));

  const { testChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'testChoice',
      message: 'Select Codex hook to test:',
      choices: [
        { name: '🚀 Test Codex SessionStart Hook', value: 'codex-sessionstart' },
        { name: '🔚 Test Codex Stop Hook', value: 'codex-stop' },
        { name: '🎯 Test All Codex Hooks', value: 'all' },
      ],
    },
  ]);

  console.log('');

  if (testChoice === 'all') {
    const results = await testAllCodexHooks({ verbose: true, record: false });
    if (results.length === 0) {
      showWarning('No Codex hooks installed to test');
      return;
    }

    const passed = results.filter((result) => result.success).length;
    const failed = results.filter((result) => !result.success).length;
    if (failed === 0) {
      showSuccess(`All ${passed} Codex hook(s) passed!`);
    } else {
      showWarning(`${passed} passed, ${failed} failed`);
    }
  } else {
    const result = await testCodexHook(testChoice as 'codex-sessionstart' | 'codex-stop', { verbose: true, record: false });
    displayTestResult(result);
  }
}

async function offerCodexInitialSync(projects?: CodexProject[]): Promise<void> {
  console.log('');
  console.log(colors.accent('📊 Initial Codex Session Sync'));
  console.log('');

  if (projects && projects.length > 0) {
    console.log(`Would you like to sync existing sessions from ${projects.length} selected Codex project${projects.length !== 1 ? 's' : ''} now?`);
  } else {
    console.log('Would you like to sync existing Codex sessions from this project now?');
  }

  console.log('This gives hooks a clean starting point for future background syncs.');
  console.log('');

  const { syncNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'syncNow',
      message: 'Sync existing Codex sessions now?',
      default: true,
    },
  ]);

  if (!syncNow) {
    showInfo('You can sync Codex sessions later from the manual sync menu.');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const spinner = require('ora')('Preparing Codex session sync...').start();

  try {
    const { getToken } = await import('../../lib/auth/token');
    const token = await getToken();

    if (!token) {
      spinner.fail('Authentication required');
      showWarning('You need to authenticate before syncing sessions.');
      return;
    }

    spinner.succeed('Ready to sync Codex sessions');
    console.log('');

    if (projects && projects.length > 0) {
      await sendWithTimeout({
        source: 'codex',
        projectPaths: projects.map((project) => project.actualPath),
        fromMenu: true,
        isInitialSync: true,
      });
    } else {
      await sendWithTimeout({
        source: 'codex',
        fromMenu: true,
        isInitialSync: true,
      });
    }

    console.log('');
    showSuccess('✅ Initial Codex sync complete!');
  } catch (error) {
    spinner.fail('Failed to sync Codex sessions');
    const { displayError } = await import('../../utils/errors');
    displayError(error);
  }
}

async function promptToContinue(): Promise<void> {
  console.log('Press Enter to continue...');
  await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
}
