import inquirer from 'inquirer';
import { colors, box } from './styles';
import { 
  getStatusLineStatus,
  installStatusLine,
  uninstallStatusLine
} from '../status-line-manager';
import { showSuccess, showError, showInfo } from '../ui';
import { logger } from '../../utils/logger';

// Adapter types for menu compatibility
interface StatusLineConfig {
  state: 'NOT_INSTALLED' | 'PARTIALLY_INSTALLED' | 'FULLY_INSTALLED';
  hookInstalled?: boolean;
  displayInstalled?: boolean;
  analysisCount?: number;
  hasAnalyzeHook?: boolean;
  hasStatusLine?: boolean;
}

// Adapter function to get status line config for menu
async function detectStatusLineState(): Promise<StatusLineConfig> {
  const status = await getStatusLineStatus();
  
  let state: StatusLineConfig['state'];
  if (status === 'installed') {
    state = 'FULLY_INSTALLED';
  } else if (status === 'partial') {
    state = 'PARTIALLY_INSTALLED';
  } else {
    state = 'NOT_INSTALLED';
  }
  
  const isInstalled = status !== 'not-installed';
  return {
    state,
    hookInstalled: isInstalled,
    displayInstalled: isInstalled,
    hasAnalyzeHook: isInstalled,
    hasStatusLine: isInstalled,
    analysisCount: 0 // Would need to check for actual analysis files
  };
}

// Stub for stats function that was removed
async function getStatusLineStats(): Promise<{ 
  analysisCount: number; 
  lastAnalysis?: Date;
  averageScore?: number;
}> {
  // Check if analysis files exist
  return {
    analysisCount: 0,
    lastAnalysis: undefined,
    averageScore: undefined
  };
}

import { 
  getStatusLinePersonality, 
  setStatusLinePersonality,
  getPersonalityDisplayName,
  getPersonalityIcon 
} from '../personality-manager';
import { createCustomPersonality, editCustomPersonality } from './personality-creator';
import { interactivePersonalityTester } from './personality-tester';
import { 
  getCCUsageConfig, 
  enableCCUsage, 
  disableCCUsage 
} from '../ccusage-config-manager';

/**
 * Display educational header about status line
 */
async function displayEducationalHeader(config: StatusLineConfig): Promise<void> {
  console.log(colors.accent('\n🚀 Status Line - Strategic Co-pilot'));
  console.log(colors.highlight('   Strategic guidance to move your project forward\n'));
  
  // Value proposition
  console.log(colors.subdued('The Status Line uses your local Claude Code to provide strategic'));
  console.log(colors.subdued('guidance on your prompts. It helps you think strategically about'));
  console.log(colors.subdued('your next steps with actionable suggestions to stay productive.\n'));
  
  console.log(colors.info('🎯 Why Use Status Line?'));
  console.log(colors.success('  🚀 Move Forward') + colors.subdued(' - Strategic advice on next steps'));
  console.log(colors.success('  🎯 Stay Focused') + colors.subdued(' - Remember your goal and stay on track'));
  console.log(colors.success('  ⚡ Concrete Actions') + colors.subdued(' - Specific suggestions to improve'));
  console.log(colors.success('  📈 Strategic Thinking') + colors.subdued(' - Consider the right approach\n'));
  
  console.log(colors.info('⚙️  How Status Line Works:'));
  console.log(colors.subdued('  1. Intercepts prompts submitted in Claude Code'));
  console.log(colors.subdued('  2. Analyzes via local Claude Code with session context'));
  console.log(colors.subdued('  3. Provides strategic guidance to push you forward'));
  console.log(colors.subdued('  4. Displays actionable feedback in your status bar'));
  
  // Current status display
  console.log(box.horizontal.repeat(60));
  console.log('');
  
  let statusText = '';
  let statusColor = colors.muted;
  let statusIcon = '○';
  
  if (config.state === 'FULLY_INSTALLED') {
    statusText = 'Installed and Active';
    statusColor = colors.success;
    statusIcon = '✅';
  } else if (config.state === 'PARTIALLY_INSTALLED') {
    statusText = 'Partially Installed (Needs Fix)';
    statusColor = colors.warning;
    statusIcon = '⚠️';
  } else {
    statusText = 'Not Installed';
    statusColor = colors.muted;
    statusIcon = '○';
  }
  
  console.log(`${statusIcon} Status: ${statusColor(statusText)}`);
  
  // Show personality if status line is installed
  if (config.state === 'FULLY_INSTALLED') {
    const personality = getStatusLinePersonality();
    const personalityIcon = getPersonalityIcon(personality.personality);
    const personalityName = getPersonalityDisplayName(personality.personality);
    console.log(`${personalityIcon} Personality: ${colors.accent(personalityName)}`);
    
    // Check and display ccusage status
    const ccusageConfig = await getCCUsageConfig();
    if (ccusageConfig.enabled) {
      console.log(`💰 Usage Metrics: ${colors.success('Enabled (via ccusage)')}`);
    }
  }
  
  // Show component status if partially installed
  if (config.state === 'PARTIALLY_INSTALLED') {
    console.log('');
    console.log(colors.subdued('Components:'));
    const hookStatus = config.hasAnalyzeHook ? '✓' : '✗';
    const displayStatus = config.hasStatusLine ? '✓' : '✗';
    console.log(colors.subdued(`  ${hookStatus} UserPromptSubmit hook`));
    console.log(colors.subdued(`  ${displayStatus} Status line display`));
  }
  
  // Show example or stats
  if (config.state === 'FULLY_INSTALLED') {
    const stats = await getStatusLineStats();
    if (stats.analysisCount > 0) {
      console.log('');
      console.log(colors.subdued('Your Statistics:'));
      console.log(colors.subdued(`  • Prompts analyzed: ${colors.accent(stats.analysisCount.toString())}`));
      if (stats.averageScore !== undefined) {
        console.log(colors.subdued(`  • Average score: ${colors.accent(stats.averageScore.toString() + '/100')}`));
      }
      if (stats.lastAnalysis) {
        const timeAgo = getTimeAgo(stats.lastAnalysis);
        console.log(colors.subdued(`  • Last analysis: ${timeAgo}`));
      }
    }
  } else {
    console.log('');
    console.log(colors.info('🎭 Coach Personalities:'));
    console.log('');
    console.log(colors.warning('  🔥 Gordon') + colors.subdued(' - Direct, results-focused'));
    console.log(colors.dim('     "Focus on the MVP first, skip the nice-to-haves"'));
    console.log('');
    console.log(colors.accent('  💜 Vibe-Log') + colors.subdued(' - Supportive, encouraging'));
    console.log(colors.dim('     "Great start! Consider breaking this into steps"'));
    console.log('');
    console.log(colors.primary('  ✨ Custom') + colors.subdued(' - Your strategic style'));
    console.log(colors.dim('     Define your ideal strategic advisor'));
    console.log('');
    console.log(colors.info('📊 Example Feedback:'));
    console.log(colors.success('  🟢 85/100') + colors.subdued(' | ') + colors.highlight('Start with authentication, then add features'));
    console.log(colors.subdued('  ') + colors.primary('✅ NEXT STEP: "Implement login endpoint with JWT"'));
  }
  
  console.log('');
  console.log(box.horizontal.repeat(60));
  console.log('');
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

/**
 * Install status line with confirmation
 */
async function performInstallation(): Promise<void> {
  console.clear();
  
  // Show what will be installed
  console.log(colors.highlight('\n🚀 Installing Strategic Co-pilot\n'));
  
  console.log(colors.success('What you\'ll get:'));
  console.log('');
  console.log(colors.primary('  ✓ Strategic guidance') + colors.subdued(' on your development approach'));
  console.log(colors.primary('  ✓ Actionable next steps') + colors.subdued(' to keep moving forward'));
  console.log(colors.primary('  ✓ Choose your advisor') + colors.subdued(' (Gordon/Vibe-Log/Custom)'));
  console.log('');
  
  console.log(colors.info('Technical setup:'));
  console.log(colors.dim('  • UserPromptSubmit hook for analysis'));
  console.log(colors.dim('  • Status line display in Claude Code'));
  console.log(colors.dim('  • Installation path: ~/.claude/settings.json'));
  console.log('');

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Proceed with installation?',
      default: true
    }
  ]);

  if (!confirm) {
    console.log(colors.muted('\nInstallation cancelled'));
    return;
  }

  try {
    // Show progress
    console.log('');
    console.log(colors.muted('Installing...'));
    
    // Perform installation
    await installStatusLine();
    
    // Success message
    console.log('');
    showSuccess('Strategic Co-pilot activated!');
    console.log('');
    console.log(colors.highlight('🚀 Quick Start:'));
    console.log('');
    console.log(colors.success('  1. Submit any prompt') + colors.subdued(' in Claude Code'));
    console.log(colors.success('  2. Watch your status bar') + colors.subdued(' for strategic guidance'));
    console.log(colors.success('  3. Follow the advice') + colors.subdued(' to move forward effectively!'));
    console.log('');
    console.log(colors.accent('  💡 Pro tip:') + colors.subdued(' Ask for a complex feature and watch'));
    console.log(colors.subdued('     your co-pilot suggest a strategic approach!'));
    console.log('');
    
  } catch (error) {
    console.log('');
    showError('Failed to install status line');
    if (error instanceof Error) {
      console.log(colors.dim(`  ${error.message}`));
    }
    logger.error('Status line installation failed:', error);
  }
}

/**
 * Fix partially installed status line
 */
async function performFix(config: StatusLineConfig): Promise<void> {
  console.clear();
  
  // Show what's broken
  console.log(colors.warning('\n🔧 Fixing Strategic Co-pilot Installation\n'));
  
  console.log('Current state:');
  console.log('');
  
  const hookStatus = config.hasAnalyzeHook ? '✓' : '✗';
  const displayStatus = config.hasStatusLine ? '✓' : '✗';
  
  console.log(`  ${hookStatus} UserPromptSubmit hook: ${config.hasAnalyzeHook ? 'Installed' : 'Missing'}`);
  console.log(`  ${displayStatus} Status line display: ${config.hasStatusLine ? 'Installed' : 'Missing'}`);
  console.log('');

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Fix the installation?',
      default: true
    }
  ]);

  if (!confirm) {
    console.log(colors.muted('\nFix cancelled'));
    return;
  }

  try {
    console.log('');
    console.log(colors.muted('Fixing installation...'));
    
    // Reinstall everything
    await installStatusLine();
    
    console.log('');
    showSuccess('Strategic Co-pilot fixed successfully!');
    console.log('');
    
  } catch (error) {
    console.log('');
    showError('Failed to fix status line');
    if (error instanceof Error) {
      console.log(colors.dim(`  ${error.message}`));
    }
    logger.error('Status line fix failed:', error);
  }
}

/**
 * Uninstall status line with confirmation
 */
async function performUninstall(): Promise<void> {
  console.clear();
  
  // Show what will be removed
  console.log(colors.warning('\n⚠️  Uninstalling Strategic Co-pilot\n'));
  
  console.log('This will remove:');
  console.log('');
  console.log(`  • UserPromptSubmit hook`);
  console.log(`  • Status line display`);
  console.log('');
  console.log(colors.subdued('Your analysis history will be preserved'));
  console.log('');

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: colors.warning('Are you sure you want to uninstall?'),
      default: false
    }
  ]);

  if (!confirm) {
    console.log(colors.muted('\nUninstall cancelled'));
    return;
  }

  try {
    console.log('');
    console.log(colors.muted('Uninstalling...'));
    
    // Perform uninstallation
    await uninstallStatusLine();
    
    console.log('');
    showInfo('Strategic Co-pilot uninstalled');
    console.log(colors.dim('  You can reinstall it anytime from the menu'));
    console.log('');
    
  } catch (error) {
    console.log('');
    showError('Failed to uninstall status line');
    if (error instanceof Error) {
      console.log(colors.dim(`  ${error.message}`));
    }
    logger.error('Status line uninstallation failed:', error);
  }
}

/**
 * Manage personality settings
 */
async function managePersonality(): Promise<void> {
  console.clear();
  
  const personality = getStatusLinePersonality();
  const currentPersonality = personality.personality;
  const currentName = getPersonalityDisplayName(currentPersonality);
  const currentIcon = getPersonalityIcon(currentPersonality);
  
  console.log(colors.accent('\n🎭 Manage Status Line Personality\n'));
  console.log(`Current: ${currentIcon} ${colors.highlight(currentName)}\n`);
  
  // Build choices with current status indicators
  const choices = [
    {
      name: '🧪 Test Current Personality',
      value: 'test'
    },
    new inquirer.Separator(),
    {
      name: `🔥 Gordon ${currentPersonality === 'gordon' ? colors.success('(Active)') : ''}`,
      value: 'gordon',
      disabled: currentPersonality === 'gordon' ? 'Currently active' : false
    },
    {
      name: `💜 Vibe-Log ${currentPersonality === 'vibe-log' ? colors.success('(Active)') : ''}`,
      value: 'vibe-log',
      disabled: currentPersonality === 'vibe-log' ? 'Currently active' : false
    },
    new inquirer.Separator(),
    {
      name: '✨ Create Custom Personality',
      value: 'create-custom'
    }
  ];
  
  // Add edit option if custom personality exists
  if (personality.customPersonality) {
    const customName = personality.customPersonality.name;
    choices.push({
      name: `📝 Edit Custom: "${customName}" ${currentPersonality === 'custom' ? colors.success('(Active)') : ''}`,
      value: 'edit-custom'
    });
    
    // Add activate option if not currently active
    if (currentPersonality !== 'custom') {
      choices.push({
        name: `✨ Activate Custom: "${customName}"`,
        value: 'custom'
      });
    }
  }
  
  choices.push(
    new inquirer.Separator(),
    {
      name: '← Back',
      value: 'back'
    }
  );
  
  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'Choose a personality:',
      choices,
      pageSize: 10
    }
  ]);
  
  switch (choice) {
    case 'test':
      await interactivePersonalityTester();
      break;
      
    case 'gordon':
    case 'vibe-log':
      setStatusLinePersonality(choice);
      console.log('');
      showSuccess(`Personality switched to ${getPersonalityDisplayName(choice)}!`);
      console.log(colors.dim('\n  The status line will now use this personality style'));
      await promptToContinue();
      break;
      
    case 'custom':
      if (personality.customPersonality) {
        setStatusLinePersonality('custom');
        console.log('');
        showSuccess(`Activated custom personality "${personality.customPersonality.name}"!`);
        console.log(colors.dim('\n  The status line will now use your custom style'));
        await promptToContinue();
      }
      break;
      
    case 'create-custom':
      await createCustomPersonality();
      await promptToContinue();
      break;
      
    case 'edit-custom':
      await editCustomPersonality();
      await promptToContinue();
      break;
      
    case 'back':
      // Return to main menu
      break;
  }
}

/**
 * Wait for user to press Enter
 */
async function promptToContinue(): Promise<void> {
  await inquirer.prompt({
    type: 'input',
    name: 'continue',
    message: 'Press Enter to continue...',
    default: ''
  });
}

/**
 * Main status line management menu
 */
export async function showStatusLineMenu(): Promise<void> {
  let shouldContinue = true;

  while (shouldContinue) {
    console.clear();
    
    // Get current status
    const config = await detectStatusLineState();
    
    // Display header with current status
    await displayEducationalHeader(config);

    // Build menu choices based on state
    const choices = [];
    
    if (config.state === 'NOT_INSTALLED') {
      choices.push({
        name: `🚀 Install Strategic Co-pilot`,
        value: 'install'
      });
    } else if (config.state === 'PARTIALLY_INSTALLED') {
      choices.push({
        name: `⚠️  Fix Strategic Co-pilot Installation`,
        value: 'fix'
      });
      choices.push({
        name: `❌ Uninstall Strategic Co-pilot`,
        value: 'uninstall'
      });
    } else if (config.state === 'FULLY_INSTALLED') {
      choices.push({
        name: `✅ Strategic Co-pilot Active (Reinstall to Update)`,
        value: 'reinstall'
      });
      
      // Add ccusage toggle option
      const ccusageConfig = await getCCUsageConfig();
      
      if (ccusageConfig.enabled) {
        choices.push({
          name: `💰 Disable ccusage metrics`,
          value: 'disable-ccusage'
        });
      } else {
        choices.push({
          name: `💰 Enable ccusage metrics`,
          value: 'enable-ccusage'
        });
      }
      
      choices.push({
        name: `🎭 Manage Personality`,
        value: 'personality'
      });
      choices.push({
        name: `🧪 Test Personality System`,
        value: 'test-quick'
      });
      choices.push({
        name: `❌ Uninstall Strategic Co-pilot`,
        value: 'uninstall'
      });
    }
    
    choices.push(
      new inquirer.Separator(),
      {
        name: '← Back to main menu',
        value: 'back'
      }
    );

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices,
        pageSize: 10
      }
    ]);

    switch (action) {
      case 'install':
        await performInstallation();
        await promptToContinue();
        break;
        
      case 'fix':
        await performFix(config);
        await promptToContinue();
        break;
        
      case 'reinstall':
        await performInstallation();
        await promptToContinue();
        break;
      
      case 'enable-ccusage':
        try {
          console.log('');
          console.log(colors.muted('Enabling ccusage integration...'));
          await enableCCUsage();
          console.log('');
          showSuccess('ccusage metrics enabled!');
          console.log(colors.dim('\n  Token usage will now appear in your status line'));
          console.log(colors.dim('  Note: ccusage may take a moment to calculate on first use'));
        } catch (error) {
          console.log('');
          showError('Failed to enable ccusage');
          if (error instanceof Error) {
            console.log(colors.dim(`  ${error.message}`));
          }
        }
        await promptToContinue();
        break;
      
      case 'disable-ccusage':
        try {
          console.log('');
          console.log(colors.muted('Disabling ccusage integration...'));
          await disableCCUsage();
          console.log('');
          showInfo('ccusage metrics disabled');
          console.log(colors.dim('\n  Token usage will no longer appear in status line'));
        } catch (error) {
          console.log('');
          showError('Failed to disable ccusage');
          if (error instanceof Error) {
            console.log(colors.dim(`  ${error.message}`));
          }
        }
        await promptToContinue();
        break;
      
      case 'personality':
        await managePersonality();
        break;
      
      case 'test-quick':
        await interactivePersonalityTester();
        await promptToContinue();
        break;
        
      case 'uninstall':
        await performUninstall();
        await promptToContinue();
        break;
        
      case 'back':
        shouldContinue = false;
        break;
    }
  }
}