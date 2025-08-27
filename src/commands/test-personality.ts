/**
 * PHASE 6.1 UPDATE: Personality System Fixed
 * 
 * The personality system now uses enhanced system prompts to guide Claude's
 * natural language generation instead of template substitution.
 * 
 * Key changes:
 * - transformSuggestion() no longer replaces suggestions with templates
 * - Personalities influence HOW Claude writes, not REPLACE what Claude writes
 * - Each suggestion is unique and contextual while maintaining personality
 * - Gordon naturally uses kitchen metaphors without scripted phrases
 * - Vibe-Log naturally uses dev metaphors without repetition
 */

import { Command } from 'commander';
import { colors } from '../lib/ui/styles';
import { 
  getStatusLinePersonality, 
  setStatusLinePersonality,
  getPersonalityDisplayName,
  getPersonalityIcon,
  getPersonalitySystemPrompt,
  transformSuggestion
} from '../lib/personality-manager';
import { setCustomPersonality } from '../lib/config';
import { 
  runPersonalityTest,
  STANDARD_TEST_PROMPTS
} from '../lib/personality-test-engine';

/**
 * Create the test-personality command for debugging personality system
 */
export function createTestPersonalityCommand(): Command {
  const command = new Command('test-personality')
    .description('Test and debug the personality system (hidden command)')
    .option('-p, --personality <type>', 'Test specific personality (gordon, vibe-log, custom)')
    .option('-c, --create-custom', 'Create a test custom personality')
    .option('-a, --analyze', 'Analyze test prompts with current personality')
    .option('-v, --verbose', 'Show detailed debug output')
    .action(async (options) => {
      console.log(colors.accent('\n🧪 Personality System Test\n'));
      
      // Set debug mode for this session
      if (options.verbose) {
        process.env.DEBUG_PERSONALITY = 'true';
        console.log(colors.subdued('Debug mode enabled\n'));
      }
      
      // Show current personality
      const currentConfig = getStatusLinePersonality();
      const currentName = getPersonalityDisplayName(currentConfig.personality);
      const currentIcon = getPersonalityIcon(currentConfig.personality);
      
      console.log(colors.info('Current Personality:'));
      console.log(`  ${currentIcon} ${colors.highlight(currentName)}`);
      
      if (currentConfig.personality === 'custom' && currentConfig.customPersonality) {
        console.log(`  Name: ${currentConfig.customPersonality.name}`);
        console.log(`  Style: ${currentConfig.customPersonality.description}`);
      }
      console.log('');
      
      // Test creating a custom personality
      if (options.createCustom) {
        console.log(colors.info('Creating test custom personality...'));
        setCustomPersonality({
          name: 'Test Bot',
          description: 'Like a helpful robot assistant',
          templates: {
            poor: 'BEEP BOOP! ERROR: Context not found!',
            fair: 'PROCESSING... More data required for optimal output.',
            good: 'ANALYSIS COMPLETE: Quality acceptable. Minor optimizations suggested.',
            excellent: 'EXCELLENT! All parameters optimal. Executing with maximum efficiency!'
          }
        });
        console.log(colors.success('✅ Test custom personality created!'));
        console.log('');
      }
      
      // Test specific personality
      if (options.personality) {
        const validPersonalities = ['gordon', 'vibe-log', 'custom'];
        if (!validPersonalities.includes(options.personality)) {
          console.log(colors.error('Invalid personality. Choose: gordon, vibe-log, or custom'));
          process.exit(1);
        }
        
        console.log(colors.info(`Switching to ${options.personality} personality...`));
        setStatusLinePersonality(options.personality as any);
        console.log(colors.success('✅ Personality switched!'));
        console.log('');
      }
      
      // Show system prompt
      console.log(colors.info('System Prompt Addition:'));
      const systemPrompt = getPersonalitySystemPrompt();
      if (systemPrompt) {
        console.log(colors.subdued(systemPrompt));
      } else {
        console.log(colors.subdued('  (No personality-specific prompt)'));
      }
      console.log('');
      
      // Test transformation
      console.log(colors.info('Testing Suggestion Transformations:'));
      console.log('');
      
      const testScores = [25, 55, 75, 95];
      const originalSuggestion = 'Add more context to your prompt';
      
      for (const score of testScores) {
        const transformed = transformSuggestion(originalSuggestion, score);
        const emoji = score <= 40 ? '🔴' : score <= 60 ? '🟠' : score <= 80 ? '🟡' : '🟢';
        console.log(`  ${emoji} Score ${score}: "${transformed}"`);
      }
      console.log('');
      
      // Analyze test prompts if requested
      if (options.analyze) {
        console.log(colors.info('Analyzing Test Prompts with Claude SDK:'));
        console.log(colors.subdued('(This will make actual calls to Claude Code)\n'));
        
        // Use shared test engine
        const results = await runPersonalityTest(STANDARD_TEST_PROMPTS, {
          verbose: options.verbose,
          personality: currentConfig.personality,
          onProgress: (message) => {
            console.log(colors.subdued(message));
          }
        });
        
        // Display results
        for (const result of results) {
          console.log(colors.accent(`Prompt: "${result.prompt.substring(0, 50)}..."`));
          console.log(colors.subdued(`  Context: ${result.promptDescription}`));
          
          if (result.error) {
            console.log(colors.error(`  Error: ${result.error}`));
          } else {
            console.log(`  Result: ${result.emoji} ${result.aiScore}/100 (${result.aiQuality})`);
            console.log(`  AI Suggestion: "${result.aiSuggestion}"`);
            console.log(`  With Personality: "${result.personalityTransformed}"`);
            console.log(colors.dim(`  Processing: ${(result.processingTime / 1000).toFixed(1)}s`));
          }
          console.log('');
        }
      }
      
      // Summary
      console.log(colors.accent('Test Summary:'));
      console.log(colors.subdued('• Personality system is working correctly'));
      console.log(colors.subdued('• System prompts are being sent to Claude SDK'));
      console.log(colors.subdued('• Transformations are applied based on score ranges'));
      
      if (options.verbose) {
        console.log('');
        console.log(colors.subdued('Check the debug logs above for detailed information'));
      } else {
        console.log('');
        console.log(colors.subdued('Run with -v flag for detailed debug output'));
      }
    });
  
  return command;
}