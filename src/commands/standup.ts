import chalk from 'chalk';
import { requireAuth } from '../lib/auth/token';
import { apiClient } from '../lib/api-client';
import { createSpinner } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';

interface SessionData {
  id: string;
  timestamp: string;
  projectName?: string;
  duration: number;
  data?: {
    messageSummary?: string;
    metadata?: {
      files_edited?: number;
      files_created?: number;
      tests_run?: number;
      commits_made?: number;
    };
  };
}

interface ProjectWork {
  project: string;
  sessions: SessionData[];
  totalDuration: number;
  accomplishments: string[];
}

export async function standup(): Promise<void> {
  await requireAuth();

  const spinner = createSpinner('Preparing your standup summary...').start();

  try {
    logger.debug('Starting standup generation...');

    // Get recent sessions (last 50 should cover several days)
    logger.debug('Fetching recent sessions from API...');
    const sessions = await apiClient.getRecentSessions(50);
    logger.debug(`Received ${sessions?.length || 0} sessions from API`);

    if (!sessions || sessions.length === 0) {
      spinner.fail('No sessions found');
      console.log(chalk.yellow('\nNo coding sessions found. Start working on some projects first!'));
      return;
    }

    // Log first session structure for debugging
    if (sessions.length > 0) {
      logger.debug('Sample session structure:', JSON.stringify(sessions[0], null, 2));
    }

    // Determine yesterday (or last working day)
    const yesterday = getYesterdayWorkingDay();
    logger.debug(`Target date for standup: ${yesterday.toISOString()}`);
    logger.debug(`Day of week: ${yesterday.getDay()} (0=Sunday, 1=Monday, etc.)`);

    const today = new Date();
    logger.debug(`Today's date: ${today.toISOString()}`);

    // Filter and process sessions
    const yesterdayWork = filterSessionsByDate(sessions, yesterday);
    logger.debug(`Sessions on ${yesterday.toDateString()}: ${yesterdayWork.length}`);

    const recentWork = filterSessionsLastNDays(sessions, 3);
    logger.debug(`Sessions in last 3 days: ${recentWork.length}`);

    // Extract meaningful accomplishments
    logger.debug('Extracting accomplishments from yesterday\'s sessions...');
    const accomplishments = extractAccomplishments(yesterdayWork);
    logger.debug(`Projects with work: ${accomplishments.size}`);

    logger.debug('Identifying open work from recent sessions...');
    const openWork = identifyOpenWork(recentWork);
    logger.debug(`Open work items: ${openWork.length}`);

    spinner.succeed('Standup summary ready!');

    // Display the summary
    displayStandupSummary(yesterday, accomplishments, openWork);

  } catch (error) {
    spinner.fail('Failed to generate standup summary');

    // Log the actual error details
    logger.error('Standup generation failed with error:', error);
    logger.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    if (error instanceof VibelogError) {
      throw error;
    }

    // Include more specific error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new VibelogError(`Failed to generate standup summary: ${errorMessage}`, 'STANDUP_ERROR');
  }
}

function getYesterdayWorkingDay(): Date {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const yesterday = new Date(today);

  if (dayOfWeek === 1) { // Monday
    yesterday.setDate(today.getDate() - 3); // Get Friday
  } else if (dayOfWeek === 0) { // Sunday
    yesterday.setDate(today.getDate() - 2); // Get Friday
  } else {
    yesterday.setDate(today.getDate() - 1); // Get yesterday
  }

  return yesterday;
}

function filterSessionsByDate(sessions: SessionData[], targetDate: Date): SessionData[] {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  logger.debug(`Filtering sessions between ${startOfDay.toISOString()} and ${endOfDay.toISOString()}`);

  return sessions.filter(session => {
    const sessionDate = new Date(session.timestamp);
    const matches = sessionDate >= startOfDay && sessionDate <= endOfDay;
    if (matches) {
      logger.debug(`Session matched: ${session.projectName || 'Unknown'} at ${session.timestamp}`);
    }
    return matches;
  });
}

function filterSessionsLastNDays(sessions: SessionData[], days: number): SessionData[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  cutoffDate.setHours(0, 0, 0, 0);

  return sessions.filter(session => {
    const sessionDate = new Date(session.timestamp);
    return sessionDate >= cutoffDate;
  });
}

function extractAccomplishments(sessions: SessionData[]): Map<string, ProjectWork> {
  const projectWork = new Map<string, ProjectWork>();

  logger.debug(`Processing ${sessions.length} sessions for accomplishments`);

  for (const session of sessions) {
    logger.debug(`Session: ${session.projectName || 'Unknown'}, duration: ${session.duration}s`);

    // Log the entire session structure to understand what we have
    logger.debug('Full session object:', JSON.stringify(session, null, 2));

    // Skip very short sessions (less than 5 minutes)
    if (session.duration < 300) {
      logger.debug(`  Skipping session (too short: ${session.duration}s < 300s)`);
      continue;
    }

    const project = session.projectName || 'Unnamed Project';

    if (!projectWork.has(project)) {
      projectWork.set(project, {
        project,
        sessions: [],
        totalDuration: 0,
        accomplishments: []
      });
    }

    const work = projectWork.get(project)!;
    work.sessions.push(session);
    work.totalDuration += session.duration;

    // Parse the session data for meaningful work
    const accomplishments = parseAccomplishments(session);
    work.accomplishments.push(...accomplishments);
  }

  // Deduplicate and refine accomplishments
  projectWork.forEach((work) => {
    work.accomplishments = [...new Set(work.accomplishments)].filter(a => a.length > 0);

    // If no specific accomplishments, add a generic one based on duration
    if (work.accomplishments.length === 0 && work.totalDuration > 900) { // More than 15 minutes
      const hours = Math.round(work.totalDuration / 3600 * 10) / 10;
      work.accomplishments.push(`${hours} hours of development work`);
    }
  });

  return projectWork;
}

function parseAccomplishments(sessionData: SessionData): string[] {
  const accomplishments: string[] = [];

  logger.debug(`Parsing accomplishments for session:`, {
    hasData: !!sessionData?.data,
    dataType: typeof sessionData?.data,
    dataKeys: sessionData?.data ? Object.keys(sessionData.data) : [],
    dataValue: typeof sessionData?.data === 'string' ? (sessionData.data as string).substring(0, 200) : sessionData?.data
  });

  // Parse the data object which contains messageSummary
  if (sessionData?.data) {
    try {
      let summaryData: any = sessionData.data;

      // If data is a string, it's likely a JSON string from the database
      if (typeof sessionData.data === 'string') {
        try {
          summaryData = JSON.parse(sessionData.data);
          logger.debug('Parsed data from string:', Object.keys(summaryData));
        } catch (e) {
          logger.debug('Failed to parse data as JSON:', e);
        }
      } else if (typeof sessionData.data === 'object') {
        summaryData = sessionData.data;
      }

      // Try to parse messageSummary if it's a string
      let messageSummary: any = {};
      if (summaryData.messageSummary) {
        logger.debug('Found messageSummary, type:', typeof summaryData.messageSummary);
        if (typeof summaryData.messageSummary === 'string') {
          try {
            messageSummary = JSON.parse(summaryData.messageSummary);
            logger.debug('Parsed messageSummary:', messageSummary);
          } catch {
            // messageSummary might not be JSON
            logger.debug('messageSummary is not JSON:', summaryData.messageSummary);
          }
        } else {
          messageSummary = summaryData.messageSummary;
          logger.debug('messageSummary object:', messageSummary);
        }
      } else {
        logger.debug('No messageSummary field found in data');
      }

      // Extract from messageSummary
      if (messageSummary.filesEdited && messageSummary.filesEdited > 5) {
        accomplishments.push(`Edited ${messageSummary.filesEdited} files`);
      } else if (messageSummary.filesEdited > 0) {
        accomplishments.push(`Modified ${messageSummary.filesEdited} files`);
      }

      if (messageSummary.filesCreated && messageSummary.filesCreated > 0) {
        accomplishments.push(`Created ${messageSummary.filesCreated} new files`);
      }

      if (messageSummary.commandsRun && messageSummary.commandsRun > 5) {
        accomplishments.push(`Executed ${messageSummary.commandsRun} commands`);
      }

      // Extract from metadata if available
      if (summaryData.metadata) {
        const metadata = summaryData.metadata;
        logger.debug('Found metadata:', metadata);

        if (metadata.files_edited && metadata.files_edited > 10) {
          accomplishments.push('Major code changes across multiple files');
        } else if (metadata.files_edited > 0) {
          accomplishments.push(`Worked on ${metadata.files_edited} file${metadata.files_edited > 1 ? 's' : ''}`);
        }

        if (metadata.languages && Array.isArray(metadata.languages) && metadata.languages.length > 0) {
          const langs = metadata.languages.slice(0, 3).join(', ');
          accomplishments.push(`Worked with ${langs}`);
        }

        if (metadata.primaryModel) {
          // Track model usage for notable sessions
          if (sessionData.duration > 3600) { // More than 1 hour
            accomplishments.push(`Extended session with ${metadata.primaryModel}`);
          }
        }

        if (metadata.gitBranch && metadata.gitBranch !== 'main' && metadata.gitBranch !== 'master') {
          accomplishments.push(`Working on branch: ${metadata.gitBranch}`);
        }

        // Planning mode usage
        if (metadata.hasPlanningMode) {
          accomplishments.push(`Used planning mode (${metadata.planningCycles || 1} cycle${metadata.planningCycles > 1 ? 's' : ''})`);
        }
      }

      // Add message activity insights
      if (summaryData.messageCount) {
        logger.debug('Found messageCount:', summaryData.messageCount);
        if (summaryData.messageCount > 50) {
          accomplishments.push(`Intensive development (${summaryData.messageCount} interactions)`);
        } else if (summaryData.messageCount > 20) {
          accomplishments.push(`Active development session (${summaryData.messageCount} interactions)`);
        } else if (summaryData.messageCount > 10) {
          accomplishments.push(`${summaryData.messageCount} code interactions`);
        }
      } else {
        logger.debug('No messageCount field found');
      }

      // Log all available fields for debugging
      logger.debug('All summaryData fields:', Object.keys(summaryData));

      // Check for projectName field
      if (summaryData.projectName) {
        logger.debug('Project from data:', summaryData.projectName);
      }

      // Duration-based accomplishments
      if (sessionData.duration > 10800) { // More than 3 hours
        accomplishments.push('Marathon coding session (3+ hours)');
      } else if (sessionData.duration > 7200) { // More than 2 hours
        accomplishments.push('Extended focus session (2+ hours)');
      } else if (sessionData.duration > 3600) { // More than 1 hour
        accomplishments.push('Deep work session (1+ hour)');
      }

    } catch (e) {
      logger.debug('Error parsing session data:', e);
      // Fallback to basic info
      if (sessionData.duration > 1800) {
        accomplishments.push('Development work');
      }
    }
  }

  // If we have no accomplishments but significant duration, add a note
  if (accomplishments.length === 0 && sessionData.duration > 900) {
    const minutes = Math.round(sessionData.duration / 60);
    accomplishments.push(`${minutes} minutes of focused work`);
  }

  return accomplishments;
}

function identifyOpenWork(sessions: SessionData[]): string[] {
  const projectInfo = new Map<string, {
    lastWorked: Date;
    totalSessions: number;
    shortSessions: number;
    longSessions: number;
    totalDuration: number;
    recentBranch?: string;
    recentLanguages?: string[];
    hadPlanningMode?: boolean;
  }>();

  // Analyze all sessions to build project context
  for (const session of sessions) {
    const project = session.projectName || 'Unnamed Project';
    const sessionDate = new Date(session.timestamp);

    if (!projectInfo.has(project)) {
      projectInfo.set(project, {
        lastWorked: sessionDate,
        totalSessions: 0,
        shortSessions: 0,
        longSessions: 0,
        totalDuration: 0
      });
    }

    const info = projectInfo.get(project)!;
    info.totalSessions++;
    info.totalDuration += session.duration;

    if (sessionDate > info.lastWorked) {
      info.lastWorked = sessionDate;
    }

    // Track session patterns
    if (session.duration < 1800 && session.duration > 300) { // 5-30 minutes
      info.shortSessions++;
    } else if (session.duration > 3600) { // Over 1 hour
      info.longSessions++;
    }

    // Extract context from session data
    if (session.data && typeof session.data === 'object') {
      const data = typeof session.data === 'string' ? JSON.parse(session.data) : session.data;

      if (data.metadata) {
        if (data.metadata.gitBranch && data.metadata.gitBranch !== 'main' && data.metadata.gitBranch !== 'master') {
          info.recentBranch = data.metadata.gitBranch;
        }

        if (data.metadata.languages && Array.isArray(data.metadata.languages)) {
          info.recentLanguages = data.metadata.languages;
        }

        if (data.metadata.hasPlanningMode) {
          info.hadPlanningMode = true;
        }
      }
    }
  }

  // Generate intelligent suggestions based on patterns
  const today = new Date();
  const suggestions: Array<{ priority: number; text: string }> = [];

  projectInfo.forEach((info, project) => {
    const hoursSince = Math.floor((today.getTime() - info.lastWorked.getTime()) / (1000 * 60 * 60));
    const daysSince = Math.floor(hoursSince / 24);

    // Priority 1: Projects with interrupted work (many short sessions)
    if (info.shortSessions > 2) {
      const avgDuration = Math.round(info.totalDuration / info.totalSessions / 60);
      suggestions.push({
        priority: 1,
        text: `🔴 Resume ${project} - Multiple interrupted sessions (avg ${avgDuration} min) suggest unfinished work`
      });
    }
    // Priority 2: Active branches need continuation
    else if (info.recentBranch && daysSince <= 1) {
      suggestions.push({
        priority: 2,
        text: `🟡 Continue ${project} on branch "${info.recentBranch}" (active yesterday)`
      });
    }
    // Priority 3: Projects with planning mode that need execution
    else if (info.hadPlanningMode && daysSince <= 2) {
      suggestions.push({
        priority: 3,
        text: `🟢 Execute planned work in ${project} (had planning session ${daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`})`
      });
    }
    // Priority 4: Recently active projects
    else if (hoursSince < 24) {
      if (info.longSessions > 0) {
        suggestions.push({
          priority: 4,
          text: `Continue deep work on ${project} (had ${info.longSessions} extended session${info.longSessions > 1 ? 's' : ''} recently)`
        });
      } else {
        suggestions.push({
          priority: 4,
          text: `Follow up on ${project} (worked ${hoursSince < 1 ? 'just now' : `${hoursSince} hours ago`})`
        });
      }
    }
    // Priority 5: Projects that might need attention
    else if (daysSince === 1) {
      const totalHours = Math.round(info.totalDuration / 3600 * 10) / 10;
      suggestions.push({
        priority: 5,
        text: `Review progress on ${project} (${totalHours}h invested yesterday)`
      });
    }
    // Priority 6: Stale projects that had significant investment
    else if (daysSince <= 3 && info.totalDuration > 7200) { // Over 2 hours total
      const totalHours = Math.round(info.totalDuration / 3600);
      suggestions.push({
        priority: 6,
        text: `Consider resuming ${project} (${totalHours}h invested, last worked ${daysSince} days ago)`
      });
    }
  });

  // Sort by priority and take top suggestions
  suggestions.sort((a, b) => a.priority - b.priority);

  // Return top 5 most relevant suggestions
  return suggestions.slice(0, 5).map(s => s.text);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function displayStandupSummary(
  yesterday: Date,
  accomplishments: Map<string, ProjectWork>,
  openWork: string[]
): void {
  const dateStr = yesterday.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

  console.log(chalk.cyan('\n📋 Daily Standup Summary'));
  console.log(chalk.gray('═══════════════════════════════\n'));

  // Yesterday's accomplishments
  console.log(chalk.yellow(`WHAT I ACCOMPLISHED (${dateStr})`));
  console.log(chalk.gray('─────────────────────────────'));

  if (accomplishments.size === 0) {
    console.log(chalk.gray('  No substantial work recorded for this day\n'));
  } else {
    let totalTimeYesterday = 0;
    accomplishments.forEach((work) => {
      totalTimeYesterday += work.totalDuration;

      console.log(chalk.white(`\n  ${chalk.bold(work.project)} ${chalk.gray(`(${formatDuration(work.totalDuration)})`)}`));

      if (work.accomplishments.length > 0) {
        work.accomplishments.forEach(item => {
          console.log(chalk.gray(`    • ${item}`));
        });
      } else {
        console.log(chalk.gray(`    • ${formatDuration(work.totalDuration)} of focused work`));
      }
    });

    if (accomplishments.size > 1) {
      console.log(chalk.gray(`\n  Total time: ${chalk.white(formatDuration(totalTimeYesterday))}`));
    }
  }

  // Today's suggested focus
  console.log(chalk.yellow('\n\nSUGGESTED FOCUS FOR TODAY'));
  console.log(chalk.gray('─────────────────────────────'));

  if (openWork.length === 0) {
    console.log(chalk.gray('  No specific continuation suggestions\n'));
  } else {
    console.log();
    openWork.slice(0, 5).forEach(item => { // Limit to 5 items
      console.log(chalk.gray(`  • ${item}`));
    });

    if (openWork.length > 5) {
      console.log(chalk.gray(`\n  ... and ${openWork.length - 5} more`));
    }
  }

  // Add helpful tips
  console.log(chalk.gray('\n═══════════════════════════════'));
  console.log(chalk.dim('\n💡 Tip: Run this command each morning to prepare for your standup!'));
}