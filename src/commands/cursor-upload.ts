import chalk from 'chalk';
import inquirer from 'inquirer';
import { getCursorMessagesSince } from '../lib/readers/cursor';
import { CursorSessionConverter, CursorMessage } from '../lib/converters/cursor-session-converter';
import { SendOrchestrator, SendOptions } from '../lib/orchestrators/send-orchestrator';
import { SendProgressUI } from '../lib/ui/send/send-progress';
import { SendSummaryUI } from '../lib/ui/send/send-summary';
import { SendConfirmationUI } from '../lib/ui/send/send-confirmation';
import { countTotalRedactions } from '../lib/ui/sanitization-display';
import { showUploadResults } from '../lib/ui';
import { logger } from '../utils/logger';

/**
 * Options for cursor upload command
 */
export interface CursorUploadOptions {
  dateRange?: 'all' | '7days' | '30days'; // Date range for reading sessions
  dry?: boolean; // Preview without uploading
  silent?: boolean; // Suppress UI output
}

/**
 * Upload Cursor sessions to Vibelog
 *
 * This command reads Cursor conversations from the Cursor database,
 * converts them to SessionData format, and uploads them using the
 * existing send infrastructure (100% code reuse).
 */
export async function cursorUpload(options: CursorUploadOptions = {}): Promise<void> {
  const orchestrator = new SendOrchestrator();
  const progressUI = new SendProgressUI(options.silent);
  const summaryUI = new SendSummaryUI(options.silent);
  const confirmationUI = new SendConfirmationUI(options.silent, false);

  try {
    // Step 1: Determine date range
    const sinceTimestamp = await determineDateRange(options);

    // Step 2: Read Cursor database
    const spinner = progressUI.createSpinner('Reading Cursor database...');
    spinner.start();

    const cursorResult = await getCursorMessagesSince(sinceTimestamp);

    if (cursorResult.totalCount === 0) {
      spinner.fail('No Cursor conversations found');
      console.log(chalk.yellow('\n⚠️  No Cursor conversations found in the selected date range.'));
      console.log(chalk.dim('Make sure you have used Cursor recently.'));
      return;
    }

    spinner.succeed(`Found ${cursorResult.totalCount} messages in Cursor database`);

    // Step 3: Group messages by composerId
    progressUI.showPreparing();
    const conversations = groupMessagesByComposer(cursorResult.allMessages);

    if (conversations.length === 0) {
      console.log(chalk.yellow('\n⚠️  No conversations to process'));
      return;
    }

    console.log(chalk.dim(`Grouped into ${conversations.length} conversation(s)`));

    // Step 4: Convert to SessionData format
    const convertSpinner = progressUI.createSpinner('Converting Cursor sessions...');
    convertSpinner.start();

    const conversionResult = CursorSessionConverter.convertConversations(conversations);

    if (conversionResult.skippedSessions.length > 0 && !options.silent) {
      console.log(chalk.yellow(`\n⚠️  Skipped ${conversionResult.skippedSessions.length} session(s) (too short or invalid)`));
    }

    if (conversionResult.sessions.length === 0) {
      convertSpinner.fail('No valid sessions to upload');
      console.log(chalk.yellow('\n⚠️  No valid Cursor sessions to upload after filtering.'));
      console.log(chalk.dim('Sessions must be at least 4 minutes long.'));
      return;
    }

    convertSpinner.succeed(`Converted ${conversionResult.sessions.length} session(s)`);

    // Step 5: Prepare sessions for upload (sanitize + format)
    // 🔄 REUSING: SendOrchestrator.sanitizeSessions()
    const prepareSpinner = progressUI.createSpinner('Preparing sessions...');
    prepareSpinner.start();

    const sendOptions: SendOptions = {
      dry: options.dry,
      silent: options.silent,
    };

    const apiSessions = await orchestrator.sanitizeSessions(
      conversionResult.sessions,
      sendOptions
    );

    prepareSpinner.succeed(`Prepared ${apiSessions.length} session(s) for upload`);

    // Step 6: Show upload summary
    // 🔄 REUSING: SendSummaryUI.showUploadSummary()
    const totalRedactions = countTotalRedactions(apiSessions);
    summaryUI.showUploadSummary(apiSessions, totalRedactions);

    // Handle dry run
    if (options.dry) {
      summaryUI.showDryRun();
      return;
    }

    // Step 7: Confirm upload
    // 🔄 REUSING: SendConfirmationUI.confirmUpload()
    const action = await confirmationUI.confirmUpload();

    if (action === 'cancel') {
      confirmationUI.showCancelled();
      return;
    }

    // Step 8: Upload sessions with progress
    // 🔄 REUSING: SendOrchestrator.uploadSessions()
    console.log(''); // Add blank line before progress

    let results;
    try {
      progressUI.showUploadProgress(0, apiSessions.length);

      results = await orchestrator.uploadSessions(
        apiSessions,
        sendOptions,
        (current, total, sizeKB) => {
          progressUI.showUploadProgress(current, total, sizeKB);
        }
      );

      progressUI.completeUploadProgress();
      const uploadSpinner = progressUI.createSpinner('');
      uploadSpinner.succeed('Cursor sessions uploaded!');

    } catch (uploadError) {
      progressUI.completeUploadProgress();
      throw uploadError;
    }

    // Step 9: Show results
    // 🔄 REUSING: showUploadResults()
    if (!options.silent) {
      showUploadResults(results);
      console.log(chalk.green('\n✅ Cursor sessions successfully uploaded!'));
      console.log(chalk.dim('View your dashboard: https://app.vibe-log.dev/dashboard'));
    }

  } catch (error) {
    handleError(error, options);
  }
}

/**
 * Determine the date range for reading Cursor sessions
 */
async function determineDateRange(options: CursorUploadOptions): Promise<number> {
  if (options.dateRange) {
    if (options.dateRange === 'all') {
      return 0; // Get all messages
    }

    const days = options.dateRange === '7days' ? 7 : 30;
    const timestamp = Date.now() - (days * 24 * 60 * 60 * 1000);
    console.log(chalk.dim(`Reading Cursor sessions from last ${days} day(s)...\n`));
    return timestamp;
  }

  // Interactive date range selection
  const { range } = await inquirer.prompt([
    {
      type: 'list',
      name: 'range',
      message: 'Select date range for Cursor sessions:',
      choices: [
        { name: 'Last 7 days (recommended)', value: '7days' },
        { name: 'Last 30 days', value: '30days' },
        { name: 'All time', value: 'all' },
      ],
      default: '7days',
    },
  ]);

  console.log(''); // Blank line after prompt
  return determineDateRange({ ...options, dateRange: range });
}

/**
 * Group Cursor messages by composerId to create conversations
 */
function groupMessagesByComposer(messages: CursorMessage[]): Array<{
  composerId: string;
  messages: CursorMessage[];
  workspacePath?: string;
  createdAt: number;
  lastUpdatedAt: number;
}> {
  // The messages returned from getCursorMessagesSince don't have composerId
  // We need to handle this by treating all messages as separate conversations
  // or group by timestamp proximity

  // For now, we'll create a single conversation from all messages
  // This is a simplified approach - in reality, Cursor DB structure is more complex

  if (messages.length === 0) {
    return [];
  }

  // Group messages by time gaps (>1 hour = new conversation)
  const conversations: any[] = [];
  let currentConversation: any = null;
  const MAX_GAP_MS = 60 * 60 * 1000; // 1 hour

  const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  for (const msg of sortedMessages) {
    if (!currentConversation || (msg.timestamp - currentConversation.lastUpdatedAt > MAX_GAP_MS)) {
      // Start new conversation
      currentConversation = {
        composerId: msg.bubbleId || `cursor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        messages: [msg],
        workspacePath: undefined, // Cursor reader doesn't provide this
        createdAt: msg.timestamp,
        lastUpdatedAt: msg.timestamp,
      };
      conversations.push(currentConversation);
    } else {
      // Add to current conversation
      currentConversation.messages.push(msg);
      currentConversation.lastUpdatedAt = msg.timestamp;
    }
  }

  return conversations;
}

/**
 * Handle errors
 */
function handleError(error: unknown, options: CursorUploadOptions): void {
  if (options.silent) {
    logger.error('Cursor upload failed', error);
    return;
  }

  if (error instanceof Error) {
    if (error.message.includes('ENOENT') && error.message.includes('state.vscdb')) {
      console.log(chalk.red('\n❌ Error: Could not find Cursor database'));
      console.log(chalk.dim('Make sure Cursor is installed and has been used at least once.'));
      console.log(chalk.dim('\nExpected locations:'));
      console.log(chalk.dim('  macOS: ~/Library/Application Support/Cursor/User/globalStorage/state.vscdb'));
      console.log(chalk.dim('  Windows: %APPDATA%\\Cursor\\User\\globalStorage\\state.vscdb'));
      console.log(chalk.dim('  Linux: ~/.config/Cursor/User/globalStorage/state.vscdb'));
    } else if (error.message.includes('SQLITE') || error.message.includes('database')) {
      console.log(chalk.red('\n❌ Error: Failed to read Cursor database'));
      console.log(chalk.dim('The database might be locked by Cursor or corrupted.'));
      console.log(chalk.dim('Try closing Cursor and running this command again.'));
    } else if (error.message.includes('Not authenticated') || error.message.includes('token')) {
      console.log(chalk.red('\n❌ Error: Not authenticated'));
      console.log(chalk.dim('Please run: npx vibe-log auth'));
    } else {
      console.log(chalk.red(`\n❌ Error: ${error.message}`));
    }
  } else {
    console.log(chalk.red('\n❌ Unknown error occurred'));
  }

  logger.error('Cursor upload error:', error);
  process.exit(1);
}
