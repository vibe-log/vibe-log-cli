import chalk from 'chalk';
import { requireAuth } from '../lib/auth/token';
import { createSpinner } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';
import { readClaudeSessions } from '../lib/readers/claude';
import { SessionData } from '../lib/readers/types';
import { executeClaude, checkClaudeInstalled } from '../utils/claude-executor';
import { extractProjectName } from '../lib/claude-project-parser';
import {
  getYesterdayWorkingDay,
  getDayName,
  groupSessionsByProject,
  formatDuration,
  buildStandupPrompt,
  getClaudeSystemPrompt
} from '../lib/standup-utils';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

interface StandupData {
  yesterday: {
    date: string;
    projects: Array<{
      name: string;
      accomplishments: string[];
      duration: string;
    }>;
  };
  todayFocus: string[];
  blockers?: string[];
}

export async function standup(): Promise<void> {
  await requireAuth();

  const spinner = createSpinner('Reading your local Claude Code sessions...').start();

  try {
    logger.debug('Starting Claude-powered standup generation...');

    // Read local Claude sessions for the last 3 days (relevant for standup)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 3);

    logger.debug(`Reading sessions from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    const claudeSessions = await readClaudeSessions({ since: startDate });

    if (!claudeSessions || claudeSessions.length === 0) {
      spinner.fail('No sessions found');
      console.log(chalk.yellow('\nNo Claude Code sessions found in the last 3 days.'));
      console.log(chalk.gray('Start coding with Claude Code and then run this command again!'));
      return;
    }

    spinner.succeed(`Found ${claudeSessions.length} sessions from the last 3 days`);
    logger.debug(`Found ${claudeSessions.length} Claude sessions`);

    // Prepare sessions for Claude analysis by creating temp directory with session data
    const tempDir = path.join(os.tmpdir(), `.vibe-log-standup-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Write sessions to temp directory for Claude to analyze
    const yesterday = getYesterdayWorkingDay();
    const sessionsByProject = groupSessionsByProject(claudeSessions);

    // Create manifest for Claude
    const manifest = {
      targetDate: yesterday.toISOString(),
      dayOfWeek: getDayName(yesterday),
      totalSessions: claudeSessions.length,
      projects: Object.keys(sessionsByProject),
      sessionsPerProject: Object.entries(sessionsByProject).map(([project, sessions]) => ({
        project,
        count: sessions.length,
        files: sessions.map(s => `${s.id}.jsonl`)
      }))
    };

    await fs.writeFile(
      path.join(tempDir, 'standup-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Copy relevant session files to temp directory
    let copiedCount = 0;
    for (const session of claudeSessions) {
      // Use the sourceFile info if available, otherwise fall back to id
      const filename = (session as any).sourceFile?.sessionFile || `${session.id}.jsonl`;
      const projectPath = (session as any).sourceFile?.claudeProjectPath || session.projectPath;

      const sourcePath = path.join(projectPath, filename);
      const destPath = path.join(tempDir, filename);

      try {
        await fs.copyFile(sourcePath, destPath);
        copiedCount++;
      } catch (err) {
        logger.debug(`Could not copy session file ${filename}: ${err}`);
      }
    }

    logger.debug(`Copied ${copiedCount} of ${claudeSessions.length} session files`);

    // Create the standup analysis prompt
    const standupPrompt = buildStandupPrompt(tempDir, yesterday);

    // Check for Claude Code installation
    const claudeCheck = await checkClaudeInstalled();
    if (!claudeCheck.installed) {
      console.log(chalk.yellow('\n⚠️  Claude Code is not installed'));
      console.log(chalk.gray('Using basic analysis instead...'));
      const standupData = await fallbackAnalysis(claudeSessions, yesterday);
      displayStandupSummary(standupData);

      // Clean up temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        logger.debug(`Could not clean up temp directory: ${err}`);
      }
      return;
    }

    // Show analysis is starting
    console.log();
    console.log(chalk.cyan('🤖 Analyzing your work with Claude Code...'));
    console.log(chalk.gray(`📁 Found ${claudeSessions.length} sessions from ${Object.keys(sessionsByProject).length} projects`));
    console.log(chalk.gray('This will take about 30-45 seconds'));
    console.log();

    // Execute Claude to analyze the sessions
    let standupData: StandupData | null = null;

    let claudeMessages: string[] = [];

    try {
      await executeClaude(standupPrompt, {
        systemPrompt: getClaudeSystemPrompt(),
        cwd: tempDir,  // Use temp directory for execution
        claudePath: claudeCheck.path,  // Use the found Claude path
        onStreamEvent: (event) => {
          // Capture what Claude is saying
          if (event.type === 'assistant' && event.message?.content) {
            for (const content of event.message.content) {
              if (content.type === 'text' && content.text) {
                claudeMessages.push(content.text);
                logger.debug(`Claude says: ${content.text.substring(0, 200)}`);
              }
            }
          }
        },
        onComplete: async (code) => {
          logger.debug(`Claude execution completed with code: ${code}`);

          // Log what Claude actually said
          const fullOutput = claudeMessages.join('\n');
          if (claudeMessages.length > 0) {
            logger.debug('Claude full output:', fullOutput);
          }

          if (code === 0 && fullOutput) {
            // Try to parse Claude's response as JSON
            try {
              // Find JSON in the response - it might have some text before/after
              const jsonMatch = fullOutput.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const jsonStr = jsonMatch[0];
                standupData = JSON.parse(jsonStr);

                // Write the JSON to file for consistency
                const outputPath = path.join(tempDir, 'standup-output.json');
                await fs.writeFile(outputPath, JSON.stringify(standupData, null, 2));

                console.log(chalk.green('\n✓ Claude Code analysis complete!'));
                logger.debug('Successfully parsed standup data from Claude response');
              } else {
                logger.debug('No JSON found in Claude response');
                console.log(chalk.yellow('\n⚠️  Claude did not return valid JSON'));
              }
            } catch (err) {
              logger.debug(`Could not parse Claude output as JSON: ${err}`);
              console.log(chalk.yellow('\n⚠️  Claude response was not valid JSON'));

              // Log the actual response for debugging
              if (fullOutput.length < 500) {
                logger.debug(`Claude response: ${fullOutput}`);
              }
            }
          } else if (code !== 0) {
            console.log(chalk.yellow('\n⚠️  Claude analysis had an issue'));
          }
        }
      });
    } catch (error) {
      logger.error('Failed to execute Claude:', error);
      console.log(chalk.yellow(`\n⚠️  Could not run Claude: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }

    // If no standup data was generated, use fallback
    if (!standupData) {
      logger.debug('No standup data generated, using fallback');
      standupData = await fallbackAnalysis(claudeSessions, yesterday);
    }

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      logger.debug(`Could not clean up temp directory: ${err}`);
    }

    // Display the standup summary
    if (standupData) {
      displayStandupSummary(standupData);
    } else {
      console.log(chalk.yellow('\n⚠️  Could not generate standup summary'));
      console.log(chalk.gray('Please try again or check your Claude Code installation'));
    }

  } catch (error) {
    spinner.fail('Failed to generate standup summary');

    logger.error('Standup generation failed with error:', error);
    logger.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    if (error instanceof VibelogError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new VibelogError(`Failed to generate standup summary: ${errorMessage}`, 'STANDUP_ERROR');
  }
}

// Helper functions moved to ../lib/standup-utils.ts
// buildStandupPrompt also moved to standup-utils.ts

async function fallbackAnalysis(sessions: SessionData[], targetDate: Date): Promise<StandupData> {
  // Enhanced fallback analysis when Claude isn't available
  const yesterday = targetDate.toISOString().split('T')[0];
  const yesterdaySessions = sessions.filter(s =>
    s.timestamp.toISOString().split('T')[0] === yesterday
  );

  // If no work yesterday, find the most recent work
  let recentSessions = yesterdaySessions;
  let actualDate = targetDate;

  if (yesterdaySessions.length === 0) {
    // Find the most recent day with work
    const sortedSessions = sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    if (sortedSessions.length > 0) {
      actualDate = sortedSessions[0].timestamp;
      const recentDay = actualDate.toISOString().split('T')[0];
      recentSessions = sessions.filter(s =>
        s.timestamp.toISOString().split('T')[0] === recentDay
      );
    }
  }

  const projectWork = new Map<string, { sessions: SessionData[], duration: number }>();

  for (const session of recentSessions) {
    const projectName = extractProjectName(session.projectPath);
    if (!projectWork.has(projectName)) {
      projectWork.set(projectName, { sessions: [], duration: 0 });
    }
    const work = projectWork.get(projectName)!;
    work.sessions.push(session);
    // Use actual duration if available, otherwise estimate
    work.duration += session.duration || (session.messages.length * 120); // 2 minutes per message average
  }

  const projects = Array.from(projectWork.entries()).map(([name, work]) => {
    // Try to extract meaningful accomplishments from metadata
    const accomplishments: string[] = [];

    for (const session of work.sessions) {
      const fileCount = session.metadata?.files_edited || 0;
      const langs = session.metadata?.languages || [];

      // Try to create accomplishments based on available data
      if (fileCount > 0) {
        // Create accomplishment based on files and languages
        const langStr = langs.length > 0 ? langs.join(', ') : 'various files';
        accomplishments.push(`Modified ${fileCount} ${langStr} files`);
      } else {
        // Generic accomplishment based on session duration
        const minutes = Math.round(session.duration / 60);
        if (minutes > 30) {
          accomplishments.push(`Extended development session (${minutes} minutes)`);
        } else {
          accomplishments.push(`Quick fixes and updates (${minutes} minutes)`);
        }
      }
    }

    // Remove duplicates and limit to top 3
    const uniqueAccomplishments = Array.from(new Set(accomplishments)).slice(0, 3);

    // If we still don't have accomplishments, add generic ones
    if (uniqueAccomplishments.length === 0) {
      uniqueAccomplishments.push(`Development work on ${name}`);
    }

    const durationStr = formatDuration(work.duration);

    return {
      name,
      accomplishments: uniqueAccomplishments,
      duration: durationStr
    };
  });

  // Generate smarter suggestions based on recent activity patterns
  const allProjects = new Set<string>();
  const recentLanguages = new Set<string>();

  sessions.forEach(s => {
    allProjects.add(extractProjectName(s.projectPath));
    if (s.metadata?.languages) {
      s.metadata.languages.forEach(lang => recentLanguages.add(lang));
    }
  });

  const todayFocus: string[] = [];

  // Add project-specific focus
  if (projects.length > 0) {
    const topProject = projects[0].name;
    todayFocus.push(`Continue development on ${topProject}`);
  }

  // Add language/tech specific focus if detected
  if (recentLanguages.has('TypeScript') || recentLanguages.has('JavaScript')) {
    todayFocus.push('Complete pending TypeScript/JavaScript features');
  }

  // Add general development tasks
  if (sessions.some(s => s.metadata?.files_edited && s.metadata.files_edited > 10)) {
    todayFocus.push('Review and test recent changes');
  }

  // Add collaboration tasks if multiple projects
  if (allProjects.size > 2) {
    todayFocus.push('Sync with team on multi-project progress');
  }

  // Ensure we always have at least 2 focus items
  if (todayFocus.length < 2) {
    todayFocus.push('Address any outstanding pull request feedback');
    todayFocus.push('Update project documentation');
  }

  return {
    yesterday: {
      date: actualDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      }),
      projects
    },
    todayFocus: todayFocus.slice(0, 3) // Limit to 3 focus items
  };
}

function displayStandupSummary(data: StandupData): void {
  console.log(chalk.cyan('\n📋 Daily Standup Summary'));
  console.log(chalk.gray('═══════════════════════════════\n'));

  // Yesterday's accomplishments
  console.log(chalk.yellow(`WHAT I ACCOMPLISHED (${data.yesterday.date})`));
  console.log(chalk.gray('─────────────────────────────'));

  if (data.yesterday.projects.length === 0) {
    console.log(chalk.gray('  No sessions recorded for this day'));
    console.log(chalk.dim('  (Check recent work in your project folders)\n'));
  } else {
    for (const project of data.yesterday.projects) {
      console.log(chalk.white(`\n  ${chalk.bold(project.name)} ${chalk.gray(`(${project.duration})`)}`));

      for (const accomplishment of project.accomplishments) {
        console.log(chalk.gray(`    • ${accomplishment}`));
      }
    }
  }

  // Today's focus
  console.log(chalk.yellow('\n\nSUGGESTED FOCUS FOR TODAY'));
  console.log(chalk.gray('─────────────────────────────'));

  if (data.todayFocus.length === 0) {
    console.log(chalk.gray('  No specific plans identified\n'));
  } else {
    console.log();
    for (const item of data.todayFocus) {
      console.log(chalk.gray(`  • ${item}`));
    }
  }

  // Blockers (if any)
  if (data.blockers && data.blockers.length > 0) {
    console.log(chalk.red('\n\nBLOCKERS'));
    console.log(chalk.gray('─────────────────────────────'));
    console.log();
    for (const blocker of data.blockers) {
      console.log(chalk.gray(`  ⚠️  ${blocker}`));
    }
  }

  console.log(chalk.gray('\n═══════════════════════════════'));
  console.log(chalk.yellow('\n💡 Tip: Stop wasting tokens and time!'));
  console.log(chalk.cyan('   Switch to Cloud Mode for automated daily summaries!'));
  console.log();
}