import { ClaudeProject } from '../claude-core';
import { logger } from '../../utils/logger';
import path from 'path';
import fs from 'fs/promises';

export interface ReportOptions {
  timeframe: string;
  days: number;
  projects: ClaudeProject[];
}

export interface ReportData {
  timeframe: string;
  startDate: Date;
  endDate: Date;
  projects: ProjectReportData[];
  totalSessions: number;
  totalProjects: number;
}

export interface ProjectReportData {
  name: string;
  path: string;
  sessions: SessionData[];
  totalSessions: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
}

export interface SessionData {
  id: string;
  timestamp: Date;
  messageCount: number;
  duration?: number;
}

/**
 * Generate report data from selected projects and timeframe
 */
export async function generateReportData(options: ReportOptions): Promise<ReportData> {
  const { projects, days } = options;
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const projectReports: ProjectReportData[] = [];
  let totalSessions = 0;
  
  for (const project of projects) {
    const projectData = await analyzeProject(project, startDate, endDate);
    projectReports.push(projectData);
    totalSessions += projectData.totalSessions;
  }
  
  return {
    timeframe: options.timeframe,
    startDate,
    endDate,
    projects: projectReports,
    totalSessions,
    totalProjects: projects.length
  };
}

/**
 * Analyze a single project for the report
 */
async function analyzeProject(
  project: ClaudeProject, 
  startDate: Date, 
  endDate: Date
): Promise<ProjectReportData> {
  const sessions: SessionData[] = [];
  
  try {
    const files = await fs.readdir(project.claudePath);
    const sessionFiles = files.filter(f => f.endsWith('.jsonl'));
    
    for (const file of sessionFiles) {
      const filePath = path.join(project.claudePath, file);
      const stat = await fs.stat(filePath);
      
      // Check if file is within date range
      if (stat.mtime >= startDate && stat.mtime <= endDate) {
        // Extract session ID from filename
        const sessionId = file.replace('.jsonl', '');
        
        // Count messages (simplified - in real impl would parse JSONL)
        const messageCount = await countMessagesInSession(filePath);
        
        sessions.push({
          id: sessionId,
          timestamp: stat.mtime,
          messageCount
        });
      }
    }
    
    // Sort sessions by timestamp
    sessions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    return {
      name: project.name,
      path: project.actualPath,
      sessions,
      totalSessions: sessions.length,
      firstActivity: sessions.length > 0 ? sessions[0].timestamp : null,
      lastActivity: sessions.length > 0 ? sessions[sessions.length - 1].timestamp : null
    };
    
  } catch (error) {
    logger.error(`Error analyzing project ${project.name}:`, error);
    return {
      name: project.name,
      path: project.actualPath,
      sessions: [],
      totalSessions: 0,
      firstActivity: null,
      lastActivity: null
    };
  }
}

/**
 * Count messages in a session file
 */
async function countMessagesInSession(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    return lines.length;
  } catch {
    return 0;
  }
}

/**
 * Format report data for Claude Code command
 */
export function formatCommandArgs(data: ReportData): string {
  const projectPaths = data.projects.map(p => p.path).join(',');
  const args = [
    `--timeframe ${data.timeframe}`,
    `--projects "${projectPaths}"`,
    `--start-date ${data.startDate.toISOString()}`,
    `--end-date ${data.endDate.toISOString()}`,
    `--sessions ${data.totalSessions}`
  ];
  
  return args.join(' ');
}

/**
 * Generate a summary of the report data
 */
export function generateSummary(data: ReportData): string {
  const lines: string[] = [];
  
  lines.push(`Report Summary`);
  lines.push(`==============`);
  lines.push(`Timeframe: ${data.timeframe}`);
  lines.push(`Period: ${data.startDate.toLocaleDateString()} - ${data.endDate.toLocaleDateString()}`);
  lines.push(`Total Projects: ${data.totalProjects}`);
  lines.push(`Total Sessions: ${data.totalSessions}`);
  lines.push('');
  
  lines.push('Projects:');
  for (const project of data.projects) {
    lines.push(`  - ${project.name}: ${project.totalSessions} sessions`);
    if (project.firstActivity && project.lastActivity) {
      lines.push(`    First: ${project.firstActivity.toLocaleDateString()}`);
      lines.push(`    Last: ${project.lastActivity.toLocaleDateString()}`);
    }
  }
  
  return lines.join('\n');
}