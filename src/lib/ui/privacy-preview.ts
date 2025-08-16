import chalk from 'chalk';
import inquirer from 'inquirer';
import { formatDuration } from '../ui';

/**
 * Privacy preview component extracted from send.ts
 * Shows what data will be redacted before sending
 */

interface RedactionCounts {
  codeBlocks: number;
  credentials: number;
  paths: number;
  urls: number;
  emails: number;
}

interface ApiSession {
  tool: string;
  timestamp: string;
  duration: number;
  data: {
    projectName: string;
    messageSummary: string; // JSON string of sanitized messages
    messageCount: number;
    metadata?: {
      files_edited: number;
      languages: string[];
    };
  };
}

export interface SelectedSessionInfo {
  projectPath: string;
  sessionFile: string;
  displayName: string;
  duration: number;
  timestamp: Date;
  messageCount: number;
}

/**
 * Show privacy preview with redaction details
 * @param apiSessions - Sanitized sessions to preview
 * @param selectedSessions - Original session info for context
 * @param debugCredentials - Optional debug info about detected credentials
 * @returns true if user wants to proceed, false if cancelled
 */
export async function showPrivacyPreview(
  apiSessions: ApiSession[], 
  selectedSessions?: SelectedSessionInfo[],
  debugCredentials?: Array<{ text: string; pattern: string }>
): Promise<boolean> {
  console.log('');
  console.log(chalk.cyan('🔒 Privacy Preview'));
  console.log(chalk.gray('─'.repeat(50)));
  
  // Show selected sessions summary if available
  if (selectedSessions && selectedSessions.length > 0) {
    // Group sessions by project
    const sessionsByProject = new Map<string, SelectedSessionInfo[]>();
    
    for (const session of selectedSessions) {
      const existing = sessionsByProject.get(session.displayName) || [];
      existing.push(session);
      sessionsByProject.set(session.displayName, existing);
    }
    
    // Get time range
    const timestamps = selectedSessions.map(s => s.timestamp);
    const earliest = new Date(Math.min(...timestamps.map(t => t.getTime())));
    const latest = new Date(Math.max(...timestamps.map(t => t.getTime())));
    
    console.log('');
    console.log(chalk.white(`You selected ${chalk.cyan(selectedSessions.length)} session${selectedSessions.length !== 1 ? 's' : ''} to analyze:`));
    
    // Show each project with its session count and duration
    sessionsByProject.forEach((sessions, projectName) => {
      const projectDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
      const sessionText = sessions.length === 1 ? 'session' : 'sessions';
      console.log(chalk.gray(`  • ${chalk.white(projectName)} (${sessions.length} ${sessionText}, ${formatDuration(projectDuration)})`));
    });
    
    // Show date range if sessions span multiple days
    const sameDay = earliest.toDateString() === latest.toDateString();
    if (sameDay) {
      const timeRange = `${earliest.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${latest.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      console.log(chalk.gray(`  📅 From today, ${timeRange}`));
    } else {
      console.log(chalk.gray(`  📅 ${earliest.toLocaleDateString()} to ${latest.toLocaleDateString()}`));
    }
    
    console.log('');
  }
  
  console.log(chalk.gray('─'.repeat(50)));
  
  // Count redactions by type
  const redactionCounts: RedactionCounts = {
    codeBlocks: 0,
    credentials: 0,
    paths: 0,
    urls: 0,
    emails: 0,
  };
  
  // Calculate total redactions across all sessions
  let sampleMessage = '';
  
  for (const session of apiSessions) {
    const messages = JSON.parse(session.data.messageSummary);
    
    messages.forEach((msg: any) => {
      if (msg.metadata?.redactedItems) {
        Object.entries(msg.metadata.redactedItems).forEach(([key, value]) => {
          if (key in redactionCounts) {
            redactionCounts[key as keyof RedactionCounts] += value as number;
          }
        });
      }
    });
    
    // Get sample message from first session
    if (!sampleMessage && messages.length > 0) {
      sampleMessage = messages[0].content;
    }
  }
  
  // Show what's being redacted
  console.log(chalk.yellow('\nWhat gets removed:'));
  if (redactionCounts.codeBlocks > 0) {
    console.log(`  📝 ${redactionCounts.codeBlocks} code blocks`);
  }
  if (redactionCounts.credentials > 0) {
    console.log(`  🔑 ${redactionCounts.credentials} credentials`);
    
    // Show debug info if available and in debug mode
    if (debugCredentials && debugCredentials.length > 0 && process.env.VIBELOG_DEBUG === 'true') {
      console.log('');
      console.log(chalk.yellow('  Debug: Detected credentials (first 20 chars):'));
      debugCredentials.slice(0, 5).forEach(({ text, pattern }) => {
        console.log(chalk.gray(`    - "${text}" [${pattern}]`));
      });
      if (debugCredentials.length > 5) {
        console.log(chalk.gray(`    ... and ${debugCredentials.length - 5} more`));
      }
    }
  }
  if (redactionCounts.paths > 0) {
    console.log(`  📁 ${redactionCounts.paths} file paths`);
  }
  if (redactionCounts.urls > 0) {
    console.log(`  🌐 ${redactionCounts.urls} URLs`);
  }
  if (redactionCounts.emails > 0) {
    console.log(`  📧 ${redactionCounts.emails} email addresses`);
  }
  
  // Show sample message if available
  if (sampleMessage) {
    console.log('');
    console.log(chalk.yellow('Sample sanitized message:'));
    console.log(chalk.gray('─'.repeat(50)));
    const preview = sampleMessage.length > 200 
      ? sampleMessage.substring(0, 200) + '...' 
      : sampleMessage;
    console.log(chalk.gray(preview));
    console.log(chalk.gray('─'.repeat(50)));
  }
  
  console.log('');
  console.log(chalk.blueBright('💡 For detailed preview: vibe-log privacy'));
  console.log('');
  
  // Ask for confirmation
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Upload these sessions?',
      default: true,
    },
  ]);
  
  if (!proceed) {
    console.log(chalk.yellow('\nUpload cancelled.'));
    console.log(chalk.blueBright('💡 Tip: Use "vibe-log privacy" to preview what gets sent'));
  }
  
  return proceed;
}

/**
 * Show the action menu with preview option
 * @returns 'upload', 'preview', or 'cancel'
 */
export async function showUploadActionMenu(): Promise<'upload' | 'preview' | 'cancel'> {
  console.log('');
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '✅ Upload sessions', value: 'upload' },
        { name: '🔍 Preview what will be sent', value: 'preview' },
        { name: '❌ Cancel', value: 'cancel' },
      ],
      default: 'upload',
    },
  ]);
  
  return action;
}

/**
 * Calculate total redaction count from API sessions
 */
export function calculateTotalRedactions(apiSessions: ApiSession[]): number {
  let totalRedactions = 0;
  
  apiSessions.forEach(session => {
    const messages = JSON.parse(session.data.messageSummary);
    messages.forEach((msg: any) => {
      if (msg.metadata?.redactedItems) {
        Object.values(msg.metadata.redactedItems).forEach((count: any) => {
          totalRedactions += count;
        });
      }
    });
  });
  
  return totalRedactions;
}