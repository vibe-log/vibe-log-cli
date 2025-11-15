import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger';
import { getCliPath } from './config';
import { isVibeLogCommand } from './hooks/hooks-controller';


/**
 * Hook command configuration
 */
interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
}

/**
 * Hook configuration with matcher
 */
interface HookConfig {
  matcher?: string;
  hooks: HookCommand[];
}

/**
 * Claude Code settings structure
 */
interface ClaudeSettings {
  hooks?: {
    PreCompact?: HookConfig[];
    Stop?: HookConfig[]; // Used by Push-Up Challenge
    [key: string]: HookConfig[] | any;
  };
  [key: string]: any;
}

/**
 * Hook installation status
 */
export interface HookStatus {
  installed: boolean;
  preCompactHook: boolean;
  settingsPath: string | null;
  hookCommands: {
    preCompact?: string;
  };
}

/**
 * Get path to Claude Code settings.json file
 * NOTE: We only use settings.json, not settings.local.json, 
 * because hooks don't work properly in settings.local.json
 */
export function getSettingsPath(): string {
  const homeDir = homedir();
  return path.join(homeDir, '.claude', 'settings.json');
}

/**
 * For backwards compatibility with code that expects both paths
 * @deprecated Use getSettingsPath() instead
 */
export function getSettingsPaths(): { global: string; local: string } {
  const settingsPath = getSettingsPath();
  return {
    global: settingsPath,
    local: settingsPath  // Return same path for both to maintain compatibility
  };
}

/**
 * Read Claude settings from settings.json file
 */
async function readSettingsFile(filePath: string): Promise<ClaudeSettings | null> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.debug(`Could not read settings from ${filePath}:`, error);
    return null;
  }
}

/**
 * Read Claude settings from settings.json only
 * We don't use settings.local.json because hooks don't work there
 */
export async function readClaudeSettings(): Promise<{
  global: ClaudeSettings | null;
  local: ClaudeSettings | null;
  merged: ClaudeSettings;
}> {
  const settingsPath = getSettingsPath();
  const settings = await readSettingsFile(settingsPath);
  
  // Return the same settings for all three to maintain compatibility
  // but only actually read from settings.json
  return { 
    global: settings, 
    local: null,  // Explicitly null since we don't use local
    merged: settings || {} 
  };
}

/**
 * Check if a hook contains vibe-log command
 */
function isVibeLogHook(hookConfig: HookConfig[] | undefined): boolean {
  if (!hookConfig) return false;
  
  return hookConfig.some(config => 
    config.hooks?.some(hook => 
      isVibeLogCommand(hook.command)
    )
  );
}

/**
 * Get the vibe-log command from a hook config
 */
function getVibeLogCommand(hookConfig: HookConfig[] | undefined): string | undefined {
  if (!hookConfig) return undefined;
  
  for (const config of hookConfig) {
    for (const hook of config.hooks || []) {
      if (isVibeLogCommand(hook.command)) {
        return hook.command;
      }
    }
  }
  
  return undefined;
}

/**
 * Check if vibe-log hooks are installed and get their status
 * Only checks settings.json (not settings.local.json)
 */
export async function getHookStatus(): Promise<HookStatus> {
  const settingsPath = getSettingsPath();
  const settings = await readSettingsFile(settingsPath);

  // Check for PreCompact hook (PascalCase only)
  const preCompactHook = isVibeLogHook(settings?.hooks?.PreCompact);

  // Get hook commands
  const hookCommands: HookStatus['hookCommands'] = {};
  if (preCompactHook) {
    hookCommands.preCompact = getVibeLogCommand(settings?.hooks?.PreCompact);
  }

  return {
    installed: preCompactHook,
    preCompactHook,
    settingsPath: preCompactHook ? settingsPath : null,
    hookCommands
  };
}

/**
 * Check if hooks are installed (simplified check for status display)
 */
export async function areHooksInstalled(): Promise<boolean> {
  const status = await getHookStatus();
  return status.installed;
}

/**
 * Helper function to filter out vibe-log commands from hook configurations
 * Preserves non-vibe-log hooks in the array
 */
function filterVibeLogHooks(hookConfigs: HookConfig[]): HookConfig[] {
  return hookConfigs
    .map(config => ({
      ...config,
      hooks: config.hooks.filter(hook => !isVibeLogCommand(hook.command))
    }))
    .filter(config => config.hooks.length > 0);
}

/**
 * Uninstall vibe-log hooks
 * Only removes from settings.json (not settings.local.json)
 */
export async function uninstallVibeLogHooks(): Promise<void> {
  const settingsPath = getSettingsPath();
  const settings = await readSettingsFile(settingsPath);
  
  if (!settings || !settings.hooks) {
    throw new Error('No settings file found or no hooks to uninstall.');
  }
  
  let modified = false;

  // Filter out vibe-log commands from PreCompact hook (preserves non-vibe-log hooks)
  if (settings.hooks.PreCompact) {
    const originalPreCompact = settings.hooks.PreCompact;
    const filteredConfigs = filterVibeLogHooks(originalPreCompact);

    if (filteredConfigs.length !== originalPreCompact.length ||
        filteredConfigs.some((config, i) => config.hooks.length !== originalPreCompact[i].hooks.length)) {
      modified = true;
    }

    if (filteredConfigs.length > 0) {
      settings.hooks.PreCompact = filteredConfigs;
    } else {
      delete settings.hooks.PreCompact;
    }
  }

  if (!modified) {
    throw new Error('No vibe-log hooks found to uninstall.');
  }
  
  // Remove empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  
  // Write settings back
  if (Object.keys(settings).length > 0) {
    const tempPath = `${settingsPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(settings, null, 2));
    await fs.rename(tempPath, settingsPath);
  } else {
    // No settings left, remove the file
    try {
      await fs.unlink(settingsPath);
    } catch (error) {
      logger.debug(`Could not remove ${settingsPath}:`, error);
    }
  }
  
  logger.debug(`Hooks removed from ${settingsPath}`);
}

/**
 * Validate that hook commands are executable
 */
export async function validateHookCommands(): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const status = await getHookStatus();
  const errors: string[] = [];
  
  if (!status.installed) {
    errors.push('No hooks installed');
    return { valid: false, errors };
  }
  
  // Check if CLI command exists
  const cliPath = getCliPath();
  try {
    await fs.access(cliPath);
  } catch (error) {
    errors.push(`CLI command not found: ${cliPath}`);
  }
  
  // Check hook commands match current CLI path
  if (status.hookCommands.preCompact && !status.hookCommands.preCompact.includes(cliPath)) {
    errors.push(`PreCompact hook uses different CLI path: ${status.hookCommands.preCompact}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}