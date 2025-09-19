import inquirer from 'inquirer';
import { colors } from './styles';
import chalk from 'chalk';
import { InteractiveMenu, MenuOption } from './interactive-menu';

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
  // Try to use the custom interactive menu if TTY is available
  if (process.stdin.isTTY && process.stdout.isTTY) {
    // Build menu options
    const menuOptions: MenuOption[] = [
      {
        title: '📋 Prepare for standup (2 min) - NEW!',
        value: 'standup',
        details: optionDetails['standup']
      },
      {
        title: '📊 Generate Local Reports',
        value: 'local',
        details: optionDetails['local']
      },
      {
        title: '☁️ Set up Cloud Dashboard',
        value: 'cloud',
        details: optionDetails['cloud']
      },
      {
        title: '💬 Install CC Co-Pilot Statline',
        value: 'statusline',
        details: optionDetails['statusline']
      },
      {
        title: 'Exit',
        value: 'exit',
        details: []
      }
    ];

    try {
      const menu = new InteractiveMenu(menuOptions);
      const choice = await menu.show();

      if (choice === null || choice === 'exit') {
        return 'exit';
      }

      // Clear screen after selection
      console.clear();

      // Show logo and centered slogan
      const { showLogo } = await import('../ui');
      const pkg = require('../../../package.json');
      const version = process.env.SIMULATE_OLD_VERSION || pkg.version;
      await showLogo(version);

      const slogan1 = 'Focus. Discover. Grow.';
      const slogan2 = 'Ship Daily.';
      const terminalWidth = process.stdout.columns || 80;
      const padding1 = Math.floor((terminalWidth - slogan1.length) / 2);
      const padding2 = Math.floor((terminalWidth - slogan2.length) / 2);

      console.log();
      console.log(' '.repeat(padding1) + chalk.green.bold(slogan1));
      console.log(' '.repeat(padding2) + chalk.green.bold(slogan2));
      console.log();

      return choice as WelcomeChoice;
    } catch (error) {
      // If interactive menu fails, fall back to inquirer
      console.log(colors.warning('Interactive menu failed, using fallback...'));
    }
  }

  // Fallback to inquirer for non-TTY environments or if custom menu fails
  const slogan1 = 'Focus. Discover. Grow.';
  const slogan2 = 'Ship Daily.';
  const terminalWidth = process.stdout.columns || 80;
  const padding1 = Math.floor((terminalWidth - slogan1.length) / 2);
  const padding2 = Math.floor((terminalWidth - slogan2.length) / 2);

  console.log();
  console.log(' '.repeat(padding1) + chalk.green.bold(slogan1));
  console.log(' '.repeat(padding2) + chalk.green.bold(slogan2));
  console.log();
  console.log(colors.muted('Setup options:'));
  console.log();

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

  // Build formatted choices with first item's details shown
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

  // Clear after selection
  console.clear();
  console.log();
  console.log(' '.repeat(padding1) + chalk.green.bold(slogan1));
  console.log(' '.repeat(padding2) + chalk.green.bold(slogan2));
  console.log();

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