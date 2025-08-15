import chalk from 'chalk';
import { formatDuration, showSuccess, showWarning, showInfo } from '../../ui';
import { parseProjectName } from '../project-display';
import { SessionData } from '../../readers/types';
import { logger } from '../../../utils/logger';

export class SendSummaryUI {
  private silent: boolean;

  constructor(silent: boolean = false) {
    this.silent = silent;
  }

  showNoSessions(options: { 
    all?: boolean; 
    selectedSessions?: any[];
    currentDir?: string 
  }) {
    if (this.silent) {
      logger.info('No sessions found');
      return;
    }

    if (options.selectedSessions) {
      showWarning('No sessions could be loaded from selected files.');
    } else if (!options.all && options.currentDir) {
      showWarning(`No sessions found in current directory (${parseProjectName(options.currentDir)}).`);
      showInfo('Tips:');
      showInfo('- Make sure you have used Claude Code in this directory');
      showInfo('- Use --all flag to send sessions from all projects');
      showInfo(`- Current directory: ${options.currentDir}`);
    } else {
      const defaultDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      showWarning('No new sessions found in any project.');
      showInfo('Make sure you have used Claude Code since ' + defaultDate.toLocaleDateString());
    }
  }

  showSessionsFound(count: number, source: string) {
    if (this.silent) {
      logger.info(`Found ${count} sessions from ${source}`);
    } else {
      console.log(chalk.green(`✓ Found ${count} sessions from ${source}`));
    }
  }

  showUploadSummary(sessions: SessionData[], totalRedactions: number) {
    if (this.silent) {
      const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
      logger.info(`Uploading ${sessions.length} sessions (${formatDuration(totalDuration)})`);
      return;
    }

    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
    console.log(chalk.cyan('\n📊 Sessions to be uploaded summary:'));
    console.log(chalk.white(`   Sessions: ${sessions.length}`));
    console.log(chalk.white(`   Total Duration: ${formatDuration(totalDuration)}`));
    console.log(chalk.white(`   Privacy Redactions: ${totalRedactions}`));
  }

  showDryRun() {
    if (this.silent) {
      logger.info('Dry run - no data sent');
    } else {
      console.log(chalk.gray('\n🔍 Dry run - no data sent'));
    }
  }

  showUploadResults(results: any) {
    if (this.silent) {
      logger.info('Sessions uploaded successfully');
      return;
    }

    showSuccess('Sessions uploaded!');
    
    if (results.streak && results.streak.current === 0) {
      showWarning('\nYour streak has been reset! Start building again today.');
    }
  }
}