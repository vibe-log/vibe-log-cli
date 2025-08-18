import inquirer from 'inquirer';
import { StateDetails } from '../detector';
import { parseProjectName } from './project-display';
import { colors, icons } from './styles';
import { createStatusDashboard } from './status-sections';
import { generateMenuItems, MenuContext } from './menu-builder';
import { sendWithTimeout } from '../../commands/send';
import { status } from '../../commands/status';
import { auth } from '../../commands/auth';
import { logout } from '../../commands/logout';
import { displayError } from '../../utils/errors';
import open from 'open';

// Helper to wait for Enter key
async function waitForEnter(): Promise<void> {
  await inquirer.prompt({
    type: 'input',
    name: 'continue',
    message: ' '
  });
}

// Helper to display package update notification
function displayPackageUpdateNotification(packageUpdateInfo: { current: string; latest: string }): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const boxen = require('boxen');
  console.log(boxen(
    `Update available ${packageUpdateInfo.current} → ${packageUpdateInfo.latest}\nRun \`npx vibe-log-cli@latest\` to update`,
    {
      padding: 1,
      margin: 0,
      align: 'center',
      borderColor: 'yellow',
      borderStyle: 'round'
    }
  ));
}

export async function showMainMenu(
  state: StateDetails, 
  packageUpdateInfo?: { current: string; latest: string } | null
): Promise<void> {
  // Get version from index.ts
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require('../../../package.json');
  const version = process.env.SIMULATE_OLD_VERSION || pkg.version;
  
  // Handle FIRST_TIME and PARTIAL_SETUP states with welcome screen
  if (state.state === 'FIRST_TIME' || state.state === 'PARTIAL_SETUP') {
    // Clear console and show logo for first-time experience
    console.clear();
    const { showLogo } = await import('../ui');
    await showLogo(version);
    
    // Show package update notification if available
    if (packageUpdateInfo) {
      displayPackageUpdateNotification(packageUpdateInfo);
    }
    
    const { showFirstTimeWelcome, showSetupMessage } = await import('./first-time-welcome');
    const choice = await showFirstTimeWelcome();
    
    switch (choice) {
      case 'local': {
        showSetupMessage('local');
        // Track that this is first-time setup
        const wasFirstTime = state.agentCount === 0;
        await manageAgents();
        
        // After agents installation, check if we should prompt for report
        // Get fresh state to check if agents were installed
        const { detectSetupState: detectStateAfterAgents } = await import('../detector');
        const stateAfterAgents = await detectStateAfterAgents();
        
        // If this was first-time and all agents are now installed
        if (wasFirstTime && stateAfterAgents.agentCount === stateAfterAgents.totalAgents) {
          // The prompt for report generation is already handled in sub-agents-installer.ts
          // when it detects a successful first-time installation
        }
        break;
      }
      
      case 'cloud': {
        showSetupMessage('cloud');
        // Start guided cloud setup flow
        const { guidedCloudSetup } = await import('./cloud-setup-wizard');
        await guidedCloudSetup();
        break;
      }
      
      case 'help':
        showHelp();
        // Show welcome again after help
        await showMainMenu(state, packageUpdateInfo);
        return;
      
      case 'exit':
        console.log(colors.muted('\nGoodbye! 👋\n'));
        process.exit(0);
        break;
    }
    
    // After setup, refresh state and show main menu
    const { detectSetupState } = await import('../detector');
    const newState = await detectSetupState();
    
    // If still FIRST_TIME or PARTIAL_SETUP (user cancelled), show welcome again
    if (newState.state === 'FIRST_TIME' || newState.state === 'PARTIAL_SETUP') {
      await showMainMenu(newState, packageUpdateInfo);
    } else {
      // Setup successful, show the main menu
      await showMainMenu(newState, packageUpdateInfo);
    }
    return;
  }
  
  // Regular main menu for non-FIRST_TIME states
  console.clear();
  
  // Show the logo after clearing console
  const { showLogo } = await import('../ui');
  await showLogo(version);
  
  // Show package update notification if available
  if (packageUpdateInfo) {
    displayPackageUpdateNotification(packageUpdateInfo);
  }
  
  // Show status dashboard with converted parameters
  const cloudStatus = {
    connected: state.hasAuth,
    hooksEnabled: state.hasHooks,
    syncStatus: 'synced' as const,  // Not used anymore, kept for compatibility
    lastSync: state.lastSync,
    lastSyncProject: state.lastSyncProject,
    pendingChanges: 0,
    trackingMode: state.trackingMode,
    trackedProjectCount: state.trackedProjectCount
  };
  
  const installStatus: 'not-installed' | 'installed' | 'partial' = 
    state.agentCount === 0 ? 'not-installed' :
    state.agentCount === state.totalAgents ? 'installed' :
    'partial';
  
  const localEngine = {
    installStatus,
    subAgentsInstalled: state.agentCount,
    totalSubAgents: state.totalAgents,
    configPath: '~/.claude/config'
  };
  
  console.log(createStatusDashboard(cloudStatus, localEngine));
  console.log('');
  
  // Build context-aware menu
  const context: MenuContext = {
    state: state.state,
    isAuthenticated: state.hasAuth,
    hasAgents: state.hasAgents,
    hasHooks: state.hasHooks,
    projectCount: state.projectCount,
    sessionCount: state.sessionCount,
    lastSync: state.lastSync || undefined,
    agentCount: state.agentCount,
    totalAgents: state.totalAgents
  };
  const menuItems = generateMenuItems(context);
  
  // Map menu items to inquirer choices, including separators
  const choices = menuItems
    .map(item => {
      if (item.separator) {
        return new inquirer.Separator('─────────────────────');
      }
      return {
        name: item.label,
        value: item.action || item.id,  // Use action if available, otherwise id
        disabled: item.disabled
      };
    });
  
  // Add exit option
  choices.push({
    name: `${icons.cross} Exit`,
    value: 'exit',
    disabled: false
  });
  
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices,
      pageSize: 12,  // Increased to show all items including Exit
      loop: false
    }
  ]);
  
  // Handle actions
  await handleMenuAction(action, state, packageUpdateInfo);
}

async function handleMenuAction(
  action: string, 
  state: StateDetails,
  packageUpdateInfo?: { current: string; latest: string } | null
): Promise<void> {
  switch (action) {
    case 'auth':
      try {
        // For first-time users selecting cloud mode, show privacy notice first
        const { showPrivacyNotice: showNotice } = await import('./privacy-notice');
        const userAccepted = await showNotice();
        
        if (userAccepted) {
          console.log(colors.info('\nAuthenticating with GitHub...'));
          await auth({});
        } else {
          console.log(colors.warning('\nCloud setup cancelled.'));
        }
      } catch (error) {
        displayError(error);
        await waitForEnter();
      }
      break;
      
    case 'send':
      try {
        await sendWithTimeout({ fromMenu: true });
      } catch (error) {
        displayError(error);
        await waitForEnter();
      }
      break;
    
    case 'manual-sync':
      try {
        // Show manual sync menu
        const { showManualSyncMenu } = await import('./manual-sync-menu');
        const syncOption = await showManualSyncMenu();
      
      switch (syncOption.type) {
        case 'selected':
          // Send specific sessions - they're already in the right format!
          console.log(colors.info(`\nSyncing ${syncOption.sessions.length} selected sessions...`));
          console.log(colors.dim('Preparing sessions for privacy-safe upload...'));
          
          await sendWithTimeout({ 
            selectedSessions: syncOption.sessions,
            fromMenu: true
          });
          break;
          
        case 'projects': {
          // Send selected projects
          // Read sessions from selected projects
          const { readClaudeSessions } = await import('../readers/claude');
          const { analyzeProject } = await import('../claude-core');
          const projectSessions: any[] = [];
          
          for (const claudePath of syncOption.projects) {
            try {
              // Analyze the Claude project to get the actual path
              const dirName = parseProjectName(claudePath);
              const project = await analyzeProject(claudePath, dirName);
              
              if (!project) {
                console.log(colors.warning(`Failed to analyze project ${dirName}`));
                continue;
              }
              
              // Read sessions using the actual path for filtering
              const sessions = await readClaudeSessions({
                projectPath: project.actualPath
              });
              projectSessions.push(...sessions);
              console.log(colors.subdued(`  • ${project.name}: ${sessions.length} sessions`));
            } catch (error) {
              console.log(colors.warning(`Failed to read sessions from ${parseProjectName(claudePath)}`));
            }
          }
          
          if (projectSessions.length > 0) {
            console.log(colors.success(`\nTotal: ${projectSessions.length} sessions to sync`));
            console.log(colors.dim('Preparing sessions for privacy-safe upload...'));
            
            await sendWithTimeout({ 
              selectedSessions: projectSessions.map(s => ({
                projectPath: s.sourceFile?.claudeProjectPath || s.projectPath,
                sessionFile: s.sourceFile?.sessionFile || '',
                displayName: parseProjectName(s.projectPath),
                timestamp: s.timestamp,
                duration: s.duration,
                messageCount: s.messages.length
              })),
              fromMenu: true
            });
          } else {
            console.log(colors.warning('No sessions found in selected projects'));
          }
          break;
        }
          
        case 'all':
          // Send all projects
          console.log(colors.info('\nSyncing all projects...'));
          await sendWithTimeout({ all: true, fromMenu: true });
          break;
          
        case 'cancel':
          // User cancelled
          break;
      }
      } catch (error) {
        displayError(error);
        await waitForEnter();
      }
      break;
      
    case 'status':
      try {
        await status();
      } catch (error) {
        displayError(error);
        await waitForEnter();
      }
      break;
      
    case 'dashboard':
      if (state.cloudUrl) {
        console.log(colors.info(`Opening dashboard: ${state.cloudUrl}`));
        await open(state.cloudUrl);
      }
      break;
      
      
    case 'report':
      try {
        const { generateLocalReportInteractive } = await import('./local-report-generator');
        await generateLocalReportInteractive();
      } catch (error) {
        displayError(error);
        await waitForEnter();
      }
      break;
      
    case 'install-agents':
      await manageAgents();
      break;
      
    case 'manage-hooks': {
      const { showHooksManagementMenu } = await import('./hooks-menu');
      await showHooksManagementMenu();
      break;
    }
      
    case 'install-hooks': {
      // Legacy support - redirect to new hooks management
      const { showHooksManagementMenu: showMenu } = await import('./hooks-menu');
      await showMenu();
      break;
    }
      
    case 'update-hooks': {
      // Legacy support - redirect to new hooks management
      const { showHooksManagementMenu: showMenuUpdate } = await import('./hooks-menu');
      await showMenuUpdate();
      break;
    }
      
    case 'switch-cloud':
      try {
        const { showPrivacyNotice } = await import('./privacy-notice');
        const accepted = await showPrivacyNotice();
        
        if (accepted) {
          console.log(colors.info('\nAuthenticating with GitHub...'));
          await auth({});
        } else {
          console.log(colors.warning('\nCloud setup cancelled.'));
        }
      } catch (error) {
        displayError(error);
        await waitForEnter();
      }
      break;
      
      
    case 'logout':
      try {
        await logout();
      } catch (error) {
        displayError(error);
        await waitForEnter();
      }
      break;
      
    case 'help':
      showHelp();
      console.log('Press Enter to continue...');
      await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
      break;
      
    case 'exit':
      console.log(colors.muted('\nGoodbye! 👋\n'));
      process.exit(0);
      break;
      
    default:
      console.log(colors.warning(`Unknown action: ${action}`));
  }
  
  // Show menu again unless exiting
  if (action !== 'exit') {
    // For auth actions, auto-refresh without prompt (SSE handles the flow)
    if (action === 'auth' || action === 'switch-cloud') {
      // Only refresh if auth was successful (user didn't cancel)
      // The auth/switch-cloud handlers already show cancellation message
      const { detectSetupState } = await import('../detector');
      const newState = await detectSetupState();
      
      // Only show menu if state changed (successful auth)
      if (newState.hasAuth !== state.hasAuth || action === 'switch-cloud') {
        await showMainMenu(newState, packageUpdateInfo);
      } else {
        // Auth was cancelled or failed, return to menu
        await showMainMenu(newState, packageUpdateInfo);
      }
    } else {
      // For all other actions, refresh state and show menu again
      const { detectSetupState } = await import('../detector');
      const newState = await detectSetupState();
      await showMainMenu(newState, packageUpdateInfo);
    }
  }
}


async function manageAgents(): Promise<void> {
  const { installSubAgentsInteractive } = await import('./sub-agents-installer');
  await installSubAgentsInteractive();
}

function showHelp(): void {
  console.log('');
  console.log(colors.primary('📊 Vibe-Log - Measure, Learn & Improve Your AI Coding'));
  console.log('');
  console.log(colors.subdued('Understand how you work with Claude Code. Track patterns, measure'));
  console.log(colors.subdued('productivity, and discover what makes your AI coding sessions effective.'));
  console.log('');
  console.log(colors.accent('🎯 Why Track Your AI Coding?'));
  console.log('  • ' + colors.highlight('Measure Patterns') + ' - See when and how you\'re most productive');
  console.log('  • ' + colors.highlight('Learn From Data') + ' - Understand what makes sessions successful');
  console.log('  • ' + colors.highlight('Improve Workflow') + ' - Identify bottlenecks and optimize your process');
  console.log('  • ' + colors.highlight('Track Progress') + ' - Monitor project velocity and completion rates');
  console.log('  • ' + colors.highlight('Privacy Protected') + ' - Your code stays private, only metadata tracked');
  console.log('');
  console.log(colors.accent('🔄 Choose How to Analyze:'));
  console.log('  • ' + colors.success('Cloud Mode (Recommended)') + ' - Automatic tracking & insights');
  console.log('    └─ Dashboard with trends, patterns, and productivity metrics');
  console.log('    └─ Zero setup, GitHub auth, no tokens needed');
  console.log('  • ' + colors.info('Local Mode') + ' - Private analysis on your machine');
  console.log('    └─ Generate AI reports using Claude Code sub-agents');
  console.log('    └─ 100% offline, uses your Claude tokens');
  console.log('');
  console.log(colors.accent('⚡ Getting Started:'));
  console.log('  1. Run ' + colors.primary('npx vibe-log-cli') + ' to open this menu');
  console.log('  2. Choose your analysis mode (Cloud or Local)');
  console.log('  3. Start coding with Claude - vibe-log tracks automatically');
  console.log('  4. Review insights to improve your AI coding workflow');
  console.log('');
  console.log(colors.accent('📚 Learn More:'));
  console.log('  • Documentation: ' + colors.primary('https://vibe-log.dev'));
  console.log('  • View Dashboard: ' + colors.primary('https://app.vibe-log.dev'));
  console.log('  • GitHub: ' + colors.primary('https://github.com/vibe-log'));
  console.log('');
}