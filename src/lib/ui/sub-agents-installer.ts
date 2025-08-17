import inquirer from 'inquirer';
import { colors, icons, box, format } from './styles';
import { installSubAgents, getSubAgentStatus, removeSelectedSubAgents, removeAllSubAgents } from '../sub-agents/manager';
import { SubAgentName } from '../sub-agents/constants';

/**
 * Display explanation about what sub-agents are and their benefits
 */
function showSubAgentExplanation(): void {
  console.clear();
  
  // Main header with box drawing
  const headerText = ' Managing Local Sub-Agents ';
  const headerWidth = 60;
  const headerPadding = Math.floor((headerWidth - headerText.length) / 2);
  const headerLine = box.horizontal.repeat(headerPadding) + headerText + box.horizontal.repeat(headerWidth - headerPadding - headerText.length);
  
  console.log('\n' + colors.accent(box.horizontal.repeat(2) + headerLine + box.horizontal.repeat(2)));
  console.log();
  
  // Section 1: What are sub-agents?
  console.log(colors.primary(format.bold('What are Claude Code sub-agents?')));
  console.log(colors.highlight('Sub-agents are specialized helpers you can install to extend'));
  console.log(colors.highlight('Claude Code\'s capabilities. They\'re like plugins that give Claude'));
  console.log(colors.highlight('new skills and knowledge for specific tasks.'));
  console.log();
  console.log(colors.dim('Learn more: ') + colors.info(format.underline('https://docs.anthropic.com/en/docs/claude-code/sub-agents')));
  console.log();
  
  // Section divider
  console.log(colors.accent(box.horizontal.repeat(2) + ' How vibe-log Uses Sub-Agents ' + box.horizontal.repeat(29)));
  console.log();
  
  console.log(colors.highlight('vibe-log uses a streamlined set of 3 sub-agents to quickly'));
  console.log(colors.highlight('generate concise productivity reports from your coding sessions:'));
  console.log();
  
  // Phase 1 - Data Collection
  console.log(colors.primary(format.bold('Phase 1 - Data Collection:')));
  console.log(`  ${colors.success(icons.package)} ${colors.accent(format.bold('@vibe-log-claude-code-logs-fetcher'))}`);
  console.log(`    ${colors.dim(icons.arrow)} Fetches your Claude Code sessions`);
  console.log();
  
  // Phase 2 - Analysis
  console.log(colors.primary(format.bold('Phase 2 - Analysis:')));
  console.log(`  ${icons.bullet} ${colors.accent(format.bold('@vibe-log-track-analyzer'))}`);
  console.log(`    ${colors.dim(icons.arrow)} Analyzes productivity patterns and metrics`);
  console.log();
  
  // Phase 3 - Report Generation
  console.log(colors.primary(format.bold('Phase 3 - Report Generation:')));
  console.log(`  ${icons.bullet} ${colors.accent(format.bold('@vibe-log-report-generator'))}`);
  console.log(`    ${colors.dim(icons.arrow)} Creates concise HTML report`);
  console.log(`    ${colors.dim(icons.arrow)} Saves to current directory with date`);
  console.log();
  
  // Bottom border
  console.log(colors.dim(box.horizontal.repeat(62)));
  console.log();
}

/**
 * Display current installation status and determine if we should proceed
 */
async function showInstallationStatus(): Promise<{
  status: Awaited<ReturnType<typeof getSubAgentStatus>>;
  shouldProceed: boolean;
  isReinstall: boolean;
}> {
  const status = await getSubAgentStatus();
  
  if (status.installed.length === status.total) {
    console.log(colors.success('✓ All sub-agents are already installed!'));
    console.log(colors.dim(`Location: ${status.directory}`));
    console.log();
    console.log(colors.highlight('You can re-install to get the latest versions or fix any issues.'));
    return { status, shouldProceed: true, isReinstall: true };
  }
  
  console.log(colors.accent('Installation Details:'));
  console.log(`Location: ${colors.dim(status.directory)}`);
  console.log(`Status: ${colors.highlight(`${status.installed.length}/${status.total}`)} installed`);
  
  if (status.missing.length > 0) {
    console.log(`\nSub-agents to install (${status.missing.length}):`);
    status.missing.forEach(agent => {
      console.log(`  ${icons.bullet} ${agent.replace('.md', '')}`);
    });
  }
  
  return { status, shouldProceed: true, isReinstall: false };
}

/**
 * Prompt user for confirmation to install
 */
async function confirmInstallation(isReinstall: boolean = false): Promise<boolean> {
  const message = isReinstall 
    ? 'Do you want to re-install/update the sub-agents?'
    : 'Do you want to install the sub-agents?';
    
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message,
    default: true
  }]);
  
  return confirm;
}

/**
 * Display installation results
 */
function showInstallationResults(result: Awaited<ReturnType<typeof installSubAgents>>): void {
  if (result.installed.length > 0) {
    console.log(colors.success('\n✅ Sub-agents installation complete!'));
    console.log(colors.dim('\nYou can now use these sub-agents in Claude Code with @ mentions.'));
  } else if (result.skipped.length > 0 && result.failed.length === 0) {
    console.log(colors.success('\n✓ All sub-agents are already installed!'));
  } else if (result.failed.length > 0) {
    console.log(colors.warning('\n⚠️  Some sub-agents failed to install. Please check permissions.'));
    if (result.failed.length < 5) {
      console.log(colors.dim('\nFailed to install:'));
      result.failed.forEach(agent => {
        console.log(colors.dim(`  • ${agent}`));
      });
    }
  }
}

/**
 * Show management menu for sub-agents
 */
async function showManagementMenu(status: Awaited<ReturnType<typeof getSubAgentStatus>>): Promise<string> {
  const choices = [];
  
  if (status.installed.length < status.total) {
    choices.push({
      name: `${icons.plus} Install missing sub-agents (${status.missing.length} to install)`,
      value: 'install'
    });
  }
  
  if (status.installed.length === status.total) {
    choices.push({
      name: `${icons.refresh} Re-install/Update all sub-agents`,
      value: 'reinstall'
    });
  }
  
  if (status.installed.length > 0) {
    choices.push({
      name: `${icons.minus} Remove selected sub-agents`,
      value: 'remove-selected'
    });
    
    choices.push({
      name: `${icons.cross} Remove all sub-agents`,
      value: 'remove-all'
    });
  }
  
  choices.push({
    name: `${icons.arrow} Back to main menu`,
    value: 'back'
  });
  
  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices
  }]);
  
  return action;
}

/**
 * Handle selective removal of sub-agents
 */
async function handleSelectiveRemoval(status: Awaited<ReturnType<typeof getSubAgentStatus>>): Promise<void> {
  if (status.installed.length === 0) {
    console.log(colors.warning('\nNo sub-agents are currently installed.'));
    return;
  }
  
  const choices = status.installed.map(agent => ({
    name: agent.replace('.md', ''),
    value: agent,
    checked: false
  }));
  
  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: 'Select sub-agents to remove:',
    choices,
    validate: (input) => {
      if (input.length === 0) {
        return 'Please select at least one sub-agent to remove';
      }
      return true;
    }
  }]);
  
  if (selected.length === 0) {
    console.log(colors.warning('\nNo sub-agents selected.'));
    return;
  }
  
  // Confirm removal
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: `Remove ${selected.length} sub-agent${selected.length > 1 ? 's' : ''}?`,
    default: false
  }]);
  
  if (!confirm) {
    console.log(colors.warning('\nRemoval cancelled.'));
    return;
  }
  
  // Perform removal
  console.log('\nRemoving selected sub-agents...');
  const result = await removeSelectedSubAgents(
    selected as SubAgentName[],
    { onProgress: (message) => console.log(message) }
  );
  
  if (result.removed.length > 0) {
    console.log(colors.success(`\n✅ Successfully removed ${result.removed.length} sub-agent${result.removed.length > 1 ? 's' : ''}.`));
  }
  
  if (result.failed.length > 0) {
    console.log(colors.error(`\n⚠️ Failed to remove ${result.failed.length} sub-agent${result.failed.length > 1 ? 's' : ''}.`));
  }
}

/**
 * Handle removal of all sub-agents
 */
async function handleRemoveAll(): Promise<void> {
  // Single confirmation for removing all
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: colors.warning('Are you sure you want to remove ALL 3 vibe-log sub-agents?'),
    default: false
  }]);
  
  if (!confirm) {
    console.log(colors.warning('\nRemoval cancelled.'));
    return;
  }
  
  console.log('\nRemoving all sub-agents...');
  const removed = await removeAllSubAgents();
  
  if (removed > 0) {
    console.log(colors.success(`\n✅ Successfully removed ${removed} sub-agent${removed > 1 ? 's' : ''}.`));
  } else {
    console.log(colors.warning('\nNo sub-agents were removed.'));
  }
}

/**
 * Prompt user to generate a local report after first-time installation
 */
async function promptForLocalReport(): Promise<boolean> {
  console.log();
  console.log(colors.success('✨ Great! Your sub-agents are ready.'));
  console.log();
  
  const { generateReport } = await inquirer.prompt([{
    type: 'confirm',
    name: 'generateReport',
    message: 'Would you like to generate a local vibe-log report now?',
    default: true
  }]);
  
  return generateReport;
}

/**
 * Main interactive management flow for sub-agents
 */
export async function installSubAgentsInteractive(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Show explanation about sub-agents
    showSubAgentExplanation();
    
    // Check and display current status
    const { status } = await showInstallationStatus();
    
    // Show management menu
    const action = await showManagementMenu(status);
    
    switch (action) {
      case 'install':
      case 'reinstall': {
        const isReinstall = action === 'reinstall';
        const confirmed = await confirmInstallation(isReinstall);
        
        if (confirmed) {
          const actionText = isReinstall ? 'Re-installing' : 'Installing';
          console.log(`\n${actionText} sub-agents...`);
          const result = await installSubAgents({
            force: isReinstall,
            onProgress: (message) => console.log(message)
          });
          showInstallationResults(result);
          
          // If this is a fresh install (not reinstall) and all agents installed successfully
          // Also check that we actually installed agents (not just skipped because they were already there)
          if (!isReinstall && result.installed.length > 0 && result.failed.length === 0 && 
              (result.installed.length + result.skipped.length) === 3) {
            const shouldGenerateReport = await promptForLocalReport();
            if (shouldGenerateReport) {
              // Import and run the local report generator
              const { generateLocalReportInteractive } = await import('./local-report-generator');
              await generateLocalReportInteractive();
              return; // Exit the sub-agent installer after report generation
            }
          }
        } else {
          console.log(colors.warning('\nInstallation cancelled.'));
        }
        break;
      }
        
      case 'remove-selected':
        await handleSelectiveRemoval(status);
        break;
        
      case 'remove-all':
        await handleRemoveAll();
        break;
        
      case 'back':
        return;
    }
    
    // Clear and refresh menu
    console.clear();
  }
}