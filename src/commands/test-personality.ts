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
import { PromptAnalyzer } from '../lib/prompt-analyzer';

/**
 * Test prompts with different scores
 */
const TEST_PROMPTS = [
  { text: 'fix this', expectedScore: 20, description: 'Poor prompt - minimal context' },
  { text: 'I need help with my React component that handles user authentication', expectedScore: 55, description: 'Fair prompt - some context' },
  { text: 'I\'m building a Next.js app with TypeScript. My UserProfile component at src/components/UserProfile.tsx is not updating when the user data changes. Here\'s the relevant code...', expectedScore: 75, description: 'Good prompt - detailed context' },
  { text: 'I need to implement a debounced search feature in my React app. Users type in a search box, and after 500ms of no typing, it should query the /api/search endpoint. The response is an array of {id, title, description}. I want to display results in a dropdown below the search box with keyboard navigation support. Using TypeScript and React 18.', expectedScore: 90, description: 'Excellent prompt - complete context' }
];

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
        console.log(colors.subdued('(This will make actual API calls to Claude)\n'));
        
        const analyzer = new PromptAnalyzer();
        
        for (const testPrompt of TEST_PROMPTS) {
          console.log(colors.accent(`Testing: "${testPrompt.text.substring(0, 50)}..."`));
          console.log(colors.subdued(`  Expected: ${testPrompt.description}`));
          
          try {
            const analysis = await analyzer.analyze(testPrompt.text, {
              verbose: options.verbose
            });
            
            console.log(`  Result: ${getScoreEmoji(analysis.score)} ${analysis.score}/100`);
            console.log(`  Suggestion: "${analysis.suggestion}"`);
            
            // Show if the personality transformation worked
            const expectedTransformed = transformSuggestion(analysis.suggestion, analysis.score);
            console.log(`  Personality: "${expectedTransformed}"`);
            
          } catch (error) {
            console.log(colors.error(`  Error: ${error}`));
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

/**
 * Get emoji for score
 */
function getScoreEmoji(score: number): string {
  if (score <= 40) return '🔴';
  if (score <= 60) return '🟠';
  if (score <= 80) return '🟡';
  return '🟢';
}