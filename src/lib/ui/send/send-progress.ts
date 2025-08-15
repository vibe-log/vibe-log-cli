import chalk from 'chalk';
import { createSpinner } from '../../ui';

export class SendProgressUI {
  private silent: boolean;

  constructor(silent: boolean = false) {
    this.silent = silent;
  }

  createSpinner(message: string) {
    if (this.silent) {
      return {
        start: () => ({ succeed: () => {}, fail: () => {} }),
        succeed: () => {},
        fail: () => {}
      };
    }
    return createSpinner(message);
  }

  showProgress(current: number, total: number, label: string = 'Processing') {
    if (this.silent) return;
    
    const progress = Math.round((current / total) * 100);
    const barLength = 30;
    const filled = Math.round((progress / 100) * barLength);
    const empty = barLength - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    process.stdout.write(
      `\r  ${label}: [${bar}] ${progress}% (${current}/${total})`
    );
  }

  completeProgress() {
    if (!this.silent) {
      console.log('\n');
    }
  }

  showPreparing() {
    if (!this.silent) {
      console.log(chalk.cyan('\n🔒 Preparing sessions for privacy-safe upload...\n'));
    }
  }

  showUploadProgress(current: number, total: number, sizeKB?: number) {
    if (this.silent) return;
    
    const progress = Math.round((current / total) * 100);
    const barLength = 30;
    const filled = Math.round((progress / 100) * barLength);
    const empty = barLength - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    const sizeInfo = sizeKB ? ` • ${sizeKB.toFixed(1)} KB` : '';
    
    process.stdout.write(
      `\r  Uploading: [${bar}] ${progress}% (${current}/${total} sessions${sizeInfo})`
    );
  }

  completeUploadProgress() {
    if (!this.silent) {
      // Clear the entire line (use 100 spaces to be safe) and return cursor to start
      process.stdout.write('\r' + ' '.repeat(100) + '\r');
    }
  }
}