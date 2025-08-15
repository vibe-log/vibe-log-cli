/**
 * Pure business logic for parsing Claude project data
 * No file system operations - just data transformation
 */

import { parseProjectName } from './ui/project-display';

export interface ClaudeProject {
  name: string;              // Display name (e.g., "vibe-log")
  claudePath: string;        // Claude folder path (e.g., ~/.claude/projects/-Users-danny-dev-vibe-log)
  actualPath: string;        // Actual project path (e.g., /Users/danny/dev/vibe-log)
  sessions: number;          // Number of session files
  lastActivity: Date | null; // Last modification time
  isActive: boolean;         // Active within last 30 days
  size: number;             // Total size of session files
}

export interface SessionFileInfo {
  path: string;
  size: number;
  mtime: Date;
}

export interface ParsedSessionLine {
  cwd?: string;
  sessionId?: string;
  timestamp?: string;
  [key: string]: any;
}

/**
 * Parse a JSONL session file content and extract the first cwd field
 */
export function parseSessionContent(content: string): ParsedSessionLine | null {
  const lines = content.trim().split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const data = JSON.parse(line);
      if (data.cwd) {
        return data;
      }
    } catch {
      // Skip invalid JSON lines
      continue;
    }
  }
  
  return null;
}

/**
 * Extract project name from a path
 */
export function extractProjectName(cwdPath: string): string {
  return parseProjectName(cwdPath);
}

/**
 * Create a ClaudeProject from parsed session data
 */
export function createProjectFromSessionData(
  claudePath: string,
  _dirName: string,  // Prefixed with _ to indicate it's intentionally unused
  sessionData: ParsedSessionLine | null,
  sessionFiles: SessionFileInfo[]
): ClaudeProject | null {
  // We only trust the cwd field from JSONL files as the source of truth
  if (!sessionData?.cwd) {
    return null;
  }
  
  const actualPath = sessionData.cwd;
  const projectName = extractProjectName(actualPath);
  
  // Calculate stats from session files
  let lastActivity: Date | null = null;
  let totalSize = 0;
  
  for (const file of sessionFiles) {
    totalSize += file.size;
    
    if (!lastActivity || file.mtime > lastActivity) {
      lastActivity = file.mtime;
    }
  }
  
  // Determine if project is active (activity within last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const isActive = lastActivity ? lastActivity > thirtyDaysAgo : false;
  
  return {
    name: projectName,
    claudePath,
    actualPath,
    sessions: sessionFiles.length,
    lastActivity,
    isActive,
    size: totalSize
  };
}

/**
 * Match a project to a given path (checks if path starts with project path)
 */
export function matchProjectToPath(
  projects: ClaudeProject[], 
  targetPath: string
): ClaudeProject | null {
  return projects.find(project => 
    targetPath.startsWith(project.actualPath)
  ) || null;
}

/**
 * Sort projects by last activity (most recent first)
 */
export function sortProjectsByActivity(projects: ClaudeProject[]): ClaudeProject[] {
  return [...projects].sort((a, b) => {
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.getTime() - a.lastActivity.getTime();
  });
}

/**
 * Filter projects by activity within the last N days
 */
export function filterActiveProjects(projects: ClaudeProject[], days: number = 30): ClaudeProject[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return projects.filter(project => 
    project.lastActivity && project.lastActivity > cutoffDate
  );
}