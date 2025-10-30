/**
 * Challenge Statusline Command
 *
 * Displays push-up challenge progress in Claude Code status line.
 * This is a focused statusline that ONLY shows challenge stats,
 * separate from the prompt analysis statusline.
 *
 * Installation: Users install this via claude-settings-manager
 * Usage: Automatically invoked by Claude Code when configured
 */

import { Command } from 'commander';
import { logger } from '../utils/logger';
import { getPushUpChallengeConfig, getPushUpStats } from '../lib/config';
import {
  debugLog,
  OutputFormat,
  validateOutputFormat,
  readStdinWithTimeout,
  extractSessionId
} from './shared/statusline-base';
import { getProgressEmoji, formatNumber } from './shared/display-utils';

/**
 * Format push-up challenge stats for different output formats
 */
function formatChallengeStats(format: OutputFormat): string {
  const config = getPushUpChallengeConfig();

  // If challenge is not enabled, show encouraging message
  if (!config.enabled) {
    return formatDisabledMessage(format);
  }

  const stats = getPushUpStats();

  switch (format) {
    case 'json':
      return JSON.stringify({
        enabled: true,
        debt: stats.debt,
        completed: stats.completed,
        streakDays: stats.streakDays,
        todayDebt: stats.todayDebt,
        todayCompleted: stats.todayCompleted,
        startDate: stats.startDate,
        lastCompletedDate: stats.lastCompletedDate
      });

    case 'detailed':
      return formatDetailedStats(stats);

    case 'emoji':
      return formatEmojiStats(stats);

    case 'minimal':
      return formatMinimalStats(stats);

    case 'compact':
    default:
      return formatCompactStats(stats);
  }
}

/**
 * Format message when challenge is disabled
 */
function formatDisabledMessage(format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify({ enabled: false, message: 'Push-up challenge not enabled' });

    case 'detailed':
      return 'Status: Challenge Disabled | Enable with: vibe-log pushup enable';

    case 'emoji':
      return '💤 Challenge not enabled';

    case 'minimal':
      return 'Disabled';

    case 'compact':
    default:
      return '💪 Push-Up Challenge: Not enabled (Run `vibe-log pushup enable` to start!)';
  }
}

/**
 * Format compact output (default)
 * Example: 💪 Push-Up Challenge | To-Do: 15 | Done Today: 30 | Total: 250 | 🔥 5 day streak
 */
function formatCompactStats(stats: PushUpStats): string {
  const parts: string[] = ['💪 Push-Up Challenge'];

  // Show total debt if non-zero
  if (stats.debt > 0) {
    parts.push(`Total Debt: ${stats.debt}`);
  }


  // Show today's completed push-ups
  if (stats.todayCompleted > 0) {
    parts.push(`Done Today: ${stats.todayCompleted}`);
  }

  // Show total completed
  parts.push(`Total Done: ${formatNumber(stats.completed)}`);

  // Show streak if active
  if (stats.streakDays > 0) {
    parts.push(`🔥 ${stats.streakDays} day streak`);
  }

  return parts.join(' | ');
}

/**
 * Format detailed output
 * Shows comprehensive stats with labels
 */
function formatDetailedStats(stats: PushUpStats): string {
  const lines: string[] = ['Push-Up Challenge Status'];

  if (stats.todayDebt > 0 || stats.todayCompleted > 0) {
    lines.push(`Today: ${stats.todayCompleted} done, ${stats.todayDebt} remaining`);
  }

  if (stats.debt > 0) {
    lines.push(`Total Debt: ${stats.debt}`);
  }

  lines.push(`Total Completed: ${formatNumber(stats.completed)}`);

  if (stats.streakDays > 0) {
    lines.push(`Streak: ${stats.streakDays} days`);
  }

  if (stats.startDate) {
    const startDate = new Date(stats.startDate).toLocaleDateString();
    lines.push(`Started: ${startDate}`);
  }

  return lines.join(' | ');
}

/**
 * Format emoji output
 * Visual representation with minimal text
 */
function formatEmojiStats(stats: PushUpStats): string {
  const parts: string[] = ['💪'];

  // Calculate today's progress percentage
  const todayTotal = stats.todayCompleted + stats.todayDebt;
  const todayPercentage = todayTotal > 0 ? (stats.todayCompleted / todayTotal) * 100 : 0;
  const progressEmoji = getProgressEmoji(todayPercentage);

  parts.push(`${progressEmoji} ${stats.todayCompleted}/${todayTotal > 0 ? todayTotal : stats.todayCompleted}`);

  if (stats.debt > 0) {
    parts.push(`📊 ${stats.debt}`);
  }

  parts.push(`✅ ${formatNumber(stats.completed)}`);

  if (stats.streakDays > 0) {
    parts.push(`🔥 ${stats.streakDays}d`);
  }

  return parts.join(' ');
}

/**
 * Format minimal output
 * Shortest possible representation
 */
function formatMinimalStats(stats: PushUpStats): string {
  if (stats.todayDebt > 0) {
    return `💪 ${stats.todayDebt} to-do`;
  }

  if (stats.todayCompleted > 0) {
    return `💪 ${stats.todayCompleted} done today`;
  }

  if (stats.debt > 0) {
    return `💪 ${stats.debt} debt`;
  }

  if (stats.streakDays > 0) {
    return `🔥 ${stats.streakDays}d streak`;
  }

  return `💪 ${formatNumber(stats.completed)} total`;
}

/**
 * TypeScript interface for stats (matching config.ts)
 */
interface PushUpStats {
  debt: number;
  completed: number;
  streakDays: number;
  startDate?: string;
  todayDebt: number;
  todayCompleted: number;
  lastCompletedDate?: string;
}

/**
 * Create the statusline-challenge command for displaying push-up challenge stats in Claude Code
 * This command is designed to be fast (<100ms) and fail gracefully
 */
export function createChallengeStatuslineCommand(): Command {
  const command = new Command('statusline-challenge')
    .description('Display push-up challenge stats in Claude Code status line (hidden command)')
    .option('-f, --format <type>', 'Output format: compact, detailed, emoji, minimal, json', 'compact')
    .option('--stdin', 'Explicitly wait for stdin input from Claude Code', false)
    .action(async (options) => {
      const startTime = Date.now();

      try {
        debugLog('=== STATUSLINE-CHALLENGE START ===', 'statusline-challenge-debug.log');
        debugLog(`Options: stdin=${options.stdin}, format=${options.format}`, 'statusline-challenge-debug.log');

        // Try to read Claude Code context from stdin (for consistency with main statusline)
        // We don't actually use it for challenge stats, but it follows the same pattern
        const timeout = options.stdin ? 1000 : 500;
        debugLog(`Waiting for stdin with ${timeout}ms timeout`, 'statusline-challenge-debug.log');
        const stdinData = await readStdinWithTimeout(timeout);

        if (stdinData) {
          const sessionId = extractSessionId(stdinData);
          debugLog(`Received stdin data, session ID: ${sessionId || 'none'}`, 'statusline-challenge-debug.log');
        } else {
          debugLog('No stdin data received', 'statusline-challenge-debug.log');
        }

        // Validate and normalize format option
        const format = validateOutputFormat(options.format);

        // Format and output the challenge stats
        const output = formatChallengeStats(format);
        debugLog(`SUCCESS: Outputting stats (${output.length} bytes): ${output.substring(0, 150)}`, 'statusline-challenge-debug.log');
        logger.debug(`Challenge statusline output (${output.length} bytes): ${output.substring(0, 200)}`);
        process.stdout.write(output);

        // Log performance metrics
        const elapsed = Date.now() - startTime;
        debugLog(`COMPLETE: Rendered in ${elapsed}ms`, 'statusline-challenge-debug.log');
        logger.debug(`Challenge statusline rendered in ${elapsed}ms`);

        // Use exitCode instead of exit() to allow stdout buffer to flush on Windows
        process.exitCode = 0;

      } catch (error) {
        // Unexpected error - log but return empty to not break status line
        debugLog(`ERROR: ${error instanceof Error ? error.message : String(error)}`, 'statusline-challenge-debug.log');
        logger.error('Unexpected error in statusline-challenge command:', error);
        process.stdout.write('');
        process.exitCode = 0;
      }
    });

  // Mark as hidden since this is for internal use
  return command;
}
