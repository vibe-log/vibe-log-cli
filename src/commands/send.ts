import { SendOrchestrator, SendOptions } from '../lib/orchestrators/send-orchestrator';
import { BackgroundSendOrchestrator } from '../lib/orchestrators/background-send-orchestrator';
import { HookSendOrchestrator } from '../lib/orchestrators/hook-send-orchestrator';
import { SendProgressUI } from '../lib/ui/send/send-progress';
import { SendSummaryUI } from '../lib/ui/send/send-summary';
import { SendConfirmationUI } from '../lib/ui/send/send-confirmation';
import { showPrivacyPreview } from '../lib/ui/privacy-preview';
import { parseProjectName } from '../lib/ui/project-display';
import { countTotalRedactions } from '../lib/ui/sanitization-display';
import { showUploadResults } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';
import { isNetworkError, createNetworkError } from '../lib/errors/network-errors';
import chalk from 'chalk';

/**
 * Send session data to Vibelog API
 * 
 * This command orchestrates the upload of Claude Code session data to the Vibelog platform.
 * It supports multiple modes of operation:
 * 
 * 1. **Interactive Mode** (default): Shows UI, prompts for confirmation
 * 2. **Silent Mode** (--silent): For automated execution from hooks
 * 3. **Background Mode** (--background): Spawns detached process
 * 4. **Test Mode** (--test): Validates hook configuration
 * 5. **Dry Run** (--dry): Preview without uploading
 * 
 * The command delegates to specialized orchestrators based on the mode:
 * - BackgroundSendOrchestrator: Manages background process spawning
 * - HookSendOrchestrator: Handles hook-specific logic (locks, timeouts)
 * - SendOrchestrator: Core upload logic and session management
 */
export async function send(options: SendOptions): Promise<void> {
  logger.debug('Send options received:', options);

  try {
    // Route to appropriate orchestrator based on mode
    if (options.background && options.hookTrigger) {
      const orchestrator = new BackgroundSendOrchestrator();
      await orchestrator.execute(options);
      return;
    }

    if (options.hookTrigger) {
      const orchestrator = new HookSendOrchestrator();
      await orchestrator.execute(options);
      return;
    }

    // Interactive mode with UI
    await executeInteractiveSend(options);

  } catch (error) {
    handleSendError(error, options);
  }
}

/**
 * Execute send in interactive mode with full UI
 */
async function executeInteractiveSend(options: SendOptions): Promise<void> {
  const orchestrator = new SendOrchestrator();
  const progressUI = new SendProgressUI(options.silent);
  const summaryUI = new SendSummaryUI(options.silent);
  const confirmationUI = new SendConfirmationUI(options.silent, options.skipActionMenu);

  // Start progress spinner
  const spinner = progressUI.createSpinner('Finding sessions...');
  spinner.start();

  try {
    // Use orchestrator to load and prepare sessions
    const sessions = await orchestrator.loadSessions(options);
    
    if (sessions.length === 0) {
      spinner.fail('No sessions found');
      summaryUI.showNoSessions({
        all: options.all,
        selectedSessions: options.selectedSessions,
        currentDir: process.cwd()
      });
      return;
    }

    // Show sessions found
    const source = determineSessionSource(options);
    spinner.succeed(`Found ${sessions.length} sessions from ${source}`);

    // Prepare sessions for upload
    progressUI.showPreparing();
    const apiSessions = await orchestrator.sanitizeSessions(sessions, options);
    
    // Show progress during sanitization
    if (!options.silent && sessions.length > 1) {
      for (let i = 0; i < sessions.length; i++) {
        progressUI.showProgress(i + 1, sessions.length, 'Processing');
      }
      progressUI.completeProgress();
    }

    // Check if sessions were filtered
    const filteredCount = sessions.length - apiSessions.length;
    if (filteredCount > 0) {
      console.log(chalk.yellow(`\n⚠️  Filtered out ${filteredCount} session(s) shorter than 4 minutes`));
    }
    
    // If no sessions left after filtering
    if (apiSessions.length === 0) {
      if (options.isInitialSync) {
        // During initial sync, this is not an error
        console.log(chalk.yellow('\nℹ️  No sessions longer than 4 minutes found to sync.'));
        console.log(chalk.dim('Future sessions longer than 4 minutes will be synced automatically.'));
        return;
      }
      // For regular sync, the orchestrator will throw an error
    }

    // Show upload summary
    const totalRedactions = countTotalRedactions(apiSessions);
    summaryUI.showUploadSummary(apiSessions, totalRedactions);

    // Handle dry run
    if (options.dry) {
      summaryUI.showDryRun();
      return;
    }

    // Confirm upload
    const action = await confirmationUI.confirmUpload();
    
    if (action === 'preview') {
      const sessionInfo = options.selectedSessions || sessions.map(s => ({
        projectPath: s.sourceFile?.claudeProjectPath || s.projectPath,
        sessionFile: s.sourceFile?.sessionFile || '',
        displayName: parseProjectName(s.projectPath),
        duration: s.duration,
        timestamp: s.timestamp,
        messageCount: s.messages.length
      }));
      
      const proceed = await showPrivacyPreview(apiSessions, sessionInfo, []);
      if (!proceed) {
        return;
      }
    } else if (action === 'cancel') {
      confirmationUI.showCancelled();
      return;
    }

    // Upload sessions with progress bar
    console.log(''); // Add a blank line before progress bar
    
    let results;
    try {
      // Show initial progress
      if (process.env.VIBELOG_DEBUG === 'true') {
        console.log('[DEBUG] Starting upload of', apiSessions.length, 'sessions');
      }
      progressUI.showUploadProgress(0, apiSessions.length);
      
      results = await orchestrator.uploadSessions(
        apiSessions, 
        options,
        (current, total, sizeKB) => {
          if (process.env.VIBELOG_DEBUG === 'true') {
            console.log('[DEBUG] Progress update:', current, '/', total, sizeKB ? `(${sizeKB.toFixed(2)} KB)` : '');
          }
          progressUI.showUploadProgress(current, total, sizeKB);
        }
      );
      
      // Clear progress bar and show success
      progressUI.completeUploadProgress();
      const uploadSpinner = progressUI.createSpinner('');
      uploadSpinner.succeed('Sessions uploaded!');
    } catch (uploadError) {
      // Clear progress bar on error
      if (process.env.VIBELOG_DEBUG === 'true') {
        console.log('[DEBUG] Upload error caught:', uploadError);
      }
      progressUI.completeUploadProgress();
      throw uploadError;
    }
    
    // Update sync state
    await orchestrator.updateSyncState(sessions, options);
    
    // Show results
    if (!options.silent) {
      showUploadResults(results);
      await confirmationUI.showNextSteps();
    }

  } catch (error) {
    // Clear any progress bar if it was showing
    progressUI.completeUploadProgress();
    spinner.fail('Failed to send sessions');
    throw error;
  }
}

/**
 * Determine the source description for sessions
 */
function determineSessionSource(options: SendOptions): string {
  if (options.selectedSessions) {
    return `${options.selectedSessions.length} selected sessions`;
  }
  
  if (options.claudeProjectDir) {
    return parseProjectName(options.claudeProjectDir);
  }
  
  if (options.all) {
    return 'all projects (--all flag)';
  }
  
  return `current directory (${parseProjectName(process.cwd())})`;
}

/**
 * Handle errors during send operation
 */
function handleSendError(error: unknown, options: SendOptions): void {
  if (options.silent) {
    logger.error('Failed to send sessions', error);
    // In silent mode, never throw - just exit gracefully
    return;
  }

  // Always throw errors so they can be caught and displayed properly
  // The menu will catch these and display them with displayError()

  if (error instanceof VibelogError) {
    throw error;
  }

  // Handle specific error types
  if (error instanceof Error) {
    // Network errors
    if (isNetworkError(error)) {
      throw createNetworkError(error);
    }
    
    // Disk space errors
    if (error.message.includes('ENOSPC')) {
      throw new VibelogError(
        'Insufficient disk space. Please free up some space and try again.',
        'DISK_FULL'
      );
    }
    
    // Permission errors
    if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
      throw new VibelogError(
        'Permission denied. Please check file permissions.',
        'PERMISSION_DENIED'
      );
    }
  }

  logger.error('Failed to send sessions', error);
  throw new VibelogError(
    'Failed to send sessions. Please try again.',
    'SEND_FAILED'
  );
}

/**
 * Send command wrapper for hook execution with timeout
 * This ensures hooks don't hang indefinitely
 */
export async function sendWithTimeout(options: SendOptions): Promise<void> {
  // Test mode - handle immediately without timeout
  if (options.test) {
    console.log('Hook test successful');
    process.exit(0);
  }

  // Background mode doesn't need timeout - it spawns and returns immediately
  if (options.background) {
    await send(options);
    return;
  }

  // Execute send command directly for all cases
  await send(options);
}

// Re-export SendOptions type for backward compatibility
export type { SendOptions };