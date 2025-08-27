import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { PromptAnalysis } from '../lib/prompt-analyzer';
import { logger } from '../utils/logger';
import { transformSuggestion, getPersonalityIcon, getStatusLinePersonality } from '../lib/personality-manager';

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
 * Get promotional tip (shows ~10% of the time)
 */
function getPromotionalTip(): string {
  // Only show tip 10% of the time
  if (Math.random() > 0.1) {
    return '';
  }
  
  // Return tip on a new line
  return '\n💡 run: `npx vibe-log-cli` → Generate Local Report to see your improvements over time';
}

/**
 * Format the analysis for compact output (default)
 * Example: 🟢 85/100 | ✨ Great context! Consider adding expected output format
 */
function formatCompact(analysis: PromptAnalysis): string {
  const score = analysis.score;
  let suggestion = analysis.suggestion;
  
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
  
  // Always add personality icon since we always have a personality
  const personalityIcon = `${getPersonalityIcon(personality.personality)} `;
  
  // Format the enhanced output with personality icon
  let output = `${personalityIcon}${scoreEmoji} ${score}/100 | ${contextEmoji} ${suggestion}`;
  
  // Occasionally add promotional tip
  output += getPromotionalTip();
  
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
 * Format the analysis based on the selected format
 */
function formatAnalysis(analysis: PromptAnalysis, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(analysis);
    case 'detailed':
      return formatDetailed(analysis);
    case 'emoji':
      return formatEmoji(analysis);
    case 'minimal':
      return formatMinimal(analysis);
    case 'compact':
    default:
      return formatCompact(analysis);
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
    .action(async (options) => {
      const startTime = Date.now();
      
      try {
        // Parse and validate format option
        const format = (options.format || 'compact').toLowerCase() as OutputFormat;
        const validFormats: OutputFormat[] = ['compact', 'detailed', 'emoji', 'minimal', 'json'];
        
        if (!validFormats.includes(format)) {
          // Invalid format, use default
          logger.debug(`Invalid format '${options.format}', using 'compact'`);
          options.format = 'compact';
        }
        
        // Build path to latest analysis file
        const homeDir = os.homedir();
        const analysisFile = path.join(homeDir, '.vibe-log', 'analyzed-prompts', 'latest.json');
        
        // Check if file exists
        if (!existsSync(analysisFile)) {
          // No analysis yet - return empty string (show nothing)
          logger.debug('No analysis file found, returning empty');
          process.stdout.write('');
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
        let analysis: PromptAnalysis;
        try {
          analysis = JSON.parse(content);
        } catch (parseError) {
          // Corrupted JSON - show error
          logger.debug('Failed to parse analysis JSON:', parseError);
          process.stdout.write('[Error] Invalid analysis data');
          process.exit(0);
        }
        
        // Validate the analysis has required fields
        if (!analysis.quality || typeof analysis.score !== 'number' || !analysis.suggestion) {
          logger.debug('Invalid analysis structure:', analysis);
          process.stdout.write('[Error] Invalid analysis data');
          process.exit(0);
        }
        
        // Format and output the analysis
        const output = formatAnalysis(analysis, format);
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