import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { PromptAnalysis } from '../lib/prompt-analyzer';
import { logger } from '../utils/logger';
import { transformSuggestion, getStatusLinePersonality, getPersonalityDisplayName } from '../lib/personality-manager';
import { isLoadingState, isStaleLoadingState, LoadingState, getLoadingMessage } from '../types/loading-state';
import { getCCUsageMetrics } from '../lib/ccusage-integration';

/**
 * Output format types for the statusline
 */
type OutputFormat = 'compact' | 'detailed' | 'emoji' | 'minimal' | 'json';

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
 * Format the analysis for compact output (default)
 * Example: 🟢 85/100 | ✨ Great context! Consider adding expected output format
 * With actionableSteps: Adds second line with "✅ TRY THIS:" prefix
 * With ccusage: Adds usage metrics on additional line
 */
function formatCompact(analysis: PromptAnalysis, ccusageOutput?: string | null): string {
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
function formatAnalysis(analysis: PromptAnalysis, format: OutputFormat, ccusageOutput?: string | null): string {
  switch (format) {
    case 'json':
      // For JSON, include ccusage as a separate field
      if (ccusageOutput) {
        return JSON.stringify({ ...analysis, ccusage: ccusageOutput });
      }
      return JSON.stringify(analysis);
    case 'detailed':
      return formatDetailed(analysis);
    case 'emoji':
      return formatEmoji(analysis);
    case 'minimal':
      return formatMinimal(analysis);
    case 'compact':
    default:
      return formatCompact(analysis, ccusageOutput);
  }
}

/**
 * Read stdin with a timeout to get Claude Code context
 */
async function readStdinWithTimeout(timeoutMs: number = 50): Promise<string | null> {
  return new Promise((resolve) => {
    let input = '';
    let hasData = false;
    
    // Set timeout to return null if no data
    const timeout = setTimeout(() => {
      if (!hasData) {
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
      resolve(hasData ? input : null);
    });
    
    // Handle error gracefully
    process.stdin.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
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
  const baseMessage = `💭 ${personalityName} is ready to analyze and improve your prompts`;
  
  // No promotional tip for empty state - keep it clean and focused
    
  switch (format) {
    case 'json':
      return JSON.stringify({ status: 'ready', message: baseMessage, personality: personality.personality });
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
    .action(async (options) => {
      const startTime = Date.now();
      
      try {
        // Try to read Claude Code context from stdin
        let currentSessionId: string | undefined;
        let claudeContext: any = null;
        const stdinData = await readStdinWithTimeout(50); // 50ms timeout for speed
        
        if (stdinData) {
          try {
            claudeContext = JSON.parse(stdinData);
            currentSessionId = claudeContext.session_id;
            logger.debug(`Statusline received session ID: ${currentSessionId}`);
          } catch (parseError) {
            logger.debug('Failed to parse Claude context from stdin:', parseError);
          }
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
          logger.debug('No session ID provided, showing default message');
          const output = formatDefault(format);
          process.stdout.write(output);
          process.exit(0);
        }
        
        // Build path to session-specific analysis file
        const homeDir = os.homedir();
        const analysisFile = path.join(homeDir, '.vibe-log', 'analyzed-prompts', `${currentSessionId}.json`);
        
        // Check if file exists
        if (!existsSync(analysisFile)) {
          // No analysis for this session yet - show default message
          logger.debug(`No analysis file found for session ${currentSessionId}, showing default message`);
          const output = formatDefault(format);
          process.stdout.write(output);
          process.exit(0);
        }
        
        // Read the analysis file synchronously for speed
        let content: string;
        try {
          content = readFileSync(analysisFile, 'utf8');
        } catch (readError) {
          // File exists but can't be read - return empty
          logger.debug('Failed to read analysis file:', readError);
          process.stdout.write('');
          process.exit(0);
        }
        
        // Parse the JSON content
        let parsedContent: any;
        try {
          parsedContent = JSON.parse(content);
        } catch (parseError) {
          // Corrupted JSON - show error
          logger.debug('Failed to parse JSON:', parseError);
          process.stdout.write('[Error] Invalid data');
          process.exit(0);
        }
        
        // Check if this is a loading state
        if (isLoadingState(parsedContent)) {
          logger.debug('Detected loading state');
          const output = formatLoadingState(parsedContent as LoadingState, format);
          process.stdout.write(output);
          process.exit(0);
        }
        
        // Otherwise, treat as completed analysis
        const analysis = parsedContent as PromptAnalysis;
        
        // Validate the analysis has required fields
        if (!analysis.quality || typeof analysis.score !== 'number' || !analysis.suggestion) {
          logger.debug('Invalid analysis structure:', analysis);
          process.stdout.write('[Error] Invalid analysis data');
          process.exit(0);
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
        
        // Format and output the analysis
        const output = formatAnalysis(analysis, format, ccusageOutput);
        process.stdout.write(output);
        
        // Log performance metrics
        const elapsed = Date.now() - startTime;
        logger.debug(`Statusline rendered in ${elapsed}ms`);
        
        // Ensure we exit cleanly
        process.exit(0);
        
      } catch (error) {
        // Unexpected error - log but return empty to not break status line
        logger.error('Unexpected error in statusline command:', error);
        process.stdout.write('');
        process.exit(0);
      }
    });

  // Mark as hidden since this is for internal use
  // Note: Command.hidden might not be directly settable in some versions
  // The command is registered as hidden via the parent program instead
  
  return command;
}