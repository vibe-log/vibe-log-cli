import inquirer from 'inquirer';
import { colors, icons, box, format } from './styles';
import { discoverProjects } from '../claude-core';
import { discoverCodexProjects } from '../codex-core';
import { SelectableProject } from './project-selector';
import { interactiveProjectSelector } from './interactive-project-selector';
import { buildOrchestratedPrompt } from '../prompts/orchestrator';
import { PromptContext } from '../../types/prompts';
import { executeClaudePrompt } from '../report-executor';
import {
  checkLocalAgentInstalled,
  getConfiguredLocalAgentProvider,
  type LocalAgentProviderId,
} from '../../utils/acp-executor';
import { getStatusLineStatus } from '../status-line-manager';
import { readInstructions } from '../instructions';
import { readClaudeSessions } from '../readers/claude';
import { readCodexSessions } from '../readers/codex';
import { SessionData, SessionSource } from '../readers/types';
import { promises as fs } from 'fs';
import path from 'path';
import { getTempDirectoryPath, isClaudeTempProject } from '../temp-directories';

interface TimeframeOption {
  name: string;
  value: string;
  days?: number;
}

interface LocalReportProject extends SelectableProject {
  sources: SessionSource[];
  sourcePaths: Partial<Record<SessionSource, string>>;
}

/**
 * Display explanation about local report generation
 */
function showLocalReportExplanation(): void {
  console.clear();
  
  // Main header with box drawing
  const headerText = ' Generate Local Report ';
  const headerWidth = 60;
  const headerPadding = Math.floor((headerWidth - headerText.length) / 2);
  const headerLine = box.horizontal.repeat(headerPadding) + headerText + box.horizontal.repeat(headerWidth - headerPadding - headerText.length);
  
  console.log('\n' + colors.accent(box.horizontal.repeat(2) + headerLine + box.horizontal.repeat(2)));
  console.log();
  
  // Section 1: How it works
  console.log(colors.primary(format.bold('How Local Reports Work')));
  console.log(colors.highlight('Local reports use your local ACP agent to quickly analyze sessions'));
  console.log(colors.highlight('and generate a HTML report with key insights,'));
  console.log(colors.highlight('keeping your data 100% private on your machine.'));
  console.log();
  
  // Section 2: What's included
  console.log(colors.primary(format.bold('Report Contents:')));
  console.log(`  ${icons.bullet} ${colors.accent('Executive Summary')} - 3-4 key points`);
  console.log(`  ${icons.bullet} ${colors.accent('Top 3 Projects')} - Time invested`);
  console.log(`  ${icons.bullet} ${colors.accent('Key Accomplishments')} - 2-3 highlights`);
  console.log(`  ${icons.bullet} ${colors.accent('Productivity Insight')} - 1 main observation`);
  console.log(`  ${icons.bullet} ${colors.accent('Quick Stats')} - Total hours & sessions`);
  console.log();
  
  // Section 3: Privacy note
  console.log(colors.success(`${icons.lock} ${format.bold('100% Private')}`));
  console.log(colors.muted('All analysis happens locally using your configured agent subscription or tokens.'));
  console.log(colors.muted('No data is sent to vibe-log servers in local mode.'));
  console.log();
  
  // Section 4: First-time user guidance
  console.log(colors.primary(format.bold('👋 First Time? Start Small!')));
  console.log(colors.accent('  📅 Try "Last 24 hours" - faster analysis (2-4 minutes)'));
  console.log(colors.accent('  📁 Select just 1 project - easier to review results'));
  console.log(colors.muted('  You can always generate larger reports once you like what you see!'));
  console.log();
  
  // Bottom border
  console.log(colors.muted(box.horizontal.repeat(62)));
  console.log();
}

/**
 * Prompt for timeframe selection
 */
async function selectTimeframe(): Promise<{ timeframe: string; days: number }> {
  const timeframeOptions: TimeframeOption[] = [
    { name: 'Last 24 hours (Recommended for first time) - ~2-4 minutes', value: '24h', days: 1 },
    { name: 'Last 7 days - ~5-8 minutes', value: '7d', days: 7 },
    { name: 'Last 30 days - ~8-15 minutes', value: '30d', days: 30 },
    { name: 'Custom range', value: 'custom' }
  ];
  
  const { timeframe } = await inquirer.prompt([
    {
      type: 'list',
      name: 'timeframe',
      message: 'Select timeframe:',
      choices: timeframeOptions
    }
  ]);
  
  if (timeframe === 'custom') {
    const { days } = await inquirer.prompt([
      {
        type: 'number',
        name: 'days',
        message: 'Enter number of days to analyze:',
        default: 14,
        validate: (input) => {
          if (!input || input < 1 || input > 365) {
            return 'Please enter a number between 1 and 365';
          }
          return true;
        }
      }
    ]);
    return { timeframe: `${days}d`, days };
  }
  
  const selected = timeframeOptions.find(opt => opt.value === timeframe);
  return { timeframe, days: selected?.days || 7 };
}

function mergeLocalReportProject(
  grouped: Map<string, LocalReportProject>,
  input: {
    source: SessionSource;
    name: string;
    actualPath: string;
    sourcePath: string;
    sessions: number;
    lastActivity: Date | null;
    isActive: boolean;
  }
): void {
  const normalizedPath = path.normalize(input.actualPath);
  if (isClaudeTempProject(normalizedPath)) {
    return;
  }

  const key = normalizedPath.toLowerCase();
  const existing = grouped.get(key);

  if (!existing) {
    grouped.set(key, {
      id: normalizedPath,
      name: input.name,
      path: normalizedPath,
      sessions: input.sessions,
      lastActivity: input.lastActivity || new Date(0),
      selected: false,
      isActive: input.isActive,
      sources: [input.source],
      sourcePaths: {
        [input.source]: input.sourcePath,
      },
    });
    return;
  }

  const existingLastActivity = new Date(existing.lastActivity);
  existing.sessions += input.sessions;
  existing.lastActivity = input.lastActivity && input.lastActivity > existingLastActivity
    ? input.lastActivity
    : existing.lastActivity;
  existing.isActive = existing.isActive || input.isActive;
  existing.sources = Array.from(new Set([...existing.sources, input.source]));
  existing.sourcePaths[input.source] = input.sourcePath;
}

async function discoverLocalReportProjects(): Promise<LocalReportProject[]> {
  const grouped = new Map<string, LocalReportProject>();
  const [claudeProjects, codexProjects] = await Promise.all([
    discoverProjects().catch(() => []),
    discoverCodexProjects().catch(() => []),
  ]);

  for (const project of claudeProjects) {
    mergeLocalReportProject(grouped, {
      source: 'claude',
      name: project.name,
      actualPath: project.actualPath,
      sourcePath: project.claudePath,
      sessions: project.sessions,
      lastActivity: project.lastActivity,
      isActive: project.isActive,
    });
  }

  for (const project of codexProjects) {
    mergeLocalReportProject(grouped, {
      source: 'codex',
      name: project.name,
      actualPath: project.actualPath,
      sourcePath: project.codexPath,
      sessions: project.sessions,
      lastActivity: project.lastActivity,
      isActive: project.isActive,
    });
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const aTime = new Date(a.lastActivity).getTime();
    const bTime = new Date(b.lastActivity).getTime();
    return bTime - aTime;
  });
}

function hasCodexSource(projects: LocalReportProject[]): boolean {
  return projects.some(project => project.sources.includes('codex'));
}

async function readProjectSessions(project: LocalReportProject, since: Date): Promise<SessionData[]> {
  const sessions: SessionData[] = [];

  if (project.sources.includes('claude')) {
    sessions.push(...await readClaudeSessions({
      since,
      projectPath: project.path,
    }));
  }

  if (project.sources.includes('codex')) {
    sessions.push(...await readCodexSessions({
      since,
      projectPath: project.path,
    }));
  }

  return sessions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function safeManifestFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function copySelectedProjectSessions(input: {
  selectedProjects: LocalReportProject[];
  tempDir: string;
  days: number;
  timeframe: string;
}): Promise<{ copiedFiles: number; totalSessions: number; manifest: any }> {
  const since = new Date();
  since.setDate(since.getDate() - input.days);

  let copiedFiles = 0;
  let totalSessions = 0;
  const manifest: any = {
    generated: new Date().toISOString(),
    timeframe: input.timeframe,
    timeframeDays: input.days,
    sources: Array.from(new Set(input.selectedProjects.flatMap(project => project.sources))),
    projects: [],
    sessionFiles: []
  };

  for (const project of input.selectedProjects) {
    let projectSessionCount = 0;

    try {
      const sessions = await readProjectSessions(project, since);

      for (const [index, session] of sessions.entries()) {
        const sourceFile = session.sourceFile?.fullPath;
        if (!sourceFile) continue;

        const stat = await fs.stat(sourceFile);
        const source = session.source || session.sourceFile?.source || (session.tool === 'codex' ? 'codex' : 'claude');
        const originalFile = session.sourceFile?.sessionFile || path.basename(sourceFile);
        const destFilename = safeManifestFilename(`${project.name}_${source}_${index + 1}_${originalFile}`);
        const destFile = path.join(input.tempDir, destFilename);

        await fs.copyFile(sourceFile, destFile);

        copiedFiles++;
        projectSessionCount++;

        const sizeKB = parseFloat((stat.size / 1024).toFixed(2));
        manifest.sessionFiles.push({
          file: destFilename,
          project: project.name,
          source,
          originalPath: sourceFile,
          modified: stat.mtime.toISOString(),
          sizeKB,
          isLarge: stat.size > 100000,
          readStrategy: stat.size > 100000 ? 'read_partial' : 'read_full'
        });
      }

      manifest.projects.push({
        name: project.name,
        path: project.path,
        sources: project.sources,
        sourcePaths: project.sourcePaths,
        sessionCount: projectSessionCount
      });

      totalSessions += projectSessionCount;
    } catch (err) {
      console.log(colors.warning(`⚠️  Could not access project: ${project.name}`));
      console.log(colors.muted(`   ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  manifest.totalSessions = totalSessions;

  return { copiedFiles, totalSessions, manifest };
}

/**
 * Main interactive function for generating local reports
 */
/**
 * Show sub-agents management menu
 */
async function showSubAgentsManagement(): Promise<void> {
  const { installSubAgents, removeAllSubAgents } = await import('../sub-agents/manager');
  const { installSubAgentsInteractive } = await import('./sub-agents-installer');

  console.log('🤖 Sub-Agents Management');
  console.log('Current status: ✓ Installed\n');

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      'Update sub-agents',
      'Reinstall sub-agents',
      'Uninstall sub-agents',
      '← Back'
    ]
  }]);

  // Handle management actions
  switch(action) {
    case 'Update sub-agents':
      console.log(colors.info('\nUpdating sub-agents...'));
      // Update is essentially reinstall with force
      await installSubAgents({ force: true });
      console.log(colors.success('Sub-agents updated successfully!'));
      break;

    case 'Reinstall sub-agents':
      console.log(colors.info('\nReinstalling sub-agents...'));
      // First remove all, then install
      await removeAllSubAgents();
      await installSubAgentsInteractive();
      console.log(colors.success('Sub-agents reinstalled successfully!'));
      break;

    case 'Uninstall sub-agents': {
      const { confirmUninstall } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmUninstall',
        message: colors.warning('Are you sure you want to uninstall all sub-agents?'),
        default: false
      }]);

      if (confirmUninstall) {
        console.log(colors.info('\nUninstalling sub-agents...'));
        await removeAllSubAgents();
        console.log(colors.success('Sub-agents uninstalled successfully!'));
      }
      break;
    }
  }
}

export async function generateLocalReportInteractive(): Promise<void> {
  // Check if sub-agents are installed
  const { checkInstalledSubAgents } = await import('../sub-agents/manager');
  const subAgentStatus = await checkInstalledSubAgents();

  if (subAgentStatus.missing.length > 0) {
    // Sub-agents are missing, prompt to install
    console.clear();
    console.log('📊 Generate Local Report\n');
    console.log('This feature requires vibe-log sub-agents to be installed.');
    console.log('Sub-agents are local AI components that analyze your sessions.\n');
    console.log('Current status: Not installed\n');
    console.log('This is a one-time installation (~2 minutes).\n');

    const { install } = await inquirer.prompt([{
      type: 'confirm',
      name: 'install',
      message: 'Install sub-agents and continue?',
      default: true
    }]);

    if (install) {
      const { installSubAgentsInteractive } = await import('./sub-agents-installer');
      await installSubAgentsInteractive();

      // Check if installation was successful
      const newStatus = await checkInstalledSubAgents();
      if (newStatus.missing.length === 0) {
        console.log();
        const { continueReport } = await inquirer.prompt([{
          type: 'confirm',
          name: 'continueReport',
          message: 'Sub-agents installed! Would you like to generate your report now?',
          default: true
        }]);

        if (!continueReport) {
          return;
        }
      } else {
        console.log(colors.warning('\nSub-agent installation was incomplete. Please try again.'));
        return;
      }
    } else {
      return;
    }
  } else {
    // Sub-agents are installed, offer management option
    console.clear();
    console.log('📊 Generate Local Report\n');
    console.log(colors.success('✓ Sub-agents installed\n'));

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Select an option:',
      choices: [
        'Continue to report generation',
        new inquirer.Separator('───────────────────'),
        'Manage sub-agents',
        '← Back to main menu'
      ]
    }]);

    switch(action) {
      case 'Manage sub-agents':
        await showSubAgentsManagement();
        // Show the menu again after management
        await generateLocalReportInteractive();
        return;

      case '← Back to main menu':
        return;

      // Continue to report generation is handled by falling through
    }
  }
  
  // Show explanation
  showLocalReportExplanation();
  
  // Step 1: Select timeframe
  console.log(colors.accent('Step 1: Select Timeframe'));
  console.log();
  const { timeframe, days } = await selectTimeframe();
  console.log();
  
  // Step 2: Discover and select projects
  console.log(colors.accent('Step 2: Select Projects to Include'));
  console.log(colors.muted('Discovering Claude Code and Codex projects...'));
  console.log();
  
  // Add processing time guidance
  if (days === 1) {
    console.log(colors.info('💡 Tip: For 24-hour reports, selecting 1-2 projects gives the best experience'));
  } else if (days <= 7) {
    console.log(colors.info('💡 Tip: Multiple projects are fine, but expect longer processing time'));
  } else {
    console.log(colors.warning('💡 Tip: 30-day reports with many projects can take 10-15+ minutes'));
  }
  console.log();
  
  const allProjects = await discoverLocalReportProjects();
  
  if (allProjects.length === 0) {
    console.log(colors.warning(`${icons.warning} No Claude Code or Codex projects found`));
    console.log(colors.muted('Start a Claude Code or Codex session to begin tracking.'));
    return;
  }
  
  // Filter projects by timeframe (only show projects with recent activity)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentProjects = allProjects.filter(p => 
    p.lastActivity && p.lastActivity >= cutoffDate
  );
  
  if (recentProjects.length === 0) {
    console.log(colors.warning(`${icons.warning} No projects with activity in the last ${days} days`));
    console.log(colors.muted('Try selecting a longer timeframe.'));
    return;
  }
  
  // Show project selector
  const selectedProjects = await interactiveProjectSelector({
    projects: recentProjects,
    multiSelect: true,
    title: `SELECT PROJECTS (${recentProjects.length} with recent activity)`,
    showStats: true
  });
  
  if (selectedProjects.length === 0) {
    console.log(colors.warning('\nNo projects selected. Report generation cancelled.'));
    return;
  }
  
  // Step 3: Generate report
  console.clear();
  console.log(colors.accent('\n--- Generating Report ---'));
  console.log();
  console.log(colors.info(`Timeframe: ${timeframe}`));
  console.log(colors.info(`Projects: ${selectedProjects.length} selected`));
  selectedProjects.forEach(p => {
    console.log(colors.muted(`  ${icons.folder} ${p.name}`));
  });
  console.log();
  console.log(colors.warning('📍 Report will be saved in your current directory'));
  
  // Show dynamic time estimate based on selections
  let estimatedTime: string;
  if (days === 1 && selectedProjects.length === 1) {
    estimatedTime = '~2-4 minutes';
  } else if (days === 1 && selectedProjects.length <= 3) {
    estimatedTime = '~3-6 minutes';
  } else if (days <= 7 && selectedProjects.length <= 3) {
    estimatedTime = '~5-8 minutes';
  } else if (days <= 30 && selectedProjects.length <= 3) {
    estimatedTime = '~8-12 minutes';
  } else {
    estimatedTime = '~10-20 minutes';
  }
  
  console.log(colors.muted(`   Estimated generation time: ${estimatedTime}`));
  console.log();
  
  // Check if status line is installed for the report recommendation
  const statusLineStatus = await getStatusLineStatus();
  const isStatusLineInstalled = statusLineStatus === 'installed';

  // Read custom instructions if available
  const customInstructions = await readInstructions();

  // Build the orchestrated prompt
  const promptContext: PromptContext = {
    timeframe,
    days,
    projectPaths: selectedProjects.map(p => p.path),
    projectNames: selectedProjects.map(p => p.name),
    statusLineInstalled: isStatusLineInstalled,
    customInstructions: customInstructions || undefined
  };
  
  const orchestrated = buildOrchestratedPrompt(promptContext);
  
  console.log(colors.primary('Generated Plan:'));
  console.log();
  console.log(colors.accent('This command will orchestrate vibe-log sub-agents to:'));
  console.log(colors.highlight('  1. Fetch and organize your Claude Code and Codex sessions into chunks'));
  console.log(colors.highlight(`  2. Run ${days > 1 ? `${Math.min(days, 7)} parallel analyzers` : '1 analyzer'} to extract patterns`));
  console.log(colors.highlight('  3. Generate a concise HTML report'));
  if (days > 1) {
    console.log();
    console.log(colors.success(`  ⚡ Parallel execution: ${Math.min(days, 7)} sub-agents analyzers will run simultaneously!`));
  }
  console.log();
  
  // Check local ACP agent availability for the recommended execution option
  const selectedReportProjects = selectedProjects as LocalReportProject[];
  const configuredProvider = hasCodexSource(selectedReportProjects)
    && !process.env.VIBELOG_LOCAL_AGENT_PROVIDER
    && !process.env.VIBELOG_AGENT_PROVIDER
    ? 'codex'
    : getConfiguredLocalAgentProvider();
  const providerOrder: LocalAgentProviderId[] = configuredProvider === 'claude'
    ? ['claude', 'codex']
    : ['codex', 'claude'];
  const localAgentChecks = await Promise.all(providerOrder.map((provider) => checkLocalAgentInstalled(provider)));
  const configuredAgentCheck = localAgentChecks.find((check) => check.provider === configuredProvider) || localAgentChecks[0];
  
  // Build choices based on local ACP agent availability
  const choices = [];
  for (const check of localAgentChecks) {
    if (!check.installed) continue;
    const recommended = check.provider === configuredProvider ? ' (Recommended)' : '';
    choices.push({
      name: `🚀 Generate with ${check.name} via ACP${recommended}`,
      value: `execute:${check.provider}`,
    });
  }
  choices.push(
    { name: '👁️  View full prompt', value: 'view' },
    { name: '↩️  Return to menu', value: 'return' }
  );
  
  // Show local agent unavailable message if needed  
  if (!localAgentChecks.some((check) => check.installed)) {
    console.log(colors.muted(`${configuredAgentCheck.name} ACP adapter not available`));
    console.log();
  }
  
  // Prompt to execute, inspect prompt, or return
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices
    }
  ]);
  
  if (typeof action === 'string' && action.startsWith('execute:')) {
    const selectedProvider = action.split(':')[1] as LocalAgentProviderId;
    const selectedAgentCheck = localAgentChecks.find((check) => check.provider === selectedProvider) || configuredAgentCheck;
    // Pre-fetch session files before executing the selected ACP provider
    console.log();
    console.log(colors.accent('Pre-fetching session data...'));
    
    // Get the temp report directory that will be used as cwd
    const tempReportDir = getTempDirectoryPath('PRODUCTIVITY_REPORT');
    
    try {
      // Create temp directory for session files within the report directory
      const tempDir = path.join(tempReportDir, '.vibe-log-temp');
      
      // Remove old temp directory if it exists
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Directory might not exist, that's fine
      }
      
      // Create fresh temp directory
      await fs.mkdir(tempDir, { recursive: true });
      console.log(colors.info(`📁 Created temp directory: ${tempDir}`));
      
      const { copiedFiles, totalSessions, manifest } = await copySelectedProjectSessions({
        selectedProjects: selectedReportProjects,
        tempDir,
        days,
        timeframe,
      });
      
      console.log(colors.success(`✓ Copied ${copiedFiles} session files from selected projects`));
      if (totalSessions === 0) {
        console.log(colors.warning('No session files matched the selected projects and timeframe.'));
        console.log(colors.muted('Try selecting a longer timeframe or another project.'));
        return;
      }
      
      // Save lightweight manifest
      const manifestPath = path.join(tempDir, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      
      // Verify manifest was created
      try {
        const stats = await fs.stat(manifestPath);
        const fileSize = (stats.size / 1024).toFixed(2);
        console.log(colors.success(`✅ Manifest created successfully (${fileSize} KB)`));
        console.log(colors.muted(`   Sessions ready for analysis in: ${tempDir}`));
      } catch (verifyError) {
        // Manifest doesn't exist - critical error
        console.log(colors.error(`❌ CRITICAL: Failed to create manifest at ${manifestPath}`));
        console.log(colors.error(`   Error: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`));
        console.log();
        console.log(colors.warning('Report generation cannot continue without the manifest.'));
        process.exit(1);
      }
      
      console.log();
      
      // Update the prompt to reference the temp directory
      const updatedPrompt = orchestrated.prompt.replace(
        'Projects to analyze:',
        `Session files have been copied to: .vibe-log-temp/\nManifest available at: .vibe-log-temp/manifest.json\n\nProjects to analyze:`
      );
      
      // Execute directly with the selected ACP provider
      console.log(colors.muted(`Using orchestrated prompt (${updatedPrompt.length} characters)`));
      console.log(colors.muted(`System prompt adds behavioral instructions (${orchestrated.systemPrompt.length} characters)`));
      if (customInstructions) {
        console.log(colors.success(`✓ Custom instructions applied (${customInstructions.length} characters)`));
      } else {
        console.log(colors.muted(`ℹ No custom instructions configured`));
      }
      
      // Ensure temp report directory exists (already defined above)
      await fs.mkdir(tempReportDir, { recursive: true }).catch(() => {});
      
      await executeClaudePrompt(updatedPrompt, {
        systemPrompt: orchestrated.systemPrompt,  // Pass the system prompt
        cwd: tempReportDir,  // Use temp directory to isolate report generation sessions
        provider: selectedProvider,
        onComplete: async (code) => {
          console.log(colors.muted(`${selectedAgentCheck.name} completed with exit code: ${code}`));
          
          // Clean up temp directory
          try {
            const tempDir = path.join(tempReportDir, '.vibe-log-temp');
            await fs.rm(tempDir, { recursive: true, force: true });
            console.log(colors.muted('Cleaned up temporary session files'));
          } catch (e) {
            // Ignore cleanup errors
          }
        },
        onError: (error) => {
          console.log();
          console.log(colors.error(`${icons.error} Failed to execute ${selectedAgentCheck.name}: ${error.message}`));
          
          // Show detailed error for debugging
          if (process.env.VIBELOG_DEBUG || error.stack) {
            console.log(colors.muted('Error details:'));
            console.log(colors.muted(error.stack || error.toString()));
          }
          
          // Clean up temp directory before exiting
          const tempDir = path.join(tempReportDir, '.vibe-log-temp');
          fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
            // Ignore cleanup errors
          });
          
          // Exit gracefully without recursive call
          console.log(colors.muted('Report generation failed. Please check your ACP adapter and try again.'));
        }
      });
    } catch (error) {
      // This should only happen if there's an error starting Claude
      console.log();
      console.log(colors.error(`Failed to start Claude: ${error instanceof Error ? error.message : String(error)}`));
      
      // Show detailed error for debugging
      if (process.env.VIBELOG_DEBUG || (error instanceof Error && error.stack)) {
        console.log(colors.muted('Error details:'));
        console.log(colors.muted(error instanceof Error ? error.stack : String(error)));
      }
      
      // Clean up temp directory before exiting
      const tempDir = path.join(tempReportDir, '.vibe-log-temp');
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors
      });
      
      // Exit gracefully without recursive call
      console.log(colors.muted('Report generation failed. Please check your ACP adapter and try again.'));
      return;
    }
  } else if (action === 'view') {
    // Show the full prompt
    console.log();
    console.log(colors.accent('=== Full Orchestrated Prompt ==='));
    console.log();
    console.log(colors.highlight(orchestrated.prompt));
    console.log();
    console.log(colors.muted('Press any key to return...'));
    
    // Wait for user input
    await new Promise(resolve => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        resolve(void 0);
      });
    });
    
    // Re-run the generator
    return generateLocalReportInteractive();
  }
}
