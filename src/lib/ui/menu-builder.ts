import { colors, icons, box, padRight, getTerminalWidth } from './styles';

export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  action?: string;  // Changed from function to string for action name
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: MenuItem[];
}

export interface MenuContext {
  state: string;  // SetupState from detector
  isAuthenticated: boolean;
  hasAgents?: boolean;
  hasHooks?: boolean;
  projectCount?: number;
  sessionCount?: number;
  lastSync?: Date;
  agentCount?: number;
  totalAgents?: number;
}

/**
 * Generate consistent agent management label based on status
 */
function getAgentManageLabel(agentCount?: number, totalAgents?: number): string {
  if (agentCount !== undefined && totalAgents !== undefined) {
    return `${icons.package} Manage local sub-agents (${agentCount}/${totalAgents} installed)`;
  }
  return `${icons.package} Manage local sub-agents`;
}


/**
 * Generate context-aware menu items based on current state
 */
export function generateMenuItems(context: MenuContext): MenuItem[] {
  const items: MenuItem[] = [];
  
  // FIRST_TIME is now handled by the welcome screen in main-menu.ts
  // For ERROR state, show recovery options
  if (context.state === 'ERROR') {
    items.push({
      id: 'retry-setup',
      label: `${icons.refresh} Retry setup`,
      description: 'Try setting up vibe-log again',
      icon: '',
      action: 'auth'
    });
    items.push({
      id: 'auth',
      label: `${icons.sparkles} Try cloud mode`,
      description: 'Authenticate with GitHub',
      icon: '',
      action: 'auth'
    });
    items.push({ separator: true } as MenuItem);
    items.push({
      id: 'help',
      label: `${icons.info} Get help`,
      description: 'Documentation and troubleshooting',
      icon: '',
      action: 'help'
    });
    return items;
  }
  
  // For LOCAL_ONLY state
  if (context.state === 'LOCAL_ONLY') {
    items.push({
      id: 'switch-cloud',
      label: `${icons.sparkles} Switch to cloud mode`,
      action: 'switch-cloud'
    });
    
    items.push({
      id: 'status-line',
      label: `📊 Prompt quality status line`,
      description: 'Real-time prompt feedback in Claude Code',
      action: 'status-line'
    });
    
    items.push({
      id: 'report',
      label: `${icons.chart} Generate local report (using Claude sub-agents)`,
      action: 'report'
    });
    
    items.push({
      id: 'install-agents',
      label: getAgentManageLabel(context.agentCount, context.totalAgents),
      action: 'install-agents'
    });
  }
  
  // For CLOUD states
  if (context.state === 'CLOUD_AUTO' || context.state === 'CLOUD_MANUAL' || context.state === 'CLOUD_ONLY') {
    // Cloud actions at the top
    items.push({
      id: 'dashboard',
      label: `${icons.sparkles} Open vibe-log web dashboard`,
      action: 'dashboard'
    });

    // Always show manual sync option for all cloud states
    items.push({
      id: 'manual-sync',
      label: `📤 Manual sync (upload) coding sessions to cloud`,
      action: 'manual-sync'
    });
    
    items.push({
      id: 'manage-hooks',
      label: `${icons.refresh} Configure auto-sync (Claude Code hooks)`,
      description: context.hasHooks ? 'Configure Claude Code hooks' : 'Install and configure hooks',
      action: 'manage-hooks'
    });
    
    items.push({
      id: 'status-line',
      label: `📊 Prompt quality status line`,
      description: 'Real-time prompt feedback in Claude Code',
      action: 'status-line'
    });

    // Separator between cloud and local actions
    items.push({ separator: true } as MenuItem);
    
    // Local actions
    items.push({
      id: 'report',
      label: `${icons.chart} Generate local report (using Claude sub-agents)`,
      action: 'report'
    });
    
    // Note: Local static analysis only available in offline mode
    // Always show agent installation option in cloud mode
    items.push({
      id: 'install-agents',
      label: getAgentManageLabel(context.agentCount, context.totalAgents),
      action: 'install-agents'
    });
    
    items.push({ separator: true } as MenuItem);
    items.push({
      id: 'logout',
      label: `${icons.unlock} Logout`,
      action: 'logout'
    });
  }
  
  // For PARTIAL_SETUP state - no menu items needed
  // This state will be handled by showing the first-time welcome screen
  if (context.state === 'PARTIAL_SETUP') {
    // Return empty items - main-menu.ts will handle this by showing welcome screen
    return [];
  }
  
  // Common items for all states (except initial)
  if (context.state !== 'FIRST_TIME') {
    items.push({ separator: true } as MenuItem);
    items.push({
      id: 'help',
      label: `${icons.info} Help`,
      action: 'help'
    });
  }
  
  return items;
}

/**
 * Create a beautiful interactive menu display
 */
export function createMenu(
  items: MenuItem[],
  selectedIndex: number = 0,
  options?: {
    title?: string;
    width?: number;
    showShortcuts?: boolean;
    showDescriptions?: boolean;
    style?: 'compact' | 'detailed' | 'centered';
  }
): string {
  const width = options?.width || Math.min(getTerminalWidth(), 80);
  const showShortcuts = options?.showShortcuts !== false;
  const showDescriptions = options?.showDescriptions !== false;
  const style = options?.style || 'detailed';
  
  const lines: string[] = [];
  
  // Title
  if (options?.title) {
    const titleText = ` ${icons.sparkles} ${options.title} ${icons.sparkles} `;
    // eslint-disable-next-line no-control-regex
    const titleWidth = titleText.replace(/\u001b\[[0-9;]*m/g, '').length;
    const padding = Math.floor((width - titleWidth) / 2);
    
    lines.push(colors.primary(box.topLeft + box.horizontal.repeat(width - 2) + box.topRight));
    lines.push(
      colors.primary(box.vertical) +
      ' '.repeat(padding) +
      colors.highlight(titleText) +
      ' '.repeat(width - padding - titleWidth - 2) +
      colors.primary(box.vertical)
    );
    lines.push(colors.primary(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
  }
  
  // Menu items
  let currentIndex = 0;
  items.forEach((item) => {
    if (item.separator) {
      // Separator line
      lines.push(
        colors.dim(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight)
      );
      return;
    }
    
    const isSelected = currentIndex === selectedIndex;
    currentIndex++;
    
    // Build item display
    let itemLine = '';
    
    // Selection indicator
    if (isSelected) {
      itemLine += colors.accent('▶ ');
    } else {
      itemLine += '  ';
    }
    
    // Icon
    if (item.icon) {
      itemLine += item.icon + '  ';
    }
    
    // Label
    const labelColor = item.disabled 
      ? colors.dim
      : isSelected 
      ? colors.highlight
      : colors.primary;
    itemLine += labelColor(item.label);
    
    // Shortcut
    if (showShortcuts && item.shortcut) {
      const shortcutText = ` [${item.shortcut}]`;
      itemLine += colors.muted(shortcutText);
    }
    
    // Submenu indicator
    if (item.submenu) {
      itemLine += colors.muted(' ▶');
    }
    
    // Add to lines
    if (style === 'detailed' && showDescriptions && item.description) {
      // Two-line format with description
      const paddedLine = padRight(itemLine, width - 4);
      lines.push(
        colors.primary(box.vertical) + ' ' +
        paddedLine + ' ' +
        colors.primary(box.vertical)
      );
      
      const descLine = '    ' + colors.dim(item.description);
      const paddedDesc = padRight(descLine, width - 4);
      lines.push(
        colors.primary(box.vertical) + ' ' +
        paddedDesc + ' ' +
        colors.primary(box.vertical)
      );
    } else {
      // Single-line format
      const paddedLine = padRight(itemLine, width - 4);
      lines.push(
        colors.primary(box.vertical) + ' ' +
        paddedLine + ' ' +
        colors.primary(box.vertical)
      );
    }
  });
  
  // Bottom border
  lines.push(colors.primary(box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight));
  
  // Navigation hints
  if (style !== 'compact') {
    lines.push('');
    lines.push(
      colors.dim('  Navigate: ') +
      colors.muted('↑↓') +
      colors.dim(' Select: ') +
      colors.muted('Enter') +
      colors.dim(' Back: ') +
      colors.muted('Esc') +
      colors.dim(' Quit: ') +
      colors.muted('q')
    );
  }
  
  return lines.join('\n');
}

/**
 * Create a breadcrumb navigation display
 */
export function createBreadcrumb(path: string[]): string {
  const parts = path.map((part, index) => {
    const isLast = index === path.length - 1;
    const text = isLast ? colors.highlight(part) : colors.muted(part);
    const separator = isLast ? '' : colors.dim(' › ');
    return text + separator;
  });
  
  return `${icons.folder} ${parts.join('')}`;
}

/**
 * Create a command palette style menu
 */
export function createCommandPalette(
  items: MenuItem[],
  searchTerm: string = '',
  selectedIndex: number = 0
): string {
  const width = Math.min(getTerminalWidth(), 60);
  const lines: string[] = [];
  
  // Search box
  lines.push(colors.primary(box.topLeft + box.horizontal.repeat(width - 2) + box.topRight));
  
  const searchLine = 
    colors.primary(box.vertical) + ' ' +
    icons.search + '  ' +
    colors.highlight(searchTerm) +
    colors.dim('|') +
    ' '.repeat(width - searchTerm.length - 8) +
    colors.primary(box.vertical);
  lines.push(searchLine);
  
  lines.push(colors.primary(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
  
  // Filtered items
  const filteredItems = searchTerm
    ? items.filter(item => 
        !item.separator && 
        item.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : items.filter(item => !item.separator);
  
  // Show up to 10 items
  const visibleItems = filteredItems.slice(0, 10);
  
  visibleItems.forEach((item, index) => {
    const isSelected = index === selectedIndex;
    
    let itemLine = isSelected ? colors.accent('▶ ') : '  ';
    
    if (item.icon) {
      itemLine += item.icon + '  ';
    }
    
    // Highlight matching parts
    if (searchTerm) {
      const regex = new RegExp(`(${searchTerm})`, 'gi');
      const highlighted = item.label.replace(regex, colors.accent('$1'));
      itemLine += isSelected ? colors.highlight(highlighted) : highlighted;
    } else {
      itemLine += isSelected ? colors.highlight(item.label) : colors.primary(item.label);
    }
    
    if (item.shortcut) {
      itemLine += colors.dim(` [${item.shortcut}]`);
    }
    
    const paddedLine = padRight(itemLine, width - 4);
    lines.push(
      colors.primary(box.vertical) + ' ' +
      paddedLine + ' ' +
      colors.primary(box.vertical)
    );
  });
  
  // Results count
  if (filteredItems.length > 10) {
    const moreText = `... and ${filteredItems.length - 10} more`;
    const paddedMore = padRight('  ' + colors.dim(moreText), width - 4);
    lines.push(
      colors.primary(box.vertical) + ' ' +
      paddedMore + ' ' +
      colors.primary(box.vertical)
    );
  }
  
  // Bottom border
  lines.push(colors.primary(box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight));
  
  return lines.join('\n');
}

/**
 * Create a confirmation dialog
 */
export function createConfirmDialog(
  message: string,
  options?: {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    dangerous?: boolean;
  }
): string {
  const width = Math.min(getTerminalWidth(), 60);
  const lines: string[] = [];
  
  const title = options?.title || 'Confirm';
  const confirmText = options?.confirmText || 'Yes';
  const cancelText = options?.cancelText || 'No';
  const borderColor = options?.dangerous ? colors.error : colors.warning;
  
  // Top border
  lines.push(borderColor(box.doubleTopLeft + box.doubleHorizontal.repeat(width - 2) + box.doubleTopRight));
  
  // Title
  const titleIcon = options?.dangerous ? icons.warning : icons.info;
  const titleLine = ` ${titleIcon} ${title} `;
  const titlePadding = Math.floor((width - titleLine.length) / 2);
  lines.push(
    borderColor(box.doubleVertical) +
    ' '.repeat(titlePadding) +
    colors.highlight(titleLine) +
    ' '.repeat(width - titlePadding - titleLine.length - 2) +
    borderColor(box.doubleVertical)
  );
  
  lines.push(borderColor(box.tLeft + box.horizontal.repeat(width - 2) + box.tRight));
  
  // Message (word-wrapped)
  const words = message.split(' ');
  let currentLine = '';
  const maxLineLength = width - 6;
  
  words.forEach(word => {
    if ((currentLine + word).length > maxLineLength) {
      const paddedLine = padRight('  ' + currentLine, width - 4);
      lines.push(
        borderColor(box.vertical) + ' ' +
        colors.primary(paddedLine) + ' ' +
        borderColor(box.vertical)
      );
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  });
  
  if (currentLine.trim()) {
    const paddedLine = padRight('  ' + currentLine.trim(), width - 4);
    lines.push(
      borderColor(box.vertical) + ' ' +
      colors.primary(paddedLine) + ' ' +
      borderColor(box.vertical)
    );
  }
  
  // Spacer
  lines.push(
    borderColor(box.vertical) + ' '.repeat(width - 2) + borderColor(box.vertical)
  );
  
  // Options
  const optionsLine = 
    `  ${colors.success(`[Y] ${confirmText}`)}    ${colors.error(`[N] ${cancelText}`)}`;
  const optionsPadding = Math.floor((width - 20) / 2);
  lines.push(
    borderColor(box.vertical) +
    ' '.repeat(optionsPadding) +
    optionsLine +
    ' '.repeat(width - optionsPadding - 20 - 2) +
    borderColor(box.vertical)
  );
  
  // Bottom border
  lines.push(borderColor(box.doubleBottomLeft + box.doubleHorizontal.repeat(width - 2) + box.doubleBottomRight));
  
  return lines.join('\n');
}