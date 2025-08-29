import { colors, icons, box, progress, padRight, truncate, getTerminalWidth } from './styles';

interface Project {
  name: string;
  sessions: number;
  lastActivity: Date | string;
  isActive?: boolean;
  path?: string;
}

/**
 * Extract project name from a file path
 * e.g., "vibe-log" from path "/home/user/projects/vibe-log"
 */
export function parseProjectName(path: string): string {
  if (!path) return '';
  
  // Handle both Unix and Windows path separators
  const normalizedPath = path.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  // Return the last segment of the path as the project name
  return parts[parts.length - 1];
}

/**
 * Format relative time for last activity
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  
  // Handle invalid dates
  if (isNaN(then.getTime())) {
    return 'just now';
  }
  
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}

/**
 * Create an activity graph showing session distribution
 */
export function createActivityGraph(sessions: number, maxSessions: number, width: number = 20): string {
  // Validate inputs
  const safeSessions = Math.max(0, sessions);
  const safeMaxSessions = Math.max(1, maxSessions);
  const ratio = Math.min(1, safeSessions / safeMaxSessions);
  
  const filled = Math.floor(ratio * width);
  const graph = progress.full.repeat(filled) + progress.empty.repeat(width - filled);
  
  // Color based on activity level
  if (ratio > 0.75) return colors.success(graph);
  if (ratio > 0.5) return colors.primary(graph);
  if (ratio > 0.25) return colors.warning(graph);
  return colors.muted(graph);
}

/**
 * Create activity sparkline for recent sessions
 */
export function createSparkline(recentActivity: number[], maxValue?: number): string {
  const sparkChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = maxValue || Math.max(...recentActivity, 1);
  
  return recentActivity
    .map(value => {
      const index = Math.floor((value / max) * (sparkChars.length - 1));
      const char = sparkChars[Math.max(0, Math.min(index, sparkChars.length - 1))];
      
      // Color based on intensity
      if (value === 0) return colors.dim(char);
      if (index > 5) return colors.success(char);
      if (index > 2) return colors.primary(char);
      return colors.muted(char);
    })
    .join('');
}

/**
 * Create a beautiful ASCII table for project listing
 */
export function createProjectTable(projects: Project[]): string {
  const termWidth = Math.min(getTerminalWidth(), 120);
  const maxSessions = Math.max(...projects.map(p => p.sessions), 1);
  
  // Column widths
  const nameWidth = 30;
  const sessionsWidth = 12;
  const graphWidth = 20;
  const lastActivityWidth = 15;
  const statusWidth = 8;
  
  const lines: string[] = [];
  
  // Header with double-line box
  lines.push(colors.primary(box.doubleTopLeft + box.doubleHorizontal.repeat(termWidth - 2) + box.doubleTopRight));
  
  // Title
  const title = `${icons.folder} PROJECT OVERVIEW`;
  const titlePadding = Math.floor((termWidth - title.length - 4) / 2);
  lines.push(
    colors.primary(box.doubleVertical) + 
    ' '.repeat(titlePadding) + 
    colors.highlight(title) + 
    ' '.repeat(termWidth - titlePadding - title.length - 4) +
    colors.primary(box.doubleVertical)
  );
  
  // Header separator
  lines.push(
    colors.primary(box.tLeft + box.horizontal.repeat(termWidth - 2) + box.tRight)
  );
  
  // Column headers
  const headers = 
    colors.primary(box.vertical) + ' ' +
    colors.dim(padRight('PROJECT', nameWidth)) +
    colors.dim(padRight('SESSIONS', sessionsWidth)) +
    colors.dim(padRight('ACTIVITY', graphWidth)) +
    colors.dim(padRight('LAST SEEN', lastActivityWidth)) +
    colors.dim(padRight('STATUS', statusWidth)) +
    ' '.repeat(Math.max(0, termWidth - nameWidth - sessionsWidth - graphWidth - lastActivityWidth - statusWidth - 4)) +
    colors.primary(box.vertical);
  
  lines.push(headers);
  
  // Header underline
  lines.push(
    colors.primary(box.tLeft) +
    colors.dim(box.horizontal.repeat(termWidth - 2)) +
    colors.primary(box.tRight)
  );
  
  // Project rows
  projects.forEach((project, index) => {
    const isLast = index === projects.length - 1;
    
    // Project name with icon
    const projectName = truncate(project.name, nameWidth - 3);
    const nameDisplay = project.isActive 
      ? `${icons.fire} ${colors.highlight(projectName)}`
      : `${icons.folder} ${colors.primary(projectName)}`;
    
    // Session count with formatting
    const sessionDisplay = project.sessions > 99 
      ? colors.accent(`${project.sessions}+`)
      : project.sessions > 50
      ? colors.success(project.sessions.toString())
      : project.sessions > 10
      ? colors.primary(project.sessions.toString())
      : colors.muted(project.sessions.toString());
    
    // Activity graph
    const activityGraph = createActivityGraph(project.sessions, maxSessions, graphWidth);
    
    // Last activity with color coding
    const relativeTime = formatRelativeTime(project.lastActivity);
    const timeDisplay = relativeTime === 'just now'
      ? colors.success(relativeTime)
      : relativeTime.includes('m ago') || relativeTime.includes('h ago')
      ? colors.primary(relativeTime)
      : colors.muted(relativeTime);
    
    // Status indicator
    const status = project.isActive
      ? colors.success(`${icons.check} active`)
      : colors.muted(`${icons.clock} idle`);
    
    // Construct row
    const row = 
      colors.primary(box.vertical) + ' ' +
      padRight(nameDisplay, nameWidth + 15) + // Extra space for color codes
      padRight(sessionDisplay, sessionsWidth + 5) +
      padRight(activityGraph, graphWidth) +
      padRight(timeDisplay, lastActivityWidth + 5) +
      padRight(status, statusWidth + 10) +
      ' '.repeat(Math.max(0, termWidth - nameWidth - sessionsWidth - graphWidth - lastActivityWidth - statusWidth - 30)) +
      colors.primary(box.vertical);
    
    lines.push(row);
    
    // Add subtle separator between rows (except last)
    if (!isLast) {
      lines.push(
        colors.dim(box.tLeft + box.horizontal.repeat(termWidth - 2) + box.tRight)
      );
    }
  });
  
  // Footer
  lines.push(colors.primary(box.bottomLeft + box.horizontal.repeat(termWidth - 2) + box.bottomRight));
  
  // Summary statistics
  const totalSessions = projects.reduce((sum, p) => sum + p.sessions, 0);
  const activeProjects = projects.filter(p => p.isActive).length;
  
  lines.push('');
  lines.push(
    colors.dim('  Total: ') + 
    colors.highlight(`${projects.length} projects`) +
    colors.dim(' | ') +
    colors.highlight(`${totalSessions} sessions`) +
    colors.dim(' | ') +
    colors.success(`${activeProjects} active`)
  );
  
  return lines.join('\n');
}

/**
 * Create a compact project list for limited space
 */
export function createCompactProjectList(projects: Project[]): string {
  const lines: string[] = [];
  const maxSessions = Math.max(...projects.map(p => p.sessions), 1);
  
  projects.forEach(project => {
    const activity = createActivityGraph(project.sessions, maxSessions, 10);
    const time = formatRelativeTime(project.lastActivity);
    const icon = project.isActive ? icons.fire : icons.folder;
    
    lines.push(
      `${icon} ${colors.primary(padRight(project.name, 20))} ${activity} ${colors.dim(`(${project.sessions} sessions, ${time})`)}`
    );
  });
  
  return lines.join('\n');
}

/**
 * Create a detailed project card for single project display
 */
export function createProjectCard(project: Project, recentActivity?: number[]): string {
  const width = Math.min(getTerminalWidth(), 80);
  const lines: string[] = [];
  
  // Top border
  lines.push(colors.primary(box.topLeft + box.horizontal.repeat(width - 2) + box.topRight));
  
  // Project name header
  const headerText = ` ${icons.folder} ${project.name.toUpperCase()} `;
  const headerPadding = Math.floor((width - headerText.length) / 2);
  lines.push(
    colors.primary(box.vertical) +
    ' '.repeat(headerPadding) +
    colors.highlight(headerText) +
    ' '.repeat(width - headerPadding - headerText.length - 2) +
    colors.primary(box.vertical)
  );
  
  // Separator
  lines.push(colors.primary(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
  
  // Stats rows
  const stats = [
    { label: 'Sessions', value: project.sessions.toString(), icon: icons.chart },
    { label: 'Last Activity', value: formatRelativeTime(project.lastActivity), icon: icons.clock },
    { label: 'Status', value: project.isActive ? 'Active' : 'Idle', icon: project.isActive ? icons.fire : icons.clock },
  ];
  
  stats.forEach(stat => {
    const row = 
      colors.primary(box.vertical) + '  ' +
      colors.muted(stat.icon + '  ' + padRight(stat.label + ':', 15)) +
      colors.highlight(stat.value) +
      ' '.repeat(width - stat.label.length - stat.value.length - 22) +
      colors.primary(box.vertical);
    lines.push(row);
  });
  
  // Activity sparkline if provided
  if (recentActivity && recentActivity.length > 0) {
    lines.push(colors.primary(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
    
    const sparkline = createSparkline(recentActivity);
    const sparkRow = 
      colors.primary(box.vertical) + '  ' +
      colors.muted(icons.chart + '  Recent Activity: ') +
      sparkline +
      ' '.repeat(width - 20 - recentActivity.length - 4) +
      colors.primary(box.vertical);
    lines.push(sparkRow);
  }
  
  // Bottom border
  lines.push(colors.primary(box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight));
  
  return lines.join('\n');
}