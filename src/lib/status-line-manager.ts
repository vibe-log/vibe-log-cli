/**
 * Status Line Manager - Simplified wrapper around Claude Settings Manager
 * 
 * This module now delegates all actual settings manipulation to the 
 * unified ClaudeSettingsManager to prevent conflicts and duplicates.
 */

import { claudeSettingsManager, StatusLineFeatureStatus } from './claude-settings-manager';
import { getCliPath, getStatusLineBackup } from './config';
import { logger } from '../utils/logger';

/**
 * Status Line installation status
 */
export type StatusLineStatus = 'not-installed' | 'partial' | 'installed';

/**
 * Get the current status of the status line feature
 */
export async function getStatusLineStatus(): Promise<StatusLineStatus> {
  try {
    const status = await claudeSettingsManager.getFeatureStatus();
    const statusLine = status.statusLine;
    
    if (!statusLine.hookInstalled && !statusLine.displayInstalled) {
      return 'not-installed';
    }
    
    if (statusLine.isComplete) {
      return 'installed';
    }
    
    return 'partial';
  } catch (error) {
    logger.error('Error getting status line status:', error);
    return 'not-installed';
  }
}

/**
 * Get detailed status line information
 */
export async function getStatusLineInfo(): Promise<StatusLineFeatureStatus> {
  const status = await claudeSettingsManager.getFeatureStatus();
  return status.statusLine;
}

/**
 * Install the status line feature
 * Installs both UserPromptSubmit hook and statusLine display together
 */
export async function installStatusLine(cliPath?: string): Promise<void> {
  try {
    const finalCliPath = cliPath || getCliPath();
    logger.debug(`Installing status line with CLI path: ${finalCliPath}`);
    
    await claudeSettingsManager.installStatusLineFeature({ cliPath: finalCliPath });
  } catch (error) {
    logger.error('Error installing status line:', error);
    throw new Error(`Failed to install status line: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Uninstall the status line feature
 * Removes both UserPromptSubmit hook and statusLine display
 * @param restoreBackup - Whether to restore the backed up status line
 */
export async function uninstallStatusLine(restoreBackup: boolean = false): Promise<void> {
  try {
    logger.debug(`Uninstalling status line${restoreBackup ? ' (with restore)' : ''}`);
    
    await claudeSettingsManager.removeStatusLineFeature(restoreBackup);
  } catch (error) {
    logger.error('Error uninstalling status line:', error);
    throw new Error(`Failed to uninstall status line: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update CLI path for all status line commands
 */
export async function updateStatusLineCliPath(newCliPath: string): Promise<void> {
  try {
    logger.debug(`Updating status line CLI path: ${newCliPath}`);
    
    await claudeSettingsManager.updateCliPath(newCliPath);
  } catch (error) {
    logger.error('Error updating status line CLI path:', error);
    throw new Error(`Failed to update CLI path: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build the analyze-prompt hook command
 * @deprecated Use installStatusLine instead
 */
export function buildAnalyzePromptCommand(): string {
  const cliPath = getCliPath();
  return `${cliPath} analyze-prompt --silent --stdin`;
}

/**
 * Build the statusline display command
 * @deprecated Use installStatusLine instead
 */
export function buildStatuslineCommand(): string {
  const cliPath = getCliPath();
  return `${cliPath} statusline`;
}

/**
 * Check if there's a backup of a previous status line
 */
export function hasStatusLineBackup(): boolean {
  const backup = getStatusLineBackup();
  return !!(backup && backup.originalCommand);
}

/**
 * Get details about the backed up status line
 */
export function getBackupDetails(): { command?: string; date?: string } | null {
  const backup = getStatusLineBackup();
  if (!backup || !backup.originalCommand) return null;
  
  return {
    command: backup.originalCommand,
    date: backup.backupDate
  };
}

/**
 * Check for existing non-vibe-log status line
 */
export async function detectExistingStatusLine(): Promise<{
  command?: string;
  type?: string;
  padding?: number;
} | null> {
  try {
    const { readGlobalSettings } = await import('./claude-settings-reader');
    const settings = await readGlobalSettings();
    return claudeSettingsManager.detectExistingStatusLine(settings);
  } catch (error) {
    logger.error('Error detecting existing status line:', error);
    return null;
  }
}