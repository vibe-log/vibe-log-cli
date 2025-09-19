import chalk from 'chalk';
import { createSpinner } from '../lib/ui';
import { logger } from '../utils/logger';
import { readClaudeSessions } from '../lib/readers/claude';
import { discoverProjects } from '../lib/claude-core';
import path from 'path';

interface Accomplishment {
  type: 'file_created' | 'file_edited' | 'command' | 'test' | 'commit' | 'general';
  description: string;
  count?: number;
}

interface ProjectWork {
  project: string;
  sessions: Array<{
    duration: number;
    messageCount: number;
    filesEdited: string[];
    languages: string[];
    timestamp: Date;
  }>;
  accomplishments: Accomplishment[];
  totalDuration: number;
  totalMessages: number;
}

export async function standupLocal(): Promise<void> {
  const spinner = createSpinner('Analyzing your local Claude sessions...').start();

  try {
    // Get all Claude projects
    const projects = await discoverProjects();
    if (projects.length === 0) {
      spinner.fail('No Claude projects found');
      console.log(chalk.yellow('\nNo Claude Code projects found. Start working on some projects first!'));
      return;
    }

    // Determine yesterday (or last working day)
    const yesterday = getYesterdayWorkingDay();

    logger.debug(`Analyzing sessions for ${yesterday.toDateString()}`);

    // Read sessions from all projects for yesterday
    const projectWork = new Map<string, ProjectWork>();

    for (const project of projects) {
      try {
        // Set date range for yesterday
        const startOfDay = new Date(yesterday);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(yesterday);
        endOfDay.setHours(23, 59, 59, 999);

        // Read all sessions for this project (we'll filter by date manually)
        const allSessions = await readClaudeSessions({
          projectPath: project.claudePath
        });

        // Filter sessions for yesterday
        const sessions = allSessions.filter(session => {
          const sessionDate = new Date(session.timestamp);
          return sessionDate >= startOfDay && sessionDate <= endOfDay;
        });

        if (sessions.length === 0) continue;

        const work: ProjectWork = {
          project: project.name,
          sessions: [],
          accomplishments: [],
          totalDuration: 0,
          totalMessages: 0
        };

        // Analyze each session
        for (const session of sessions) {
          const filesEditedArray: string[] = session.metadata?.files_edited
            ? (typeof session.metadata.files_edited === 'number'
              ? []
              : Array.from(session.metadata.files_edited as string[]))
            : [];

          work.sessions.push({
            duration: session.duration,
            messageCount: session.messages.length,
            filesEdited: filesEditedArray,
            languages: session.metadata?.languages || [],
            timestamp: session.timestamp
          });

          work.totalDuration += session.duration;
          work.totalMessages += session.messages.length;

          // Extract accomplishments from messages
          const sessionAccomplishments = extractAccomplishmentsFromSession(session);
          work.accomplishments.push(...sessionAccomplishments);
        }

        // Consolidate accomplishments
        work.accomplishments = consolidateAccomplishments(work.accomplishments);

        if (work.sessions.length > 0) {
          projectWork.set(project.name, work);
        }
      } catch (error) {
        logger.debug(`Failed to read sessions for ${project.name}:`, error);
      }
    }

    spinner.succeed('Analysis complete!');

    // Display the summary
    displayLocalStandupSummary(yesterday, projectWork);

  } catch (error) {
    spinner.fail('Failed to generate standup summary');
    logger.error('Standup generation failed:', error);
    throw error;
  }
}

function extractAccomplishmentsFromSession(session: any): Accomplishment[] {
  const accomplishments: Accomplishment[] = [];
  const filesCreated = new Set<string>();
  const filesEdited = new Set<string>();
  const commandsRun = new Set<string>();
  const testsRun = new Set<string>();

  // Analyze messages for accomplishments
  for (const message of session.messages) {
    if (message.role === 'assistant' && message.content) {
      // Look for tool uses in the content
      if (Array.isArray(message.content)) {
        for (const item of message.content) {
          if (item.type === 'tool_use') {
            switch (item.name) {
              case 'str_replace_editor':
              case 'str_replace_based_edit_tool':
              case 'Edit':
              case 'MultiEdit':
                if (item.input?.path || item.input?.file_path) {
                  filesEdited.add(path.basename(item.input.path || item.input.file_path));
                }
                break;
              case 'create_file':
              case 'Write':
                if (item.input?.path || item.input?.file_path) {
                  filesCreated.add(path.basename(item.input.path || item.input.file_path));
                }
                break;
              case 'execute_command':
              case 'Bash':
                if (item.input?.command) {
                  const cmd = item.input.command.split(' ')[0];
                  commandsRun.add(cmd);
                  if (cmd.includes('test') || cmd === 'npm' && item.input.command.includes('test')) {
                    testsRun.add('test suite');
                  }
                }
                break;
            }
          }
        }
      }
    }
  }

  // Convert to accomplishments
  if (filesCreated.size > 0) {
    accomplishments.push({
      type: 'file_created',
      description: `Created ${filesCreated.size} new file${filesCreated.size > 1 ? 's' : ''}`,
      count: filesCreated.size
    });
  }

  if (filesEdited.size > 0) {
    accomplishments.push({
      type: 'file_edited',
      description: `Modified ${filesEdited.size} file${filesEdited.size > 1 ? 's' : ''}`,
      count: filesEdited.size
    });
  }

  if (commandsRun.size > 0) {
    const importantCommands = Array.from(commandsRun).filter(cmd =>
      !['ls', 'cd', 'pwd', 'cat', 'echo'].includes(cmd)
    );
    if (importantCommands.length > 0) {
      accomplishments.push({
        type: 'command',
        description: `Executed ${importantCommands.length} command${importantCommands.length > 1 ? 's' : ''} (${importantCommands.slice(0, 3).join(', ')}${importantCommands.length > 3 ? '...' : ''})`,
        count: importantCommands.length
      });
    }
  }

  if (testsRun.size > 0) {
    accomplishments.push({
      type: 'test',
      description: 'Ran test suite',
      count: testsRun.size
    });
  }

  // Add general accomplishments based on patterns
  if (session.messages.length > 50) {
    accomplishments.push({
      type: 'general',
      description: `Intensive development session (${session.messages.length} interactions)`
    });
  } else if (session.messages.length > 20) {
    accomplishments.push({
      type: 'general',
      description: `Active development (${session.messages.length} interactions)`
    });
  }

  if (session.duration > 7200) {
    accomplishments.push({
      type: 'general',
      description: 'Extended focus session (2+ hours)'
    });
  }

  return accomplishments;
}

function consolidateAccomplishments(accomplishments: Accomplishment[]): Accomplishment[] {
  const consolidated = new Map<string, Accomplishment>();

  for (const acc of accomplishments) {
    const key = acc.type;
    if (consolidated.has(key)) {
      const existing = consolidated.get(key)!;
      if (existing.count && acc.count) {
        existing.count += acc.count;
        existing.description = `${acc.type === 'file_created' ? 'Created' :
                                acc.type === 'file_edited' ? 'Modified' :
                                acc.type === 'command' ? 'Executed' : ''} ${existing.count} ${
                                acc.type === 'file_created' || acc.type === 'file_edited' ? 'files' :
                                acc.type === 'command' ? 'commands' : 'items'}`;
      }
    } else {
      consolidated.set(key, { ...acc });
    }
  }

  // Add unique general accomplishments
  accomplishments
    .filter(a => a.type === 'general')
    .forEach(a => {
      const key = a.description;
      if (!consolidated.has(key)) {
        consolidated.set(key, a);
      }
    });

  return Array.from(consolidated.values());
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
    yesterday.setDate(today.getDate() - 1);
  }

  return yesterday;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function displayLocalStandupSummary(
  yesterday: Date,
  projectWork: Map<string, ProjectWork>
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

  if (projectWork.size === 0) {
    console.log(chalk.gray('  No work recorded for this day\n'));
  } else {
    let totalTime = 0;

    projectWork.forEach((work) => {
      totalTime += work.totalDuration;

      console.log(chalk.white(`\n  ${chalk.bold(work.project)} ${chalk.gray(`(${formatDuration(work.totalDuration)}, ${work.totalMessages} messages)`)}`));

      if (work.accomplishments.length > 0) {
        work.accomplishments.forEach(acc => {
          console.log(chalk.gray(`    • ${acc.description}`));
        });
      }

      // Add language information if available
      const allLanguages = new Set<string>();
      work.sessions.forEach(s => s.languages.forEach(l => allLanguages.add(l)));
      if (allLanguages.size > 0) {
        console.log(chalk.gray(`    • Worked with: ${Array.from(allLanguages).join(', ')}`));
      }
    });

    if (projectWork.size > 1) {
      console.log(chalk.gray(`\n  Total time: ${chalk.white(formatDuration(totalTime))}`));
    }
  }

  // Today's focus suggestions
  console.log(chalk.yellow('\n\nSUGGESTED FOCUS FOR TODAY'));
  console.log(chalk.gray('─────────────────────────────'));

  const suggestions = generateSmartSuggestions(projectWork);
  if (suggestions.length === 0) {
    console.log(chalk.gray('  No specific suggestions\n'));
  } else {
    console.log();
    suggestions.forEach(suggestion => {
      console.log(chalk.gray(`  ${suggestion}`));
    });
  }

  console.log(chalk.gray('\n═══════════════════════════════'));
  console.log(chalk.dim('\n💡 Tip: This analysis is based on your local Claude Code sessions'));
}

function generateSmartSuggestions(projectWork: Map<string, ProjectWork>): string[] {
  const suggestions: string[] = [];

  projectWork.forEach((work, projectName) => {
    // Check for patterns that suggest unfinished work
    const hasShortSessions = work.sessions.some(s => s.duration < 1800);
    const hasLongSessions = work.sessions.some(s => s.duration > 3600);
    const totalFiles = work.accomplishments
      .filter(a => a.type === 'file_edited' || a.type === 'file_created')
      .reduce((sum, a) => sum + (a.count || 0), 0);

    if (hasShortSessions && work.sessions.length > 1) {
      suggestions.push(`• Resume ${projectName} - had interrupted sessions`);
    } else if (totalFiles > 10) {
      suggestions.push(`• Review changes in ${projectName} - significant modifications made`);
    } else if (hasLongSessions) {
      suggestions.push(`• Continue deep work on ${projectName}`);
    }
  });

  return suggestions.slice(0, 5); // Limit to 5 suggestions
}