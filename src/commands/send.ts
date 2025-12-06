import chalk from 'chalk';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import packageJson from '../../package.json';
import { isNetworkError, createNetworkError } from '../lib/errors/network-errors';
import { BackgroundSendOrchestrator } from '../lib/orchestrators/background-send-orchestrator';
import { HookSendOrchestrator } from '../lib/orchestrators/hook-send-orchestrator';
import { SendOrchestrator, SendOptions } from '../lib/orchestrators/send-orchestrator';
import { showPrivacyPreview } from '../lib/ui/privacy-preview';
import { parseProjectName } from '../lib/ui/project-display';
import { countTotalRedactions } from '../lib/ui/sanitization-display';
import { SendConfirmationUI } from '../lib/ui/send/send-confirmation';
import { SendProgressUI } from '../lib/ui/send/send-progress';
import { SendSummaryUI } from '../lib/ui/send/send-summary';
import { showUploadResults } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';
import { clearNpxCache, checkNpxCacheHealth } from '../utils/npx-cache';
import { tryAcquireUpdateLock, UpdateLock } from '../utils/update-lock';
import { checkForUpdate, shouldSpawnLatestForHook, VersionCheckResult } from '../utils/version-check';

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
    // ============================================================
    // NON-BLOCKING UPDATE CHECK FOR HOOKS
    // ============================================================
    // When triggered by hooks, check for updates but don't block session processing.
    // Updates happen in background while current version continues processing.
    if (options.hookTrigger && !process.env.VIBE_LOG_SKIP_UPDATE) {
      const currentVersion = process.env.SIMULATE_OLD_VERSION || packageJson.version;
      logger.debug(`Checking version update: hookTrigger=${options.hookTrigger}, currentVersion=${currentVersion}`);

      const versionCheck = await checkForUpdate(currentVersion);
      logger.debug(`Version check result:`, versionCheck);

      if (shouldSpawnLatestForHook(versionCheck, options.hookTrigger)) {
        logger.debug(`Update available: current=${versionCheck.currentVersion}, latest=${versionCheck.latestVersion}`);

        // Try to acquire update lock (non-blocking)
        const lock = await tryAcquireUpdateLock();

        if (lock) {
          // We got the lock! Start background update (fire and forget)
          logger.debug('Acquired update lock, starting background update');

          // Spawn background update process (don't await - fire and forget)
          updateInBackground(versionCheck, lock).catch(error => {
            logger.debug(`Background update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          });

          // IMPORTANT: Continue processing with current version
          // Don't wait for update to complete
        } else {
          // Another process is updating, just continue
          logger.debug('Update in progress by another process, using current version');
        }
      }
    }

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
  // Explicitly set origin for manual uploads (no fallback)
  if (!options.origin) {
    options.origin = 'manual-upload';
  }

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

/**
 * Update NPX cache in background (non-blocking)
 * This runs independently from session processing
 */
async function updateInBackground(
  versionCheck: VersionCheckResult,
  lock: UpdateLock
): Promise<void> {
  try {
    await logUpdateEvent(`Starting background update: ${versionCheck.currentVersion} → ${versionCheck.latestVersion}`);

    // Check cache health before update
    const cacheHealthy = await checkNpxCacheHealth();
    if (!cacheHealthy) {
      await logUpdateEvent('NPX cache unhealthy, cleaning before update');
      await clearNpxCache();
    }

    // Clear NPX cache for our package
    await clearNpxCache();
    await logUpdateEvent('Cleared NPX cache');

    // Download latest version using npx @latest
    // This populates the cache for next run
    execSync('npx vibe-log-cli@latest --version', {
      stdio: 'ignore',
      timeout: 30000,
      env: {
        ...process.env,
        VIBE_LOG_SKIP_UPDATE: '1' // Prevent recursion
      }
    });

    await logUpdateEvent(`Update completed: next run will use ${versionCheck.latestVersion}`);
  } catch (error) {
    await logUpdateEvent(`Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    // Always release lock
    await lock.release();
  }
}

/**
 * Log update events to update log file
 */
async function logUpdateEvent(message: string): Promise<void> {
  const updateLogPath = path.join(os.homedir(), '.vibe-log', 'update.log');
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;

  try {
    await fs.mkdir(path.dirname(updateLogPath), { recursive: true });
    await fs.appendFile(updateLogPath, logLine);
  } catch {
    // Ignore logging errors - don't fail update
  }
}

// Re-export SendOptions type for backward compatibility
export type { SendOptions };