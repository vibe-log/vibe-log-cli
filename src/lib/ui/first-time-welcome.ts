import inquirer from 'inquirer';
import { colors } from './styles';

export type WelcomeChoice = 'standup' | 'local' | 'cloud' | 'statusline' | 'help' | 'exit';

/**
 * Display the first-time welcome screen with setup options
 * Returns the user's choice without implementing any setup logic
 */
export async function showFirstTimeWelcome(): Promise<WelcomeChoice> {
    
  // Header with welcome message
  console.log();
  console.log(colors.primary('Welcome to vibe-log! Session Productivity Improvements for Claude Code.'));
  console.log();
  console.log(colors.muted('Setup:'));
  console.log();
  
  // Menu choices formatted with standup as first option
  const choices = [
    {
      name: `📋 ${colors.accent('Prepare for standup (2 min) - NEW!')}
    ${colors.success('└─ 🤖 AI-generated standup summary from your sessions')}
    ${colors.success('└─ ✨ Ready for your daily meeting in minutes')}
    ${colors.success('└─ 📝 Uses Claude Code locally')}`,
      value: 'standup' as const,
      short: 'Standup'
    },
    {
      name: `📊 ${colors.primary('Generate Local Reports')}
    ${colors.muted('└─ Using your Claude Code')}
    ${colors.muted('└─ 4-10 minute generation')}
    ${colors.muted('└─ Local HTML reports')}`,
      value: 'local' as const,
      short: 'Local reports'
    },
    {
      name: `☁️ ${colors.accent('Set up - Cloud Dashboard')}
    ${colors.success('└─ ✓ Uses 0 tokens (our infrastructure)')}
    ${colors.success('└─ 📧 Daily standup emails')}
    ${colors.success('└─ 📊 Weekly summary every Monday')}
    ${colors.success('└─ 🎯 Interactive dashboard and detailed coaching plans')}`,
      value: 'cloud' as const,
      short: 'Cloud mode'
    },
    {
      name: `💬 ${colors.primary('Install CC Co-Pilot Statline')}
    ${colors.muted('└─ 📊 Analyzes your prompts')}
    ${colors.muted('└─ 💡 Shows feedback in Claude Code')}
    ${colors.muted('└─ 🧠 Personalized Guidance')}
    ${colors.muted('└─ 🤝 Keeps You & Claude focused')}`,
      value: 'statusline' as const,
      short: 'Status line'
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