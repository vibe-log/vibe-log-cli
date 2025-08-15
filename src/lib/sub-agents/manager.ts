import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { VIBE_LOG_SUB_AGENTS, SubAgentName } from './constants';
import { SUB_AGENT_TEMPLATES } from './templates';
import { logger } from '../../utils/logger';
import { icons } from '../ui/styles';

/**
 * Get the path to the Claude Code sub-agents directory
 */
export function getSubAgentsDirectory(): string {
  return path.join(os.homedir(), '.claude', 'agents');
}

/**
 * Get the full path for a specific sub-agent
 */
export function getSubAgentPath(name: SubAgentName): string {
  return path.join(getSubAgentsDirectory(), name);
}

/**
 * Ensure the sub-agents directory exists
 */
export async function ensureSubAgentsDirectory(): Promise<void> {
  const dir = getSubAgentsDirectory();
  try {
    await fs.mkdir(dir, { recursive: true });
    logger.debug('Sub-agents directory ensured', { path: dir });
  } catch (error) {
    logger.error('Failed to create sub-agents directory', error);
    throw new Error(`Failed to create sub-agents directory: ${error}`);
  }
}

/**
 * Check which sub-agents are currently installed
 */
export async function checkInstalledSubAgents(): Promise<{
  installed: SubAgentName[];
  missing: SubAgentName[];
  total: number;
}> {
  const dir = getSubAgentsDirectory();
  
  try {
    await fs.access(dir);
    const files = await fs.readdir(dir);
    
    const installed = VIBE_LOG_SUB_AGENTS.filter(agent => 
      files.includes(agent)
    ) as SubAgentName[];
    
    const missing = VIBE_LOG_SUB_AGENTS.filter(agent => 
      !files.includes(agent)
    ) as SubAgentName[];
    
    return {
      installed,
      missing,
      total: VIBE_LOG_SUB_AGENTS.length
    };
  } catch {
    // Directory doesn't exist or can't be accessed
    return {
      installed: [],
      missing: [...VIBE_LOG_SUB_AGENTS] as SubAgentName[],
      total: VIBE_LOG_SUB_AGENTS.length
    };
  }
}

/**
 * Install a single sub-agent
 */
export async function installSubAgent(name: SubAgentName): Promise<void> {
  const content = SUB_AGENT_TEMPLATES[name];
  if (!content) {
    throw new Error(`No template found for sub-agent: ${name}`);
  }
  
  const filePath = getSubAgentPath(name);
  await fs.writeFile(filePath, content, 'utf-8');
  logger.debug('Sub-agent installed', { name, path: filePath });
}

/**
 * Install all missing sub-agents with progress reporting
 */
export async function installSubAgents(options?: {
  force?: boolean;
  onProgress?: (message: string) => void;
}): Promise<{
  installed: SubAgentName[];
  skipped: SubAgentName[];
  failed: SubAgentName[];
}> {
  const { force = false, onProgress } = options || {};
  
  // Ensure directory exists
  await ensureSubAgentsDirectory();
  
  // Check current state
  const status = await checkInstalledSubAgents();
  const toInstall = force ? VIBE_LOG_SUB_AGENTS : status.missing;
  
  const results = {
    installed: [] as SubAgentName[],
    skipped: [] as SubAgentName[],
    failed: [] as SubAgentName[]
  };
  
  // Skip if all installed and not forcing
  if (!force && status.missing.length === 0) {
    onProgress?.(`${icons.check} All sub-agents already installed`);
    results.skipped = status.installed;
    return results;
  }
  
  onProgress?.(`Installing ${toInstall.length} sub-agents to ~/.claude/agents/`);
  
  for (const agent of toInstall) {
    try {
      // Check if exists and not forcing
      if (!force && status.installed.includes(agent)) {
        results.skipped.push(agent);
        onProgress?.(`  ${icons.check} ${agent} (already installed)`);
        continue;
      }
      
      // Install the sub-agent
      await installSubAgent(agent);
      results.installed.push(agent);
      onProgress?.(`  ${icons.success} ${agent}`);
    } catch (error) {
      results.failed.push(agent);
      onProgress?.(`  ${icons.error} ${agent} - ${error}`);
      logger.error(`Failed to install sub-agent ${agent}`, error);
    }
  }
  
  // Summary
  if (results.installed.length > 0) {
    onProgress?.(`\n${icons.check} Successfully installed ${results.installed.length} sub-agents`);
  }
  
  if (results.failed.length > 0) {
    onProgress?.(`${icons.warning} Failed to install ${results.failed.length} sub-agents`);
  }
  
  return results;
}

/**
 * Remove a single sub-agent
 */
export async function removeSubAgent(name: SubAgentName): Promise<void> {
  const filePath = getSubAgentPath(name);
  try {
    await fs.unlink(filePath);
    logger.debug('Sub-agent removed', { name, path: filePath });
  } catch (error) {
    if ((error as any).code !== 'ENOENT') {
      throw error;
    }
    // File doesn't exist, that's ok
  }
}

/**
 * Remove all vibe-log sub-agents
 */
export async function removeAllSubAgents(): Promise<number> {
  let removed = 0;
  for (const agent of VIBE_LOG_SUB_AGENTS) {
    try {
      await removeSubAgent(agent);
      removed++;
    } catch (error) {
      logger.error(`Failed to remove sub-agent ${agent}`, error);
    }
  }
  return removed;
}

/**
 * Remove selected sub-agents
 */
export async function removeSelectedSubAgents(
  agents: SubAgentName[],
  options?: {
    onProgress?: (message: string) => void;
  }
): Promise<{
  removed: SubAgentName[];
  failed: SubAgentName[];
}> {
  const { onProgress } = options || {};
  const results = {
    removed: [] as SubAgentName[],
    failed: [] as SubAgentName[]
  };
  
  onProgress?.(`Removing ${agents.length} sub-agents...`);
  
  for (const agent of agents) {
    try {
      await removeSubAgent(agent);
      results.removed.push(agent);
      onProgress?.(`  ${icons.success} Removed ${agent}`);
    } catch (error) {
      results.failed.push(agent);
      onProgress?.(`  ${icons.error} Failed to remove ${agent}`);
      logger.error(`Failed to remove sub-agent ${agent}`, error);
    }
  }
  
  // Summary
  if (results.removed.length > 0) {
    onProgress?.(`\n${icons.check} Successfully removed ${results.removed.length} sub-agents`);
  }
  
  if (results.failed.length > 0) {
    onProgress?.(`${icons.warning} Failed to remove ${results.failed.length} sub-agents`);
  }
  
  return results;
}

/**
 * Get detailed status of all sub-agents
 */
export async function getSubAgentStatus(): Promise<{
  directory: string;
  exists: boolean;
  installed: SubAgentName[];
  missing: SubAgentName[];
  total: number;
  percentage: number;
}> {
  const dir = getSubAgentsDirectory();
  const status = await checkInstalledSubAgents();
  
  let exists = false;
  try {
    await fs.access(dir);
    exists = true;
  } catch {
    exists = false;
  }
  
  const percentage = Math.round((status.installed.length / status.total) * 100);
  
  return {
    directory: dir,
    exists,
    ...status,
    percentage
  };
}