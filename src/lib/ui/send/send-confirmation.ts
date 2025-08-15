import chalk from 'chalk';
import inquirer from 'inquirer';
import { showUploadActionMenu } from '../privacy-preview';
import { getDashboardUrl } from '../../config';

export class SendConfirmationUI {
  private silent: boolean;
  private skipActionMenu: boolean;

  constructor(silent: boolean = false, skipActionMenu: boolean = false) {
    this.silent = silent;
    this.skipActionMenu = skipActionMenu;
  }

  async confirmUpload(): Promise<'upload' | 'preview' | 'cancel'> {
    if (this.silent || this.skipActionMenu) {
      return 'upload';
    }

    return showUploadActionMenu();
  }

  showCancelled() {
    console.log(chalk.yellow('\nUpload cancelled.'));
    console.log(chalk.blueBright('💡 Tip: Use "vibe-log privacy" to preview what gets sent'));
  }

  async showNextSteps() {
    if (this.silent) return;

    console.log('\n📋 What to do next:');
    console.log('');
    console.log(`  🌐 Visit vibe-log web dashboard   ${getDashboardUrl()}`);
    console.log('');
    
    // Prompt to continue after upload completes
    console.log('Press Enter to continue...');
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
  }
}