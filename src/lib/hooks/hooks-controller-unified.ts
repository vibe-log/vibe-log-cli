/**
 * Hooks Controller - Unified version using ClaudeSettingsManager
 * 
 * This is a simplified version that delegates to the unified manager
 * while maintaining the same public interface for compatibility.
 */

import { claudeSettingsManager } from '../claude-settings-manager';
import { getCliPath } from '../config';
import { logger } from '../../utils/logger';
import { getGlobalSettingsPath } from '../claude-core';
import { 
  getHookMode as getHookModeFromReader,
  getTrackedProjects as getTrackedProjectsFromReader 
} from '../claude-settings-reader';

/**
 * Hook selection configuration
 */
export interface HookSelection {
  sessionStartHook: boolean;
  preCompactHook: boolean;
}

/**
 * Hook status information
 */
export interface HookStatusInfo {
  installed: boolean;
  enabled: boolean;
  version: string;
  command?: string;
  timeout?: number;
  lastModified?: Date;
}

/**
 * Complete hooks status
 */
export interface HooksStatus {
  sessionStartHook: HookStatusInfo;
  preCompactHook: HookStatusInfo;
  settingsPath: string;
  cliPath: string;
  trackedProjects?: string[];
}

/**
 * Project-specific hook configuration
 */
export interface ProjectHookConfig {
  path: string;
  name: string;
  actualPath?: string;
  hooks: {
    sessionStart: boolean;
    preCompact: boolean;
  };
}

// Current version of hooks
const HOOKS_VERSION = '2.0.0';

/**
 * Get comprehensive hooks status
 */
export async function getHooksStatus(): Promise<HooksStatus> {
  const status = await claudeSettingsManager.getFeatureStatus();
  const settingsPath = getGlobalSettingsPath();
  const cliPath = status.statusLine.cliPath || getCliPath();
  
  // Get tracked projects from claude-settings-reader
  const mode = await getHookModeFromReader();
  const trackedProjects = mode === 'selected' ? await getTrackedProjectsFromReader() : undefined;
  
  return {
    sessionStartHook: {
      installed: status.autoSync.sessionStartInstalled,
      enabled: status.autoSync.sessionStartInstalled, // Assuming installed means enabled
      version: HOOKS_VERSION,
      lastModified: new Date() // Would need to read file stats for real date
    },
    preCompactHook: {
      installed: status.autoSync.preCompactInstalled,
      enabled: status.autoSync.preCompactInstalled,
      version: HOOKS_VERSION,
      lastModified: new Date()
    },
    settingsPath,
    cliPath,
    trackedProjects
  };
}

/**
 * Install selected hooks
 */
export async function installSelectedHooks(selection: HookSelection): Promise<void> {
  logger.info(`Installing selected hooks: ${JSON.stringify(selection)}`);
  
  await claudeSettingsManager.installAutoSyncHooks({
    installSessionStart: selection.sessionStartHook,
    installPreCompact: selection.preCompactHook,
    mode: 'selected'
  });
}

/**
 * Install global hooks (track all projects)
 */
export async function installGlobalHooks(): Promise<void> {
  logger.info('Installing global hooks');
  
  await claudeSettingsManager.installAutoSyncHooks({
    installSessionStart: true,
    installPreCompact: true,
    mode: 'all'
  });
}

/**
 * Install hooks for specific projects
 */
export async function installProjectHooks(projects: Array<{ path: string; name: string; actualPath?: string }>): Promise<void> {
  logger.info(`Installing hooks for ${projects.length} projects`);
  
  // For now, install hooks globally with selected mode
  // Project-specific installation would require implementing writeProjectLocalSettings
  await claudeSettingsManager.installAutoSyncHooks({
    installSessionStart: true,
    installPreCompact: true,
    mode: 'selected'
  });
  
  logger.info('Hooks configured for selected projects mode');
}

/**
 * Install selective project hooks (different hooks per project)
 */
export async function installSelectiveProjectHooks(projectConfigs: ProjectHookConfig[]): Promise<void> {
  logger.info(`Installing selective hooks for ${projectConfigs.length} projects`);
  
  // Install hooks based on the most common configuration
  // Individual project configuration would require project-specific settings support
  const hasSessionStart = projectConfigs.some(c => c.hooks.sessionStart);
  const hasPreCompact = projectConfigs.some(c => c.hooks.preCompact);
  
  if (hasSessionStart || hasPreCompact) {
    await claudeSettingsManager.installAutoSyncHooks({
      installSessionStart: hasSessionStart,
      installPreCompact: hasPreCompact,
      mode: 'selected'
    });
    
    logger.info(`Configured hooks: SessionStart=${hasSessionStart}, PreCompact=${hasPreCompact}`);
  }
}

/**
 * Remove all vibe-log hooks
 */
export async function uninstallAllHooks(): Promise<{ removedCount: number }> {
  logger.info('Uninstalling all hooks');
  
  // Remove auto-sync hooks
  await claudeSettingsManager.removeAllVibeLogSettings();
  
  // We don't know the exact count, but return a reasonable estimate
  return { removedCount: 2 }; // SessionStart + PreCompact
}

/**
 * Toggle a specific hook on/off
 */
export async function toggleHook(hookType: 'sessionstart' | 'precompact', enable: boolean): Promise<void> {
  logger.info(`${enable ? 'Enabling' : 'Disabling'} ${hookType} hook`);
  
  const status = await claudeSettingsManager.getFeatureStatus();
  const currentMode = status.autoSync.mode || 'selected';
  
  // Determine which hooks should be installed
  let installSessionStart = status.autoSync.sessionStartInstalled;
  let installPreCompact = status.autoSync.preCompactInstalled;
  
  if (hookType === 'sessionstart') {
    installSessionStart = enable;
  } else {
    installPreCompact = enable;
  }
  
  // If both hooks would be disabled, remove all
  if (!installSessionStart && !installPreCompact) {
    await claudeSettingsManager.removeAllVibeLogSettings();
    logger.info('All hooks removed');
  } else {
    // Reinstall with updated configuration
    await claudeSettingsManager.installAutoSyncHooks({
      installSessionStart,
      installPreCompact,
      mode: currentMode
    });
    logger.info(`Hook configuration updated`);
  }
}

/**
 * Update hook configuration (timeout, debug mode, etc.)
 */
export async function updateHookConfig(
  hookType: 'sessionstart' | 'precompact',
  config: { timeout?: number; debug?: boolean }
): Promise<void> {
  logger.info(`Updating ${hookType} configuration: ${JSON.stringify(config)}`);
  
  // Get current status and reinstall with updated configuration
  const status = await claudeSettingsManager.getFeatureStatus();
  const currentMode = status.autoSync.mode || 'selected';
  
  // Note: Timeout configuration would require enhancement in the manager
  // For now, we reinstall with existing settings
  await claudeSettingsManager.installAutoSyncHooks({
    installSessionStart: status.autoSync.sessionStartInstalled,
    installPreCompact: status.autoSync.preCompactInstalled,
    mode: currentMode
  });
  
  if (config.timeout) {
    logger.info(`Note: Timeout configuration requires manual editing in settings.json`);
  }
}

/**
 * Check for hook updates
 */
export async function checkForHookUpdates(): Promise<{ 
  needsUpdate: boolean; 
  currentVersion: string; 
  latestVersion: string 
}> {
  // Simple version check - could be enhanced
  return {
    needsUpdate: false,
    currentVersion: HOOKS_VERSION,
    latestVersion: HOOKS_VERSION
  };
}

/**
 * Get hook mode (all or selected)
 */
export async function getHookMode() {
  return getHookModeFromReader();
}


