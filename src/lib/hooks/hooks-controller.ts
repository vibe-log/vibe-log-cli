import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import { getCliPath } from '../config';
import { getGlobalSettingsPath, getProjectLocalSettingsPath } from '../claude-core';
import { sendTelemetryUpdate } from '../telemetry';
import { 
  readGlobalSettings, 
  writeGlobalSettings,
  getHookMode as getHookModeFromReader,
  getTrackedProjects as getTrackedProjectsFromReader,
  ClaudeSettings
} from '../claude-settings-reader';

/**
 * Hook selection configuration
 */
export interface HookSelection {
  sessionStartHook: boolean;
  preCompactHook: boolean;
  sessionEndHook: boolean;
}

/**
 * Individual hook configuration
 */
export interface HookConfig {
  type: 'command';
  command: string;
  timeout?: number;
}

/**
 * Hook configuration with matcher
 */
export interface HookConfigWithMatcher {
  matcher?: string;
  hooks: HookConfig[];
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
  sessionEndHook: HookStatusInfo;
  settingsPath: string;
  cliPath: string;
  trackedProjects?: string[];  // List of project paths being tracked
}

/**
 * Re-export HookMode from claude-settings-reader
 */
export type { HookMode } from '../claude-settings-reader';

// Current version of hooks
const HOOKS_VERSION = '1.0.0';

// Hook matcher configurations
const HOOK_MATCHERS = {
  SessionStart: 'startup|clear',  // Capture on startup and clear (not resume)
  PreCompact: 'auto',             // Only automatic compression (not manual)
  SessionEnd: 'clear|logout|prompt_input_exit|other'  // Capture on session end events
} as const;

/**
 * Check if a command is a vibe-log hook command
 * Matches both 'vibe-log' and '@vibe-log' patterns
 */
export function isVibeLogCommand(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes('vibe-log') || command.includes('@vibe-log');
}

/**
 * Read Claude settings (delegate to claude-settings-reader)
 */
async function readSettings(): Promise<ClaudeSettings | null> {
  return readGlobalSettings();
}

/**
 * Write Claude settings (delegate to claude-settings-reader)
 */
async function writeSettings(settings: ClaudeSettings): Promise<void> {
  await writeGlobalSettings(settings);
}

/**
 * Get hook status info for a specific hook
 */
function getHookStatusInfo(hookConfig: HookConfigWithMatcher[] | undefined): HookStatusInfo {
  if (!hookConfig || hookConfig.length === 0) {
    return {
      installed: false,
      enabled: false,
      version: '0.0.0'
    };
  }
  
  const hook = hookConfig[0]?.hooks?.[0];
  if (!hook) {
    return {
      installed: false,
      enabled: false,
      version: '0.0.0'
    };
  }
  
  // Check if it's a vibe-log hook
  if (!isVibeLogCommand(hook.command)) {
    return {
      installed: false,
      enabled: false,
      version: '0.0.0'
    };
  }
  
  // Extract version from command if present
  const versionMatch = hook.command.match(/--hook-version=([0-9.]+)/);
  const version = versionMatch ? versionMatch[1] : HOOKS_VERSION;
  
  return {
    installed: true,
    enabled: !hook.command.includes('--disabled'),
    version,
    command: hook.command,
    timeout: hook.timeout
  };
}

/**
 * Get comprehensive hooks status
 */
export async function getHooksStatus(): Promise<HooksStatus> {
  const settings = await readSettings();
  const settingsPath = getGlobalSettingsPath();
  const cliPath = getCliPath();

  const sessionStartHook = getHookStatusInfo(settings?.hooks?.SessionStart);
  const preCompactHook = getHookStatusInfo(settings?.hooks?.PreCompact);
  const sessionEndHook = getHookStatusInfo(settings?.hooks?.SessionEnd);

  // Get file stats for last modified
  try {
    const stats = await fs.stat(settingsPath);
    sessionStartHook.lastModified = stats.mtime;
    preCompactHook.lastModified = stats.mtime;
    sessionEndHook.lastModified = stats.mtime;
  } catch (error) {
    logger.debug('Could not get settings file stats:', error);
  }

  // Get tracked projects from claude-settings-reader
  const mode = await getHookModeFromReader();
  const trackedProjects = mode === 'selected' ? await getTrackedProjectsFromReader() : undefined;

  return {
    sessionStartHook,
    preCompactHook,
    sessionEndHook,
    settingsPath,
    cliPath,
    trackedProjects
  };
}

/**
 * Build hook command string with given trigger type
 */
export function buildHookCommand(
  cliPath: string,
  hookTrigger: 'sessionstart' | 'precompact' | 'sessionend',
  mode?: 'all' | 'selected'
): string {
  // For global mode (track all), use --all flag instead of --claude-project-dir
  if (mode === 'all') {
    return `${cliPath} send --silent --background --hook-trigger=${hookTrigger} --hook-version=${HOOKS_VERSION} --all`;
  }
  
  // For selected mode or backward compatibility, use --claude-project-dir
  return `${cliPath} send --silent --background --hook-trigger=${hookTrigger} --hook-version=${HOOKS_VERSION} --claude-project-dir="$CLAUDE_PROJECT_DIR"`;
}

/**
 * Hook definition for configuration
 */
interface HookDefinition {
  type: 'SessionStart' | 'PreCompact' | 'SessionEnd';
  enabled: boolean;
}

/**
 * Build hook configuration for a specific hook type
 * NOTE: This function is kept for future use but currently replaced by appendHookConfiguration
 * @deprecated Use appendHookConfiguration instead
 */
function buildHookConfiguration(
  hookType: 'SessionStart' | 'PreCompact' | 'SessionEnd',
  cliPath: string,
  mode?: 'all' | 'selected'
): HookConfigWithMatcher[] {
  const triggerType = hookType === 'SessionStart' ? 'sessionstart' :
                      hookType === 'PreCompact' ? 'precompact' : 'sessionend';
  return [{
    matcher: HOOK_MATCHERS[hookType],
    hooks: [{
      type: 'command',
      command: buildHookCommand(cliPath, triggerType, mode)
      // No timeout specified - uses Claude's default of 60 seconds
    }]
  }];
}

// Export to avoid unused warning (may be used in future)
export { buildHookConfiguration };

/**
 * Clean up legacy hook formats
 */
function cleanupLegacyHooks(settings: ClaudeSettings): void {
  if (settings.hooks) {
    // Remove old format hooks
    delete settings.hooks.Stop;
    delete settings.hooks.stop;
    delete settings.hooks.preCompact;
  }
}

/**
 * Ensure directory exists
 */
async function ensureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Append hook configuration without overwriting existing hooks
 */
function appendHookConfiguration(
  settings: ClaudeSettings,
  hookType: 'SessionStart' | 'PreCompact' | 'SessionEnd',
  cliPath: string,
  mode?: 'all' | 'selected'
): void {
  const triggerType = hookType === 'SessionStart' ? 'sessionstart' :
                      hookType === 'PreCompact' ? 'precompact' : 'sessionend';
  const command = buildHookCommand(cliPath, triggerType, mode);
  const matcher = HOOK_MATCHERS[hookType];

  // Ensure hooks object exists
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Ensure hook structure exists
  if (!settings.hooks[hookType]) {
    settings.hooks[hookType] = [];
  }

  // Check if vibe-log hook already exists (prevent duplicates)
  const existingHooks = settings.hooks[hookType];
  if (existingHooks) {
    for (const config of existingHooks) {
      for (const hook of config.hooks || []) {
        if (isVibeLogCommand(hook.command) && hook.command.includes(`--hook-trigger=${triggerType}`)) {
          logger.debug(`${hookType} vibe-log hook already exists, skipping`);
          return;
        }
      }
    }
  }

  // Check if there's already a config with hooks array
  if (existingHooks && existingHooks.length > 0 && existingHooks[0].hooks) {
    // Append to existing hooks array - PRESERVES EXISTING HOOKS
    existingHooks[0].hooks.push({
      type: 'command',
      command: command
    });
  } else if (existingHooks) {
    // Create new config with hooks array
    existingHooks.push({
      matcher: matcher,
      hooks: [{
        type: 'command',
        command: command
      }]
    });
  }
}

/**
 * Remove only vibe-log hooks from a specific hook type, preserving other hooks
 */
function removeVibeLogHook(
  settings: ClaudeSettings,
  hookType: 'SessionStart' | 'PreCompact' | 'SessionEnd'
): void {
  if (!settings.hooks || !settings.hooks[hookType]) {
    return;
  }

  const existingHooks = settings.hooks[hookType];
  if (!existingHooks) {
    return;
  }

  // Filter out vibe-log commands while preserving other hooks
  const filteredConfigs = existingHooks
    .map((config: HookConfigWithMatcher) => ({
      ...config,
      hooks: config.hooks.filter((hook: HookConfig) => !isVibeLogCommand(hook.command))
    }))
    .filter((config: HookConfigWithMatcher) => config.hooks.length > 0);

  if (filteredConfigs.length > 0) {
    settings.hooks[hookType] = filteredConfigs;
  } else {
    // No hooks left, delete the hook type
    delete settings.hooks[hookType];
  }
}

/**
 * Generic function to install hooks to any settings file
 */
async function installHooksToSettings(
  settingsPath: string,
  hooks: HookDefinition[],
  cliPath: string,
  mode?: 'all' | 'selected'
): Promise<void> {
  // Ensure directory exists for local settings
  const dir = path.dirname(settingsPath);
  if (dir !== path.dirname(getGlobalSettingsPath())) {
    await ensureDirectory(dir);
  }
  
  // Read or create settings
  const settings = await readSettingsFile(settingsPath) || {};
  
  // Ensure hooks object exists
  if (!settings.hooks) {
    settings.hooks = {};
  }
  
  // Install/remove each hook based on configuration
  for (const hook of hooks) {
    if (hook.enabled) {
      // Use append pattern to preserve existing hooks
      appendHookConfiguration(settings, hook.type, cliPath, mode);
      logger.debug(`${hook.type} hook configured`);
    } else {
      // Remove only vibe-log hooks, preserve others
      removeVibeLogHook(settings, hook.type);
      logger.debug(`${hook.type} hook removed`);
    }
  }
  
  // Clean up legacy hooks
  cleanupLegacyHooks(settings);
  
  // Remove empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  
  // Write settings
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

/**
 * Install selected hooks with configuration
 */
export async function installSelectedHooks(selection: HookSelection): Promise<void> {
  const hooks: HookDefinition[] = [
    { type: 'SessionStart', enabled: selection.sessionStartHook },
    { type: 'PreCompact', enabled: selection.preCompactHook },
    { type: 'SessionEnd', enabled: selection.sessionEndHook }
  ];
  
  await installHooksToSettings(
    getGlobalSettingsPath(),
    hooks,
    getCliPath(),
    'all'  // Global hooks use 'all' mode
  );

  logger.info('Hooks installed successfully');

  // After successful installation, update telemetry (cloud users only)
  await sendTelemetryUpdate();
}

/**
 * Enable or disable a specific hook
 */
export async function toggleHook(hookType: 'sessionstart' | 'precompact' | 'sessionend', enable: boolean): Promise<void> {
  const settings = await readSettings();
  if (!settings || !settings.hooks) {
    throw new Error('No hooks installed');
  }

  const hookKey = hookType === 'sessionstart' ? 'SessionStart' :
                  hookType === 'precompact' ? 'PreCompact' : 'SessionEnd';
  const hookConfig = settings.hooks[hookKey];
  
  if (!hookConfig || !hookConfig[0]?.hooks?.[0]) {
    throw new Error(`${hookKey} hook not installed`);
  }
  
  const hook = hookConfig[0].hooks[0];
  
  if (enable) {
    // Remove --disabled flag if present
    hook.command = hook.command.replace(' --disabled', '');
  } else {
    // Add --disabled flag if not present
    if (!hook.command.includes('--disabled')) {
      hook.command += ' --disabled';
    }
  }
  
  await writeSettings(settings);
  logger.info(`${hookKey} hook ${enable ? 'enabled' : 'disabled'}`);
}

/**
 * Uninstall all vibe-log hooks from both global and project-local settings
 */
export async function uninstallAllHooks(): Promise<{ removedCount: number }> {
  let removedCount = 0;
  
  // Remove from global settings
  const globalSettings = await readSettings();
  if (globalSettings && globalSettings.hooks) {
    let globalRemoved = 0;
    
    // Remove SessionStart hook
    if (globalSettings.hooks.SessionStart) {
      delete globalSettings.hooks.SessionStart;
      globalRemoved++;
    }

    // Remove PreCompact hook
    if (globalSettings.hooks.PreCompact) {
      delete globalSettings.hooks.PreCompact;
      globalRemoved++;
    }

    // Remove SessionEnd hook
    if (globalSettings.hooks.SessionEnd) {
      delete globalSettings.hooks.SessionEnd;
      globalRemoved++;
    }
    
    // Clean up old Stop hook if it exists
    if (globalSettings.hooks.Stop) {
      delete globalSettings.hooks.Stop;
      globalRemoved++;
    }
    
    // Clean up old format hooks
    if (globalSettings.hooks.stop) {
      delete globalSettings.hooks.stop;
      globalRemoved++;
    }
    
    if (globalSettings.hooks.preCompact) {
      delete globalSettings.hooks.preCompact;
      globalRemoved++;
    }
    
    if (globalRemoved > 0) {
      // Remove empty hooks object
      if (Object.keys(globalSettings.hooks).length === 0) {
        delete globalSettings.hooks;
      }
      
      await writeSettings(globalSettings);
      removedCount += globalRemoved;
      logger.info(`Removed ${globalRemoved} hook(s) from global settings`);
    }
  }
  
  // Remove from project-local settings
  const { discoverProjects } = await import('../claude-core');
  const projects = await discoverProjects();
  
  for (const project of projects) {
    try {
      const localSettingsPath = getProjectLocalSettingsPath(project.actualPath);
      const localSettings = await readSettingsFile(localSettingsPath);
      
      if (localSettings && localSettings.hooks) {
        let projectRemoved = 0;
        
        // Check and remove vibe-log hooks
        if (localSettings.hooks.SessionStart && isVibeLogHook(localSettings.hooks.SessionStart)) {
          delete localSettings.hooks.SessionStart;
          projectRemoved++;
        }

        if (localSettings.hooks.PreCompact && isVibeLogHook(localSettings.hooks.PreCompact)) {
          delete localSettings.hooks.PreCompact;
          projectRemoved++;
        }

        if (localSettings.hooks.SessionEnd && isVibeLogHook(localSettings.hooks.SessionEnd)) {
          delete localSettings.hooks.SessionEnd;
          projectRemoved++;
        }
        
        if (projectRemoved > 0) {
          // Remove empty hooks object
          if (Object.keys(localSettings.hooks).length === 0) {
            delete localSettings.hooks;
          }
          
          await fs.writeFile(localSettingsPath, JSON.stringify(localSettings, null, 2));
          removedCount += projectRemoved;
          logger.info(`Removed ${projectRemoved} hook(s) from project ${project.name}`);
        }
      }
    } catch (error) {
      // Ignore errors for projects without local settings
      logger.debug(`Could not process project ${project.name}:`, error);
    }
  }
  
  if (removedCount === 0) {
    throw new Error('No vibe-log hooks found to uninstall');
  }
  
  logger.info(`Total removed: ${removedCount} hook(s)`);

  // After successful uninstall, update telemetry (cloud users only)
  await sendTelemetryUpdate();

  return { removedCount };
}

/**
 * Helper to check if a hook configuration contains vibe-log commands
 */
function isVibeLogHook(hookConfigs: HookConfigWithMatcher[]): boolean {
  return hookConfigs.some(config => 
    config.hooks.some(hook => isVibeLogCommand(hook.command))
  );
}

/**
 * Helper to read settings file
 */
async function readSettingsFile(path: string): Promise<ClaudeSettings | null> {
  try {
    const data = await fs.readFile(path, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Update hook configuration (timeout, debug mode, etc.)
 */
export async function updateHookConfig(
  hookType: 'sessionstart' | 'precompact' | 'sessionend',
  config: { timeout?: number }
): Promise<void> {
  const settings = await readSettings();
  if (!settings || !settings.hooks) {
    throw new Error('No hooks installed');
  }

  const hookKey = hookType === 'sessionstart' ? 'SessionStart' :
                  hookType === 'precompact' ? 'PreCompact' : 'SessionEnd';
  const hookConfig = settings.hooks[hookKey];
  
  if (!hookConfig || !hookConfig[0]?.hooks?.[0]) {
    throw new Error(`${hookKey} hook not installed`);
  }
  
  const hook = hookConfig[0].hooks[0];
  
  // Update timeout
  if (config.timeout !== undefined) {
    hook.timeout = config.timeout;
  }
  
  await writeSettings(settings);
  logger.info(`${hookKey} hook configuration updated`);
}

/**
 * Check if hooks need updating
 */
export async function checkForHookUpdates(): Promise<{ needsUpdate: boolean; currentVersion: string; latestVersion: string }> {
  const status = await getHooksStatus();

  const sessionStartVersion = status.sessionStartHook.installed ? status.sessionStartHook.version : '0.0.0';
  const preCompactVersion = status.preCompactHook.installed ? status.preCompactHook.version : '0.0.0';
  const sessionEndVersion = status.sessionEndHook.installed ? status.sessionEndHook.version : '0.0.0';

  // Compare versions and get the highest one
  const versions = [sessionStartVersion, preCompactVersion, sessionEndVersion];
  const currentVersion = versions.reduce((max, version) => version > max ? version : max, '0.0.0');
  const needsUpdate = currentVersion < HOOKS_VERSION;
  
  return {
    needsUpdate,
    currentVersion,
    latestVersion: HOOKS_VERSION
  };
}

/**
 * Get current hook tracking mode (delegate to claude-settings-reader)
 */
export async function getHookMode() {
  return getHookModeFromReader();
}

/**
 * Install hooks globally for all projects
 */
export async function installGlobalHooks(): Promise<void> {
  const hooks: HookDefinition[] = [
    { type: 'SessionStart', enabled: true },
    { type: 'PreCompact', enabled: true },
    { type: 'SessionEnd', enabled: true }
  ];
  
  await installHooksToSettings(
    getGlobalSettingsPath(),
    hooks,
    getCliPath(),
    'all'  // Pass mode='all' for global hooks
  );

  logger.info('Global hooks installed for all projects');

  // After successful installation, update telemetry (cloud users only)
  await sendTelemetryUpdate();
}

/**
 * Install hooks for specific projects in their local settings
 */
export async function installProjectHooks(projects: Array<{ path: string; name: string; actualPath?: string }>): Promise<void> {
  const hooks: HookDefinition[] = [
    { type: 'SessionStart', enabled: true },
    { type: 'PreCompact', enabled: true },
    { type: 'SessionEnd', enabled: true }
  ];
  
  const cliPath = getCliPath();
  let installedCount = 0;
  let failedCount = 0;
  
  for (const project of projects) {
    try {
      const projectPath = project.actualPath;
      if (!projectPath) {
        logger.warn(`No actual path found for project ${project.name}, skipping`);
        failedCount++;
        continue;
      }
      
      const localSettingsPath = getProjectLocalSettingsPath(projectPath);
      
      await installHooksToSettings(
        localSettingsPath,
        hooks,
        cliPath,
        'selected'  // Project-specific hooks use 'selected' mode
      );
      
      logger.info(`Hooks installed for project ${project.name} at ${localSettingsPath}`);
      installedCount++;
      
    } catch (error) {
      logger.error(`Failed to install hooks for project ${project.name}:`, error);
      failedCount++;
    }
  }
  
  if (installedCount > 0) {
    logger.info(`Successfully installed hooks for ${installedCount} project(s)`);
    // After successful installation, update telemetry (cloud users only)
    await sendTelemetryUpdate();
  }
  if (failedCount > 0) {
    logger.warn(`Failed to install hooks for ${failedCount} project(s)`);
  }
}

/**
 * Project hook configuration with per-hook granularity
 */
export interface ProjectHookConfig {
  path: string;
  name: string;
  sessionStart: boolean;
  preCompact: boolean;
  sessionEnd: boolean;
}

/**
 * Install hooks for specific projects with per-hook configuration in their local settings
 */
export async function installSelectiveProjectHooks(projectConfigs: ProjectHookConfig[]): Promise<void> {
  const cliPath = getCliPath();
  let installedCount = 0;
  let failedCount = 0;
  
  for (const config of projectConfigs) {
    try {
      const projectPath = (config as any).actualPath;
      if (!projectPath) {
        logger.warn(`No actual path found for project ${config.name}, skipping`);
        failedCount++;
        continue;
      }
      
      const hooks: HookDefinition[] = [
        { type: 'SessionStart', enabled: config.sessionStart },
        { type: 'PreCompact', enabled: config.preCompact },
        { type: 'SessionEnd', enabled: config.sessionEnd }
      ];
      
      const localSettingsPath = getProjectLocalSettingsPath(projectPath);
      
      await installHooksToSettings(
        localSettingsPath,
        hooks,
        cliPath,
        'selected'  // Project-specific hooks use 'selected' mode
      );
      
      // Log per-project summary
      const enabledHooks = hooks
        .filter(h => h.enabled)
        .map(h => h.type);
      
      if (enabledHooks.length > 0) {
        logger.info(`Hooks installed for ${config.name}: ${enabledHooks.join(', ')}`);
        installedCount++;
      } else {
        logger.info(`All hooks removed for ${config.name}`);
      }
      
    } catch (error) {
      logger.error(`Failed to configure hooks for project ${config.name}:`, error);
      failedCount++;
    }
  }
  
  if (installedCount > 0) {
    logger.info(`Successfully configured hooks for ${installedCount} project(s)`);
  }
  if (failedCount > 0) {
    logger.warn(`Failed to configure hooks for ${failedCount} project(s)`);
  }
}

/**
 * Remove vibe-log hooks from specific projects' local settings
 */
export async function removeProjectHooks(projects: Array<{ path: string; name: string; actualPath?: string }>): Promise<void> {
  let removedCount = 0;
  let failedCount = 0;
  
  for (const project of projects) {
    try {
      const projectPath = project.actualPath;
      if (!projectPath) {
        logger.warn(`No actual path found for project ${project.name}, skipping`);
        failedCount++;
        continue;
      }
      
      const localSettingsPath = getProjectLocalSettingsPath(projectPath);
      const localSettings = await readSettingsFile(localSettingsPath);
      
      if (localSettings && localSettings.hooks) {
        let removed = false;
        
        // Remove vibe-log hooks only
        if (localSettings.hooks.SessionStart && isVibeLogHook(localSettings.hooks.SessionStart)) {
          delete localSettings.hooks.SessionStart;
          removed = true;
        }

        if (localSettings.hooks.PreCompact && isVibeLogHook(localSettings.hooks.PreCompact)) {
          delete localSettings.hooks.PreCompact;
          removed = true;
        }

        if (localSettings.hooks.SessionEnd && isVibeLogHook(localSettings.hooks.SessionEnd)) {
          delete localSettings.hooks.SessionEnd;
          removed = true;
        }
        
        if (removed) {
          // Remove empty hooks object
          if (Object.keys(localSettings.hooks).length === 0) {
            delete localSettings.hooks;
          }
          
          // Write back the settings
          await fs.writeFile(localSettingsPath, JSON.stringify(localSettings, null, 2));
          logger.info(`Hooks removed from project ${project.name}`);
          removedCount++;
        }
      }
      
    } catch (error) {
      // If file doesn't exist, that's fine - no hooks to remove
      if ((error as any).code !== 'ENOENT') {
        logger.error(`Failed to remove hooks from project ${project.name}:`, error);
        failedCount++;
      }
    }
  }
  
  if (removedCount > 0) {
    logger.info(`Successfully removed hooks from ${removedCount} project(s)`);
  }
  if (failedCount > 0) {
    logger.warn(`Failed to remove hooks from ${failedCount} project(s)`);
  }
}