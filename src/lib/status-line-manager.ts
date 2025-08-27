/**
 * Status Line Manager - Simplified wrapper around Claude Settings Manager
 * 
 * This module now delegates all actual settings manipulation to the 
 * unified ClaudeSettingsManager to prevent conflicts and duplicates.
 */

import { claudeSettingsManager, StatusLineFeatureStatus } from './claude-settings-manager';
import { getCliPath } from './config';
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
 */
export async function uninstallStatusLine(): Promise<void> {
  try {
    logger.debug('Uninstalling status line');
    
    await claudeSettingsManager.removeStatusLineFeature();
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