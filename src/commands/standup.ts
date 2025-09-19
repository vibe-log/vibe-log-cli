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
    // Get recent sessions (last 50 should cover several days)
    const sessions = await apiClient.getRecentSessions(50);

    // Determine yesterday (or last working day)
    const yesterday = getYesterdayWorkingDay();

    // Filter and process sessions
    const yesterdayWork = filterSessionsByDate(sessions, yesterday);
    const recentWork = filterSessionsLastNDays(sessions, 3);

    // Extract meaningful accomplishments
    const accomplishments = extractAccomplishments(yesterdayWork);
    const openWork = identifyOpenWork(recentWork);

    spinner.succeed('Standup summary ready!');

    // Display the summary
    displayStandupSummary(yesterday, accomplishments, openWork);

  } catch (error) {
    spinner.fail('Failed to generate standup summary');
    if (error instanceof VibelogError) {
      throw error;
    }
    logger.error('Standup generation failed:', error);
    throw new VibelogError('Failed to generate standup summary', 'STANDUP_ERROR');
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

  return sessions.filter(session => {
    const sessionDate = new Date(session.timestamp);
    return sessionDate >= startOfDay && sessionDate <= endOfDay;
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

  for (const session of sessions) {
    // Skip very short sessions (less than 5 minutes)
    if (session.duration < 300) continue;

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

  // Parse the messageSummary JSON if it exists
  if (sessionData?.data?.messageSummary) {
    try {
      let summary: any;

      // Handle both string and object formats
      if (typeof sessionData.data.messageSummary === 'string') {
        summary = JSON.parse(sessionData.data.messageSummary);
      } else {
        summary = sessionData.data.messageSummary;
      }

      // Extract meaningful activities from the summary
      if (summary.filesEdited && summary.filesEdited > 3) {
        accomplishments.push(`Modified ${summary.filesEdited} files`);
      }

      if (summary.filesCreated && summary.filesCreated > 0) {
        accomplishments.push(`Created ${summary.filesCreated} new files`);
      }

      if (summary.testsRun && summary.testsRun > 0) {
        accomplishments.push(`Ran ${summary.testsRun} tests`);
      }

      if (summary.commitsMade && summary.commitsMade > 0) {
        accomplishments.push(`Made ${summary.commitsMade} commits`);
      }

      // Check metadata for additional insights
      const metadata = sessionData.data.metadata;
      if (metadata) {
        if (metadata.files_edited && metadata.files_edited > 10) {
          accomplishments.push('Significant code refactoring');
        }

        if (metadata.tests_run && metadata.tests_run > 0) {
          accomplishments.push('Test suite execution');
        }

        if (metadata.commits_made && metadata.commits_made > 2) {
          accomplishments.push('Multiple feature commits');
        }
      }

      // Look for significant session duration
      if (sessionData.duration > 7200) { // More than 2 hours
        accomplishments.push('Extended coding session');
      }

    } catch (e) {
      // If parsing fails, add basic info based on duration
      if (sessionData.duration > 1800) { // More than 30 minutes
        accomplishments.push('Development work');
      }
    }
  }

  return accomplishments;
}

function identifyOpenWork(sessions: SessionData[]): string[] {
  const openItems: string[] = [];
  const projectActivity = new Map<string, { lastWorked: Date; shortSessions: number }>();

  // Track recent project activity
  for (const session of sessions) {
    const project = session.projectName || 'Unnamed Project';
    const sessionDate = new Date(session.timestamp);

    if (!projectActivity.has(project)) {
      projectActivity.set(project, { lastWorked: sessionDate, shortSessions: 0 });
    } else {
      const activity = projectActivity.get(project)!;
      if (sessionDate > activity.lastWorked) {
        activity.lastWorked = sessionDate;
      }
    }

    // Track short sessions that might indicate interrupted work
    if (session.duration < 1800 && session.duration > 300) { // 5-30 minutes
      projectActivity.get(project)!.shortSessions++;
    }
  }

  // Generate suggestions based on activity patterns
  const today = new Date();
  projectActivity.forEach((activity, project) => {
    const daysSince = Math.floor((today.getTime() - activity.lastWorked.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince === 0) {
      // Today's work - check if there were interruptions
      if (activity.shortSessions > 0) {
        openItems.push(`Continue ${project} (had ${activity.shortSessions} short session${activity.shortSessions > 1 ? 's' : ''} today)`);
      }
    } else if (daysSince === 1) {
      openItems.push(`${project} (worked on yesterday)`);
    } else if (daysSince <= 3) {
      openItems.push(`${project} (last worked ${daysSince} days ago)`);
    }
  });

  // Sort by recency and remove duplicates
  return [...new Set(openItems)];
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