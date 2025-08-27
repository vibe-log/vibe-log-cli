import inquirer from 'inquirer';
import ora from 'ora';
import { colors, box } from './styles';
import { 
  getStatusLinePersonality,
  getPersonalityDisplayName,
  getPersonalityIcon,
  getPersonalitySystemPrompt
} from '../personality-manager';
import { showInfo } from '../ui';
import { 
  runPersonalityTest,
  STANDARD_TEST_PROMPTS
} from '../personality-test-engine';
import { PromptAnalyzer } from '../prompt-analyzer';

/**
 * Display personality details header
 */
function displayPersonalityHeader(): void {
  const config = getStatusLinePersonality();
  const name = getPersonalityDisplayName(config.personality);
  const icon = getPersonalityIcon(config.personality);
  
  console.log(colors.accent('\n🧪 Testing Personality System\n'));
  console.log(`Active Personality: ${icon} ${colors.highlight(name)}`);
  
  // Show custom personality details if applicable
  if (config.personality === 'custom' && config.customPersonality) {
    console.log(colors.subdued(`Custom Name: ${config.customPersonality.name}`));
    console.log(colors.subdued(`Style: ${config.customPersonality.description}`));
    
    if (config.customPersonality.templates) {
      console.log('');
      console.log(colors.info('Custom Templates Defined:'));
      console.log(colors.subdued('  ✓ Templates for all score ranges'));
    }
  }
  
  console.log('');
  console.log(box.horizontal.repeat(60));
  console.log('');
}

/**
 * Test with sample prompts using real Claude SDK
 */
async function testSamplePrompts(): Promise<void> {
  console.log(colors.info('Testing with Claude AI (Real Analysis):\n'));
  console.log(colors.subdued('This will make actual calls to your local Claude Code...\n'));
  
  const config = getStatusLinePersonality();
  const personalityIcon = getPersonalityIcon(config.personality);
  
  // Create spinner
  const spinner = ora({
    text: 'Initializing Claude SDK...',
    color: 'cyan'
  });
  
  try {
    // Run tests with real Claude
    spinner.start();
    const results = await runPersonalityTest(STANDARD_TEST_PROMPTS, {
      verbose: false,
      personality: config.personality,
      onProgress: (message) => {
        spinner.text = message;
      }
    });
    spinner.stop();
    
    // Display results
    for (const result of results) {
      console.log(`${result.emoji} ${colors.accent(result.aiQuality.charAt(0).toUpperCase() + result.aiQuality.slice(1))} (${result.aiScore}/100)`);
      console.log(colors.subdued(`  Prompt: "${result.prompt.substring(0, 50)}${result.prompt.length > 50 ? '...' : ''}"`));
      console.log(colors.subdued(`  Context: ${result.promptDescription}`));
      console.log('');
      
      if (result.error) {
        console.log(colors.error(`  Error: ${result.error}`));
      } else {
        console.log(colors.info('  Claude\'s Analysis:'));
        console.log(colors.subdued(`    Original: "${result.aiSuggestion}"`));
        console.log('');
        console.log(colors.info('  With Personality:'));
        console.log(`    ${personalityIcon} ${result.emoji} ${result.aiScore}/100 | ${result.personalityTransformed}`);
        console.log('');
        console.log(colors.dim(`  Processing time: ${(result.processingTime / 1000).toFixed(1)}s`));
      }
      
      console.log('');
      console.log(box.horizontal.repeat(60));
      console.log('');
    }
    
    // Summary
    const successCount = results.filter(r => !r.error).length;
    const totalTime = results.reduce((sum, r) => sum + r.processingTime, 0);
    
    console.log(colors.success(`✅ Completed ${successCount}/${results.length} tests`));
    console.log(colors.dim(`Total time: ${(totalTime / 1000).toFixed(1)}s`));
    
  } catch (error) {
    spinner.stop();
    console.log(colors.error('\n❌ Test failed:'), error);
  }
}

/**
 * Test with custom prompt using real Claude SDK
 */
async function testCustomPrompt(): Promise<void> {
  console.log(colors.info('Test with Your Own Prompt:\n'));
  
  const { customPrompt } = await inquirer.prompt([
    {
      type: 'input',
      name: 'customPrompt',
      message: 'Enter a test prompt:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Please enter a prompt to test';
        }
        return true;
      }
    }
  ]);
  
  console.log('');
  
  const config = getStatusLinePersonality();
  const personalityIcon = getPersonalityIcon(config.personality);
  
  // Create spinner
  const spinner = ora({
    text: 'Analyzing with Claude...',
    color: 'cyan'
  }).start();
  
  try {
    // Analyze with real Claude
    const analyzer = new PromptAnalyzer();
    const startTime = Date.now();
    
    const analysis = await analyzer.analyze(customPrompt, {
      verbose: false,
      timeout: 15000
    });
    
    const processingTime = Date.now() - startTime;
    spinner.stop();
    
    // Get personality transformation
    const transformed = analysis.suggestion; // This already has personality applied from the analyzer
    
    // Display results
    const emoji = analysis.score <= 40 ? '🔴' : analysis.score <= 60 ? '🟠' : analysis.score <= 80 ? '🟡' : '🟢';
    const quality = analysis.quality.charAt(0).toUpperCase() + analysis.quality.slice(1);
    
    console.log(`${emoji} ${colors.accent(quality)} (${analysis.score}/100)`);
    console.log('');
    console.log(colors.info('Claude\'s Analysis:'));
    console.log(colors.subdued(`  Original: "${analysis.suggestion}"`));
    console.log('');
    console.log(colors.info('Status Line Will Show:'));
    console.log(`${personalityIcon} ${emoji} ${analysis.score}/100 | ${transformed}`);
    console.log('');
    console.log(colors.dim(`Processing time: ${(processingTime / 1000).toFixed(1)}s`));
    console.log('');
    
  } catch (error) {
    spinner.stop();
    console.log(colors.error('\n❌ Analysis failed:'), error);
  }
}

/**
 * Show system prompt for verification
 */
function showSystemPrompt(): void {
  console.log(colors.info('System Prompt Being Sent to Claude:\n'));
  
  const systemPrompt = getPersonalitySystemPrompt();
  
  if (systemPrompt) {
    console.log(colors.subdued(systemPrompt));
  } else {
    console.log(colors.subdued('(No personality-specific system prompt - using default)'));
  }
  
  console.log('');
}

/**
 * Main interactive personality tester
 */
export async function interactivePersonalityTester(): Promise<void> {
  console.clear();
  displayPersonalityHeader();
  
  // Show system prompt for custom personalities
  const config = getStatusLinePersonality();
  if (config.personality === 'custom') {
    showSystemPrompt();
    console.log(box.horizontal.repeat(60));
    console.log('');
  }
  
  console.log(colors.warning('⚠️  Tests will make real calls to your local Claude Code SDK\n'));
  
  let shouldContinue = true;
  
  while (shouldContinue) {
    const { testChoice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'testChoice',
        message: 'What would you like to test?',
        choices: [
          {
            name: '🤖 Test with sample prompts (4 calls to Claude Code)',
            value: 'samples'
          },
          {
            name: '✍️  Test with your own prompt (1 call to Claude Code)',
            value: 'custom'
          },
          {
            name: '🔍 Show system prompt details',
            value: 'system'
          },
          new inquirer.Separator(),
          {
            name: '← Back to personality menu',
            value: 'back'
          }
        ]
      }
    ]);
    
    console.log('');
    
    switch (testChoice) {
      case 'samples':
        await testSamplePrompts();
        await promptToContinue();
        console.clear();
        displayPersonalityHeader();
        break;
        
      case 'custom':
        await testCustomPrompt();
        await promptToContinue();
        console.clear();
        displayPersonalityHeader();
        break;
        
      case 'system':
        showSystemPrompt();
        await promptToContinue();
        console.clear();
        displayPersonalityHeader();
        break;
        
      case 'back':
        shouldContinue = false;
        break;
    }
  }
  
  // Summary
  console.log(colors.success('\n✅ Personality Test Complete!\n'));
  
  const personality = getPersonalityDisplayName(config.personality);
  console.log(colors.subdued(`The ${personality} personality is active and working.`));
  
  if (config.personality === 'custom') {
    console.log(colors.subdued('Your custom personality templates are being applied.'));
    console.log(colors.subdued('The personality style is included in Claude\'s system prompt.'));
  }
  
  console.log('');
  showInfo('The status line will use this personality for all prompts');
}

/**
 * Wait for user to continue
 */
async function promptToContinue(): Promise<void> {
  console.log('');
  await inquirer.prompt({
    type: 'input',
    name: 'continue',
    message: 'Press Enter to continue...',
    default: ''
  });
}