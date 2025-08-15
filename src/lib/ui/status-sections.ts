import { colors, icons, box, getTerminalWidth } from './styles';

interface CloudStatus {
  connected: boolean;
  hooksEnabled: boolean;
  syncStatus: 'synced' | 'syncing' | 'error' | 'offline';
  lastSync?: Date;
  lastSyncProject?: string;
  pendingChanges?: number;
  trackingMode?: 'all' | 'selected' | 'none';
  trackedProjectCount?: number;
}

interface LocalEngine {
  installStatus: 'installed' | 'partial' | 'not-installed';
  subAgentsInstalled: number;
  totalSubAgents: number;
  configPath?: string;
}


/**
 * Create a beautiful section box with title and content
 */
export function createSection(
  title: string,
  content: string[],
  options?: {
    width?: number;
    icon?: string;
    style?: 'single' | 'double' | 'rounded';
    color?: typeof colors[keyof typeof colors];
  }
): string {
  const width = options?.width || Math.min(getTerminalWidth(), 80);
  const icon = options?.icon || icons.bullet;
  const style = options?.style || 'single';
  const color = options?.color || colors.primary;
  
  const lines: string[] = [];
  
  // Select box characters based on style
  const chars = style === 'double' 
    ? {
        tl: box.doubleTopLeft,
        tr: box.doubleTopRight,
        bl: box.doubleBottomLeft,
        br: box.doubleBottomRight,
        h: box.doubleHorizontal,
        v: box.doubleVertical,
      }
    : {
        tl: box.topLeft,
        tr: box.topRight,
        bl: box.bottomLeft,
        br: box.bottomRight,
        h: box.horizontal,
        v: box.vertical,
      };
  
  // Top border with title
  const titleText = ` ${icon} ${title} `;
  const titleLength = titleText.replace(/\x1b\[[0-9;]*m/g, '').length;
  const leftPadding = 3;
  const rightPadding = width - titleLength - leftPadding - 2;
  
  lines.push(
    color(chars.tl + chars.h.repeat(leftPadding)) +
    colors.highlight(titleText) +
    color(chars.h.repeat(Math.max(0, rightPadding)) + chars.tr)
  );
  
  // Content lines
  content.forEach(line => {
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = width - cleanLine.length - 4;
    lines.push(
      color(chars.v) + ' ' +
      line +
      ' '.repeat(Math.max(0, padding)) + ' ' +
      color(chars.v)
    );
  });
  
  // Bottom border
  lines.push(color(chars.bl + chars.h.repeat(width - 2) + chars.br));
  
  return lines.join('\n');
}

/**
 * Create cloud status section
 */
export function createCloudStatusSection(status: CloudStatus): string {
  const content: string[] = [];
  
  // Connection status
  const connectionIcon = status.connected ? icons.success : icons.error;
  const connectionColor = status.connected ? colors.success : colors.error;
  const connectionText = status.connected ? 'Connected' : 'Disconnected';
  content.push(
    `${connectionIcon} ${colors.muted('Connection:')} ${connectionColor(connectionText)}`
  );
  
  // Auto-sync (hooks) status - show tracking mode details
  let hooksIcon = icons.cross;
  let hooksColor = colors.warning;
  let hooksText = 'Disabled';
  
  if (status.hooksEnabled && status.trackingMode) {
    hooksIcon = icons.check;
    hooksColor = colors.success;
    
    if (status.trackingMode === 'all') {
      hooksText = 'All projects';
    } else if (status.trackingMode === 'selected') {
      const count = status.trackedProjectCount || 0;
      hooksText = count === 1 ? 'Selected (1 project)' : `Selected (${count} projects)`;
    }
  }
  
  content.push(
    `${hooksIcon} ${colors.muted('Auto-sync (hooks):')} ${hooksColor(hooksText)}`
  );
  
  // Last sync time with project name
  let syncIcon = icons.clock;
  let syncColor = colors.primary;
  let syncText = 'Never synced';
  let syncProject = '';
  
  if (status.lastSync) {
    const timeSince = new Date().getTime() - status.lastSync.getTime();
    const minutes = Math.floor(timeSince / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    // Get the project name if available
    if (status.lastSyncProject) {
      syncProject = `${status.lastSyncProject} `;
    }
    
    if (days > 0) {
      syncText = days === 1 ? '1 day ago' : `${days} days ago`;
      syncIcon = icons.warning;
      syncColor = colors.warning;
    } else if (hours > 0) {
      syncText = hours === 1 ? '1 hour ago' : `${hours} hours ago`;
      syncIcon = icons.clock;
      syncColor = colors.primary;
    } else if (minutes === 0) {
      syncText = 'Just now';
      syncIcon = icons.check;
      syncColor = colors.success;
    } else {
      syncText = minutes === 1 ? '1 min ago' : `${minutes} min ago`;
      syncIcon = icons.check;
      syncColor = colors.success;
    }
  }
  
  const fullSyncText = syncProject ? `${syncProject}(${syncText})` : syncText;
  content.push(
    `${syncIcon} ${colors.muted('Last synced:')} ${syncColor(fullSyncText)}`
  )
  
  // Pending changes
  if (status.pendingChanges !== undefined && status.pendingChanges > 0) {
    content.push(
      `${icons.warning} ${colors.muted('Pending:')} ${colors.warning(status.pendingChanges + ' changes')}`
    );
  }
  
  return createSection('CLOUD SYNC STATUS', content, {
    icon: icons.cloud,
    style: 'double',
    color: status.connected ? colors.primary : colors.error,
  });
}

/**
 * Create a mini progress bar for sub-agents
 */
function createMiniProgressBar(current: number, total: number, width: number = 10): string {
  const ratio = Math.min(current / total, 1);
  const filled = Math.floor(ratio * width);
  const bar = '▰'.repeat(filled) + '▱'.repeat(width - filled);
  
  if (ratio === 1) return colors.success(bar);
  if (ratio >= 0.5) return colors.primary(bar);
  return colors.warning(bar);
}

/**
 * Create local engine section
 */
export function createLocalEngineSection(engine: LocalEngine): string {
  const content: string[] = [];
  
  if (engine.installStatus === 'installed') {
    // Fully installed - show success status
    content.push(
      `✨ ${colors.muted('Status:')} ${colors.success('Installed')}`
    );
    const progress = createMiniProgressBar(
      engine.subAgentsInstalled, 
      engine.totalSubAgents,
      10
    );
    content.push(
      `${icons.package} ${colors.muted('Sub-agents:')} ${colors.highlight(`${engine.subAgentsInstalled}/${engine.totalSubAgents}`)} ${progress}`
    );
  } else if (engine.installStatus === 'partial') {
    // Partial installation - compact display
    const missingCount = engine.totalSubAgents - engine.subAgentsInstalled;
    content.push(
      `${icons.warning} ${colors.warning(`Missing ${missingCount} agents`)} ${colors.muted(`(${engine.subAgentsInstalled}/${engine.totalSubAgents} installed)`)}`
    );
    const progress = createMiniProgressBar(
      engine.subAgentsInstalled, 
      engine.totalSubAgents,
      10
    );
    content.push(
      `${icons.package} ${progress}`
    );
    content.push('');
    content.push(colors.info(`  Select ${colors.highlight('Install local sub-agents')} to complete setup`));
  } else {
    // Not installed
    content.push(
      `${icons.error} ${colors.muted('Status:')} ${colors.error('Not installed')}`
    );
    content.push('');
    content.push(colors.warning(`  Select ${colors.highlight('Install local sub-agents')} to create local vibe log reports`));
  }
  
  return createSection('Local via Claude sub-agents', content, {
    icon: '⬇️',
    style: 'single',
    color: engine.installStatus === 'installed' ? colors.primary : colors.warning,
  });
}



/**
 * Create a status dashboard with multiple sections
 */
export function createStatusDashboard(
  cloud: CloudStatus,
  local: LocalEngine
): string {
  const sections: string[] = [];
  // Cloud status
  sections.push(createCloudStatusSection(cloud));
  sections.push('');
  
  // Local engine (Claude Code + sub-agents)
  sections.push(createLocalEngineSection(local));
  
  return sections.join('\n');
}

/**
 * Create a compact status line for minimal display
 */
export function createCompactStatus(
  cloud: CloudStatus,
  local: LocalEngine
): string {
  const parts: string[] = [];
  
  // Cloud indicator
  const cloudIcon = cloud.connected ? colors.success(icons.cloud) : colors.error(icons.cloud);
  parts.push(cloudIcon);
  
  // Sync status
  const syncIcon = cloud.syncStatus === 'synced' 
    ? colors.success(icons.check)
    : cloud.syncStatus === 'syncing'
    ? colors.warning(icons.loading)
    : colors.error(icons.cross);
  parts.push(syncIcon);
  
  // Local engine
  const engineIcon = local.installStatus === 'installed'
    ? colors.success('🧠')
    : local.installStatus === 'partial'
    ? colors.warning('🧠')
    : colors.error('🧠');
  parts.push(engineIcon);
  
  return parts.join(' ');
}