import chalk from 'chalk';
import { requireAuth } from '../lib/auth/token';
import { createSpinner } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';
import { readClaudeSessions } from '../lib/readers/claude';
import { readCodexSessions } from '../lib/readers/codex';
import { isClaudeTempProject } from '../lib/temp-directories';
import { SessionData } from '../lib/readers/types';
import { executeClaude } from '../utils/claude-executor';
import {
  checkLocalAgentInstalled,
  getConfiguredLocalAgentProvider,
  type LocalAgentProviderId,
} from '../utils/acp-executor';
import { extractProjectName } from '../lib/claude-project-parser';
import {
  getYesterdayWorkingDay,
  formatDuration,
  buildStandupPrompt,
  getClaudeSystemPrompt,
  groupSessionsByProject
} from '../lib/standup-utils';
import { StandupTempManager } from '../lib/standup-temp-manager';
import { readInstructions } from '../lib/instructions';
import { getTipsForRotation } from '../lib/ui/standup-tips';
import path from 'path';
import fs from 'fs/promises';

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

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function readStandupSessions(since: Date): Promise<SessionData[]> {
  const sessions: SessionData[] = [];

  try {
    sessions.push(...await readClaudeSessions({ since }));
  } catch (error) {
    logger.debug(`Could not read Claude Code sessions for standup: ${error}`);
  }

  try {
    sessions.push(...await readCodexSessions({ since }));
  } catch (error) {
    logger.debug(`Could not read Codex sessions for standup: ${error}`);
  }

  return sessions
    .filter(session => !isClaudeTempProject(session.projectPath))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function countSessionsBySource(sessions: SessionData[]): { claude: number; codex: number } {
  return sessions.reduce((counts, session) => {
    if (session.source === 'codex' || session.tool === 'codex') {
      counts.codex++;
    } else {
      counts.claude++;
    }
    return counts;
  }, { claude: 0, codex: 0 });
}

function formatSourceCounts(sessions: SessionData[]): string {
  const counts = countSessionsBySource(sessions);
  const parts: string[] = [];
  if (counts.claude > 0) parts.push(`${counts.claude} Claude Code`);
  if (counts.codex > 0) parts.push(`${counts.codex} Codex`);
  return parts.join(', ');
}

function chooseStandupProvider(targetSessions: SessionData[]): LocalAgentProviderId {
  const explicitProvider = process.env.VIBELOG_LOCAL_AGENT_PROVIDER || process.env.VIBELOG_AGENT_PROVIDER;
  if (explicitProvider) {
    return getConfiguredLocalAgentProvider();
  }

  const counts = countSessionsBySource(targetSessions);
  if (counts.codex > 0) {
    return 'codex';
  }

  return 'claude';
}

export async function standup(options?: { skipAuth?: boolean }): Promise<void> {
  // Skip auth check if explicitly requested (for first-time onboarding)
  if (!options?.skipAuth) {
    await requireAuth();
  }

  const spinner = createSpinner('Reading your local Claude Code and Codex sessions...').start();

  try {
    logger.debug('Starting local ACP-powered standup generation...');

    // Read local supported sessions for the last 3 days (relevant for standup)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 3);

    logger.debug(`Reading sessions from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    const filteredSessions = await readStandupSessions(startDate);

    if (!filteredSessions || filteredSessions.length === 0) {
      spinner.fail('No sessions found');
      console.log(chalk.yellow('\nNo Claude Code or Codex sessions found in the last 3 days.'));
      console.log(chalk.gray('Start coding with Claude Code or Codex and then run this command again!'));
      return;
    }

    spinner.succeed(`Found ${filteredSessions.length} sessions from the last 3 days (${formatSourceCounts(filteredSessions)})`);
    logger.debug(`Found ${filteredSessions.length} local sessions for standup`);

    // Prepare temp directory with session data
    const tempManager = new StandupTempManager();
    const yesterday = getYesterdayWorkingDay();

    // CRITICAL: Filter out today's sessions - only show PAST work
    const today = new Date();
    const todayStr = localDateKey(today);
    const pastSessions = filteredSessions.filter(s =>
      localDateKey(s.timestamp) !== todayStr
    );

    // If no past sessions, show "nothing" message
    if (pastSessions.length === 0) {
      spinner.succeed('All sessions are from today - no past work to report');
      console.log(chalk.yellow('\nNo completed work to report yet.'));
      console.log(chalk.gray('Come back tomorrow to see today\'s standup summary!'));
      return;
    }

    // Find actual date with sessions (might not be yesterday)
    const yesterdayStr = localDateKey(yesterday);
    const yesterdaySessions = pastSessions.filter(s =>
      localDateKey(s.timestamp) === yesterdayStr
    );

    let actualTargetDate = yesterday;
    if (yesterdaySessions.length === 0) {
      // No sessions yesterday, find most recent PAST day with sessions
      const sortedSessions = pastSessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      if (sortedSessions.length > 0) {
        actualTargetDate = new Date(sortedSessions[0].timestamp);
        // Set to start of day to match date comparison
        actualTargetDate.setHours(0, 0, 0, 0);
      }
    }

    const tempDir = await tempManager.prepareTempDirectory(pastSessions, actualTargetDate);

    // Create the standup analysis prompt with actual date
    const standupPrompt = buildStandupPrompt(tempDir, actualTargetDate);

    // Show accurate count for actual target date
    const actualDateStr = localDateKey(actualTargetDate);
    const actualSessions = pastSessions.filter(s =>
      localDateKey(s.timestamp) === actualDateStr
    );

    // Check for local ACP agent availability after source detection. If Codex
    // sessions are present, standup uses Codex ACP instead of falling back to Claude.
    const localAgentProvider = chooseStandupProvider(actualSessions);
    const localAgentCheck = await checkLocalAgentInstalled(localAgentProvider);
    if (!localAgentCheck.installed) {
      console.log(chalk.yellow(`\n⚠️  ${localAgentCheck.name} ACP adapter is not available`));
      console.log(chalk.gray('Using basic analysis instead...'));
      const standupData = await fallbackAnalysis(pastSessions, actualTargetDate);
      displayStandupSummary(standupData);

      // Clean up temp directory
      await tempManager.cleanup();
      return;
    }

    // Show analysis is starting
    console.log();
    console.log(chalk.cyan(`🤖 Analyzing your work with ${localAgentCheck.name} via ACP...`));

    const actualSessionsByProject = groupSessionsByProject(actualSessions);
    const sourceSummary = formatSourceCounts(actualSessions);
    console.log(chalk.gray(`📁 Analyzing ${actualSessions.length} sessions from ${Object.keys(actualSessionsByProject).length} projects (${sourceSummary}; ${actualTargetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`));
    console.log();

    // Read custom instructions if available
    const customInstructions = await readInstructions();
    if (customInstructions) {
      console.log(chalk.gray('📝 Using your custom instructions'));
      logger.debug('Custom instructions loaded for standup analysis');
    }

    // Start spinner animation with rotating tips during Claude analysis
    const tips = getTipsForRotation();
    let tipIndex = Math.floor(Math.random() * tips.length); // Start with random tip

    // Start spinner first
    const analysisSpinner = createSpinner('Analyzing sessions...').start();

    // Show tips below spinner every 4 seconds
    const tipInterval = setInterval(() => {
      analysisSpinner.stop();
      console.log(chalk.gray(`\nTip: ${tips[tipIndex]}`));
      tipIndex = (tipIndex + 1) % tips.length;
      analysisSpinner.start();
    }, 4000);

    // Execute the selected local ACP provider to analyze the sessions
    let standupData: StandupData | null = null;

    const claudeMessages: string[] = [];

    try {
      await executeClaude(standupPrompt, {
        systemPrompt: getClaudeSystemPrompt(customInstructions || undefined),
        cwd: tempDir,  // Use temp directory so Claude can access the session files
        provider: localAgentProvider,
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
            // Try to parse Claude's response as JSON using delimiters
            try {
              // Look for JSON between the delimiters
              const startDelimiter = '----JSON START----';
              const endDelimiter = '----JSON END----';

              const startIndex = fullOutput.indexOf(startDelimiter);
              const endIndex = fullOutput.indexOf(endDelimiter);

              if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
                // Extract JSON between the delimiters
                const jsonStr = fullOutput.substring(
                  startIndex + startDelimiter.length,
                  endIndex
                ).trim();

                logger.debug(`Extracted JSON between delimiters: ${jsonStr.substring(0, 200)}`);
                standupData = JSON.parse(jsonStr);

                // Write the JSON to file for consistency
                const outputPath = path.join(tempDir, 'standup-output.json');
                await fs.writeFile(outputPath, JSON.stringify(standupData, null, 2));

                // Stop spinner and show completion
                clearInterval(tipInterval);
                analysisSpinner.succeed(`${localAgentCheck.name} analysis complete!`);
                logger.debug('Successfully parsed standup data from Claude response');
              } else {
                clearInterval(tipInterval);
                analysisSpinner.stop();
                if (startIndex === -1) {
                  logger.debug('JSON START delimiter not found in Claude response');
                }
                if (endIndex === -1) {
                  logger.debug('JSON END delimiter not found in Claude response');
                }
                if (startIndex !== -1 && endIndex !== -1 && startIndex >= endIndex) {
                  logger.debug(`Invalid delimiter positions: start=${startIndex}, end=${endIndex}`);
                }
                logger.debug(`Full Claude response for debugging: ${fullOutput}`);
                console.log(chalk.yellow('\n⚠️  Claude did not return JSON with expected delimiters'));
                console.log(chalk.gray('Try running with --debug flag to see Claude\'s full response'));
              }
            } catch (err) {
              clearInterval(tipInterval);
              analysisSpinner.stop();
              logger.debug(`Could not parse Claude output as JSON: ${err}`);
              console.log(chalk.yellow('\n⚠️  Claude response was not valid JSON'));

              // Check if we at least found the delimiters
              const hasStartDelimiter = fullOutput.includes('----JSON START----');
              const hasEndDelimiter = fullOutput.includes('----JSON END----');

              if (hasStartDelimiter && hasEndDelimiter) {
                logger.debug('Delimiters found but JSON parsing failed');
                console.log(chalk.gray('JSON delimiters found but content was malformed'));
              } else {
                logger.debug(`Missing delimiters - Start: ${hasStartDelimiter}, End: ${hasEndDelimiter}`);
              }

              // Log the actual response for debugging
              if (fullOutput.length < 1000) {
                logger.debug(`Claude response: ${fullOutput}`);
              } else {
                logger.debug(`Claude response (truncated): ${fullOutput.substring(0, 1000)}...`);
              }
            }
          } else if (code !== 0) {
            clearInterval(tipInterval);
            analysisSpinner.fail('Claude analysis had an issue');
          }
        }
      });
    } catch (error) {
      clearInterval(tipInterval);
      analysisSpinner.fail('Failed to execute Claude');
      logger.error('Failed to execute Claude:', error);
      console.log(chalk.yellow(`\n⚠️  Could not run Claude: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }

    // If no standup data was generated, use fallback
    if (!standupData) {
      logger.debug('No standup data generated, using fallback');
      standupData = await fallbackAnalysis(pastSessions, actualTargetDate);
    } else {
      // Calculate durations locally for consistency
      standupData = enrichWithLocalDurations(standupData, pastSessions, actualTargetDate);
    }

    // Clean up temp directory
    await tempManager.cleanup();

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
  const yesterday = localDateKey(targetDate);
  const today = localDateKey(new Date());

  // CRITICAL: Filter out today's sessions to avoid showing current work
  const pastSessions = sessions.filter(s => {
    const sessionDate = localDateKey(s.timestamp);
    return sessionDate !== today;  // Exclude today's sessions
  });

  const yesterdaySessions = pastSessions.filter(s =>
    localDateKey(s.timestamp) === yesterday
  );

  // If no work yesterday, find the most recent PAST work (not today)
  let recentSessions = yesterdaySessions;
  let actualDate = targetDate;

  if (yesterdaySessions.length === 0) {
    // Find the most recent day with work (excluding today)
    const sortedSessions = pastSessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    if (sortedSessions.length > 0) {
      actualDate = sortedSessions[0].timestamp;
      const recentDay = localDateKey(actualDate);
      recentSessions = pastSessions.filter(s =>
        localDateKey(s.timestamp) === recentDay
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

/**
 * Enrich standup data with locally calculated durations
 * This ensures consistent time reporting across runs
 */
function enrichWithLocalDurations(
  standupData: StandupData,
  sessions: SessionData[],
  targetDate: Date
): StandupData {
  // Filter sessions for the target date
  const targetDateStr = localDateKey(targetDate);
  const targetSessions = sessions.filter(s =>
    localDateKey(s.timestamp) === targetDateStr
  );

  // Group sessions by project and handle parallel sessions
  const projectSessions = new Map<string, SessionData[]>();

  for (const session of targetSessions) {
    const projectName = extractProjectName(session.projectPath);
    if (!projectSessions.has(projectName)) {
      projectSessions.set(projectName, []);
    }
    projectSessions.get(projectName)!.push(session);
  }

  // Calculate durations with parallel session detection
  const projectDurations = new Map<string, number>();

  for (const [projectName, sessions] of projectSessions.entries()) {
    // Sort sessions by start time
    const sortedSessions = sessions.sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    let totalDuration = 0;
    let lastEndTime = 0;

    for (const session of sortedSessions) {
      const sessionStart = session.timestamp.getTime();
      const sessionEnd = sessionStart + (session.duration || 0) * 1000;

      if (sessionStart < lastEndTime) {
        // Sessions overlap - only count non-overlapping time
        const overlap = lastEndTime - sessionStart;
        const actualDuration = Math.max(0, (session.duration || 0) * 1000 - overlap);
        totalDuration += actualDuration / 1000;
        lastEndTime = Math.max(lastEndTime, sessionEnd);
      } else {
        // No overlap - count full duration
        totalDuration += session.duration || 0;
        lastEndTime = sessionEnd;
      }
    }

    projectDurations.set(projectName, totalDuration);
  }

  // Update the standup data with calculated durations
  // Try both exact and fuzzy matching for project names
  if (standupData.yesterday && standupData.yesterday.projects) {
    for (const project of standupData.yesterday.projects) {
      // First try exact match
      let totalSeconds = projectDurations.get(project.name);

      // If no exact match, try to find a similar project name
      if (totalSeconds === undefined) {
        // Check if Claude's project name is a substring of any local project name
        for (const [localProjectName, duration] of projectDurations.entries()) {
          if (localProjectName.includes(project.name) || project.name.includes(localProjectName)) {
            totalSeconds = duration;
            logger.debug(`Matched Claude project "${project.name}" to local project "${localProjectName}"`);
            break;
          }
        }

        // If still no match, log for debugging
        if (totalSeconds === undefined) {
          logger.debug(`No duration found for project "${project.name}". Available projects: ${Array.from(projectDurations.keys()).join(', ')}`);
          totalSeconds = 0;
        }
      }

      project.duration = formatDuration(totalSeconds);
    }
  }

  // Also ensure any projects found locally but not in Claude's response are added
  // This handles cases where Claude might miss a project
  const claudeProjectNames = new Set(
    standupData.yesterday?.projects?.map(p => p.name) || []
  );

  for (const [localProjectName, duration] of projectDurations.entries()) {
    // Check if this project is missing from Claude's response
    let found = false;
    for (const claudeProject of claudeProjectNames) {
      if (localProjectName === claudeProject ||
          localProjectName.includes(claudeProject) ||
          claudeProject.includes(localProjectName)) {
        found = true;
        break;
      }
    }

    if (!found && duration > 0) {
      // Add the missing project to the standup data
      logger.debug(`Adding missing project "${localProjectName}" with duration ${duration} seconds`);
      if (!standupData.yesterday.projects) {
        standupData.yesterday.projects = [];
      }
      standupData.yesterday.projects.push({
        name: localProjectName,
        accomplishments: [`Development work on ${localProjectName}`],
        duration: formatDuration(duration)
      });
    }
  }

  return standupData;
}
