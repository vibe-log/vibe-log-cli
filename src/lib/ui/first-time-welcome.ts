import inquirer from 'inquirer';
import { colors } from './styles';

export type WelcomeChoice = 'local' | 'cloud' | 'help' | 'exit';

/**
 * Display the first-time welcome screen with setup options
 * Returns the user's choice without implementing any setup logic
 */
export async function showFirstTimeWelcome(): Promise<WelcomeChoice> {
    
  // Header with welcome message
  console.log();
  console.log(colors.primary('Welcome to vibe-log! Analytics for Claude Code.'));
  console.log();
  console.log(colors.muted('Choose your setup:'));
  console.log();
  
  // Menu choices formatted exactly as in cli-flows.md
  const choices = [
    {
      name: `${colors.accent('Cloud mode (Automatic)')} ${colors.success('- FREE')}
    ${colors.success('└─ ✓ Uses 0 tokens (our infrastructure)')}
    ${colors.success('└─ ✓ Auto-analyzes after each session')}
    ${colors.success('└─ ✓ Interactive dashboard')}
    ${colors.success('└─ ✓ Community insights')}
    ${colors.warning('└─ ℹ️  Shares anonymized metrics')}`,
      value: 'cloud' as const,
      short: 'Cloud mode'
    },
    {
      name: `${colors.primary('Local mode (Private)')}
    ${colors.muted('└─ 100% offline, using your claude code')}
    ${colors.muted('└─ Uses ~25k-100k tokens per analysis')}
    ${colors.muted('└─ 5-15 minute generation')}
    ${colors.muted('└─ Local HTML reports')}`,
      value: 'local' as const,
      short: 'Local mode'
    },
    {
      name: `${colors.primary('Help')}
    ${colors.muted('└─ Documentation and support')}`,
      value: 'help' as const,
      short: 'Help'
    },
    {
      name: `${colors.muted('Exit')}`,
      value: 'exit' as const,
      short: 'Exit'
    }
  ];
  
  // Show the prompt
  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: '',
      choices,
      pageSize: 20, // Show all options without scrolling
      loop: false
    }
  ]);
  
  return choice;
}

/**
 * Display a simple loading message while setting up
 */
export function showSetupMessage(mode: 'local' | 'cloud'): void {
  console.log();
  if (mode === 'local') {
    console.log(colors.info('Installing vibe-log local mode...'));
  } else {
    console.log(colors.info('Setting up vibe-log cloud mode...'));
  }
  console.log();
}