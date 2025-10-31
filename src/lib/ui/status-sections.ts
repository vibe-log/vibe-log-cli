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
  statusLineStatus: 'installed' | 'partial' | 'not-installed';
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
  // eslint-disable-next-line no-control-regex
  const titleLength = titleText.replace(/\u001b\[[0-9;]*m/g, '').length;
  const leftPadding = 3;
  const rightPadding = width - titleLength - leftPadding - 2;
  
  lines.push(
    color(chars.tl + chars.h.repeat(leftPadding)) +
    colors.highlight(titleText) +
    color(chars.h.repeat(Math.max(0, rightPadding)) + chars.tr)
  );
  
  // Content lines
  content.forEach(line => {
    // eslint-disable-next-line no-control-regex
    const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, '');
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
 * Create local engine section with clearer descriptions
 */
export function createLocalEngineSection(engine: LocalEngine): string {
  const content: string[] = [];
  
  // Strategic Co-pilot (status-line) status - FIRST since it's real-time
  const coachIcon = engine.statusLineStatus === 'installed' ? icons.check :
                    engine.statusLineStatus === 'partial' ? icons.warning : icons.cross;
  const coachColor = engine.statusLineStatus === 'installed' ? colors.success :
                     engine.statusLineStatus === 'partial' ? colors.warning : colors.error;
  
  let coachStatus = '';
  if (engine.statusLineStatus === 'installed') {
    coachStatus = 'Active';
  } else if (engine.statusLineStatus === 'partial') {
    coachStatus = 'Partially installed';
  } else {
    coachStatus = 'Not installed';
  }
  
  content.push(
    `🚀 ${colors.muted('Strategic Co-pilot status line:')} ${coachIcon} ${coachColor(coachStatus)}`
  );
  
  // Add explanation if not installed
  if (engine.statusLineStatus !== 'installed') {
    content.push(
      colors.subdued(`                      → Strategic guidance to move forward effectively`)
    );
  }
  
  // Report generators (sub-agents) status - SECOND
  const reportIcon = engine.installStatus === 'installed' ? icons.check : 
                     engine.installStatus === 'partial' ? icons.warning : icons.cross;
  const reportColor = engine.installStatus === 'installed' ? colors.success : 
                      engine.installStatus === 'partial' ? colors.warning : colors.error;
  
  let reportStatus = '';
  if (engine.installStatus === 'installed') {
    reportStatus = `Ready (${engine.subAgentsInstalled}/${engine.totalSubAgents} installed)`;
  } else if (engine.installStatus === 'partial') {
    reportStatus = `Incomplete (${engine.subAgentsInstalled}/${engine.totalSubAgents})`;
  } else {
    reportStatus = 'Not installed';
  }
  
  content.push(
    `📊 ${colors.muted('Report generators sub-agents:')} ${reportIcon} ${reportColor(reportStatus)}`
  );
  
  // Add explanation if not fully installed
  if (engine.installStatus !== 'installed') {
    content.push(
      colors.subdued(`                      → Generates local productivity reports`)
    );
  }
  
  // Determine overall status color based on installation state
  const sectionColor = (engine.installStatus === 'installed' && engine.statusLineStatus === 'installed') 
    ? colors.primary 
    : colors.warning;
  
  return createSection('Local Analysis Tools', content, {
    icon: '🤖',
    style: 'single',
    color: sectionColor,
  });
}



/**
 * Create push-up challenge section
 */
export async function createPushUpChallengeSection(): Promise<string> {
  const { getPushUpChallengeConfig, getPushUpStats } = require('../config');
  const { readGlobalSettings } = require('../claude-settings-reader');
  const config = getPushUpChallengeConfig();
  const stats = getPushUpStats();

  const content: string[] = [];

  // Challenge status
  const challengeEnabled = config.enabled;
  const challengeIcon = challengeEnabled ? icons.check : icons.cross;
  const challengeColor = challengeEnabled ? colors.success : colors.error;
  const challengeText = challengeEnabled
    ? `Enabled (${config.pushUpsPerTrigger} per validation)`
    : 'Not enabled';
  content.push(
    `${challengeIcon} ${colors.muted('Challenge:')} ${challengeColor(challengeText)}`
  );

  // Statusline status - check global settings
  let statuslineInstalled = false;
  try {
    const settings = await readGlobalSettings();
    if (settings?.statusLine?.command?.includes('statusline-challenge')) {
      statuslineInstalled = true;
    }
  } catch (error) {
    // If we can't read settings, assume not installed
  }

  const statuslineIcon = statuslineInstalled ? icons.check : icons.cross;
  const statuslineColor = statuslineInstalled ? colors.success : colors.error;
  const statuslineText = statuslineInstalled ? 'Installed' : 'Not installed';
  content.push(
    `${statuslineIcon} ${colors.muted('Statusline:')} ${statuslineColor(statuslineText)}`
  );

  // Only show stats if challenge is enabled
  if (challengeEnabled) {
    // Today's progress
    const todayProgress = `${stats.todayCompleted} completed / ${stats.todayDebt} owed`;
    content.push(
      `📅 ${colors.muted('Today:')} ${colors.primary(todayProgress)}`
    );

    // Total debt with color coding
    const debtColor = stats.debt > 20 ? colors.error :
                       stats.debt > 10 ? colors.warning :
                       colors.success;
    content.push(
      `💳 ${colors.muted('Total Debt:')} ${debtColor(stats.debt.toString())}`
    );

    // Streak with fire emoji for active streaks
    const streakEmoji = stats.streakDays >= 7 ? '🔥🔥' :
                        stats.streakDays >= 3 ? '🔥' : '';
    content.push(
      `🏆 ${colors.muted('Streak:')} ${colors.accent(stats.streakDays + ' days')} ${streakEmoji}`
    );
  }

  return createSection('PUSH-UP CHALLENGE', content, {
    icon: '💪',
    style: 'single',
    color: colors.accent,
  });
}

/**
 * Create a status dashboard with multiple sections
 */
export async function createStatusDashboard(
  cloud: CloudStatus,
  local: LocalEngine
): Promise<string> {
  const sections: string[] = [];
  // Cloud status
  sections.push(createCloudStatusSection(cloud));
  sections.push('');

  // Local engine (Claude Code + sub-agents)
  sections.push(createLocalEngineSection(local));

  // Push-up challenge (always show status)
  sections.push('');
  sections.push(await createPushUpChallengeSection());

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