import { Command } from 'commander';
import { readFileSync, existsSync, appendFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { PromptAnalysis } from '../lib/prompt-analyzer';
import { logger } from '../utils/logger';
import { transformSuggestion, getStatusLinePersonality, getPersonalityDisplayName } from '../lib/personality-manager';
import { isLoadingState, isStaleLoadingState, LoadingState, getLoadingMessage } from '../types/loading-state';
import { getCCUsageMetrics } from '../lib/ccusage-integration';
import { getPushUpChallengeConfig, getPushUpStats } from '../lib/config';

/**
 * Output format types for the statusline
 */
type OutputFormat = 'compact' | 'detailed' | 'emoji' | 'minimal' | 'json';

/**
 * Debug logging function - writes directly to file
 */
function debugLog(message: string): void {
  try {
    const homeDir = os.homedir();
    const debugFile = path.join(homeDir, '.vibe-log', 'statusline-debug.log');
    const timestamp = new Date().toISOString();
    appendFileSync(debugFile, `[${timestamp}] ${message}\n`);
  } catch (err) {
    // Silently fail if we can't write debug log
  }
}

/**
 * Get color-coded emoji based on score
 */
function getScoreEmoji(score: number): string {
  if (score <= 40) return '🔴';      // Poor (0-40)
  if (score <= 60) return '🟠';      // Fair (41-60)
  if (score <= 80) return '🟡';      // Good (61-80)
  return '🟢';                       // Excellent (81-100)
}

/**
 * Format push-up challenge stats for statusline
 * Returns null if challenge is not enabled
 */
function formatPushUpStats(): string | null {
  const config = getPushUpChallengeConfig();

  // Only show if enabled
  if (!config.enabled) {
    return null;
  }

  const stats = getPushUpStats();
  const parts: string[] = [];

  // Show Push-Up Challenge header and metrics
  if (stats.debt > 0 || stats.completed > 0) {
    parts.push(`💪 Push-Up Challenge`);
    parts.push(`Push-Up To-Do: ${stats.debt}`);
    parts.push(`Total Push-Ups Done: ${stats.completed}`);
  }

  // Show streak if active
  if (stats.streakDays > 0) {
    parts.push(`🔥 ${stats.streakDays} day streak`);
  }

  // Return formatted string or null if no stats to show
  return parts.length > 0 ? parts.join(' | ') : null;
}

/**
 * Format the analysis for compact output (default)
 * Example: 🟢 85/100 | ✨ Great context! Consider adding expected output format
 * With actionableSteps: Adds second line with "✅ TRY THIS:" prefix
 * With ccusage: Adds usage metrics on additional line
 * With push-ups: Adds push-up challenge stats on additional line
 */
function formatCompact(analysis: PromptAnalysis, ccusageOutput?: string | null, pushUpOutput?: string | null): string {
  const score = analysis.score;
  let suggestion = analysis.suggestion;
  const actionableSteps = analysis.actionableSteps;

  // Handle recursion detection case
  if (suggestion.includes('Recursion prevented')) {
    return '🔄 Skip | Analysis loop prevented';
  }

  // Apply personality transformation to the suggestion
  const personality = getStatusLinePersonality();
  // Always apply personality transformation since we don't have 'standard' mode
  suggestion = transformSuggestion(suggestion, score, personality.personality);

  // Get appropriate emojis
  const scoreEmoji = getScoreEmoji(score);
  const contextEmoji = analysis.contextualEmoji || '💡'; // Use emoji from analysis or default

  // Get the personality name for attribution
  const personalityName = getPersonalityDisplayName(personality.personality);

  // Format the enhanced output with personality name before suggestion
  let output = `${scoreEmoji} ${score}/100 | ${contextEmoji} ${personalityName}: ${suggestion}`;

  // Add actionable steps on second line if present
  if (actionableSteps && actionableSteps.trim()) {
    output += `\n✅ TRY THIS: ${actionableSteps}`;
  }

  // Add persisted promotional tip if it exists
  if (analysis.promotionalTip) {
    output += analysis.promotionalTip;
  }

  // Add ccusage metrics if available
  if (ccusageOutput) {
    output += '\n' + ccusageOutput;
  }

  // Add push-up stats if available
  if (pushUpOutput) {
    output += '\n' + pushUpOutput;
  }

  return output;
}

/**
 * Format the analysis for detailed output
 * Example: Quality: Good (75/100) | Missing: context | Improve: Add details
 */
function formatDetailed(analysis: PromptAnalysis): string {
  const quality = analysis.quality.charAt(0).toUpperCase() + analysis.quality.slice(1);
  const score = analysis.score;
  const missing = analysis.missing.length > 0 ? analysis.missing.join(', ') : 'none';
  const suggestion = analysis.suggestion;
  
  // Handle recursion detection case
  if (suggestion.includes('Recursion prevented')) {
    return 'Status: Skip | Reason: Analysis loop prevented';
  }
  
  return `Quality: ${quality} (${score}/100) | Missing: ${missing} | Improve: ${suggestion}`;
}

/**
 * Format the analysis for emoji output
 * Example: 📊 Good (75) | 💡 Add context
 */
function formatEmoji(analysis: PromptAnalysis): string {
  const qualityEmoji = {
    'excellent': '🌟',
    'good': '✅',
    'fair': '⚠️',
    'poor': '❌'
  }[analysis.quality] || '📊';
  
  const quality = analysis.quality.charAt(0).toUpperCase() + analysis.quality.slice(1);
  const score = analysis.score;
  const suggestion = analysis.suggestion;
  
  // Handle recursion detection case
  if (suggestion.includes('Recursion prevented')) {
    return '🔄 Skip | Analysis loop prevented';
  }
  
  return `${qualityEmoji} ${quality} (${score}) | 💡 ${suggestion}`;
}

/**
 * Format the analysis for minimal output
 * Example: Good • 75% • Add context
 */
function formatMinimal(analysis: PromptAnalysis): string {
  const quality = analysis.quality.charAt(0).toUpperCase() + analysis.quality.slice(1);
  const score = analysis.score;
  const suggestion = analysis.suggestion;
  
  // Handle recursion detection case
  if (suggestion.includes('Recursion prevented')) {
    return 'Skip • Loop prevented';
  }
  
  // Shorten the suggestion for minimal format
  const shortSuggestion = suggestion.length > 30 
    ? suggestion.substring(0, 27) + '...' 
    : suggestion;
  
  return `${quality} • ${score}% • ${shortSuggestion}`;
}

/**
 * Format loading state for display
 */
function formatLoadingState(state: LoadingState, format: OutputFormat): string {
  // Check if state is stale (older than 5 minutes - 300 seconds)
  // We use a much longer timeout since analysis is async and results should persist
  if (isStaleLoadingState(state, 300000)) {
    logger.debug('Loading state is stale (>5 minutes old), returning empty');
    return '';
  }

  // Use the loading message from the state or generate based on personality
  // If we need to regenerate, check for custom personality name
  let message = state.message;
  if (!message) {
    const personality = getStatusLinePersonality();
    const customName = personality.personality === 'custom' ? personality.customPersonality?.name : undefined;
    message = getLoadingMessage(state.personality, customName);
  }

  switch (format) {
    case 'json':
      return JSON.stringify(state);
    case 'detailed':
      return `Status: Loading | ${message}`;
    case 'emoji':
      return `⏳ ${message}`;
    case 'minimal':
      return 'Loading...';
    case 'compact':
    default:
      return message;
  }
}

/**
 * Format the analysis based on the selected format
 */
function formatAnalysis(analysis: PromptAnalysis, format: OutputFormat, ccusageOutput?: string | null, pushUpOutput?: string | null): string {
  switch (format) {
    case 'json':
      // For JSON, include ccusage and pushup as separate fields
      const jsonOutput: any = { ...analysis };
      if (ccusageOutput) {
        jsonOutput.ccusage = ccusageOutput;
      }
      if (pushUpOutput) {
        jsonOutput.pushups = pushUpOutput;
      }
      return JSON.stringify(jsonOutput);
    case 'detailed':
      return formatDetailed(analysis);
    case 'emoji':
      return formatEmoji(analysis);
    case 'minimal':
      return formatMinimal(analysis);
    case 'compact':
    default:
      return formatCompact(analysis, ccusageOutput, pushUpOutput);
  }
}

/**
 * Read stdin with a timeout to get Claude Code context
 * Increased timeout to 500ms to allow Claude Code time to send session context
 */
async function readStdinWithTimeout(timeoutMs: number = 500): Promise<string | null> {
  return new Promise((resolve) => {
    let input = '';
    let hasData = false;
    let resolved = false;

    // Set timeout to return null if no data arrives
    // Increased from 50ms to 500ms to account for Claude Code's stdin piping
    const timeout = setTimeout(() => {
      if (!hasData && !resolved) {
        resolved = true;
        resolve(null);
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
      if (!resolved) {
        resolved = true;
        resolve(hasData ? input : null);
      }
    });

    // Handle error gracefully
    process.stdin.on('error', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
  });
}

/**
 * Format default message for new sessions or when no analysis exists
 */
function formatDefault(format: OutputFormat): string {
  // Get current personality for personalized message
  const personality = getStatusLinePersonality();

  // Get personality icon and name
  const personalityName = getPersonalityDisplayName(personality.personality);

  // Create unified message for all personalities
  let baseMessage = `💭 ${personalityName} is ready to analyze and improve your prompts`;

  // Get push-up stats if enabled
  const pushUpOutput = formatPushUpStats();

  // Add push-up stats to base message if available
  if (pushUpOutput && format !== 'minimal' && format !== 'emoji') {
    baseMessage += '\n' + pushUpOutput;
  }

  switch (format) {
    case 'json':
      const jsonResult: any = { status: 'ready', message: baseMessage, personality: personality.personality };
      if (pushUpOutput) {
        jsonResult.pushups = pushUpOutput;
      }
      return JSON.stringify(jsonResult);
    case 'detailed':
      return `Status: Ready | ${baseMessage}`;
    case 'emoji':
      return `Ready`;
    case 'minimal':
      return 'Ready';
    case 'compact':
    default:
      return baseMessage;
  }
}

/**
 * Create the statusline command for displaying prompt analysis in Claude Code
 * This command is designed to be fast (<100ms) and fail gracefully
 */
export function createStatuslineCommand(): Command {
  const command = new Command('statusline')
    .description('Display prompt analysis in Claude Code status line (hidden command)')
    .option('-f, --format <type>', 'Output format: compact, detailed, emoji, minimal, json', 'compact')
    .option('--with-usage', 'Include ccusage metrics in output')
    .option('--stdin', 'Explicitly wait for stdin input from Claude Code', false)
    .action(async (options) => {
      const startTime = Date.now();

      try {
        debugLog('=== STATUSLINE START ===');
        debugLog(`Options: stdin=${options.stdin}, format=${options.format}`);

        // Try to read Claude Code context from stdin
        // Claude Code sends session context via stdin with session_id
        let currentSessionId: string | undefined;
        let claudeContext: any = null;

        // When --stdin is explicitly passed, use a longer timeout since Claude Code WILL send data
        const timeout = options.stdin ? 1000 : 500;
        debugLog(`Waiting for stdin with ${timeout}ms timeout`);
        const stdinData = await readStdinWithTimeout(timeout);

        // DEBUG: Log what we received from stdin
        if (stdinData) {
          debugLog(`Received stdin data (${stdinData.length} bytes): ${stdinData.substring(0, 300)}`);
          try {
            claudeContext = JSON.parse(stdinData);
            currentSessionId = claudeContext.session_id;
            debugLog(`Extracted session ID: ${currentSessionId}`);
          } catch (parseError) {
            debugLog(`Failed to parse stdin as JSON: ${parseError}`);
          }
        } else {
          debugLog('No stdin data received (timeout or no input)');
        }

        // Parse and validate format option
        const format = (options.format || 'compact').toLowerCase() as OutputFormat;
        const validFormats: OutputFormat[] = ['compact', 'detailed', 'emoji', 'minimal', 'json'];

        if (!validFormats.includes(format)) {
          // Invalid format, use default
          logger.debug(`Invalid format '${options.format}', using 'compact'`);
          options.format = 'compact';
        }

        // If no session ID from stdin, show default message
        if (!currentSessionId) {
          debugLog('DECISION: No session ID, showing default message');
          logger.debug('No session ID provided, showing default message');
          const output = formatDefault(format);
          debugLog(`DEFAULT OUTPUT: ${output.substring(0, 100)}`);
          process.stdout.write(output);
          process.exitCode = 0;
          return;
        }

        // Build path to session-specific analysis file
        const homeDir = os.homedir();
        const analysisFile = path.join(homeDir, '.vibe-log', 'analyzed-prompts', `${currentSessionId}.json`);
        debugLog(`DECISION POINT: Looking for analysis file at: ${analysisFile}`);
        logger.debug(`Statusline looking for analysis file: ${analysisFile}`);

        // Check if file exists
        if (!existsSync(analysisFile)) {
          // No analysis for this session yet - show default message
          debugLog(`DECISION: File NOT found, showing default for session ${currentSessionId}`);
          logger.debug(`Analysis file NOT found for session ${currentSessionId}, showing default message`);
          const output = formatDefault(format);
          process.stdout.write(output);
          process.exitCode = 0;
          return;
        }

        // Read the analysis file synchronously for speed
        let content: string;
        try {
          content = readFileSync(analysisFile, 'utf8');
        } catch (readError) {
          // File exists but can't be read - return empty
          logger.debug('Failed to read analysis file:', readError);
          process.stdout.write('');
          process.exitCode = 0;
          return;
        }

        // Parse the JSON content
        let parsedContent: any;
        try {
          parsedContent = JSON.parse(content);
        } catch (parseError) {
          // Corrupted JSON - show error
          logger.debug('Failed to parse JSON:', parseError);
          process.stdout.write('[Error] Invalid data');
          process.exitCode = 0;
          return;
        }

        // Check if this is a loading state
        if (isLoadingState(parsedContent)) {
          logger.debug('Detected loading state');
          const output = formatLoadingState(parsedContent as LoadingState, format);
          process.stdout.write(output);
          process.exitCode = 0;
          return;
        }

        // Otherwise, treat as completed analysis
        const analysis = parsedContent as PromptAnalysis;

        // Validate the analysis has required fields
        if (!analysis.quality || typeof analysis.score !== 'number' || !analysis.suggestion) {
          logger.debug('Invalid analysis structure:', analysis);
          process.stdout.write('[Error] Invalid analysis data');
          process.exitCode = 0;
          return;
        }

        // No need to check session ID - we're reading the session-specific file

        // Get ccusage metrics if requested
        let ccusageOutput: string | null = null;
        if (options.withUsage && claudeContext) {
          // Wait for ccusage to complete (typically takes ~1s)
          const usageTimeout = 2000;  // Give ccusage enough time to complete
          logger.debug(`Fetching ccusage metrics with ${usageTimeout}ms timeout`);

          try {
            ccusageOutput = await getCCUsageMetrics(claudeContext, usageTimeout);
            if (ccusageOutput) {
              logger.debug('Got ccusage metrics successfully');
            } else {
              logger.debug('No ccusage metrics returned');
            }
          } catch (err) {
            logger.debug('ccusage error:', err);
            ccusageOutput = null;
          }
        } else {
          // Debug why we're not calling ccusage
          const fs = require('fs');
          fs.appendFileSync('/tmp/vibe-ccusage-debug.log', `[${new Date().toISOString()}] Not calling ccusage - withUsage: ${options.withUsage}, hasContext: ${!!claudeContext}\n`);
        }

        // Get push-up stats (always check if enabled)
        const pushUpOutput = formatPushUpStats();

        // Format and output the analysis
        const output = formatAnalysis(analysis, format, ccusageOutput, pushUpOutput);
        debugLog(`SUCCESS: Outputting analysis (${output.length} bytes): ${output.substring(0, 150)}`);
        logger.debug(`Statusline about to output (${output.length} bytes): ${output.substring(0, 200)}`);
        process.stdout.write(output);

        // Log performance metrics
        const elapsed = Date.now() - startTime;
        debugLog(`COMPLETE: Rendered in ${elapsed}ms`);
        logger.debug(`Statusline rendered in ${elapsed}ms`);

        // Use exitCode instead of exit() to allow stdout buffer to flush on Windows
        process.exitCode = 0;

      } catch (error) {
        // Unexpected error - log but return empty to not break status line
        debugLog(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
        logger.error('Unexpected error in statusline command:', error);
        process.stdout.write('');
        process.exitCode = 0;
      }
    });

  // Mark as hidden since this is for internal use
  // Note: Command.hidden might not be directly settable in some versions
  // The command is registered as hidden via the parent program instead

  return command;
}