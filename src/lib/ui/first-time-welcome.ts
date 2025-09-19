import inquirer from 'inquirer';
import { colors } from './styles';
import chalk from 'chalk';

export type WelcomeChoice = 'standup' | 'local' | 'cloud' | 'statusline' | 'exit';

// USP details for each option
const optionDetails: Record<string, string[]> = {
  'standup': [
    '🤖 AI-generated standup summary from your sessions',
    '✨ Ready for your daily meeting in minutes',
    '📝 Uses Claude Code locally'
  ],
  'local': [
    '📖 Using your Claude Code',
    '⏱️ 4-10 minute generation',
    '📄 Local HTML reports'
  ],
  'cloud': [
    '✓ Uses 0 tokens (our infrastructure)',
    '📧 Daily standup emails',
    '📊 Weekly summary every Monday',
    '🎯 Interactive dashboard and detailed coaching plans'
  ],
  'statusline': [
    '📊 Analyzes your prompts',
    '💡 Shows feedback in Claude Code',
    '🧠 Personalized Guidance',
    '🤝 Keeps You & Claude focused'
  ]
};


/**
 * Display the first-time welcome screen with setup options
 * Returns the user's choice without implementing any setup logic
 */
export async function showFirstTimeWelcome(): Promise<WelcomeChoice> {

  // Header with new branding message
  console.log();
  console.log(chalk.green.bold('Focus. Discover. Grow.\nShip Daily.'));
  console.log();
  console.log(colors.muted('Setup options:'));
  console.log();

  // Since inquirer doesn't support true dynamic updates during navigation,
  // we'll show the first option with its details expanded by default
  const menuChoices = [
    {
      name: '📋 Prepare for standup (2 min) - NEW!',
      value: 'standup' as const,
    },
    {
      name: '📊 Generate Local Reports',
      value: 'local' as const,
    },
    {
      name: '☁️ Set up Cloud Dashboard',
      value: 'cloud' as const,
    },
    {
      name: '💬 Install CC Co-Pilot Statline',
      value: 'statusline' as const,
    },
    {
      name: 'Exit',
      value: 'exit' as const,
    }
  ];

  // Build initial choices with first item expanded
  const buildFormattedChoices = () => {
    return menuChoices.map((choice, index) => {
      // Show details for first item by default (it starts selected)
      if (index === 0 && choice.value !== 'exit') {
        const details = optionDetails[choice.value];
        if (details) {
          const detailLines = details.map(d => colors.muted(`    └─ ${d}`)).join('\n');
          return {
            name: `${choice.name}\n${detailLines}`,
            value: choice.value,
            short: choice.name
          };
        }
      }
      return choice;
    });
  };

  // Note for users about navigation
  console.log(colors.muted('Use ↑↓ arrows to navigate, Enter to select\n'));

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: '',
      choices: buildFormattedChoices(),
      pageSize: 20,
      loop: false
    }
  ]);

  // Clear and show confirmation
  console.clear();
  console.log();
  console.log(chalk.green.bold('Focus. Discover. Grow.\nShip Daily.'));
  console.log();

  if (choice !== 'exit') {
    const selectedChoice = menuChoices.find(c => c.value === choice);
    console.log(colors.success(`✓ Selected: ${selectedChoice?.name}`));

    // Show the details of what they selected
    const details = optionDetails[choice];
    if (details) {
      console.log();
      console.log(colors.muted('This option includes:'));
      details.forEach(detail => {
        console.log(colors.muted(`  • ${detail}`));
      });
    }
    console.log();
  }

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