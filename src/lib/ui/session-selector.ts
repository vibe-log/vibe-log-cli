import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { colors, padRight } from './styles';
import { formatDuration, createSpinner } from '../ui';
import { logger } from '../../utils/logger';
import { readClaudeSessions } from '../readers/claude';
import { formatRelativeTime, parseProjectName } from './project-display';

/**
 * Session identifier information for memory-efficient passing
 * Instead of passing full session data, we pass identifiers to re-read later
 */
export interface SelectedSessionInfo {
  projectPath: string;  // Claude folder path (e.g., ~/.claude/projects/-Users-danny-vibe-log)
  sessionFile: string;  // JSONL filename
  displayName: string;  // Project name for UI display
  duration: number;     // Duration in seconds for UI display
  timestamp: Date;      // Session timestamp for UI display
  messageCount: number; // Number of messages for UI display
}

interface SessionGroup {
  label: string;
  sessions: SessionInfo[];
}

interface SessionInfo {
  projectPath: string;
  sessionFile: string;
  displayName: string;
  summary?: string;     // Session title/summary if available
  duration: number;
  timestamp: Date;
  messageCount: number;
  timeRange: string;
}

/**
 * Show interactive session selector without requiring authentication
 * Reads sessions directly from ~/.claude/projects/
 * Returns session identifiers for memory-efficient processing
 */
export async function showSessionSelector(): Promise<SelectedSessionInfo[]> {
  const claudePath = path.join(os.homedir(), '.claude', 'projects');
  
  // Check if Claude directory exists
  try {
    await fs.access(claudePath);
  } catch {
    console.log(colors.warning('\nNo Claude Code sessions found.'));
    console.log(colors.subdued('Make sure you have used Claude Code at least once.'));
    return [];
  }
  
  // Show spinner while loading sessions
  const spinner = createSpinner('Looking for Claude Code sessions...').start();
  
  try {
    // Read all available sessions
    const allSessions = await readAvailableSessions(claudePath);
    
    if (allSessions.length === 0) {
      spinner.fail(colors.warning('No sessions found in the last 30 days.'));
      return [];
    }
    
    spinner.succeed(colors.success(`Found Claude Code sessions`));
    console.log('');
    
    // Group sessions by time period
    const grouped = groupSessionsByTime(allSessions);
    
    // Show selection UI with better formatting
    const { selectionMode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectionMode',
        message: 'How would you like to select sessions?',
        choices: [
          {
            name: `🕐 Analyze today's sessions (${getTodaySessionsInfo(grouped)})`,
            value: 'today',
            disabled: !hasTodaySessions(grouped) ? 'No sessions today' : false
          },
          {
            name: `🔍 Select specific sessions`,
            value: 'manual'
          },
          {
            name: `❌ Cancel`,
            value: 'cancel'
          }
        ]
      }
    ]);
    
    if (selectionMode === 'cancel') {
      return [];
    }
    
    if (selectionMode === 'today') {
      // Return all of today's sessions
      const todayGroup = grouped.find(g => g.label === 'Today');
      return todayGroup ? todayGroup.sessions : [];
    }
    
    // Manual selection mode
    return await selectSessionsManually(grouped);
  } catch (error) {
    spinner.fail(colors.error('Failed to load sessions'));
    logger.error('Error loading sessions:', error);
    return [];
  }
}

/**
 * Quick helper to select today's sessions only
 */
export async function selectTodaysSessions(): Promise<SelectedSessionInfo[]> {
  const claudePath = path.join(os.homedir(), '.claude', 'projects');
  
  try {
    await fs.access(claudePath);
  } catch {
    return [];
  }
  
  const spinner = createSpinner('Loading today\'s sessions...').start();
  
  try {
    const allSessions = await readAvailableSessions(claudePath);
    const grouped = groupSessionsByTime(allSessions);
    const todayGroup = grouped.find(g => g.label === 'Today');
    
    if (todayGroup && todayGroup.sessions.length > 0) {
      spinner.succeed(colors.success(`Found ${todayGroup.sessions.length} sessions today`));
    } else {
      spinner.info(colors.subdued('No sessions found today'));
    }
    
    return todayGroup ? todayGroup.sessions : [];
  } catch (error) {
    spinner.fail(colors.error('Failed to load sessions'));
    logger.error('Error loading today\'s sessions:', error);
    return [];
  }
}

/**
 * Read all available sessions from Claude projects directory
 */
async function readAvailableSessions(_claudePath: string): Promise<SessionInfo[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  try {
    // Use the optimized reader with date filtering
    const claudeSessions = await readClaudeSessions({ since: sevenDaysAgo });
    
    // Convert SessionData to SessionInfo format
    const sessions: SessionInfo[] = claudeSessions.map(session => {
      // Extract display name from project path
      const displayName = parseProjectName(session.projectPath);
      
      // Calculate time range from messages
      let timeRange = '';
      if (session.messages.length > 0) {
        const firstMsg = session.messages[0];
        const lastMsg = session.messages[session.messages.length - 1];
        timeRange = `${firstMsg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}-${lastMsg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // Extract summary if available (would need to be added to SessionData if needed)
      // For now, we'll leave it undefined
      const summary = undefined;
      
      return {
        projectPath: session.sourceFile?.claudeProjectPath || '',
        sessionFile: session.sourceFile?.sessionFile || '',
        displayName,
        summary,
        duration: session.duration,
        timestamp: session.timestamp,
        messageCount: session.messages.length,
        timeRange
      };
    }).filter(s => s.projectPath && s.sessionFile); // Filter out any sessions without source info
    
    // Sort by timestamp, newest first
    return sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  } catch (error) {
    logger.error('Error reading Claude sessions:', error);
    return [];
  }
}

/**
 * Group sessions by time period
 */
function groupSessionsByTime(sessions: SessionInfo[]): SessionGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const groups: SessionGroup[] = [
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'Last 7 days', sessions: [] },
    { label: 'Older', sessions: [] }
  ];
  
  for (const session of sessions) {
    if (session.timestamp >= today) {
      groups[0].sessions.push(session);
    } else if (session.timestamp >= yesterday) {
      groups[1].sessions.push(session);
    } else if (session.timestamp >= weekAgo) {
      groups[2].sessions.push(session);
    } else {
      groups[3].sessions.push(session);
    }
  }
  
  // Filter out empty groups
  return groups.filter(g => g.sessions.length > 0);
}

/**
 * Get summary info for today's sessions
 */
function getTodaySessionsInfo(groups: SessionGroup[]): string {
  const todayGroup = groups.find(g => g.label === 'Today');
  if (!todayGroup || todayGroup.sessions.length === 0) {
    return 'no sessions';
  }
  
  const sessionCount = todayGroup.sessions.length;
  
  return `${sessionCount} session${sessionCount !== 1 ? 's' : ''}`;
}

/**
 * Check if there are sessions today
 */
function hasTodaySessions(groups: SessionGroup[]): boolean {
  const todayGroup = groups.find(g => g.label === 'Today');
  return todayGroup ? todayGroup.sessions.length > 0 : false;
}

/**
 * Manual session selection with checkboxes
 */
async function selectSessionsManually(groups: SessionGroup[]): Promise<SelectedSessionInfo[]> {
  const choices: any[] = [];
  
  for (const group of groups) {
    // Calculate group totals
    const totalDuration = group.sessions.reduce((sum, s) => sum + s.duration, 0);
    const sessionCount = group.sessions.length;
    const sessionText = sessionCount === 1 ? 'session' : 'sessions';
    
    // Add enhanced group separator with counts
    const groupHeader = `── ${group.label} (${sessionCount} ${sessionText}, ${formatDuration(totalDuration)}) ──`;
    choices.push(new inquirer.Separator(colors.accent(`\n${groupHeader}`)));
    
    // Add table header for first group
    if (group === groups[0]) {
      const header = 
        colors.dim(padRight('Created', 12)) +
        colors.dim(padRight('Duration', 10)) +
        colors.dim(padRight('Messages', 10)) +
        colors.dim('Project');
      choices.push(new inquirer.Separator(header));
      choices.push(new inquirer.Separator(colors.dim('─'.repeat(50))));
    }
    
    // Add sessions in group
    for (const session of group.sessions) {
      // Format as single-line table row
      const label = 
        colors.subdued(padRight(formatRelativeTime(session.timestamp), 12)) +
        colors.accent(padRight(formatDuration(session.duration), 10)) +
        colors.dim(padRight(`${session.messageCount}`, 10)) +
        colors.primary(session.displayName);
      
      choices.push({
        name: label,
        value: session,
        checked: false
      });
    }
  }
  
  const { selected } = await inquirer.prompt({
    type: 'checkbox',
    name: 'selected',
    message: 'Select sessions to send (Space to select, Enter to confirm):',
    choices,
    pageSize: 15,
    loop: false,
    validate: (selections) => {
      if (Array.isArray(selections) && selections.length === 0) {
        return 'Please select at least one session';
      }
      return true;
    }
  });
  
  return selected;
}