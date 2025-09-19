import readline from 'readline';
import chalk from 'chalk';
import { colors } from './styles';

export interface MenuOption {
  title: string;
  value: string;
  details?: string[];
}

/**
 * Create a truly interactive menu that shows details on navigation
 */
export class InteractiveMenu {
  private options: MenuOption[];
  private selectedIndex: number = 0;
  private rl: readline.Interface;

  constructor(options: MenuOption[]) {
    this.options = options;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Enable raw mode for arrow key detection
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(process.stdin, this.rl);
  }

  private clearScreen(): void {
    console.clear();
  }

  private async render(): Promise<void> {
    this.clearScreen();

    // Show logo first
    const { showLogo } = await import('../ui');
    const pkg = require('../../../package.json');
    const version = process.env.SIMULATE_OLD_VERSION || pkg.version;
    await showLogo(version);

    // Header
    console.log();
    console.log(chalk.green.bold('Focus. Discover. Grow.\nShip Daily.'));
    console.log();
    console.log(colors.muted('Setup options:'));
    console.log();

    // Render menu options
    this.options.forEach((option, index) => {
      const isSelected = index === this.selectedIndex;
      const prefix = isSelected ? chalk.cyan('▶') : ' ';

      // Show option title
      if (isSelected) {
        console.log(`${prefix} ${chalk.bold(option.title)}`);

        // Show details for selected option
        if (option.details && option.details.length > 0) {
          option.details.forEach(detail => {
            console.log(colors.muted(`    └─ ${detail}`));
          });
        }
      } else {
        console.log(`${prefix} ${option.title}`);
      }
    });

    console.log();
    console.log(colors.muted('Use ↑↓ arrows to navigate, Enter to select, q to quit'));
  }

  async show(): Promise<string | null> {
    return new Promise(async (resolve) => {
      await this.render();

      const handleKeypress = async (_str: string | undefined, key: any) => {
        if (key) {
          if (key.name === 'up') {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            await this.render();
          } else if (key.name === 'down') {
            this.selectedIndex = Math.min(this.options.length - 1, this.selectedIndex + 1);
            await this.render();
          } else if (key.name === 'return') {
            // Clean up and return selected value
            process.stdin.removeListener('keypress', handleKeypress);
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(false);
            }
            this.rl.close();

            const selectedOption = this.options[this.selectedIndex];
            resolve(selectedOption.value);
          } else if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
            // Clean up and exit
            process.stdin.removeListener('keypress', handleKeypress);
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(false);
            }
            this.rl.close();
            resolve(null);
          }
        }
      };

      process.stdin.on('keypress', handleKeypress);
    });
  }

  cleanup(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    this.rl.close();
  }
}