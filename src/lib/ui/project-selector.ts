import { colors, icons, box, padRight, getTerminalWidth } from './styles';
import { formatRelativeTime, createActivityGraph } from './project-display';

export interface SelectableProject {
  id: string;
  name: string;
  path: string;
  sessions: number;
  lastActivity: Date | string;
  selected: boolean;
  isActive?: boolean;
}

export interface SelectorOptions {
  multiSelect?: boolean;
  showSearch?: boolean;
  showStats?: boolean;
  maxHeight?: number;
  title?: string;
  showTokenLimit?: boolean;
  tokenLimit?: number;
  estimateUsage?: boolean;
}

/**
 * Create a beautiful interactive project selector
 */
export function createProjectSelector(
  projects: SelectableProject[],
  cursorIndex: number,
  searchTerm: string = '',
  options: SelectorOptions = {}
): string {
  const width = Math.min(getTerminalWidth(), 100);
  const maxHeight = options.maxHeight || 20;
  const showSearch = options.showSearch !== false;
  const showStats = options.showStats !== false;
  const multiSelect = options.multiSelect !== false;
  
  const lines: string[] = [];
  
  // Header
  const title = options.title || 'SELECT PROJECTS';
  lines.push(colors.primary(box.doubleTopLeft + box.doubleHorizontal.repeat(width - 2) + box.doubleTopRight));
  
  const titleText = ` ${icons.folder} ${title} `;
  const titlePadding = Math.floor((width - titleText.length) / 2);
  lines.push(
    colors.primary(box.doubleVertical) +
    ' '.repeat(titlePadding) +
    colors.highlight(titleText) +
    ' '.repeat(width - titlePadding - titleText.length - 2) +
    colors.primary(box.doubleVertical)
  );
  
  // Search box
  if (showSearch) {
    lines.push(colors.primary(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
    
    const searchIcon = '🔍';
    const searchPrompt = searchTerm || 'Press / to filter...';
    const searchColor = searchTerm ? colors.highlight : colors.dim;
    
    const searchLine = 
      colors.primary(box.vertical) + '  ' +
      searchIcon + '  ' +
      searchColor(padRight(searchPrompt, width - 10)) + '  ' +
      colors.primary(box.vertical);
    
    lines.push(searchLine);
  }
  
  // Separator
  lines.push(colors.primary(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
  
  // Filter projects
  const filteredProjects = searchTerm
    ? projects.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.path.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : projects;
  
  // Calculate max sessions for activity graph
  const maxSessions = Math.max(...filteredProjects.map(p => p.sessions), 1);
  
  // Project list with scrolling
  const visibleStart = Math.max(0, Math.min(cursorIndex - Math.floor(maxHeight / 2), filteredProjects.length - maxHeight));
  const visibleEnd = Math.min(visibleStart + maxHeight, filteredProjects.length);
  const visibleProjects = filteredProjects.slice(visibleStart, visibleEnd);
  
  // Column headers
  if (showStats) {
    const headers = 
      colors.primary(box.vertical) + '  ' +
      colors.dim(padRight('', 3)) + // Checkbox column
      colors.dim(padRight('PROJECT', 30)) +
      colors.dim(padRight('SESSIONS', 10)) +
      colors.dim(padRight('', 25)) +
      colors.dim(padRight('LAST ACTIVITY', 15)) +
      '  ' + colors.primary(box.vertical);
    
    lines.push(headers);
    lines.push(colors.dim(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
  }
  
  // Project rows
  visibleProjects.forEach((project, index) => {
    const globalIndex = visibleStart + index;
    const isCursor = globalIndex === cursorIndex;
    
    let row = colors.primary(box.vertical) + ' ';
    
    // Cursor indicator
    if (isCursor) {
      row += colors.accent('▶ ');
    } else {
      row += '  ';
    }
    
    // Checkbox for multi-select
    if (multiSelect) {
      const checkbox = project.selected 
        ? colors.success('[✓]')
        : colors.muted('[ ]');
      row += checkbox + ' ';
    }
    
    // Project name with activity indicator
    const nameIcon = project.isActive ? icons.fire : icons.folder;
    const nameColor = isCursor 
      ? colors.highlight
      : project.isActive 
      ? colors.success
      : colors.primary;
    const projectName = project.name.length > 26 ? project.name.substring(0, 26) + '...' : project.name;
    row += nameIcon + ' ' + nameColor(padRight(projectName, 27)) + ' ';
    
    if (showStats) {
      // Session count with color coding
      const sessionColor = project.sessions > 50 
        ? colors.success
        : project.sessions > 10
        ? colors.primary
        : colors.muted;
      const sessionText = project.sessions.toString();
      row += sessionColor(padRight(sessionText, 10));
      
      // Activity graph
      const activityBar = createActivityGraph(project.sessions, maxSessions, 20);
      row += activityBar + '    ';
      
      // Last activity
      const timeText = formatRelativeTime(project.lastActivity);
      const timeColor = timeText === 'just now'
        ? colors.success
        : timeText.includes('h ago')
        ? colors.primary
        : colors.muted;
      row += timeColor(padRight(timeText, 15));
    } else {
      // Compact view - just name and basic info
      const info = colors.dim(` (${project.sessions} sessions)`);
      row += info;
    }
    
    // Pad to width
    // eslint-disable-next-line no-control-regex
    const cleanRow = row.replace(/\u001b\[[0-9;]*m/g, '');
    const padding = Math.max(0, width - cleanRow.length - 3);
    row += ' '.repeat(padding) + ' ' + colors.primary(box.vertical);
    
    lines.push(row);
  });
  
  // Scroll indicator if needed
  if (filteredProjects.length > maxHeight) {
    lines.push(colors.dim(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
    
    const scrollInfo = `Showing ${visibleStart + 1}-${visibleEnd} of ${filteredProjects.length}`;
    const scrollBar = createScrollBar(cursorIndex, filteredProjects.length, 20);
    const scrollLine = 
      colors.primary(box.vertical) + '  ' +
      colors.dim(scrollInfo) + '  ' +
      scrollBar +
      ' '.repeat(width - scrollInfo.length - 28) +
      colors.primary(box.vertical);
    
    lines.push(scrollLine);
  }
  
  // Token usage estimate (cloud mode)
  if (options.showTokenLimit && options.tokenLimit && options.estimateUsage) {
    lines.push(colors.dim(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
    
    // Calculate total monthly estimate for selected projects
    const selectedProjects = projects.filter(p => p.selected);
    let totalMonthlyEstimate = 0;
    
    // Check if projects have monthlyEstimate property
    selectedProjects.forEach(p => {
      if ('monthlyEstimate' in p) {
        totalMonthlyEstimate += (p as any).monthlyEstimate;
      } else {
        // Fallback: estimate as weekly average × 4.3
        const weeklyAvg = Math.round(p.sessions / 4.3);
        totalMonthlyEstimate += Math.round(weeklyAvg * 4.3);
      }
    });
    
    const usageColor = totalMonthlyEstimate <= options.tokenLimit 
      ? colors.success
      : totalMonthlyEstimate <= options.tokenLimit * 1.2
      ? colors.warning
      : colors.error;
    
    const usageText = `Estimated: ${totalMonthlyEstimate} sessions/month`;
    const limitText = `Limit: ${options.tokenLimit}/month`;
    const statusIcon = totalMonthlyEstimate <= options.tokenLimit ? icons.success : icons.warning;
    
    const usageLine = 
      colors.primary(box.vertical) + '  ' +
      statusIcon + '  ' +
      usageColor(usageText) + '  ' +
      colors.dim('|') + '  ' +
      colors.muted(limitText) +
      ' '.repeat(Math.max(0, width - usageText.length - limitText.length - 15)) +
      colors.primary(box.vertical);
    
    lines.push(usageLine);
  }
  
  // Bottom border
  lines.push(colors.primary(box.doubleBottomLeft + box.doubleHorizontal.repeat(width - 2) + box.doubleBottomRight));
  
  // Selection summary
  const selectedCount = projects.filter(p => p.selected).length;
  if (multiSelect) {
    lines.push('');
    lines.push(
      colors.dim('  Selected: ') +
      colors.highlight(`${selectedCount} project${selectedCount !== 1 ? 's' : ''}`) +
      colors.dim(' | ') +
      colors.muted('Space: toggle') +
      colors.dim(' | ') +
      colors.muted('A: select all') +
      colors.dim(' | ') +
      colors.muted('Enter: confirm')
    );
  } else {
    lines.push('');
    lines.push(
      colors.dim('  Navigate: ') +
      colors.muted('↑↓') +
      colors.dim(' | ') +
      colors.muted('Search: /') +
      colors.dim(' | ') +
      colors.muted('Select: Enter') +
      colors.dim(' | ') +
      colors.muted('Cancel: Esc')
    );
  }
  
  return lines.join('\n');
}

/**
 * Create a scroll bar indicator
 */
function createScrollBar(position: number, total: number, width: number = 10): string {
  const ratio = position / Math.max(total - 1, 1);
  const indicatorPosition = Math.floor(ratio * (width - 1));
  
  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i === indicatorPosition) {
      bar += colors.accent('●');
    } else {
      bar += colors.dim('─');
    }
  }
  
  return `[${bar}]`;
}


/**
 * Create a project detail card for selection preview
 */
export function createProjectPreview(project: SelectableProject): string {
  const width = Math.min(getTerminalWidth(), 50);
  const lines: string[] = [];
  
  // Border and title
  lines.push(colors.accent(box.topLeft + box.horizontal.repeat(width - 2) + box.topRight));
  
  const title = ` ${icons.info} PROJECT DETAILS `;
  const titlePadding = Math.floor((width - title.length) / 2);
  lines.push(
    colors.accent(box.vertical) +
    ' '.repeat(titlePadding) +
    colors.highlight(title) +
    ' '.repeat(width - titlePadding - title.length - 2) +
    colors.accent(box.vertical)
  );
  
  lines.push(colors.accent(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
  
  // Details
  const details = [
    { label: 'Name', value: project.name, icon: icons.folder },
    { label: 'Path', value: project.path, icon: icons.file },
    { label: 'Sessions', value: project.sessions.toString(), icon: icons.chart },
    { label: 'Last Active', value: formatRelativeTime(project.lastActivity), icon: icons.clock },
    { label: 'Status', value: project.isActive ? 'Active' : 'Idle', icon: project.isActive ? icons.fire : icons.clock },
  ];
  
  details.forEach(detail => {
    const line = 
      colors.accent(box.vertical) + '  ' +
      detail.icon + '  ' +
      colors.muted(padRight(detail.label + ':', 12)) +
      colors.primary(detail.value) +
      ' '.repeat(Math.max(0, width - detail.label.length - detail.value.length - 20)) +
      colors.accent(box.vertical);
    
    lines.push(line);
  });
  
  // Bottom border
  lines.push(colors.accent(box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight));
  
  return lines.join('\n');
}

/**
 * Create a bulk action menu
 */
export function createBulkActionMenu(
  selectedCount: number,
  actions: Array<{ id: string; label: string; icon?: string; dangerous?: boolean }>
): string {
  const width = Math.min(getTerminalWidth(), 60);
  const lines: string[] = [];
  
  // Header
  const borderColor = colors.warning;
  lines.push(borderColor(box.doubleTopLeft + box.doubleHorizontal.repeat(width - 2) + box.doubleTopRight));
  
  const title = ` ${icons.sparkles} BULK ACTIONS (${selectedCount} selected) `;
  const titlePadding = Math.floor((width - title.length) / 2);
  lines.push(
    borderColor(box.doubleVertical) +
    ' '.repeat(titlePadding) +
    colors.highlight(title) +
    ' '.repeat(width - titlePadding - title.length - 2) +
    borderColor(box.doubleVertical)
  );
  
  lines.push(borderColor(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
  
  // Actions
  actions.forEach((action, index) => {
    const icon = action.icon || icons.bullet;
    const color = action.dangerous ? colors.error : colors.primary;
    const key = (index + 1).toString();
    
    const actionLine = 
      borderColor(box.vertical) + '  ' +
      colors.muted(`[${key}]`) + ' ' +
      icon + '  ' +
      color(action.label) +
      ' '.repeat(Math.max(0, width - action.label.length - 12)) +
      borderColor(box.vertical);
    
    lines.push(actionLine);
  });
  
  // Bottom
  lines.push(borderColor(box.doubleBottomLeft + box.doubleHorizontal.repeat(width - 2) + box.doubleBottomRight));
  
  return lines.join('\n');
}