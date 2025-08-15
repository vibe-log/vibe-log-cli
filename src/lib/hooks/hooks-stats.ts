import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';

/**
 * Hook execution statistics
 */
export interface HookStats {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  lastExecution?: Date;
  lastSuccess?: Date;
  lastFailure?: Date;
  averageDuration?: number;
  durations: number[];
  projects: Map<string, number>;
}

/**
 * Hook statistics storage
 */
export interface HooksStatsData {
  version: string;
  sessionStartHook: HookStats;
  preCompactHook: HookStats;
  stopHook?: HookStats; // Keep for backward compatibility
  lastUpdated: Date;
}

/**
 * Hook execution record
 */
export interface HookExecution {
  hookType: 'sessionstart' | 'precompact' | 'stop'; // Keep 'stop' for backward compat
  timestamp: Date;
  success: boolean;
  duration: number;
  project?: string;
  messagesCount?: number;
  error?: string;
}

/**
 * Get the path to the hooks statistics file
 */
function getStatsPath(): string {
  const homedir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homedir, '.vibe-log', 'hooks-stats.json');
}

/**
 * Initialize empty stats
 */
function createEmptyStats(): HookStats {
  return {
    totalExecutions: 0,
    successCount: 0,
    failureCount: 0,
    durations: [],
    projects: new Map()
  };
}

/**
 * Load hook statistics
 */
export async function loadHookStats(): Promise<HooksStatsData> {
  const statsPath = getStatsPath();
  
  try {
    const data = await fs.readFile(statsPath, 'utf-8');
    const parsed = JSON.parse(data);
    
    // Migrate from stopHook to sessionStartHook if needed
    if (parsed.stopHook && !parsed.sessionStartHook) {
      parsed.sessionStartHook = parsed.stopHook;
      logger.debug('Migrated stopHook stats to sessionStartHook');
    }
    
    // Convert dates and maps for sessionStartHook
    if (parsed.sessionStartHook) {
      if (parsed.sessionStartHook.lastExecution) parsed.sessionStartHook.lastExecution = new Date(parsed.sessionStartHook.lastExecution);
      if (parsed.sessionStartHook.lastSuccess) parsed.sessionStartHook.lastSuccess = new Date(parsed.sessionStartHook.lastSuccess);
      if (parsed.sessionStartHook.lastFailure) parsed.sessionStartHook.lastFailure = new Date(parsed.sessionStartHook.lastFailure);
      parsed.sessionStartHook.projects = new Map(Object.entries(parsed.sessionStartHook.projects || {}));
    }
    
    // Convert dates and maps for preCompactHook
    if (parsed.preCompactHook) {
      if (parsed.preCompactHook.lastExecution) parsed.preCompactHook.lastExecution = new Date(parsed.preCompactHook.lastExecution);
      if (parsed.preCompactHook.lastSuccess) parsed.preCompactHook.lastSuccess = new Date(parsed.preCompactHook.lastSuccess);
      if (parsed.preCompactHook.lastFailure) parsed.preCompactHook.lastFailure = new Date(parsed.preCompactHook.lastFailure);
      parsed.preCompactHook.projects = new Map(Object.entries(parsed.preCompactHook.projects || {}));
    }
    
    if (parsed.lastUpdated) parsed.lastUpdated = new Date(parsed.lastUpdated);
    
    // Ensure sessionStartHook exists
    if (!parsed.sessionStartHook) {
      parsed.sessionStartHook = createEmptyStats();
    }
    
    return parsed;
  } catch (error) {
    logger.debug('No existing stats file, creating new one');
    return {
      version: '2.0.0',
      sessionStartHook: createEmptyStats(),
      preCompactHook: createEmptyStats(),
      lastUpdated: new Date()
    };
  }
}

/**
 * Save hook statistics
 */
export async function saveHookStats(stats: HooksStatsData): Promise<void> {
  const statsPath = getStatsPath();
  const statsDir = path.dirname(statsPath);
  
  // Ensure directory exists
  await fs.mkdir(statsDir, { recursive: true });
  
  // Convert maps to objects for JSON serialization
  const toSave: any = {
    ...stats,
    sessionStartHook: {
      ...stats.sessionStartHook,
      projects: Object.fromEntries(stats.sessionStartHook.projects)
    },
    preCompactHook: {
      ...stats.preCompactHook,
      projects: Object.fromEntries(stats.preCompactHook.projects)
    },
    lastUpdated: new Date()
  };
  
  // Remove old stopHook if present
  delete toSave.stopHook;
  
  // Write atomically
  const tempPath = `${statsPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(toSave, null, 2));
  await fs.rename(tempPath, statsPath);
  
  logger.debug('Hook statistics saved');
}

/**
 * Record a hook execution
 */
export async function recordHookExecution(execution: HookExecution): Promise<void> {
  const stats = await loadHookStats();
  
  // Map 'stop' to 'sessionstart' for backward compatibility
  const hookType = execution.hookType === 'stop' ? 'sessionstart' : execution.hookType;
  const hookStats = hookType === 'sessionstart' ? stats.sessionStartHook : stats.preCompactHook;
  
  // Update counts
  hookStats.totalExecutions++;
  if (execution.success) {
    hookStats.successCount++;
    hookStats.lastSuccess = execution.timestamp;
  } else {
    hookStats.failureCount++;
    hookStats.lastFailure = execution.timestamp;
  }
  
  // Update last execution
  hookStats.lastExecution = execution.timestamp;
  
  // Track duration (keep last 100)
  hookStats.durations.push(execution.duration);
  if (hookStats.durations.length > 100) {
    hookStats.durations.shift();
  }
  
  // Calculate average duration
  if (hookStats.durations.length > 0) {
    const sum = hookStats.durations.reduce((a, b) => a + b, 0);
    hookStats.averageDuration = sum / hookStats.durations.length;
  }
  
  // Track project
  if (execution.project) {
    const count = hookStats.projects.get(execution.project) || 0;
    hookStats.projects.set(execution.project, count + 1);
  }
  
  await saveHookStats(stats);
}

/**
 * Get statistics for the last N days
 */
export async function getRecentStats(days: number = 7): Promise<{
  sessionStartHook: { total: number; success: number; failure: number; successRate: number };
  preCompactHook: { total: number; success: number; failure: number; successRate: number };
}> {
  const stats = await loadHookStats();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  // For now, return all-time stats (in future, could filter by date)
  const sessionStartSuccessRate = stats.sessionStartHook.totalExecutions > 0
    ? (stats.sessionStartHook.successCount / stats.sessionStartHook.totalExecutions) * 100
    : 0;
  
  const preCompactSuccessRate = stats.preCompactHook.totalExecutions > 0
    ? (stats.preCompactHook.successCount / stats.preCompactHook.totalExecutions) * 100
    : 0;
  
  return {
    sessionStartHook: {
      total: stats.sessionStartHook.totalExecutions,
      success: stats.sessionStartHook.successCount,
      failure: stats.sessionStartHook.failureCount,
      successRate: sessionStartSuccessRate
    },
    preCompactHook: {
      total: stats.preCompactHook.totalExecutions,
      success: stats.preCompactHook.successCount,
      failure: stats.preCompactHook.failureCount,
      successRate: preCompactSuccessRate
    }
  };
}

/**
 * Get top projects by hook executions
 */
export async function getTopProjects(limit: number = 5): Promise<Array<{ project: string; count: number }>> {
  const stats = await loadHookStats();
  
  // Combine projects from both hooks
  const combinedProjects = new Map<string, number>();
  
  for (const [project, count] of stats.sessionStartHook.projects) {
    combinedProjects.set(project, count);
  }
  
  for (const [project, count] of stats.preCompactHook.projects) {
    const existing = combinedProjects.get(project) || 0;
    combinedProjects.set(project, existing + count);
  }
  
  // Sort and return top projects
  const sorted = Array.from(combinedProjects.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([project, count]) => ({ project, count }));
  
  return sorted;
}

/**
 * Clear hook statistics
 */
export async function clearHookStats(): Promise<void> {
  const statsPath = getStatsPath();
  
  try {
    await fs.unlink(statsPath);
    logger.info('Hook statistics cleared');
  } catch (error) {
    logger.debug('No statistics file to clear');
  }
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) {
    return 'just now';
  } else if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}