import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getAllConfig, getToken as getConfigToken, getProjectTrackingMode, getTrackedProjects, getLastSyncSummary, getDashboardUrl } from './config';
import { logger } from '../utils/logger';
import { VIBE_LOG_SUB_AGENTS } from './sub-agents/constants';
import { getHookMode } from './claude-settings-reader';

export type SetupState = 
  | 'FIRST_TIME'           // No configuration exists
  | 'LOCAL_ONLY'          // Sub-agents installed, no cloud
  | 'CLOUD_AUTO'          // Cloud + hooks installed
  | 'CLOUD_MANUAL'        // Cloud without hooks
  | 'CLOUD_ONLY'          // Cloud, no local sub-agents
  | 'PARTIAL_SETUP'       // Some components missing
  | 'ERROR';              // Error detecting state

export interface StateDetails {
  state: SetupState;
  hasConfig: boolean;
  hasAuth: boolean;
  hasAgents: boolean;
  agentCount: number;
  totalAgents: number;
  hasHooks: boolean;
  cloudUrl?: string;
  lastSync?: Date;
  lastSyncProject?: string;
  projectCount?: number;
  sessionCount?: number;
  trackingMode: 'all' | 'selected' | 'none';
  trackedProjectCount: number;
  trackedProjectNames?: string[];
  errors: string[];
}

export async function detectSetupState(): Promise<StateDetails> {
  const errors: string[] = [];
  const details: StateDetails = {
    state: 'FIRST_TIME',
    hasConfig: false,
    hasAuth: false,
    hasAgents: false,
    agentCount: 0,
    totalAgents: VIBE_LOG_SUB_AGENTS.length,
    hasHooks: false,
    trackingMode: 'none',
    trackedProjectCount: 0,
    errors
  };

  try {
    // Check for config
    const config = getAllConfig();
    details.hasConfig = Object.keys(config).length > 0;

    // Check for authentication
    try {
      const token = await getConfigToken();
      details.hasAuth = !!token;
      details.cloudUrl = getDashboardUrl();
      
      if (config.lastSync) {
        details.lastSync = new Date(config.lastSync);
      }
      
      // Get last sync summary for display
      const syncSummary = getLastSyncSummary();
      if (syncSummary) {
        details.lastSyncProject = syncSummary.description;
      }
    } catch {
      details.hasAuth = false;
    }

    // Check for sub-agents
    const agentsPath = path.join(os.homedir(), '.claude', 'agents');
    try {
      await fs.access(agentsPath);
      const files = await fs.readdir(agentsPath);
      const installedAgents = files.filter(f => 
        VIBE_LOG_SUB_AGENTS.includes(f as any) && f.endsWith('.md')
      );
      details.agentCount = installedAgents.length;
      details.hasAgents = installedAgents.length > 0;
    } catch {
      details.hasAgents = false;
      details.agentCount = 0;
    }

    // Check for hooks using the claude-settings-reader which checks both global and project settings
    try {
      const hookMode = await getHookMode();
      details.hasHooks = hookMode === 'all' || hookMode === 'selected';
    } catch (error) {
      logger.debug('Error checking hooks installation:', error);
      details.hasHooks = false;
    }

    // Check for Claude Code projects
    const projectsPath = path.join(os.homedir(), '.claude', 'projects');
    try {
      await fs.access(projectsPath);
      const projects = await fs.readdir(projectsPath);
      details.projectCount = projects.filter(async p => {
        const stat = await fs.stat(path.join(projectsPath, p));
        return stat.isDirectory();
      }).length;
    } catch {
      details.projectCount = 0;
    }

    // Get project tracking information
    try {
      details.trackingMode = getProjectTrackingMode();
      
      if (details.trackingMode === 'selected') {
        const trackedProjects = getTrackedProjects();
        details.trackedProjectCount = trackedProjects.length;
        // Only store names for display if there are a reasonable number
        if (trackedProjects.length <= 10) {
          details.trackedProjectNames = trackedProjects;
        }
      } else if (details.trackingMode === 'all') {
        // For 'all' mode, count is the total number of projects
        details.trackedProjectCount = details.projectCount || 0;
      } else {
        // For 'none' mode, count is 0
        details.trackedProjectCount = 0;
      }
    } catch (error) {
      logger.debug('Error getting project tracking info:', error);
      // Default values already set
    }

    // Determine state based on what's installed
    if (!details.hasConfig && !details.hasAuth && !details.hasAgents) {
      details.state = 'FIRST_TIME';
    } else if (details.hasAuth && details.hasHooks && details.hasAgents) {
      details.state = 'CLOUD_AUTO';
    } else if (details.hasAuth && !details.hasHooks && details.hasAgents) {
      details.state = 'CLOUD_MANUAL';
    } else if (details.hasAuth && !details.hasAgents) {
      details.state = 'CLOUD_ONLY';
    } else if (!details.hasAuth && details.hasAgents) {
      details.state = 'LOCAL_ONLY';
    } else {
      details.state = 'PARTIAL_SETUP';
    }

    // Add warnings for partial setups
    if (details.hasAgents && details.agentCount < details.totalAgents) {
      errors.push(`Only ${details.agentCount}/${details.totalAgents} sub-agents installed`);
    }

  } catch (error) {
    logger.error('Error detecting setup state:', error);
    details.state = 'ERROR';
    errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return details;
}

export async function checkClaudeCodeInstalled(): Promise<boolean> {
  const claudePath = path.join(os.homedir(), '.claude');
  try {
    await fs.access(claudePath);
    return true;
  } catch {
    return false;
  }
}

export async function checkProjectDirectory(): Promise<string | null> {
  try {
    const cwd = process.cwd();
    // Check if we're in a git repo or project directory
    const gitPath = path.join(cwd, '.git');
    try {
      await fs.access(gitPath);
      return cwd;
    } catch {
      // Not a git repo, but still could be a project
      return cwd;
    }
  } catch {
    return null;
  }
}