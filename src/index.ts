#!/usr/bin/env node
import { Command } from 'commander';
import { sendWithTimeout } from './commands/send';
import { config } from './commands/config';
import { logout } from './commands/logout';
import { privacy } from './commands/privacy';
import { createAnalyzePromptCommand } from './commands/analyze-prompt';
import { createStatuslineCommand } from './commands/statusline';
import { createChallengeStatuslineCommand } from './commands/statusline-challenge';
import { createRefreshPushUpChallengeStatuslineCommand } from './commands/refresh-push-up-challenge-statusline';
import { createTestPersonalityCommand } from './commands/test-personality';
import { createPushUpCommand } from './commands/pushup-challenge';
import { installAutoSync } from './commands/install-auto-sync';
import { showLogo } from './lib/ui';
import { handleError } from './utils/errors';
import { logger } from './utils/logger';
import { detectSetupState } from './lib/detector';
import { showMainMenu } from './lib/ui/main-menu';
import { colors } from './lib/ui/styles';

// Import package.json for version info
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json');

// Check for package updates and store the info
let packageUpdateInfo: { current: string; latest: string } | null = null;
const isSilent = process.argv.includes('--silent');

if (!isSilent) {
  // Support simulation for testing
  const simulatedVersion = process.env.SIMULATE_OLD_VERSION;
  const displayPkg = simulatedVersion 
    ? { ...pkg, name: 'vibe-log-cli', version: simulatedVersion }
    : pkg;

  // Use update-notifier to check for package updates (async)
  (async () => {
    let notifier: any;
    try {
      const updateNotifierModule = await import('update-notifier');
      const updateNotifier = updateNotifierModule.default || updateNotifierModule;
      notifier = updateNotifier({
        pkg: displayPkg,
        updateCheckInterval: simulatedVersion ? 0 : 1000 * 60 * 60, // Check immediately in simulation, otherwise hourly
        shouldNotifyInNpmScript: true
      });
    } catch (error) {
      // Silently fail if update-notifier is not available
      notifier = { update: null };
    }

    // Store package update info if available
    if (notifier.update) {
      packageUpdateInfo = {
        current: notifier.update.current,
        latest: notifier.update.latest
      };
    } else if (simulatedVersion) {
      // Force package update info in simulation mode
      packageUpdateInfo = {
        current: simulatedVersion,
        latest: pkg.version
      };
    }
  })().catch(() => {
    // Silently ignore any update check failures
  });
}

// Store version for UI components
export const currentVersion = process.env.SIMULATE_OLD_VERSION || pkg.version;

const program = new Command();

program
  .name('vibe-log')
  .description('Track your building journey with vibe-log')
  .version(currentVersion)
  .option('-v, --verbose', 'Enable verbose logging')
  .helpOption(false) // Disable default help
  .hook('preAction', async (thisCommand) => {
    // Enable debug logging if verbose flag is set
    const options = thisCommand.opts();
    if (options.verbose) {
      logger.setLevel('debug');
    }
    // Skip logo in silent mode - check command line args directly since --silent is command-specific
    const isSilent = process.argv.includes('--silent');
    // Skip logo for hook commands (statusline, statusline-challenge, pushup check-prompt, etc.)
    const isHookCommand = process.argv[2] === 'statusline' ||
                          process.argv[2] === 'statusline-challenge' ||
                          (process.argv[2] === 'pushup' && process.argv[3] === 'check-prompt');
    // Only show logo if a command is specified (not the default interactive menu)
    const hasCommand = process.argv.length > 2 && !process.argv[2].startsWith('-');
    if (!isSilent && !isHookCommand && hasCommand) {
      await showLogo(currentVersion);
    }
  });

// Hidden command for hooks - not shown in help
program
  .command('send', { hidden: true })
  .description('Send session data from current project to vibe-log')
  .option('-d, --dry', 'Show what would be sent without uploading')
  .option('-a, --all', 'Send sessions from all projects (default: current project only)')
  .option('--silent', 'Run in silent mode (for hook execution)')
  .option('--background', 'Run upload in background (for hooks)')
  .option('--hook-trigger <type>', 'Hook that triggered this command (sessionstart, precompact, sessionend)')
  .option('--hook-version <version>', 'Hook version (for tracking hook updates)')
  .option('--test', 'Test mode for hook validation (exits without processing)')
  .option('--claude-project-dir <dir>', 'Claude project directory from $CLAUDE_PROJECT_DIR')
  .action(async (options) => {
    try {
      await sendWithTimeout(options);
    } catch (error) {
      handleError(error);
    }
  });

// Auth command - shown in help for direct cloud setup
program
  .command('auth', { hidden: true })
  .description('Sign in with GitHub to enable cloud sync, web dashboard, and streak tracking')
  .action(async () => {
    try {
      // Use the guided cloud setup wizard for complete experience
      const { guidedCloudSetup } = await import('./lib/ui/cloud-setup-wizard');
      await guidedCloudSetup();
    } catch (error) {
      handleError(error);
    }
  });

// Hidden command for advanced users
program
  .command('config', { hidden: true })
  .description('Manage vibe-log configuration')
  .option('-l, --list', 'List all configuration values')
  .option('-s, --set <key=value>', 'Set a configuration value')
  .option('-g, --get <key>', 'Get a configuration value')
  .action(async (options) => {
    try {
      await config(options);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('logout', { hidden: true })
  .description('Clear authentication and logout')
  .action(async () => {
    try {
      await logout();
    } catch (error) {
      handleError(error);
    }
  });

// Hidden command for advanced users
program
  .command('privacy', { hidden: true })
  .description('Preview and review data privacy (see what gets sent)')
  .option('-e, --export <path>', 'Export sanitized data to file')
  .action(async (options) => {
    try {
      await privacy(options);
    } catch (error) {
      handleError(error);
    }
  });

// Add analyze-prompt command (hidden - for hook use)
program.addCommand(createAnalyzePromptCommand());

// Add statusline command (hidden - for Claude Code status line)
program.addCommand(createStatuslineCommand());

// Add challenge statusline command (hidden - for Claude Code status line)
program.addCommand(createChallengeStatuslineCommand());

// Add refresh command for push-up challenge statusline (hidden - triggers statusline refresh)
program.addCommand(createRefreshPushUpChallengeStatuslineCommand());

// Add test-personality command (hidden - for debugging)
program.addCommand(createTestPersonalityCommand());

// Add push-up challenge command (hidden - for advanced users)
program.addCommand(createPushUpCommand());

// Add install-auto-sync command for direct access to auto-sync configuration
program
  .command('install-auto-sync')
  .description('Configure automatic session sync (Claude Code hooks)')
  .action(async () => {
    try {
      await installAutoSync();
    } catch (error) {
      handleError(error);
    }
  });

// Custom help function
function showHelp(): void {
  console.log('');
  console.log('Usage: npx vibe-log-cli');
  console.log('');
  console.log('Track your building journey with vibe-log');
  console.log('');
  console.log('Main usage:');
  console.log('  npx vibe-log-cli              Interactive menu (recommended)');
  console.log('');
  console.log('Quick actions:');
  console.log('  npx vibe-log-cli auth               Sign in to enable cloud sync & web dashboard');
  console.log('  npx vibe-log-cli install-auto-sync  Configure automatic session sync');
  console.log('  npx vibe-log-cli send               Manually sync sessions to cloud');
  console.log('  npx vibe-log-cli privacy            Preview what data gets sent (privacy first!)');
  console.log('');
  console.log('For hooks (automatic sync):');
  console.log('  npx vibe-log-cli send --silent    Used by Claude Code hooks');
  console.log('');
  console.log('Learn more at: https://vibe-log.dev');
  console.log('');
  process.exit(0);
}

// Handle --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
}

// Custom help handler for commander
program.on('option:help', showHelp);

// Show interactive menu when no command is provided
program.action(async () => {
  let state;
  
  try {
    // Try to detect current setup state
    state = await detectSetupState();
  } catch (error) {
    // If detection fails, show menu with ERROR state
    logger.debug('State detection failed:', error);
    state = {
      state: 'ERROR' as const,
      hasConfig: false,
      hasAuth: false,
      hasAgents: false,
      agentCount: 0,
      totalAgents: 8,
      hasHooks: false,
      hasStatusLine: false,
      statusLineStatus: 'not-installed' as const,
      trackingMode: 'none' as const,
      trackedProjectCount: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
  
  // Always show the interactive menu, even on error
  try {
    await showMainMenu(state, packageUpdateInfo);
  } catch (menuError) {
    // Only if menu itself fails, show simple fallback
    console.error(colors.error('\nFailed to display interactive menu'));
    console.log(colors.subdued('Run "npx vibe-log-cli" to get started'));
    
    if (menuError instanceof Error) {
      logger.debug('Menu display error:', menuError);
    }
  }
});

program.parseAsync(process.argv).catch(handleError);