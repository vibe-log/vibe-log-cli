import inquirer from 'inquirer';
import { promises as fs } from 'fs';
import path from 'path';
import { colors } from './styles';
import { parseProjectName } from './project-display';
import { getClaudeProjectsPath } from '../claude-core';
import { logger } from '../../utils/logger';
import { getHookMode, getTrackedProjects } from '../claude-settings-reader';

/**
 * Selected project information for hooks
 */
export interface SelectedProject {
  path: string;      // Claude folder path (e.g., -Users-danny-dev-personal-vibe-log)
  name: string;      // Display name extracted from cwd
  lastActive: Date;  // Last activity time
  hasHooks?: boolean; // Whether this project currently has hooks enabled
  actualPath?: string; // Actual filesystem path (e.g., /Users/danny/dev-personal/vibe-log)
}

/**
 * Show project selector for hook configuration
 * Allows users to select which projects should have auto-sync enabled
 */
export async function showProjectSelectorForHooks(): Promise<SelectedProject[]> {
  const projectsPath = getClaudeProjectsPath();
  
  try {
    // Get current hook configuration
    const hookMode = await getHookMode();
    const trackedProjects = hookMode === 'selected' ? await getTrackedProjects() : [];
    
    // Get all project directories
    const entries = await fs.readdir(projectsPath, { withFileTypes: true });
    const projectDirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
    
    if (projectDirs.length === 0) {
      console.log(colors.warning('No Claude Code projects found.'));
      return [];
    }
    
    // Get project info for each directory
    const projectInfos = await Promise.all(
      projectDirs.map(async (dir) => {
        const info = await getProjectInfo(path.join(projectsPath, dir));
        if (!info) return null;
        
        // Check if this project has hooks enabled
        const hasHooks = hookMode === 'all' || trackedProjects.includes(dir);
        
        return { ...info, path: dir, hasHooks };
      })
    );
    
    // Filter out null values and sort by last activity
    const validProjects = projectInfos
      .filter((info): info is NonNullable<typeof info> => info !== null)
      .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
    
    if (validProjects.length === 0) {
      console.log(colors.warning('No valid projects found with sessions.'));
      return [];
    }
    
    // Group projects by recency
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const todayProjects = validProjects.filter(p => p && p.lastActive >= today);
    const yesterdayProjects = validProjects.filter(p => p && p.lastActive >= yesterday && p.lastActive < today);
    const weekProjects = validProjects.filter(p => p && p.lastActive >= lastWeek && p.lastActive < yesterday);
    const olderProjects = validProjects.filter(p => p && p.lastActive < lastWeek);
    
    // Build choices for inquirer
    const choices: any[] = [];
    
    if (todayProjects.length > 0) {
      choices.push({
        type: 'separator',
        name: colors.accent(`──── Today's Projects ────`)
      });
      todayProjects.forEach(project => {
        if (project) {
          choices.push({
            name: formatProjectChoice(project),
            value: project,
            checked: project.hasHooks || false  // Pre-select if already tracked
          });
        }
      });
    }
    
    if (yesterdayProjects.length > 0) {
      choices.push({
        type: 'separator',
        name: colors.accent(`──── Yesterday ────`)
      });
      yesterdayProjects.forEach(project => {
        if (project) {
          choices.push({
            name: formatProjectChoice(project),
            value: project,
            checked: project.hasHooks || false  // Pre-select if already tracked
          });
        }
      });
    }
    
    if (weekProjects.length > 0) {
      choices.push({
        type: 'separator',
        name: colors.accent(`──── Last 7 Days ────`)
      });
      weekProjects.forEach(project => {
        if (project) {
          choices.push({
            name: formatProjectChoice(project),
            value: project,
            checked: project.hasHooks || false  // Pre-select if already tracked
          });
        }
      });
    }
    
    if (olderProjects.length > 0) {
      choices.push({
        type: 'separator',
        name: colors.accent(`──── Older Projects ────`)
      });
      olderProjects.forEach(project => {
        if (project) {
          choices.push({
            name: formatProjectChoice(project),
            value: project,
            checked: project.hasHooks || false  // Pre-select if already tracked
          });
        }
      });
    }
    
    // Prompt for selection
    console.log(colors.subdued('Choose which projects should have auto-sync enabled:'));
    console.log(colors.subdued('✅ = Currently tracked | Pre-selected items already have hooks\n'));
    console.log(colors.hint('(Use Space to select/deselect, Enter to confirm, Q to cancel)\n'));
    
    const { selected } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: 'Select projects:',
        choices,
        pageSize: 15,
        validate: (input) => {
          if (input.length === 0) {
            return 'Please select at least one project or press Q to cancel';
          }
          return true;
        }
      }
    ]);
    
    return selected;
    
  } catch (error) {
    logger.error('Failed to load projects for selection:', error);
    console.log(colors.error('Failed to load projects. Please check your Claude Code installation.'));
    return [];
  }
}

/**
 * Get project information from session files
 * Exported for use in other UI components that need to resolve project names
 */
export async function getProjectInfo(projectPath: string): Promise<Omit<SelectedProject, 'path'> | null> {
  try {
    // Get all session files
    const files = await fs.readdir(projectPath);
    const sessionFiles = files.filter(f => f.endsWith('.jsonl'));
    
    if (sessionFiles.length === 0) {
      return null;
    }
    
    // Find the most recent session
    let mostRecent = new Date(0);
    let projectName = 'Unknown';
    let actualPath: string | undefined;
    
    for (const file of sessionFiles) {
      const filePath = path.join(projectPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtime > mostRecent) {
        mostRecent = stats.mtime;
        
        // Try to read the first line to get the cwd
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());
          
          if (lines.length > 0) {
            const firstLine = JSON.parse(lines[0]);
            if (firstLine.cwd) {
              // Extract project name from cwd
              projectName = parseProjectName(firstLine.cwd);
              actualPath = firstLine.cwd; // Store the actual path
            }
          }
        } catch (e) {
          // If we can't parse, use directory name as fallback
          const dirName = parseProjectName(projectPath);
          // Use last segment of directory name as project name
          projectName = dirName.split('-').pop() || dirName;
          // Note: actualPath will remain undefined if we can't read cwd from JSONL
        }
      }
    }
    
    return {
      name: projectName,
      lastActive: mostRecent,
      actualPath
    };
    
  } catch (error) {
    logger.debug(`Failed to get info for project ${projectPath}:`, error);
    return null;
  }
}

/**
 * Format project choice for display
 */
function formatProjectChoice(project: SelectedProject): string {
  const timeSinceActive = getTimeSinceActive(project.lastActive);
  const hookIndicator = project.hasHooks ? colors.success('✅ ') : '   ';
  return `${hookIndicator}${project.name} ${colors.subdued(`(last active: ${timeSinceActive})`)}`;
}

/**
 * Get human-readable time since last activity
 */
function getTimeSinceActive(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (hours < 1) {
    return 'just now';
  } else if (hours === 1) {
    return '1 hour ago';
  } else if (hours < 24) {
    return `${hours} hours ago`;
  } else if (days === 1) {
    return 'yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  } else {
    const months = Math.floor(days / 30);
    return `${months} month${months !== 1 ? 's' : ''} ago`;
  }
}