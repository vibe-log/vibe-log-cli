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
  
  for (const project of projects) {
    const projectPath = project.actualPath || project.path;
    
    await claudeSettingsManager.installAutoSyncHooks({
      installSessionStart: true,
      installPreCompact: true,
      mode: 'selected',
      projectPath
    });
  }
}

/**
 * Install selective project hooks (different hooks per project)
 */
export async function installSelectiveProjectHooks(projectConfigs: ProjectHookConfig[]): Promise<void> {
  logger.info(`Installing selective hooks for ${projectConfigs.length} projects`);
  
  for (const config of projectConfigs) {
    const projectPath = config.actualPath || config.path;
    
    await claudeSettingsManager.installAutoSyncHooks({
      installSessionStart: config.hooks.sessionStart,
      installPreCompact: config.hooks.preCompact,
      mode: 'selected',
      projectPath
    });
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
  
  if (!enable) {
    // For disabling, we need to remove the hook
    // The unified manager doesn't have individual hook removal yet
    // For now, we'll log a warning
    logger.warn('Individual hook disabling not yet implemented in unified manager');
    return;
  }
  
  // For enabling, install the hook
  await claudeSettingsManager.installAutoSyncHooks({
    installSessionStart: hookType === 'sessionstart',
    installPreCompact: hookType === 'precompact',
    mode: 'selected'
  });
}

/**
 * Update hook configuration (timeout, debug mode, etc.)
 */
export async function updateHookConfig(
  hookType: 'sessionstart' | 'precompact',
  config: { timeout?: number; debug?: boolean }
): Promise<void> {
  logger.info(`Updating ${hookType} configuration: ${JSON.stringify(config)}`);
  
  // The unified manager handles this through reinstallation with new settings
  // For now, we'll need to reinstall with the updated configuration
  logger.warn('Hook config updates not yet fully implemented in unified manager');
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

/**
 * Build hook command string
 * @deprecated Use claudeSettingsManager instead
 */
export function buildHookCommand(
  cliPath: string, 
  hookTrigger: 'sessionstart' | 'precompact',
  mode?: 'all' | 'selected'
): string {
  if (mode === 'all') {
    return `${cliPath} send --silent --background --hook-trigger=${hookTrigger} --hook-version=${HOOKS_VERSION} --all`;
  }
  return `${cliPath} send --silent --background --hook-trigger=${hookTrigger} --hook-version=${HOOKS_VERSION} --claude-project-dir="$CLAUDE_PROJECT_DIR"`;
}

/**
 * Check if a command is a vibe-log command
 */
export function isVibeLogCommand(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes('vibe-log') || 
         command.includes('vibelog-cli') || 
         command.includes('@vibe-log');
}