import chalk from 'chalk';
import { colors, box } from './styles';
import { getHooksStatus, checkForHookUpdates } from '../hooks/hooks-controller';
import { loadHookStats, formatDuration, formatRelativeTime, getTopProjects } from '../hooks/hooks-stats';
import { validateHookCommands } from '../hooks-manager';

/**
 * Show detailed hooks status
 */
export async function showHooksStatus(): Promise<void> {
  console.clear();
  
  // Get all status information
  const status = await getHooksStatus();
  const stats = await loadHookStats();
  const validation = await validateHookCommands();
  const updateCheck = await checkForHookUpdates();
  const topProjects = await getTopProjects(5);
  
  const width = 65;
  
  // Header
  console.log(colors.primary(box.doubleTopLeft + box.doubleHorizontal.repeat(width - 2) + box.doubleTopRight));
  const title = ` 📊 Hook Status Details `;
  const titlePadding = Math.floor((width - title.length) / 2);
  console.log(
    colors.primary(box.doubleVertical) +
    ' '.repeat(titlePadding) +
    colors.highlight(title) +
    ' '.repeat(width - titlePadding - title.length - 2) +
    colors.primary(box.doubleVertical)
  );
  console.log(colors.primary(box.doubleTLeft + box.doubleHorizontal.repeat(width - 2) + box.doubleTRight));
  
  // SessionStart Hook Section
  console.log(colors.primary(box.doubleVertical) + ' '.repeat(width - 2) + colors.primary(box.doubleVertical));
  console.log(
    colors.primary(box.doubleVertical) +
    colors.accent('  🚀 SessionStart Hook') +
    ' '.repeat(width - 23) +
    colors.primary(box.doubleVertical)
  );
  console.log(
    colors.primary(box.doubleVertical) +
    colors.dim('  ────────────────────') +
    ' '.repeat(width - 23) +
    colors.primary(box.doubleVertical)
  );
  
  displayHookDetails(status.sessionStartHook, stats.sessionStartHook, 'sessionstart', width);
  
  // PreCompact Hook Section
  console.log(colors.primary(box.doubleVertical) + ' '.repeat(width - 2) + colors.primary(box.doubleVertical));
  console.log(
    colors.primary(box.doubleVertical) +
    colors.accent('  📦 PreCompact Hook') +
    ' '.repeat(width - 22) +
    colors.primary(box.doubleVertical)
  );
  console.log(
    colors.primary(box.doubleVertical) +
    colors.dim('  ──────────────────') +
    ' '.repeat(width - 22) +
    colors.primary(box.doubleVertical)
  );
  
  displayHookDetails(status.preCompactHook, stats.preCompactHook, 'precompact', width);
  
  // System Information Section
  console.log(colors.primary(box.doubleVertical) + ' '.repeat(width - 2) + colors.primary(box.doubleVertical));
  console.log(
    colors.primary(box.doubleVertical) +
    colors.accent('  ⚙️  System Information') +
    ' '.repeat(width - 26) +
    colors.primary(box.doubleVertical)
  );
  console.log(
    colors.primary(box.doubleVertical) +
    colors.dim('  ─────────────────────') +
    ' '.repeat(width - 25) +
    colors.primary(box.doubleVertical)
  );
  
  // CLI Path
  console.log(
    colors.primary(box.doubleVertical) +
    `  CLI Path: ${chalk.cyan(status.cliPath)}` +
    ' '.repeat(Math.max(0, width - 14 - status.cliPath.length)) +
    colors.primary(box.doubleVertical)
  );
  
  // Settings Path
  console.log(
    colors.primary(box.doubleVertical) +
    `  Settings: ${chalk.cyan(status.settingsPath)}` +
    ' '.repeat(Math.max(0, width - 14 - status.settingsPath.length)) +
    colors.primary(box.doubleVertical)
  );
  
  // Version Status
  if (updateCheck.needsUpdate) {
    console.log(
      colors.primary(box.doubleVertical) +
      colors.warning(`  ⚠️  Update Available: v${updateCheck.currentVersion} → v${updateCheck.latestVersion}`) +
      ' '.repeat(Math.max(0, width - 30 - updateCheck.currentVersion.length - updateCheck.latestVersion.length)) +
      colors.primary(box.doubleVertical)
    );
  } else if (status.sessionStartHook.installed || status.preCompactHook.installed) {
    console.log(
      colors.primary(box.doubleVertical) +
      colors.success(`  ✅ Up to date (v${updateCheck.currentVersion})`) +
      ' '.repeat(Math.max(0, width - 22 - updateCheck.currentVersion.length)) +
      colors.primary(box.doubleVertical)
    );
  }
  
  // Validation Issues
  if (!validation.valid && validation.errors.length > 0) {
    console.log(colors.primary(box.doubleVertical) + ' '.repeat(width - 2) + colors.primary(box.doubleVertical));
    console.log(
      colors.primary(box.doubleVertical) +
      colors.warning('  ⚠️  Validation Issues:') +
      ' '.repeat(width - 26) +
      colors.primary(box.doubleVertical)
    );
    validation.errors.forEach(error => {
      const errorLine = `    • ${error}`;
      console.log(
        colors.primary(box.doubleVertical) +
        colors.warning(errorLine) +
        ' '.repeat(Math.max(0, width - errorLine.length - 2)) +
        colors.primary(box.doubleVertical)
      );
    });
  }
  
  // Top Projects Section (if data available)
  if (topProjects.length > 0) {
    console.log(colors.primary(box.doubleVertical) + ' '.repeat(width - 2) + colors.primary(box.doubleVertical));
    console.log(
      colors.primary(box.doubleVertical) +
      colors.accent('  📁 Top Projects') +
      ' '.repeat(width - 19) +
      colors.primary(box.doubleVertical)
    );
    console.log(
      colors.primary(box.doubleVertical) +
      colors.dim('  ───────────────') +
      ' '.repeat(width - 19) +
      colors.primary(box.doubleVertical)
    );
    
    topProjects.forEach(({ project, count }) => {
      const projectLine = `    ${project}: ${count} syncs`;
      console.log(
        colors.primary(box.doubleVertical) +
        chalk.gray(projectLine) +
        ' '.repeat(Math.max(0, width - projectLine.length - 2)) +
        colors.primary(box.doubleVertical)
      );
    });
  }
  
  // Tip Section
  console.log(colors.primary(box.doubleVertical) + ' '.repeat(width - 2) + colors.primary(box.doubleVertical));
  console.log(
    colors.primary(box.doubleVertical) +
    colors.info('  💡 Tip: SessionStart syncs previous work when you') +
    ' '.repeat(width - 57) +
    colors.primary(box.doubleVertical)
  );
  console.log(
    colors.primary(box.doubleVertical) +
    colors.info('     start/resume, PreCompact syncs before compression') +
    ' '.repeat(width - 61) +
    colors.primary(box.doubleVertical)
  );
  
  // Footer
  console.log(colors.primary(box.doubleVertical) + ' '.repeat(width - 2) + colors.primary(box.doubleVertical));
  console.log(colors.primary(box.doubleBottomLeft + box.doubleHorizontal.repeat(width - 2) + box.doubleBottomRight));
  console.log('');
}

/**
 * Display details for a single hook
 */
function displayHookDetails(
  hookStatus: any,
  hookStats: any,
  _hookType: string,
  width: number
): void {
  // Status
  const statusText = hookStatus.installed
    ? hookStatus.enabled
      ? colors.success('✅ Active')
      : colors.warning('⚠️  Disabled')
    : colors.error('❌ Not Installed');
  
  console.log(
    colors.primary(box.doubleVertical) +
    `  Status:     ${statusText}` +
    ' '.repeat(Math.max(0, width - 16 - statusText.length)) +
    colors.primary(box.doubleVertical)
  );
  
  if (!hookStatus.installed) {
    return;
  }
  
  // Command
  if (hookStatus.command) {
    const cmdDisplay = hookStatus.command.length > 40 
      ? '...' + hookStatus.command.slice(-37)
      : hookStatus.command;
    console.log(
      colors.primary(box.doubleVertical) +
      chalk.gray(`  Command:    ${cmdDisplay}`) +
      ' '.repeat(Math.max(0, width - 16 - cmdDisplay.length)) +
      colors.primary(box.doubleVertical)
    );
  }
  
  // Timeout
  if (hookStatus.timeout) {
    const timeoutStr = `${hookStatus.timeout / 1000}s`;
    console.log(
      colors.primary(box.doubleVertical) +
      chalk.gray(`  Timeout:    ${timeoutStr}`) +
      ' '.repeat(Math.max(0, width - 16 - timeoutStr.length)) +
      colors.primary(box.doubleVertical)
    );
  }
  
  // Execution Stats
  if (hookStats.totalExecutions > 0) {
    const triggersStr = `${hookStats.totalExecutions} (last 7 days)`;
    console.log(
      colors.primary(box.doubleVertical) +
      chalk.gray(`  Triggers:   ${triggersStr}`) +
      ' '.repeat(Math.max(0, width - 16 - triggersStr.length)) +
      colors.primary(box.doubleVertical)
    );
    
    const successRate = ((hookStats.successCount / hookStats.totalExecutions) * 100).toFixed(1);
    const successStr = `${hookStats.successCount} (${successRate}%)`;
    const successColor = parseFloat(successRate) >= 95 ? colors.success : parseFloat(successRate) >= 80 ? colors.warning : colors.error;
    console.log(
      colors.primary(box.doubleVertical) +
      `  Success:    ${successColor(successStr)}` +
      ' '.repeat(Math.max(0, width - 16 - successStr.length)) +
      colors.primary(box.doubleVertical)
    );
    
    if (hookStats.failureCount > 0) {
      console.log(
        colors.primary(box.doubleVertical) +
        colors.error(`  Failures:   ${hookStats.failureCount}`) +
        ' '.repeat(Math.max(0, width - 16 - hookStats.failureCount.toString().length)) +
        colors.primary(box.doubleVertical)
      );
    }
    
    if (hookStats.lastExecution) {
      const lastRunStr = formatRelativeTime(hookStats.lastExecution);
      console.log(
        colors.primary(box.doubleVertical) +
        chalk.gray(`  Last Run:   ${lastRunStr}`) +
        ' '.repeat(Math.max(0, width - 16 - lastRunStr.length)) +
        colors.primary(box.doubleVertical)
      );
    }
    
    if (hookStats.averageDuration) {
      const durationStr = formatDuration(hookStats.averageDuration);
      console.log(
        colors.primary(box.doubleVertical) +
        chalk.gray(`  Avg Time:   ${durationStr}`) +
        ' '.repeat(Math.max(0, width - 16 - durationStr.length)) +
        colors.primary(box.doubleVertical)
      );
    }
  } else {
    console.log(
      colors.primary(box.doubleVertical) +
      chalk.dim('  No execution data yet') +
      ' '.repeat(width - 25) +
      colors.primary(box.doubleVertical)
    );
  }
}