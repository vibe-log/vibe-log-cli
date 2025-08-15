import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs/promises';
import { readClaudeSessions } from '../lib/readers/claude';
import { MessageSanitizer } from '../lib/message-sanitizer';
import { getLastSync, getProjectTrackingMode, getTrackedProjects } from '../lib/config';
import { formatDuration, showInfo, showWarning, showSuccess } from '../lib/ui';
import { logger } from '../utils/logger';

interface PrivacyOptions {
  export?: string; // Export path for sanitized data
  since?: string;  // Date filter
}

/**
 * Privacy command - allows users to preview what data will be sent
 */
export async function privacy(options: PrivacyOptions): Promise<void> {
  console.clear();
  console.log(chalk.cyan('\n🔒 Privacy & Data Preview\n'));
  console.log(chalk.gray('See exactly what vibe-log sends to the cloud'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log('');

  // Menu options
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to review?',
      choices: [
        { name: '📊 Preview next upload (see what will be sent)', value: 'preview' },
        { name: '🔍 View sample redaction (before/after examples)', value: 'sample' },
        { name: '📈 Show redaction statistics', value: 'stats' },
        { name: '💾 Export sanitized data to file', value: 'export' },
        { name: '📚 Learn about privacy protection', value: 'learn' },
        { name: '← Back to main menu', value: 'back' },
      ],
    },
  ]);

  switch (action) {
    case 'preview':
      await previewNextUpload();
      break;
    case 'sample':
      await showSampleRedaction();
      break;
    case 'stats':
      await showRedactionStats();
      break;
    case 'export':
      await exportSanitizedData(options.export);
      break;
    case 'learn':
      await showPrivacyInfo();
      break;
    case 'back':
      return;
  }

  // Ask if they want to see more
  console.log('');
  const { continueReview } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'continueReview',
      message: 'Continue reviewing privacy options?',
      default: true,
    },
  ]);

  if (continueReview) {
    await privacy(options);
  }
}

async function previewNextUpload(): Promise<void> {
  console.log(chalk.cyan('\n📊 Preview Next Upload\n'));

  // Get sessions that would be sent
  const sinceDate = getLastSync() || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sessions = await readClaudeSessions({ since: sinceDate });

  // Filter by tracked projects
  const trackingMode = getProjectTrackingMode();
  const trackedProjects = getTrackedProjects();
  
  let filteredSessions = sessions;
  if (trackingMode === 'selected' && trackedProjects.length > 0) {
    filteredSessions = sessions.filter(session => {
      return trackedProjects.some(tracked => {
        const sessionPath = path.normalize(session.projectPath).toLowerCase();
        const trackedPath = path.normalize(tracked).toLowerCase();
        return sessionPath === trackedPath || sessionPath.startsWith(trackedPath + path.sep);
      });
    });
  }

  if (filteredSessions.length === 0) {
    showWarning('No sessions found to upload');
    showInfo('Use Claude Code to create some sessions first');
    return;
  }

  const totalDuration = filteredSessions.reduce((sum, s) => sum + s.duration, 0);
  
  console.log(chalk.green(`✓ Found ${filteredSessions.length} sessions (${formatDuration(totalDuration)} total)`));
  console.log('');

  // Sanitize and analyze
  const sanitizer = new MessageSanitizer();
  const totalRedactions = {
    codeBlocks: 0,
    credentials: 0,
    envVars: 0,
    paths: 0,
    urls: 0,
    emails: 0,
  };

  filteredSessions.forEach(session => {
    const sanitized = sanitizer.sanitizeMessages(session.messages);
    sanitized.forEach(msg => {
      if (msg.metadata?.redactedItems) {
        Object.entries(msg.metadata.redactedItems).forEach(([key, value]) => {
          totalRedactions[key as keyof typeof totalRedactions] += value as number;
        });
      }
    });
  });

  // Show what will be redacted
  console.log(chalk.yellow('🔒 Privacy Protection Summary:'));
  console.log('');
  
  const redactionLines = [
    { label: 'Code blocks removed', count: totalRedactions.codeBlocks, icon: '📝' },
    { label: 'Credentials masked', count: totalRedactions.credentials, icon: '🔑' },
    { label: 'File paths hidden', count: totalRedactions.paths, icon: '📁' },
    { label: 'URLs redacted', count: totalRedactions.urls, icon: '🌐' },
    { label: 'Env variables removed', count: totalRedactions.envVars, icon: '🔧' },
    { label: 'Emails hidden', count: totalRedactions.emails, icon: '📧' },
  ];

  redactionLines.forEach(line => {
    if (line.count > 0) {
      console.log(`  ${line.icon} ${line.count} ${line.label}`);
    }
  });

  const totalRedacted = Object.values(totalRedactions).reduce((a, b) => a + b, 0);
  console.log('');
  console.log(chalk.green(`  Total: ${totalRedacted} sensitive items will be redacted`));
  console.log('');

  // Show sample sanitized message
  const sampleSession = filteredSessions[0];
  const sanitizedSample = sanitizer.sanitizeMessages(sampleSession.messages.slice(0, 1));
  
  if (sanitizedSample.length > 0) {
    console.log(chalk.yellow('📝 Sample Sanitized Message:'));
    console.log(chalk.gray('─'.repeat(50)));
    const sampleContent = sanitizedSample[0].content;
    const preview = sampleContent.length > 300 
      ? sampleContent.substring(0, 300) + '...' 
      : sampleContent;
    console.log(chalk.gray(preview));
    console.log(chalk.gray('─'.repeat(50)));
  }
}

async function showSampleRedaction(): Promise<void> {
  console.log(chalk.cyan('\n🔍 Sample Redaction Examples\n'));
  
  const examples = [
    {
      title: 'API Keys & Tokens',
      before: 'const apiKey = "sk-proj-abc123xyz789...";',
      after: 'const apiKey = "[CREDENTIAL_1]";',
    },
    {
      title: 'File Paths',
      before: 'Error in /Users/john/projects/app/src/index.js',
      after: 'Error in [PATH_1]',
    },
    {
      title: 'Code Blocks',
      before: '```javascript\nfunction getData() {\n  return fetch(url);\n}\n```',
      after: '[CODE_BLOCK_1: javascript]',
    },
    {
      title: 'URLs & Endpoints',
      before: 'Connect to https://api.myapp.com/v1/users',
      after: 'Connect to [API_URL]',
    },
    {
      title: 'Environment Variables',
      before: 'Set $DATABASE_URL and $API_KEY',
      after: 'Set [ENV_VAR_1] and [ENV_VAR_2]',
    },
    {
      title: 'Email Addresses',
      before: 'Contact admin@company.com for help',
      after: 'Contact [EMAIL_1] for help',
    },
  ];

  examples.forEach(example => {
    console.log(chalk.yellow(`${example.title}:`));
    console.log(chalk.red(`  Before: ${example.before}`));
    console.log(chalk.green(`  After:  ${example.after}`));
    console.log('');
  });

  console.log(chalk.dim('Your actual code and sensitive data never leave your machine.'));
}

async function showRedactionStats(): Promise<void> {
  console.log(chalk.cyan('\n📈 Redaction Statistics\n'));

  // Get all sessions from last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sessions = await readClaudeSessions({ since: thirtyDaysAgo });

  if (sessions.length === 0) {
    showWarning('No sessions found in the last 30 days');
    return;
  }

  // Analyze all sessions
  const sanitizer = new MessageSanitizer();
  const stats = {
    totalSessions: sessions.length,
    totalMessages: 0,
    totalRedactions: 0,
    byType: {
      codeBlocks: 0,
      credentials: 0,
      envVars: 0,
      paths: 0,
      urls: 0,
      emails: 0,
    },
  };

  sessions.forEach(session => {
    const sanitized = sanitizer.sanitizeMessages(session.messages);
    stats.totalMessages += sanitized.length;
    
    sanitized.forEach(msg => {
      if (msg.metadata?.redactedItems) {
        Object.entries(msg.metadata.redactedItems).forEach(([key, value]) => {
          const count = value as number;
          stats.byType[key as keyof typeof stats.byType] += count;
          stats.totalRedactions += count;
        });
      }
    });
  });

  console.log(chalk.green('Last 30 Days Summary:'));
  console.log('');
  console.log(`  📊 Sessions analyzed: ${stats.totalSessions}`);
  console.log(`  💬 Messages processed: ${stats.totalMessages}`);
  console.log(`  🔒 Items redacted: ${stats.totalRedactions}`);
  console.log('');
  
  console.log(chalk.yellow('Redaction Breakdown:'));
  Object.entries(stats.byType).forEach(([type, count]) => {
    if (count > 0) {
      const percentage = ((count / stats.totalRedactions) * 100).toFixed(1);
      const label = type.replace(/([A-Z])/g, ' $1').toLowerCase();
      console.log(`  • ${label}: ${count} (${percentage}%)`);
    }
  });
}

async function exportSanitizedData(exportPath?: string): Promise<void> {
  console.log(chalk.cyan('\n💾 Export Sanitized Data\n'));

  // Get sessions
  const sinceDate = getLastSync() || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sessions = await readClaudeSessions({ since: sinceDate });

  if (sessions.length === 0) {
    showWarning('No sessions found to export');
    return;
  }

  // Sanitize all sessions
  const sanitizer = new MessageSanitizer();
  const sanitizedData = sessions.map(session => ({
    projectPath: '[REDACTED]',
    timestamp: session.timestamp,
    duration: session.duration,
    messages: sanitizer.sanitizeMessages(session.messages),
  }));

  // Determine export path
  const defaultPath = `vibe-log-sanitized-${new Date().toISOString().split('T')[0]}.json`;
  const finalPath = exportPath || defaultPath;

  // Write to file
  try {
    await fs.writeFile(finalPath, JSON.stringify(sanitizedData, null, 2));
    showSuccess(`Sanitized data exported to: ${finalPath}`);
    console.log(chalk.dim('You can review this file to see exactly what would be sent.'));
  } catch (error) {
    logger.error('Failed to export data:', error);
    showWarning('Failed to export data. Check permissions and try again.');
  }
}

async function showPrivacyInfo(): Promise<void> {
  console.log(chalk.cyan('\n📚 Privacy Protection Information\n'));
  
  console.log(chalk.yellow('How vibe-log protects your privacy:'));
  console.log('');
  
  console.log(chalk.green('✓ Local Processing'));
  console.log('  All data sanitization happens on your machine.');
  console.log('  Your actual code never leaves your computer.');
  console.log('');
  
  console.log(chalk.green('✓ Automatic Redaction'));
  console.log('  Sensitive information is automatically removed:');
  console.log('  • Source code and snippets');
  console.log('  • API keys and credentials');
  console.log('  • File paths and URLs');
  console.log('  • Email addresses');
  console.log('  • Environment variables');
  console.log('');
  
  console.log(chalk.green('✓ What We Track'));
  console.log('  • Session duration and timestamps');
  console.log('  • Natural language conversations');
  console.log('  • Programming topics discussed');
  console.log('  • Error descriptions (without code)');
  console.log('');
  
  console.log(chalk.green('✓ What We Never See'));
  console.log('  • Your actual source code');
  console.log('  • File contents');
  console.log('  • Passwords or secrets');
  console.log('  • Personal file paths');
  console.log('  • Company-specific data');
  console.log('');
  
  console.log(chalk.dim('Learn more: https://vibe-log.dev/privacy'));
}