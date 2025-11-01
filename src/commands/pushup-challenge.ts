import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { readFileSync, existsSync } from 'fs';
import {
  getPushUpChallengeConfig,
  setPushUpChallengeEnabled,
  getPushUpStats,
  incrementPushUpDebt,
  incrementTodayDebt,
  recordPushUpsCompleted
} from '../lib/config';
import { ClaudeSettingsManager } from '../lib/claude-settings-manager';
import { syncPushUpStats } from '../lib/push-up-sync';
import { logger } from '../utils/logger';
import { displayReceiptWithCopyOption } from '../lib/ui/push-up-receipt';

// Helper functions
function calculateDuration(startDate: string): string {
  const start = new Date(startDate);
  const now = new Date();
  const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (days < 7) return `${days} day${days !== 1 ? 's' : ''}`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) !== 1 ? 's' : ''}`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) !== 1 ? 's' : ''}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

/**
 * Create the main push-up challenge command with sub-commands
 */
export function createPushUpCommand(): Command {
  const pushup = new Command('pushup')
    .description('Push-up challenge gamification for reducing AI over-validation')
    .addHelpText('after', `
Examples:
  $ vibe-log pushup enable       # Enable challenge with optional statusline
  $ vibe-log pushup stats        # View current stats
  $ vibe-log pushup summary      # Settle your push-up debt
  $ vibe-log pushup statusline   # Manage statusline display
    `);

  // Enable sub-command
  pushup
    .command('enable')
    .description('Enable the push-up challenge (silent mode)')
    .action(async () => {
      try {
        // Ask for push-up count
        console.log(chalk.gray('\n🔍 Debug: About to show 2 prompts...\n'));

        const answers = await (inquirer.prompt as any)([
          {
            type: 'number',
            name: 'pushUpsPerTrigger',
            message: 'How many push-ups per validation phrase?',
            default: 1,
            validate: (value: number) => {
              if (!value || isNaN(value) || value < 1 || value > 100) {
                return 'Please enter a number between 1 and 100';
              }
              return true;
            }
          },
          {
            type: 'confirm',
            name: 'installStatusline',
            message: 'Install challenge statusline to track progress in Claude Code?',
            default: true
          }
        ]);

        console.log(chalk.gray(`\n🔍 Debug: Received answers - pushUps: ${answers.pushUpsPerTrigger}, statusline: ${answers.installStatusline}\n`));

        const pushUpsPerTrigger = answers.pushUpsPerTrigger;
        const installStatusline = answers.installStatusline;

        // Update config (no mode needed, always silent)
        setPushUpChallengeEnabled(true, pushUpsPerTrigger as number);

        // Sync to server immediately after enabling
        try {
          await syncPushUpStats();
          logger.debug('Push-up challenge synced to server');
        } catch (error) {
          logger.error('Failed to sync push-up challenge to server', error);
          console.log(chalk.yellow('\n⚠️  Warning: Failed to sync to server. Will retry on next session upload.'));
        }

        // Install hook (silent mode only)
        const settingsManager = new ClaudeSettingsManager();
        await settingsManager.installPushUpChallengeHook();

        // Install challenge statusline if requested
        if (installStatusline) {
          await settingsManager.installChallengeStatusLineFeature();
          console.log(chalk.green(`✅ Push-up challenge enabled with statusline!`));
        } else {
          console.log(chalk.green(`✅ Push-up challenge enabled!`));
        }

        console.log(chalk.gray(`   Rate: ${pushUpsPerTrigger} push-up(s) per validation`));
        console.log();
        console.log(chalk.cyan('💡 Debt will accumulate silently. Check with `vibe-log pushup stats`'));

        if (installStatusline) {
          console.log(chalk.cyan('💡 Your progress is now visible in Claude Code statusline!'));
        } else {
          console.log(chalk.gray('   Run `vibe-log pushup statusline install` to add statusline later'));
        }
      } catch (error) {
        logger.error('Failed to enable push-up challenge', error);
        process.exit(1);
      }
    });

  // Disable sub-command
  pushup
    .command('disable')
    .description('Disable the push-up challenge')
    .action(async () => {
      try {
        const stats = getPushUpStats();
        const config = getPushUpChallengeConfig();

        if (!config.enabled) {
          console.log(chalk.yellow('⚠️  Push-up challenge is not enabled.'));
          return;
        }

        // Show final stats
        console.log('\n' + chalk.bold('📊 Final Push-Up Challenge Stats:'));
        console.log(chalk.gray('   Debt: ') + chalk.red(stats.debt));
        console.log(chalk.gray('   Completed: ') + chalk.green(stats.completed));
        console.log(chalk.gray('   Streak: ') + chalk.yellow(`${stats.streakDays} days`));

        if (stats.startDate) {
          const duration = calculateDuration(stats.startDate);
          console.log(chalk.gray('   Duration: ') + chalk.cyan(duration));
        }

        // Uninstall hook
        const settingsManager = new ClaudeSettingsManager();
        await settingsManager.uninstallPushUpChallengeHook();

        // Disable in config (preserve stats)
        setPushUpChallengeEnabled(false);

        // Sync to server immediately after disabling
        try {
          await syncPushUpStats();
          logger.debug('Push-up challenge disabled status synced to server');
        } catch (error) {
          logger.error('Failed to sync disabled status to server', error);
          console.log(chalk.yellow('\n⚠️  Warning: Failed to sync to server. Will retry on next session upload.'));
        }

        console.log('\n' + chalk.green('✅ Push-up challenge disabled. Stats preserved.'));
      } catch (error) {
        logger.error('Failed to disable push-up challenge', error);
        process.exit(1);
      }
    });

  // Stats sub-command
  pushup
    .command('stats')
    .description('Show push-up challenge statistics')
    .action(async () => {
      try {
        const stats = getPushUpStats();
        const config = getPushUpChallengeConfig();

        console.log('\n' + chalk.bold('💪 Push-Up Challenge Stats:'));
        console.log(chalk.gray('   Status: ') + (config.enabled ? chalk.green('✅ Active') : chalk.red('❌ Disabled')));

        if (config.enabled) {
          console.log(chalk.gray('   Rate: ') + chalk.cyan(`${config.pushUpsPerTrigger} per validation`));
        }

        console.log(chalk.gray('   Total Debt: ') + chalk.red(stats.debt));
        console.log(chalk.gray('   Total Completed: ') + chalk.green(stats.completed));
        console.log(chalk.gray('   Today\'s Debt: ') + chalk.yellow(stats.todayDebt));
        console.log(chalk.gray('   Today\'s Completed: ') + chalk.yellow(stats.todayCompleted));
        console.log(chalk.gray('   Streak: ') + chalk.yellow(`${stats.streakDays} days 🔥`));

        if (stats.startDate) {
          console.log(chalk.gray('   Running since: ') + chalk.cyan(formatDate(stats.startDate)));
        }

        console.log();
      } catch (error) {
        logger.error('Failed to show stats', error);
        process.exit(1);
      }
    });


  // Summary sub-command
  pushup
    .command('summary')
    .description('Show push-up stats and settle debt')
    .action(async () => {
      try {
        const stats = getPushUpStats();
        const config = getPushUpChallengeConfig();

        if (!config.enabled) {
          console.log(chalk.yellow('⚠️  Push-up challenge is not enabled.'));
          return;
        }

        console.log('\n' + chalk.bold('💪 Push-Up Challenge Summary:'));
        console.log(chalk.gray('   Today: ') + chalk.cyan(`${stats.todayCompleted} done / ${stats.todayDebt} owed`));
        console.log(chalk.gray('   Total debt: ') + chalk.red(stats.debt));
        console.log(chalk.gray('   Total completed: ') + chalk.green(stats.completed));
        console.log();

        if (stats.debt > 0) {
          const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: `You owe ${stats.debt} push-ups. Mark as done?`,
            choices: [
              { name: '✅ Yes, already did them', value: 'done' },
              { name: '📝 No, keep in debt', value: 'debt' },
            ],
          }]);

          if (action === 'done') {
            // Mark push-ups as completed and reduce debt
            recordPushUpsCompleted(stats.debt);
            incrementPushUpDebt(-stats.debt);
            await syncPushUpStats();
            console.log(chalk.green(`\n✅ Marked ${stats.debt} push-ups as completed!`));
            console.log();

            // Display the awesome receipt with clipboard copy
            await displayReceiptWithCopyOption(stats.debt);
          } else {
            console.log(chalk.yellow('📝 Debt remains. Keep pushing!'));
          }
        } else {
          console.log(chalk.green('✅ All caught up! Great work!'));
        }
      } catch (error) {
        logger.error('Failed to show summary', error);
        process.exit(1);
      }
    });


  // Detect sub-command (for hooks - reads from stdin)
  pushup
    .command('detect')
    .description('Detect validation phrases in Claude responses (for hooks)')
    .option('--silent', 'Run silently, output only JSON result')
    .option('--stdin', 'Read input from stdin')
    .option('--timeout <ms>', 'Timeout for stdin reading in ms', '1000')
    .action(async (options) => {
      const config = getPushUpChallengeConfig();

      // If challenge is not enabled, return early
      if (!config.enabled) {
        if (options.silent) {
          console.log(JSON.stringify({ triggered: false, enabled: false }));
        }
        return;
      }

      let response = '';

      // Read from stdin if requested
      if (options.stdin) {
        const stdinData = await readStdin(parseInt(options.timeout));
        if (!stdinData) {
          if (options.silent) {
            console.log(JSON.stringify({ triggered: false, error: 'No stdin data' }));
          } else {
            logger.error('No data received from stdin');
          }
          return;
        }

        try {
          // Parse JSON input - expected format from Stop hook:
          // { session_id, transcript_path, permission_mode, hook_event_name, stop_hook_active }
          const parsed = JSON.parse(stdinData);
          const transcriptPath = parsed.transcript_path;

          if (!transcriptPath) {
            if (options.silent) {
              console.log(JSON.stringify({ triggered: false, error: 'No transcript_path in input' }));
            }
            return;
          }

          // Read the transcript file to get the last assistant message
          if (!existsSync(transcriptPath)) {
            if (options.silent) {
              console.log(JSON.stringify({ triggered: false, error: 'Transcript file not found' }));
            }
            return;
          }

          // Read file from the end for efficiency
          const transcriptContent = readFileSync(transcriptPath, 'utf-8');
          const lines = transcriptContent.trim().split('\n');

          // Read backwards to find the last assistant message (most efficient)
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const entry = JSON.parse(lines[i]);
              // Check if this is an assistant message (message.role === 'assistant')
              if (entry.message?.role === 'assistant' && entry.message?.content) {
                // Extract text from content array
                const textContent = entry.message.content
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join(' ');
                response = textContent;
                break;
              }
            } catch (parseError) {
              // Skip invalid lines
              continue;
            }
          }

          if (!response) {
            if (options.silent) {
              console.log(JSON.stringify({ triggered: false, error: 'No assistant message found' }));
            }
            return;
          }
        } catch (error) {
          if (options.silent) {
            console.log(JSON.stringify({ triggered: false, error: 'Failed to process transcript' }));
          } else {
            logger.error('Failed to process transcript', error);
          }
          return;
        }
      }

      // Detection patterns (case-insensitive)
      const patterns = [
        { regex: /you('re|\s+are)\s+absolutely\s+right/i, phrase: "you're absolutely right" },
        { regex: /you('re|\s+are)\s+totally\s+right/i, phrase: "you're totally right" },
        { regex: /you('re|\s+are)\s+completely\s+correct/i, phrase: "you're completely correct" },
        { regex: /that('s|\s+is)\s+absolutely\s+correct/i, phrase: "that's absolutely correct" },
        { regex: /absolutely\s+right/i, phrase: "absolutely right" },
        { regex: /perfect(ly)?\s+(right|correct)/i, phrase: "perfectly correct" },
        { regex: /you\s+nailed\s+it/i, phrase: "you nailed it" },
        { regex: /spot\s+on/i, phrase: "spot on" },
      ];

      const matchedPattern = patterns.find(p => p.regex.test(response));
      const triggered = !!matchedPattern;

      if (triggered) {
        const amount = config.pushUpsPerTrigger;
        const phrase = matchedPattern.phrase;

        logger.debug(`Validation detected: "${phrase}" - adding ${amount} push-up(s) to debt`);

        // Always increment debt (silent mode only)
        incrementPushUpDebt(amount);
        incrementTodayDebt(amount);

        logger.debug(`Push-up debt added: ${amount}`);

        // Sync to backend (silent, fire-and-forget)
        syncPushUpStats().catch(err => {
          logger.debug('Failed to sync push-up stats', err);
        });
      }

      // Output result
      if (options.silent) {
        console.log(JSON.stringify({
          triggered,
          debt: config.totalDebt,
          phrase: matchedPattern?.phrase
        }));
      } else if (triggered) {
        logger.info(`Validation detected: ${matchedPattern.phrase}`);
      }
    });

  // Statusline management sub-command
  pushup
    .command('statusline')
    .description('Manage challenge statusline display in Claude Code')
    .action(async () => {
      try {
        const settingsManager = new ClaudeSettingsManager();

        // Detect current statusline status
        const { readGlobalSettings } = await import('../lib/claude-settings-reader');
        const settings = await readGlobalSettings();

        let currentStatusline = 'none';
        if (settings?.statusLine?.command) {
          if (settings.statusLine.command.includes('statusline-challenge')) {
            currentStatusline = 'challenge';
          } else if (settings.statusLine.command.includes('statusline')) {
            currentStatusline = 'prompt-analysis';
          } else {
            currentStatusline = 'other';
          }
        }

        // Show current status
        console.log('\n' + chalk.bold('📊 Challenge Statusline Management:'));
        console.log(chalk.gray('   Current statusline: ') +
          (currentStatusline === 'challenge' ? chalk.green('Challenge Statusline ✅') :
           currentStatusline === 'prompt-analysis' ? chalk.yellow('Prompt Analysis Statusline') :
           currentStatusline === 'other' ? chalk.cyan('Custom Statusline') :
           chalk.red('No statusline installed')));
        console.log();

        // Ask user what they want to do
        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '📥 Install challenge statusline', value: 'install', disabled: currentStatusline === 'challenge' },
            { name: '🔄 Switch from prompt analysis to challenge statusline', value: 'switch-to-challenge', disabled: currentStatusline !== 'prompt-analysis' },
            { name: '🔙 Restore previous statusline', value: 'restore', disabled: currentStatusline === 'none' },
            { name: '❌ Uninstall challenge statusline', value: 'uninstall', disabled: currentStatusline !== 'challenge' },
            { name: '⬅️  Go back', value: 'back' }
          ]
        }]);

        if (action === 'back') {
          return;
        }

        // Handle actions
        switch (action) {
          case 'install':
            await settingsManager.installChallengeStatusLineFeature();
            console.log(chalk.green('\n✅ Challenge statusline installed!'));
            console.log(chalk.cyan('💡 Your push-up progress is now visible in Claude Code statusline'));
            break;

          case 'switch-to-challenge':
            await settingsManager.removeStatusLineFeature();
            await settingsManager.installChallengeStatusLineFeature();
            console.log(chalk.green('\n✅ Switched to challenge statusline!'));
            console.log(chalk.cyan('💡 Your push-up progress is now visible in Claude Code statusline'));
            break;

          case 'restore':
            await settingsManager.removeChallengeStatusLineFeature(true);
            console.log(chalk.green('\n✅ Previous statusline restored!'));
            break;

          case 'uninstall':
            const { confirmUninstall } = await inquirer.prompt([{
              type: 'confirm',
              name: 'confirmUninstall',
              message: 'Remove challenge statusline? (Stats will be preserved)',
              default: false
            }]);

            if (confirmUninstall) {
              await settingsManager.removeChallengeStatusLineFeature();
              console.log(chalk.green('\n✅ Challenge statusline uninstalled!'));
              console.log(chalk.gray('   Your challenge stats are still preserved'));
            } else {
              console.log(chalk.yellow('\n❌ Cancelled'));
            }
            break;
        }
      } catch (error) {
        logger.error('Failed to manage statusline', error);
        process.exit(1);
      }
    });

  return pushup;
}

/**
 * Read stdin with a timeout
 * Reusing the same pattern from analyze-prompt.ts
 */
async function readStdin(timeoutMs = 1000): Promise<string | null> {
  return new Promise((resolve) => {
    let input = '';
    let hasData = false;

    // Set timeout to check if stdin has data
    const timeout = setTimeout(() => {
      if (!hasData) {
        resolve(null); // No stdin data
      }
    }, timeoutMs);

    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        hasData = true;
        input += chunk;
      }
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(hasData ? input : null);
    });
  });
}
