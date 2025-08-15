import { promises as fs } from 'fs';
import { logger } from '../utils/logger';
import {
  getGlobalSettingsPath,
  getProjectSettingsPath,
  getProjectLocalSettingsPath,
  getEnterpriseManagedSettingsPath,
  discoverProjects,
  ClaudeProject
} from './claude-core';

/**
 * Claude settings reader - Single source of truth for all settings
 * Reads from all locations and merges with correct precedence
 */

/**
 * Hook configuration
 */
interface HookConfig {
  type: 'command';
  command: string;
  timeout?: number;
}

/**
 * Hook configuration with matcher
 */
interface HookConfigWithMatcher {
  matcher?: string;
  hooks: HookConfig[];
}

/**
 * Claude settings structure
 */
export interface ClaudeSettings {
  hooks?: {
    SessionStart?: HookConfigWithMatcher[];
    PreCompact?: HookConfigWithMatcher[];
    Stop?: HookConfigWithMatcher[]; // Legacy, kept for cleanup
    [key: string]: HookConfigWithMatcher[] | any;
  };
  [key: string]: any;
}

/**
 * Hook tracking mode
 */
export type HookMode = 'all' | 'selected' | 'none';

/**
 * Project with hook status
 */
export interface ProjectWithHookStatus extends ClaudeProject {
  hasGlobalHooks: boolean;
  hasProjectHooks: boolean;
  hasLocalHooks: boolean;
  hasEffectiveHooks: boolean; // After merging all settings
}

/**
 * Read a settings file safely
 */
async function readSettingsFile(path: string): Promise<ClaudeSettings | null> {
  try {
    const data = await fs.readFile(path, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // File not existing is normal, not an error
    if ((error as any).code !== 'ENOENT') {
      logger.debug(`Could not read settings from ${path}:`, error);
    }
    return null;
  }
}

/**
 * Read global Claude settings
 */
export async function readGlobalSettings(): Promise<ClaudeSettings | null> {
  return readSettingsFile(getGlobalSettingsPath());
}

/**
 * Read project-specific shared settings
 */
export async function readProjectSettings(projectPath: string): Promise<ClaudeSettings | null> {
  return readSettingsFile(getProjectSettingsPath(projectPath));
}

/**
 * Read project-specific local settings
 */
export async function readProjectLocalSettings(projectPath: string): Promise<ClaudeSettings | null> {
  return readSettingsFile(getProjectLocalSettingsPath(projectPath));
}

/**
 * Read enterprise managed settings
 */
export async function readEnterpriseManagedSettings(): Promise<ClaudeSettings | null> {
  const path = getEnterpriseManagedSettingsPath();
  if (!path) return null;
  return readSettingsFile(path);
}

/**
 * Merge settings with correct precedence
 * Higher precedence overrides lower:
 * 1. Enterprise managed (highest)
 * 2. Project local
 * 3. Project shared
 * 4. Global (lowest)
 */
function mergeSettings(...settings: (ClaudeSettings | null)[]): ClaudeSettings {
  const result: ClaudeSettings = {};
  
  // Merge in order from lowest to highest precedence
  for (const setting of settings) {
    if (!setting) continue;
    
    // Deep merge
    for (const [key, value] of Object.entries(setting)) {
      if (key === 'hooks' && result.hooks) {
        // Special handling for hooks - merge hook configurations
        result.hooks = { ...result.hooks, ...value };
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = { ...(result[key] || {}), ...value };
      } else {
        result[key] = value;
      }
    }
  }
  
  return result;
}

/**
 * Get merged settings for a specific project
 */
export async function getMergedSettingsForProject(projectPath: string): Promise<ClaudeSettings> {
  const global = await readGlobalSettings();
  const project = await readProjectSettings(projectPath);
  const local = await readProjectLocalSettings(projectPath);
  const enterprise = await readEnterpriseManagedSettings();
  
  // Merge in precedence order (lowest to highest)
  return mergeSettings(global, project, local, enterprise);
}

/**
 * Check if a command is a vibe-log hook
 */
function isVibeLogCommand(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes('vibe-log') || command.includes('vibe-log');
}

/**
 * Check if settings have vibe-log hooks
 */
export function hasVibeLogHooks(settings: ClaudeSettings | null): boolean {
  if (!settings?.hooks) return false;
  
  // Check SessionStart hooks
  if (settings.hooks.SessionStart) {
    for (const config of settings.hooks.SessionStart) {
      if (config.hooks.some(h => isVibeLogCommand(h.command))) {
        return true;
      }
    }
  }
  
  // Check PreCompact hooks
  if (settings.hooks.PreCompact) {
    for (const config of settings.hooks.PreCompact) {
      if (config.hooks.some(h => isVibeLogCommand(h.command))) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get the current hook tracking mode by checking global and project settings
 */
export async function getHookMode(): Promise<HookMode> {
  const global = await readGlobalSettings();
  
  // Check if global settings have vibe-log hooks
  if (hasVibeLogHooks(global)) {
    return 'all';
  }
  
  // Check if any project has local vibe-log hooks
  const projects = await discoverProjects();
  for (const project of projects) {
    const localSettings = await readProjectLocalSettings(project.actualPath);
    if (hasVibeLogHooks(localSettings)) {
      return 'selected';
    }
  }
  
  return 'none';
}

/**
 * Get list of projects that have vibe-log hooks in their local settings
 */
export async function getTrackedProjects(): Promise<string[]> {
  const projects = await discoverProjects();
  const trackedProjects: string[] = [];
  
  for (const project of projects) {
    const localSettings = await readProjectLocalSettings(project.actualPath);
    if (hasVibeLogHooks(localSettings)) {
      // Return the Claude folder name (e.g., "-Users-danny-dev-personal-vibe-log")
      trackedProjects.push(project.claudePath.split('/').pop() || project.claudePath);
    }
  }
  
  return trackedProjects;
}

/**
 * Get all projects with their hook status
 */
export async function getAllProjectsHookStatus(): Promise<ProjectWithHookStatus[]> {
  const projects = await discoverProjects();
  const mode = await getHookMode();
  const trackedProjects = mode === 'selected' ? await getTrackedProjects() : [];
  
  const projectsWithStatus: ProjectWithHookStatus[] = [];
  
  for (const project of projects) {
    const projectSettings = await readProjectSettings(project.actualPath);
    const localSettings = await readProjectLocalSettings(project.actualPath);
    const merged = await getMergedSettingsForProject(project.actualPath);
    
    const hasGlobalHooks = mode === 'all' || 
                          (mode === 'selected' && trackedProjects.includes(project.claudePath));
    const hasProjectHooks = hasVibeLogHooks(projectSettings);
    const hasLocalHooks = hasVibeLogHooks(localSettings);
    const hasEffectiveHooks = hasVibeLogHooks(merged);
    
    projectsWithStatus.push({
      ...project,
      hasGlobalHooks,
      hasProjectHooks,
      hasLocalHooks,
      hasEffectiveHooks
    });
  }
  
  return projectsWithStatus;
}

/**
 * Get hook status for a specific project
 */
export async function getProjectHookStatus(projectPath: string): Promise<{
  hasGlobalHooks: boolean;
  hasProjectHooks: boolean;
  hasLocalHooks: boolean;
  hasEffectiveHooks: boolean;
}> {
  const project = await readProjectSettings(projectPath);
  const local = await readProjectLocalSettings(projectPath);
  const merged = await getMergedSettingsForProject(projectPath);
  
  const mode = await getHookMode();
  const trackedProjects = mode === 'selected' ? await getTrackedProjects() : [];
  
  // Check if this project is tracked globally
  const hasGlobalHooks = mode === 'all' || 
                        (mode === 'selected' && trackedProjects.some(p => projectPath.includes(p)));
  
  return {
    hasGlobalHooks,
    hasProjectHooks: hasVibeLogHooks(project),
    hasLocalHooks: hasVibeLogHooks(local),
    hasEffectiveHooks: hasVibeLogHooks(merged)
  };
}

/**
 * Write settings to global location
 */
export async function writeGlobalSettings(settings: ClaudeSettings): Promise<void> {
  const settingsPath = getGlobalSettingsPath();
  const tempPath = `${settingsPath}.tmp`;
  
  await fs.writeFile(tempPath, JSON.stringify(settings, null, 2));
  await fs.rename(tempPath, settingsPath);
  
  logger.debug(`Global settings written to ${settingsPath}`);
}