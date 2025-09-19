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
import { showHelpContent } from './help-content';
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
      case 'standup': {
        // Run standup command directly, skipping auth for first-time users
        const { standup } = await import('../../commands/standup');
        await standup({ skipAuth: true });

        // After standup completes, offer cloud setup if not authenticated
        const { isAuthenticated } = await import('../auth/token');
        if (!await isAuthenticated()) {
          console.log(); // Add spacing
          const { setupCloud } = await inquirer.prompt([{
            type: 'confirm',
            name: 'setupCloud',
            message: 'Enable cloud for daily email summaries?',
            default: true
          }]);

          if (setupCloud) {
            showSetupMessage('cloud');
            const { guidedCloudSetup } = await import('./cloud-setup-wizard');
            await guidedCloudSetup();
          }
        }
        break;
      }

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
      
      case 'statusline': {
        const { showStatusLineMenu } = await import('./status-line-menu');
        await showStatusLineMenu();
        // Show welcome again after status line configuration
        await showMainMenu(state, packageUpdateInfo);
        return;
      }
      
      
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
    statusLineStatus: state.statusLineStatus,
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
      pageSize: 13,  // Increased to show all items including Exit
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
          
        case 'time-based':
          // Send sessions from time-based selection
          console.log(colors.info(`\nSyncing ${syncOption.sessions.length} sessions from the last ${syncOption.days} days...`));
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

    case 'standup':
      try {
        // Use Claude Code analysis for standup
        const { standup } = await import('../../commands/standup');
        await standup();
        await waitForEnter();
      } catch (error) {
        displayError(error);
        await waitForEnter();
      }
      break;

    case 'report':
      try {
        // Check if sub-agents are installed first
        const { checkInstalledSubAgents } = await import('../sub-agents/manager');
        const subAgentStatus = await checkInstalledSubAgents();
        
        if (subAgentStatus.missing.length > 0) {
          // Sub-agents are missing, prompt to install
          console.clear();
          console.log(colors.warning('\n⚠️  Sub-agents Required'));
          console.log(colors.muted('Local report generation requires vibe-log sub-agents to be installed.'));
          console.log(colors.muted(`Currently missing: ${subAgentStatus.missing.length} of ${subAgentStatus.total} sub-agents`));
          console.log();
          
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Would you like to install them now?',
            default: true
          }]);
          
          if (confirm) {
            // Install the sub-agents
            const { installSubAgentsInteractive } = await import('./sub-agents-installer');
            await installSubAgentsInteractive();
            
            // After installation, check if they want to continue with report
            const newStatus = await checkInstalledSubAgents();
            if (newStatus.missing.length === 0) {
              console.log();
              const { continueReport } = await inquirer.prompt([{
                type: 'confirm',
                name: 'continueReport',
                message: 'Sub-agents installed! Would you like to generate your report now?',
                default: true
              }]);
              
              if (continueReport) {
                const { generateLocalReportInteractive } = await import('./local-report-generator');
                await generateLocalReportInteractive();
              }
            }
          } else {
            console.log(colors.info('\nYou can install sub-agents later from the menu.'));
            await waitForEnter();
          }
        } else {
          // Sub-agents are installed, proceed with report generation
          const { generateLocalReportInteractive } = await import('./local-report-generator');
          await generateLocalReportInteractive();
        }
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
    
    case 'status-line': {
      const { showStatusLineMenu } = await import('./status-line-menu');
      await showStatusLineMenu();
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
  showHelpContent();
}