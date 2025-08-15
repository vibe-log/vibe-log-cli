import inquirer from 'inquirer';
import { colors, box } from './styles';
import { 
  getHooksStatus, 
  HooksStatus, 
  uninstallAllHooks,
  installSelectedHooks,
  installSelectiveProjectHooks,
  removeProjectHooks,
  ProjectHookConfig
} from '../hooks/hooks-controller';
import { getHookMode, HookMode } from '../claude-settings-reader';
import { getRecentStats } from '../hooks/hooks-stats';
import { testHook, testAllHooks, displayTestResult } from '../hooks/hooks-tester';
import { showSuccess, showWarning, showError, showInfo } from '../ui';
import { showProjectSelectorForHooks, getProjectInfo } from './project-selector-hooks';
import { getClaudeProjectsPath } from '../claude-core';
import path from 'path';
import { sendWithTimeout } from '../../commands/send';
import { parseProjectName } from './project-display';

/**
 * Main hooks management menu with educational approach
 * @param guidedMode - If true, returns boolean indicating if hooks were installed
 */
export async function showHooksManagementMenu(guidedMode: boolean = false): Promise<boolean | void> {
  let shouldContinue = true;
  let hooksWereInstalled = false;

  while (shouldContinue) {
    console.clear();
    
    // Get current status
    const status = await getHooksStatus();
    const stats = await getRecentStats(7);
    const hookMode = await getHookMode(); // Now from claude-settings-reader
    
    // Display educational header with current status
    await displayEducationalHeader(hookMode, status, stats);

    // Menu options based on current mode
    const choices = [
      {
        name: `[1] Track all projects - Install hooks globally`,
        value: 'track-all'
      },
      {
        name: `[2] Select specific projects - Choose which to track`,
        value: 'track-selected'
      },
      {
        name: `[3] Disable tracking - Remove all hooks`,
        value: 'track-none'
      },
      new inquirer.Separator()
    ];
    
    // Add test option if hooks are installed
    if (status.sessionStartHook.installed || status.preCompactHook.installed) {
      choices.push({
        name: `[4] Test hooks`,
        value: 'test'
      });
    }
    
    choices.push(
      {
        name: `[5] View detailed status`,
        value: 'detailed-status'
      },
      new inquirer.Separator(),
      {
        name: `[B] ${guidedMode ? '← Back' : 'Back to main menu'}`,
        value: 'back'
      }
    );

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Choose an option:',
        choices,
        pageSize: 10
      }
    ]);
    
    switch (action) {
      case 'track-all':
        try {
          await configureTrackAll();
          hooksWereInstalled = true;
        } catch (error) {
          const { displayError } = await import('../../utils/errors');
          displayError(error);
          await inquirer.prompt({
            type: 'input',
            name: 'continue',
            message: ' '
          });
        }
        break;
        
      case 'track-selected':
        try {
          await configureTrackSelected();
          const newStatus = await getHooksStatus();
          if (newStatus.sessionStartHook.installed || newStatus.preCompactHook.installed) {
            hooksWereInstalled = true;
          }
        } catch (error) {
          const { displayError } = await import('../../utils/errors');
          displayError(error);
          await inquirer.prompt({
            type: 'input',
            name: 'continue',
            message: ' '
          });
        }
        break;
        
      case 'track-none':
        try {
          await disableAllTracking(status, stats);
        } catch (error) {
          const { displayError } = await import('../../utils/errors');
          displayError(error);
          await inquirer.prompt({
            type: 'input',
            name: 'continue',
            message: ' '
          });
        }
        break;
        
      case 'test':
        await testHooksMenu();
        await promptToContinue();
        break;
        
      case 'detailed-status':
        await showDetailedStatus(status, stats);
        await promptToContinue();
        break;
        
      case 'back':
        shouldContinue = false;
        break;
    }
  }
  
  // Return whether hooks were installed (for guided mode tracking)
  if (guidedMode) {
    return hooksWereInstalled;
  }
}

/**
 * Display educational header with current status
 */
async function displayEducationalHeader(mode: HookMode, status: HooksStatus, stats: any): Promise<void> {
  console.log(colors.accent('\n🔧 Auto-sync Configuration\n'));
  
  // Educational section
  console.log(colors.subdued('Claude Code Hooks allow vibe-log to automatically sync your coding sessions.\n'));
  
  console.log(colors.info('What are Claude Code Hooks?'));
  console.log(colors.subdued('  • Small commands that run at specific moments in Claude Code'));
  console.log(colors.subdued('  • They work silently in the background (you won\'t notice them)'));
  console.log(colors.subdued('  • They ensure complete session sync without manual effort\n'));
  
  console.log(colors.info('Which hooks do we use?'));
  console.log('  📍 ' + colors.accent('SessionStart') + colors.subdued(' - Syncs previous session when you start/resume work'));
  console.log(colors.subdued('     (Triggers: startup, resume, clear commands)\n'));
  console.log('  📦 ' + colors.accent('PreCompact') + colors.subdued(' - Syncs full session before context compression'));
  console.log(colors.subdued('     (Triggers: manual or automatic context cleanup)\n'));
  
  console.log(colors.info('Why we recommend both:'));
  console.log(colors.success('  ✓ SessionStart ensures nothing is lost between sessions'));
  console.log(colors.success('  ✓ PreCompact syncs everything before Claude compresses context'));
  console.log(colors.success('  ✓ Together they provide complete coverage without duplicates\n'));
  
  // Current status display
  console.log(box.horizontal.repeat(60));
  console.log('');
  
  let statusText = '';
  let statusColor = colors.muted;
  
  if (mode === 'all') {
    statusText = '✅ Tracking all projects';
    statusColor = colors.success;
  } else if (mode === 'selected') {
    const projectCount = status.trackedProjects?.length || 0;
    statusText = `📍 Tracking ${projectCount} project${projectCount !== 1 ? 's' : ''}`;
    statusColor = colors.warning;
  } else {
    statusText = '❌ Not tracking';
    statusColor = colors.error;
  }
  
  console.log('Current Status: ' + statusColor(statusText));
  
  // Show activity stats if tracking
  if (mode !== 'none' && (stats.sessionStartHook?.total > 0 || stats.preCompactHook?.total > 0)) {
    console.log('');
    if (stats.sessionStartHook?.total > 0) {
      console.log(`  SessionStart: ${stats.sessionStartHook.total} syncs, ${stats.sessionStartHook.successRate.toFixed(1)}% success`);
    }
    if (stats.preCompactHook?.total > 0) {
      console.log(`  PreCompact: ${stats.preCompactHook.total} syncs, ${stats.preCompactHook.successRate.toFixed(1)}% success`);
    }
  }
  
  console.log('');
}

/**
 * Configure to track all projects with checkbox selection
 */
async function configureTrackAll(): Promise<void> {
  console.clear();
  console.log(colors.accent('\n✅ Global Hook Configuration\n'));
  
  console.log('Configure hooks for all current and future projects.\n');
  console.log(colors.subdued('These settings will be saved to ~/.claude/settings.json\n'));
  
  console.log(colors.info('Select which hooks to install globally:'));
  console.log(colors.subdued('• SessionStart: Syncs when starting/resuming work'));
  console.log(colors.subdued('• PreCompact: Syncs before context compression'));
  console.log(colors.subdued('\nWe recommend enabling both for complete session tracking.\n'));
  
  // Use inquirer checkbox for hook selection
  const { selectedHooks } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedHooks',
      message: 'Choose hooks to enable:',
      choices: [
        { 
          name: 'SessionStart - Sync on startup/resume/clear', 
          value: 'sessionStart',
          checked: true 
        },
        { 
          name: 'PreCompact - Sync before compression', 
          value: 'preCompact',
          checked: true 
        }
      ]
    }
  ]);
  
  // Handle empty selection
  if (selectedHooks.length === 0) {
    console.log('');
    showWarning('No hooks selected. Installation cancelled.');
    await promptToContinue();
    return;
  }
  
  // Confirm installation
  console.log('\n' + colors.info('You selected:'));
  if (selectedHooks.includes('sessionStart')) {
    console.log('  ✓ SessionStart hook');
  }
  if (selectedHooks.includes('preCompact')) {
    console.log('  ✓ PreCompact hook');
  }
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Install these hooks globally?',
      default: true
    }
  ]);
  
  if (!confirm) {
    showWarning('Installation cancelled');
    await promptToContinue();
    return;
  }
  
  // Install selected hooks
  console.log('');
  const spinner = require('ora')('Installing global hooks...').start();
  
  try {
    const selection = {
      sessionStartHook: selectedHooks.includes('sessionStart'),
      preCompactHook: selectedHooks.includes('preCompact'),
      timeout: 30000
    };
    
    await installSelectedHooks(selection);
    spinner.succeed('Global hooks configured successfully!');
    
    console.log('');
    if (selection.sessionStartHook) {
      showSuccess('✅ SessionStart hook installed');
    }
    if (selection.preCompactHook) {
      showSuccess('✅ PreCompact hook installed');
    }
    
    console.log('');
    showInfo('All your Claude Code sessions will now be automatically synced!');
    
    // Offer to sync existing sessions
    await offerInitialSync({ all: true });
    
  } catch (error) {
    spinner.fail('Failed to configure global hooks');
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
  
  await promptToContinue();
}

/**
 * Configure to track selected projects with per-hook granularity
 */
async function configureTrackSelected(): Promise<void> {
  console.clear();
  console.log(colors.accent('\n📁 Configure Project-Specific Tracking\n'));
  
  console.log(colors.subdued('Select which projects to track and configure hooks for each:\n'));
  
  // Get currently tracked projects BEFORE selection
  const { getTrackedProjects } = await import('../claude-settings-reader');
  const previouslyTracked = await getTrackedProjects();
  
  // Use the enhanced project selector for hooks
  const selectedProjects = await showProjectSelectorForHooks();
  
  // Identify deselected projects (previously tracked but not in new selection)
  const selectedPaths = selectedProjects.map(p => p.path);
  const deselectedProjects: Array<{ path: string; name: string; actualPath?: string }> = [];
  
  // Get all projects to find the ones that were deselected
  const { discoverProjects } = await import('../claude-core');
  const allProjects = await discoverProjects();
  
  for (const trackedPath of previouslyTracked) {
    if (!selectedPaths.includes(trackedPath)) {
      // Find the full project info for this deselected project
      const project = allProjects.find(p => p.claudePath.endsWith(trackedPath));
      if (project) {
        deselectedProjects.push({
          path: trackedPath,
          name: project.name,
          actualPath: project.actualPath
        });
      }
    }
  }
  
  // Check if user cancelled selection (no projects selected but had previous ones)
  if (selectedProjects.length === 0 && previouslyTracked.length === 0) {
    showWarning('No projects selected');
    await promptToContinue();
    return;
  }
  
  // Create configuration for each project
  const projectConfigs: ProjectHookConfig[] = [];
  
  // Only ask for hook configuration if there are selected projects
  if (selectedProjects.length > 0) {
    console.clear();
    console.log(colors.accent('\n⚙️  Configure Hooks for Selected Projects\n'));
    
    console.log(colors.info('Choose which hooks to enable for each project:'));
    console.log(colors.subdued('SessionStart: Syncs when starting/resuming work'));
    console.log(colors.subdued('PreCompact: Syncs before context compression\n'));
    
    for (const project of selectedProjects) {
      console.log(colors.accent(`\n${project.name}:`));
      
      const { hooks } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'hooks',
          message: 'Select hooks to enable:',
          choices: [
            { name: 'SessionStart - Sync on startup/resume', value: 'sessionStart', checked: true },
            { name: 'PreCompact - Sync before compression', value: 'preCompact', checked: true }
          ]
        }
      ]);
      
      if (hooks.length > 0) {
        projectConfigs.push({
          path: project.path,
          name: project.name,
          sessionStart: hooks.includes('sessionStart'),
          preCompact: hooks.includes('preCompact'),
          actualPath: (project as any).actualPath // Pass through the actual path for local settings
        } as any);
      }
    }
  }
  
  if (projectConfigs.length === 0 && deselectedProjects.length === 0) {
    showWarning('No hooks configured for any project');
    await promptToContinue();
    return;
  }
  
  // Show summary
  if (selectedProjects.length === 0 && deselectedProjects.length > 0) {
    // Special case: removing all hooks
    console.clear();
    console.log(colors.warning('\n⚠️  Removing Project Tracking\n'));
    console.log('You are about to remove hooks from all previously tracked projects:\n');
    deselectedProjects.forEach(project => {
      console.log(`  • ${project.name}`);
    });
  } else {
    console.log('\n' + colors.info('Configuration Summary:'));
    
    if (projectConfigs.length > 0) {
      console.log(colors.success('Projects to track:'));
      projectConfigs.forEach(config => {
        const hooks = [];
        if (config.sessionStart) hooks.push('SessionStart');
        if (config.preCompact) hooks.push('PreCompact');
        console.log(`  • ${config.name}: ${hooks.join(', ')}`);
      });
    }
    
    if (deselectedProjects.length > 0) {
      console.log('\n' + colors.warning('Projects to stop tracking:'));
      deselectedProjects.forEach(project => {
        console.log(`  • ${project.name}`);
      });
    }
  }
  
  console.log('');
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Apply this configuration?',
      default: true
    }
  ]);
  
  if (!confirm) {
    showWarning('Configuration cancelled');
    await promptToContinue();
    return;
  }
  
  console.log('');
  const spinner = require('ora')('Configuring project hooks...').start();
  
  try {
    // First remove hooks from deselected projects
    if (deselectedProjects.length > 0) {
      spinner.text = 'Removing hooks from deselected projects...';
      await removeProjectHooks(deselectedProjects);
    }
    
    // Then install/update hooks for selected projects
    if (projectConfigs.length > 0) {
      spinner.text = 'Installing hooks for selected projects...';
      await installSelectiveProjectHooks(projectConfigs);
    }
    
    spinner.succeed('Project hooks configured successfully!');
    
    console.log('');
    if (projectConfigs.length > 0) {
      showSuccess(`✅ Hooks configured for ${projectConfigs.length} project${projectConfigs.length !== 1 ? 's' : ''}`);
    }
    if (deselectedProjects.length > 0) {
      showInfo(`📤 Hooks removed from ${deselectedProjects.length} project${deselectedProjects.length !== 1 ? 's' : ''}`);
    }
    
    console.log('');
    showInfo('Configuration applied successfully!');
    
    // Offer to sync existing sessions for configured projects
    if (projectConfigs.length > 0) {
      await offerInitialSync({ selectedProjects: projectConfigs });
    }
    
  } catch (error) {
    spinner.fail('Failed to configure project hooks');
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
  
  await promptToContinue();
}

/**
 * Disable all tracking
 */
async function disableAllTracking(status: HooksStatus, stats: any): Promise<void> {
  console.clear();
  console.log(colors.warning('\n⚠️ Disable Auto-sync\n'));
  
  console.log('This will remove all vibe-log hooks from Claude Code.');
  console.log('You\'ll need to manually send sessions using main menu.\n');
  
  // Show what will be removed
  if (status.sessionStartHook.installed || status.preCompactHook.installed) {
    console.log(colors.subdued('Hooks to be removed:'));
    if (status.sessionStartHook.installed) {
      console.log(`  • SessionStart Hook (${stats.sessionStartHook?.total || 0} syncs in last 7 days)`);
    }
    if (status.preCompactHook.installed) {
      console.log(`  • PreCompact Hook (${stats.preCompactHook?.total || 0} syncs in last 7 days)`);
    }
    console.log('');
  }
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure?',
      default: false
    }
  ]);
  
  if (!confirm) {
    showWarning('Uninstallation cancelled');
    await promptToContinue();
    return;
  }
  
  console.log('');
  const spinner = require('ora')('Removing hooks...').start();
  
  try {
    const result = await uninstallAllHooks();
    spinner.succeed(`Successfully removed ${result.removedCount} hook(s)`);
    
    console.log('');
    showInfo('You can reinstall hooks at any time from this menu');
    
  } catch (error) {
    spinner.fail('Failed to remove hooks');
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
  
  await promptToContinue();
}

/**
 * Show detailed status
 */
async function showDetailedStatus(status: HooksStatus, stats: any): Promise<void> {
  console.clear();
  console.log(colors.accent('\n📊 Detailed Hook Status\n'));
  
  const mode = await getHookMode();
  
  // Mode information
  console.log(colors.info('Tracking Mode:'));
  if (mode === 'all') {
    console.log('  ✅ Tracking all projects globally');
    console.log(`  • Hooks installed in: ${status.settingsPath}`);
  } else if (mode === 'selected') {
    const projectCount = status.trackedProjects?.length || 0;
    console.log(`  📍 Tracking ${projectCount} selected project${projectCount !== 1 ? 's' : ''}`);
    if (status.trackedProjects && status.trackedProjects.length > 0) {
      console.log('\n  Projects being tracked:');
      const projectsPath = getClaudeProjectsPath();
      
      // Fetch real project names from session files
      for (const project of status.trackedProjects) {
        const projectPath = path.join(projectsPath, project);
        const projectInfo = await getProjectInfo(projectPath);
        const name = projectInfo?.name || project.split('-').pop() || project;
        console.log(`    • ${name}`);
      }
    }
  } else {
    console.log('  ❌ Not tracking any projects');
  }
  
  // Hook status
  console.log('\n' + colors.info('Hook Installation:'));
  console.log(`  SessionStart: ${status.sessionStartHook.installed ? colors.success('✅ Installed') : colors.muted('❌ Not Installed')}`);
  if (status.sessionStartHook.installed) {
    console.log(`    Version: ${status.sessionStartHook.version}`);
    console.log(`    Timeout: ${(status.sessionStartHook.timeout || 30000) / 1000}s`);
  }
  
  console.log(`  PreCompact: ${status.preCompactHook.installed ? colors.success('✅ Installed') : colors.muted('❌ Not Installed')}`);
  if (status.preCompactHook.installed) {
    console.log(`    Version: ${status.preCompactHook.version}`);
    console.log(`    Timeout: ${(status.preCompactHook.timeout || 30000) / 1000}s`);
  }
  
  // Statistics
  if (stats.sessionStartHook?.total > 0 || stats.preCompactHook?.total > 0) {
    console.log('\n' + colors.info('Activity (Last 7 Days):'));
    
    if (stats.sessionStartHook?.total > 0) {
      console.log('\n  SessionStart Hook:');
      console.log(`    Total executions: ${stats.sessionStartHook.total}`);
      console.log(`    Success rate: ${stats.sessionStartHook.successRate.toFixed(1)}%`);
      console.log(`    Successful: ${stats.sessionStartHook.successful}`);
      console.log(`    Failed: ${stats.sessionStartHook.failed}`);
      if (stats.sessionStartHook.lastSuccess) {
        const lastSuccess = new Date(stats.sessionStartHook.lastSuccess);
        console.log(`    Last success: ${lastSuccess.toLocaleString()}`);
      }
    }
    
    if (stats.preCompactHook?.total > 0) {
      console.log('\n  PreCompact Hook:');
      console.log(`    Total executions: ${stats.preCompactHook.total}`);
      console.log(`    Success rate: ${stats.preCompactHook.successRate.toFixed(1)}%`);
      console.log(`    Successful: ${stats.preCompactHook.successful}`);
      console.log(`    Failed: ${stats.preCompactHook.failed}`);
      if (stats.preCompactHook.lastSuccess) {
        const lastSuccess = new Date(stats.preCompactHook.lastSuccess);
        console.log(`    Last success: ${lastSuccess.toLocaleString()}`);
      }
    }
    
    // Top projects
    if (stats.topProjects && stats.topProjects.length > 0) {
      console.log('\n' + colors.info('Top Projects:'));
      stats.topProjects.slice(0, 5).forEach((project: any, index: number) => {
        console.log(`    ${index + 1}. ${project.name} - ${project.count} syncs`);
      });
    }
  }
  
  // Configuration files
  console.log('\n' + colors.info('Configuration:'));
  console.log(`  Settings file: ${status.settingsPath}`);
  console.log(`  CLI path: ${status.cliPath}`);
}

/**
 * Test hooks menu
 */
async function testHooksMenu(): Promise<void> {
  console.clear();
  console.log(colors.accent('\n🧪 Test Hooks\n'));
  
  const { testChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'testChoice',
      message: 'Select hook to test:',
      choices: [
        { name: '🚀 Test SessionStart Hook', value: 'sessionstart' },
        { name: '📦 Test PreCompact Hook', value: 'precompact' },
        { name: '🎯 Test All Hooks', value: 'all' }
      ]
    }
  ]);
  
  console.log('');
  
  if (testChoice === 'all') {
    const results = await testAllHooks({ verbose: true, record: false });
    
    if (results.length === 0) {
      showWarning('No hooks installed to test');
    } else {
      console.log('');
      console.log(colors.accent('Test Summary:'));
      const passed = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      if (failed === 0) {
        showSuccess(`All ${passed} hook(s) passed!`);
      } else {
        showWarning(`${passed} passed, ${failed} failed`);
      }
    }
  } else {
    const result = await testHook(testChoice as 'sessionstart' | 'precompact', { verbose: true, record: false });
    displayTestResult(result);
  }
}

/**
 * Prompt to continue (now a no-op for smoother flow)
 */
async function promptToContinue(): Promise<void> {
  // Removed prompt for better UX - menu will refresh automatically
}

/**
 * Offer to sync existing sessions after hook installation
 * This ensures hooks only need to handle new sessions going forward
 */
async function offerInitialSync(options: { 
  all?: boolean; 
  selectedProjects?: ProjectHookConfig[] 
}): Promise<void> {
  console.log('');
  console.log(colors.accent('📊 Initial Session Sync'));
  console.log('');
  console.log('Would you like to sync the selected projects existing sessions now?');
  console.log('This ensures hooks only need to handle new sessions going forward.');
  console.log('');
  console.log(colors.success('  ✓ This is a one-time upload of historical data'));
  console.log(colors.success('  ✓ You\'ll see exactly what will be sent before confirming'));
  console.log(colors.success('  ✓ Future sessions will sync automatically via hooks'));
  console.log('');
  
  const { syncNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'syncNow',
      message: 'Sync existing sessions now?',
      default: true
    }
  ]);
  
  if (!syncNow) {
    console.log('');
    showInfo('You can sync existing sessions anytime using "vibe-log send"');
    return;
  }
  
  console.log('');
  const spinner = require('ora')('Preparing to sync sessions...').start();
  
  try {
    // Check if user is authenticated first
    const { getToken } = await import('../../lib/auth/token');
    const token = await getToken();
    
    if (!token) {
      spinner.fail('Authentication required');
      console.log('');
      showWarning('You need to authenticate before syncing sessions.');
      console.log('');
      
      const { authenticate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'authenticate',
          message: 'Would you like to authenticate now?',
          default: true
        }
      ]);
      
      if (authenticate) {
        const { auth } = await import('../../commands/auth');
        await auth({ wizardMode: true });
        
        // Check again after auth
        const newToken = await getToken();
        if (!newToken) {
          showError('Authentication failed. Please try again from the main menu.');
          return;
        }
      } else {
        showInfo('You can authenticate and sync later from the main menu.');
        return;
      }
    }
    
    spinner.succeed('Ready to sync sessions');
    console.log('');
    
    // Trigger the sync based on configuration
    if (options.all) {
      // Sync all sessions for global hooks
      showInfo('Syncing all existing sessions from all projects...');
      console.log('');
      await sendWithTimeout({ all: true, fromMenu: true, isInitialSync: true });
    } else if (options.selectedProjects) {
      // For selected projects, directly load their sessions (like manual sync does)
      const { readClaudeSessions } = await import('../readers/claude');
      const { discoverProjects } = await import('../claude-core');
      
      // Show which projects we're syncing
      console.log(colors.info(`Syncing sessions from ${options.selectedProjects.length} configured project(s):`));
      
      // Discover all projects to get actual paths
      const allProjects = await discoverProjects();
      const projectSessions: any[] = [];
      
      for (const config of options.selectedProjects) {
        // Find the actual project info
        const project = allProjects.find(p => p.claudePath.endsWith(config.path));
        if (project) {
          try {
            const sessions = await readClaudeSessions({
              projectPath: project.actualPath
            });
            projectSessions.push(...sessions);
            console.log(colors.subdued(`  • ${project.name}: ${sessions.length} sessions`));
          } catch (error) {
            console.log(colors.warning(`Failed to read sessions from ${config.name}`));
          }
        }
      }
      
      if (projectSessions.length > 0) {
        console.log(colors.success(`\nTotal: ${projectSessions.length} sessions to sync`));
        
        // Convert to the format expected by sendWithTimeout
        const selectedSessions = projectSessions.map(s => ({
          projectPath: s.sourceFile?.claudeProjectPath || s.projectPath,
          sessionFile: s.sourceFile?.sessionFile || '',
          displayName: parseProjectName(s.projectPath),
          timestamp: s.timestamp,
          duration: s.duration,
          messageCount: s.messages.length
        }));
        
        // Show privacy processing message
        console.log(colors.dim('Preparing sessions for privacy-safe upload...'));
        
        // This will show the loading, redaction count, and upload UI
        await sendWithTimeout({ selectedSessions, fromMenu: true, isInitialSync: true });
      } else {
        console.log(colors.warning('No sessions found in selected projects'));
        showInfo('You can sync sessions later using "Send sessions" from the main menu');
      }
    }
    
    console.log('');
    showSuccess('✅ Initial sync complete!');
    showInfo('Future sessions will be synced automatically by hooks.');
    
  } catch (error) {
    spinner.fail('Failed to sync sessions');
    console.log('');
    
    // Use displayError for better error handling
    const { displayError } = await import('../../utils/errors');
    displayError(error);
    
    console.log('');
    showInfo('You can try syncing again from the main menu using "Send sessions"');
    
    // Wait for user to acknowledge the error
    await inquirer.prompt({
      type: 'input',
      name: 'continue',
      message: ' '
    });
  }
}