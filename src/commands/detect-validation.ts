import { Command } from 'commander';
import {
  getPushUpChallengeConfig,
  incrementPushUpDebt,
  incrementTodayDebt
} from '../lib/config';
import { syncPushUpStats } from '../lib/push-up-sync';
import { logger } from '../utils/logger';

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

/**
 * Detect validation phrases in Claude's responses
 * This command is designed to be called from Claude Code hooks
 */
export function createDetectValidationCommand(): Command {
  const command = new Command('detect-validation')
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
          // Parse JSON input - expected format: { response: string, sessionId?: string }
          const parsed = JSON.parse(stdinData);
          response = parsed.response || '';
        } catch (error) {
          if (options.silent) {
            console.log(JSON.stringify({ triggered: false, error: 'Invalid JSON input' }));
          } else {
            logger.error('Failed to parse stdin JSON', error);
          }
          return;
        }
      }

      // Detection patterns (case-insensitive)
      const patterns = [
        { regex: /you('re|\s+are)\s+absolutely\s+right/i, phrase: "you're absolutely right" },

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

  return command;
}