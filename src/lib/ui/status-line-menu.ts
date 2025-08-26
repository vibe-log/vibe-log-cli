import inquirer from 'inquirer';
import { colors, box } from './styles';
import { 
  detectStatusLineState,
  installStatusLine,
  uninstallStatusLine,
  getStatusLineStats,
  StatusLineConfig
} from '../status-line-manager';
import { showSuccess, showError, showInfo } from '../ui';
import { logger } from '../../utils/logger';

/**
 * Display educational header about status line
 */
async function displayEducationalHeader(config: StatusLineConfig): Promise<void> {
  console.log(colors.accent('\n📊 Prompt Quality Status Line\n'));
  
  // Educational content
  console.log(colors.subdued('Real-time prompt quality feedback directly in Claude Code.\n'));
  
  console.log(colors.info('What is the Status Line?'));
  console.log(colors.subdued('  • Analyzes each prompt using Claude AI (Haiku model)'));
  console.log(colors.subdued('  • Shows quality score (0-100) in your status bar'));
  console.log(colors.subdued('  • Provides instant improvement suggestions\n'));
  
  console.log(colors.info('How it works:'));
  console.log(colors.subdued('  1. UserPromptSubmit hook analyzes your prompts'));
  console.log(colors.subdued('  2. Status line displays the analysis results'));
  console.log(colors.subdued('  3. Updates in real-time as you type\n'));
  
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
    console.log(colors.subdued('Example display:'));
    console.log(colors.primary('  [GOOD 75/100] Add more implementation details'));
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
  console.log(colors.highlight('\n🚀 Installing Status Line\n'));
  
  console.log('This will configure:');
  console.log('');
  console.log(`  ○ UserPromptSubmit hook for real-time analysis`);
  console.log(`  ○ Status line display in Claude Code`);
  console.log('');
  console.log(colors.subdued('Installation location:'));
  console.log(colors.dim('  ~/.claude/settings.json'));
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
    showSuccess('Status line installed successfully!');
    console.log('');
    console.log(colors.primary('✨ Try it out:'));
    console.log(colors.dim('  1. Type a prompt in Claude Code'));
    console.log(colors.dim('  2. Look at the bottom status bar'));
    console.log(colors.dim('  3. See your prompt quality score!'));
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
  console.log(colors.warning('\n🔧 Fixing Status Line Installation\n'));
  
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
    showSuccess('Status line fixed successfully!');
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
  console.log(colors.warning('\n⚠️  Uninstalling Status Line\n'));
  
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

  // Double confirmation
  const { confirmAgain } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmAgain',
      message: 'Really uninstall the status line?',
      default: false
    }
  ]);

  if (!confirmAgain) {
    console.log(colors.muted('\nUninstall cancelled'));
    return;
  }

  try {
    console.log('');
    console.log(colors.muted('Uninstalling...'));
    
    // Perform uninstallation
    await uninstallStatusLine();
    
    console.log('');
    showInfo('Status line uninstalled');
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
        name: `✅ Install Status Line`,
        value: 'install'
      });
    } else if (config.state === 'PARTIALLY_INSTALLED') {
      choices.push({
        name: `⚠️  Fix Status Line Installation`,
        value: 'fix'
      });
      choices.push({
        name: `❌ Uninstall Status Line`,
        value: 'uninstall'
      });
    } else if (config.state === 'FULLY_INSTALLED') {
      choices.push({
        name: `✅ Status Line Active (Reinstall to Update Paths)`,
        value: 'reinstall'
      });
      choices.push({
        name: `❌ Uninstall Status Line`,
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