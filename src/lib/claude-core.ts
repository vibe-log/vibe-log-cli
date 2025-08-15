import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import {
  ClaudeProject,
  parseSessionContent,
  createProjectFromSessionData,
  matchProjectToPath,
  sortProjectsByActivity,
  filterActiveProjects
} from './claude-project-parser';
import {
  ClaudeFileSystem,
  IClaudeFileSystem,
  getClaudeHomePath,
  getClaudeProjectsPath,
  getGlobalSettingsPath,
  getProjectSettingsPath,
  getProjectLocalSettingsPath,
  getEnterpriseManagedSettingsPath
} from './claude-fs';

// Re-export types and utility functions for backward compatibility
export type { ClaudeProject };
export {
  getClaudeHomePath,
  getClaudeProjectsPath,
  getGlobalSettingsPath,
  getProjectSettingsPath,
  getProjectLocalSettingsPath,
  getEnterpriseManagedSettingsPath
};

// Default file system implementation
let fileSystem: IClaudeFileSystem = new ClaudeFileSystem();

/**
 * Set a custom file system implementation (useful for testing)
 */
export function setFileSystem(fs: IClaudeFileSystem): void {
  fileSystem = fs;
}

/**
 * Reset to default file system implementation
 */
export function resetFileSystem(): void {
  fileSystem = new ClaudeFileSystem();
}

/**
 * Analyze a single Claude project directory
 */
export async function analyzeProject(
  claudePath: string, 
  dirName: string
): Promise<ClaudeProject | null> {
  try {
    const sessionFiles = await fileSystem.getSessionFiles(claudePath);
    
    if (sessionFiles.length === 0) {
      return null;
    }
    
    // Read the first session file to get the actual cwd
    let sessionData = null;
    if (sessionFiles.length > 0) {
      try {
        const content = await fileSystem.readSessionFile(sessionFiles[0].path);
        sessionData = parseSessionContent(content);
      } catch (error) {
        logger.debug(`Could not read session file: ${error}`);
      }
    }
    
    const project = createProjectFromSessionData(
      claudePath,
      dirName,
      sessionData,
      sessionFiles
    );
    
    if (!project) {
      logger.debug(`No valid project data found in ${dirName}`);
    }
    
    return project;
  } catch (error) {
    logger.debug(`Error analyzing project ${dirName}:`, error);
    return null;
  }
}

/**
 * Discover all Claude projects
 */
export async function discoverProjects(): Promise<ClaudeProject[]> {
  const projects: ClaudeProject[] = [];
  
  try {
    const projectDirs = await fileSystem.getProjectDirectories();
    
    for (const projectPath of projectDirs) {
      const dirName = path.basename(projectPath);
      const project = await analyzeProject(projectPath, dirName);
      if (project) {
        projects.push(project);
      }
    }
    
    return sortProjectsByActivity(projects);
  } catch (error) {
    logger.error('Error discovering projects:', error);
    return projects;
  }
}

/**
 * Get active projects (with activity in the last N days)
 */
export async function getActiveProjects(days: number = 30): Promise<ClaudeProject[]> {
  const allProjects = await discoverProjects();
  return filterActiveProjects(allProjects, days);
}

/**
 * Get the current project based on the current working directory
 */
export async function getCurrentProject(): Promise<ClaudeProject | null> {
  const cwd = process.cwd();
  const projects = await discoverProjects();
  return matchProjectToPath(projects, cwd);
}

/**
 * Check if Claude Code is installed
 */
export async function isClaudeCodeInstalled(): Promise<boolean> {
  try {
    await fs.access(getClaudeHomePath());
    return true;
  } catch {
    return false;
  }
}