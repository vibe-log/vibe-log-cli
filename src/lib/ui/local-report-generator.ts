import inquirer from 'inquirer';
import { colors, icons, box, format } from './styles';
import { discoverProjects, ClaudeProject } from '../claude-core';
import { SelectableProject } from './project-selector';
import { interactiveProjectSelector } from './interactive-project-selector';
import { buildOrchestratedPrompt, getExecutableCommand } from '../prompts/orchestrator';
import { PromptContext } from '../../types/prompts';
import { checkClaudeInstalled } from '../../utils/claude-executor';
import { executeClaudePrompt } from '../report-executor';
import { getStatusLineStatus } from '../status-line-manager';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getTempDirectoryPath } from '../temp-directories';

interface TimeframeOption {
  name: string;
  value: string;
  days?: number;
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
  console.log(colors.highlight('Local reports use Claude Code to quickly analyze your sessions'));
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
  console.log(colors.muted('All analysis happens locally using your Claude Code tokens.'));
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

/**
 * Convert ClaudeProject to SelectableProject for the UI
 */
function toSelectableProjects(
  projects: ClaudeProject[], 
  previouslySelected: string[]
): SelectableProject[] {
  return projects.map(p => ({
    id: p.claudePath,
    name: p.name,
    path: p.actualPath,
    sessions: p.sessions,
    lastActivity: p.lastActivity || new Date(),
    selected: previouslySelected.includes(p.claudePath),
    isActive: p.isActive
  }));
}

/**
 * Main interactive function for generating local reports
 */
export async function generateLocalReportInteractive(): Promise<void> {
  // Safety check: Ensure sub-agents are installed
  const { checkInstalledSubAgents } = await import('../sub-agents/manager');
  const subAgentStatus = await checkInstalledSubAgents();
  
  if (subAgentStatus.missing.length > 0) {
    console.clear();
    console.log(colors.error('\n❌ Sub-agents Not Installed'));
    console.log(colors.muted('Local report generation requires all vibe-log sub-agents to be installed.'));
    console.log();
    console.log(colors.warning(`Missing ${subAgentStatus.missing.length} of ${subAgentStatus.total} sub-agents:`));
    subAgentStatus.missing.forEach(agent => {
      console.log(colors.muted(`  • ${agent}`));
    });
    console.log();
    console.log(colors.info('Please install sub-agents from the main menu:'));
    console.log(colors.accent('  📦 Manage local sub-agents'));
    console.log();
    console.log(colors.muted('Press Enter to return to menu...'));
    
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
    return;
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
  console.log(colors.muted('Discovering Claude Code projects...'));
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
  
  const allProjects = await discoverProjects();
  
  if (allProjects.length === 0) {
    console.log(colors.warning(`${icons.warning} No Claude Code projects found`));
    console.log(colors.muted('Start a Claude Code session to begin tracking.'));
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
  
  // Convert to selectable format (no previous selection persistence for local reports)
  const selectableProjects = toSelectableProjects(recentProjects, []);
  
  // Show project selector
  const selectedProjects = await interactiveProjectSelector({
    projects: selectableProjects,
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
  
  // Build the orchestrated prompt
  const promptContext: PromptContext = {
    timeframe,
    days,
    projectPaths: selectedProjects.map(p => p.id),
    projectNames: selectedProjects.map(p => p.name),
    statusLineInstalled: isStatusLineInstalled
  };
  
  const orchestrated = buildOrchestratedPrompt(promptContext);
  const executableCommand = getExecutableCommand(orchestrated.prompt);
  
  console.log(colors.primary('Generated Command:'));
  console.log();
  console.log(colors.accent('This command will orchestrate vibe-log sub-agents to:'));
  console.log(colors.highlight('  1. Fetch and organize your Claude Code sessions into chunks'));
  console.log(colors.highlight(`  2. Run ${days > 1 ? `${Math.min(days, 7)} parallel analyzers` : '1 analyzer'} to extract patterns`));
  console.log(colors.highlight('  3. Generate a concise HTML report'));
  if (days > 1) {
    console.log();
    console.log(colors.success(`  ⚡ Parallel execution: ${Math.min(days, 7)} sub-agents analyzers will run simultaneously!`));
  }
  console.log();
  
  // Check if Claude is installed for the recommended option
  const claudeCheck = await checkClaudeInstalled();
  
  // Build choices based on Claude availability
  const choices = [];
  if (claudeCheck.installed) {
    choices.push({ name: '🚀 Generate with Claude (Recommended)', value: 'execute' });
  }
  choices.push(
    { name: '📋 Copy command to clipboard', value: 'copy-full' },
    { name: '👁️  View full prompt', value: 'view' },
    { name: '↩️  Return to menu', value: 'return' }
  );
  
  // Show Claude not installed message if needed  
  if (!claudeCheck.installed) {
    console.log(colors.muted('Claude CLI not available - using copy-to-clipboard method'));
    console.log();
  }
  
  // Prompt to copy command or return
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices
    }
  ]);
  
  if (action === 'execute') {
    // Pre-fetch session files before executing Claude
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
      
      // Get Claude projects directory
      const claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
      
      // Copy relevant session files
      let copiedFiles = 0;
      let totalSessions = 0;
      const manifest: any = {
        generated: new Date().toISOString(),
        timeframe: timeframe,
        timeframeDays: days,
        projects: [],
        sessionFiles: []
      };
      
      // Process each selected project
      for (const project of selectedProjects) {
        // Extract Claude folder name from the project ID
        // On Windows: project.id is like C:\Users\97254\.claude\projects\C--vibelog-vibe-log-cli
        // On Mac/Linux: project.id is like ~/.claude/projects/-home-user-projects-vibe-log
        
        let sourceDir: string;
        let claudeFolderName: string;
        
        if (process.platform === 'win32') {
          // On Windows, project.id is already the full path
          sourceDir = project.id;
          // Extract just the folder name for prefixing files
          claudeFolderName = path.basename(project.id);
        } else {
          // On Mac/Linux, extract the folder name and join with base path
          claudeFolderName = project.id.split('/').pop() || '';
          sourceDir = path.join(claudeProjectsPath, claudeFolderName);
        }
        
        try {
          // Read all JSONL files from this project
          const files = await fs.readdir(sourceDir);
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
          
          let projectSessionCount = 0;
          
          // Check each session file
          for (const file of jsonlFiles) {
            const sourceFile = path.join(sourceDir, file);
            
            // Quick check if session is within timeframe
            const fileStat = await fs.stat(sourceFile);
            const since = new Date();
            since.setDate(since.getDate() - days);
            
            if (fileStat.mtime >= since) {
              // Copy file to temp directory with project prefix
              const destFile = path.join(tempDir, `${claudeFolderName}_${file}`);
              await fs.copyFile(sourceFile, destFile);
              
              copiedFiles++;
              projectSessionCount++;
              
              // Add to manifest with size information
              const sizeKB = parseFloat((fileStat.size / 1024).toFixed(2));
              manifest.sessionFiles.push({
                file: `${claudeFolderName}_${file}`,
                project: project.name,
                originalPath: sourceFile,
                modified: fileStat.mtime.toISOString(),
                sizeKB: sizeKB,
                isLarge: fileStat.size > 100000, // Files > 100KB are considered large
                readStrategy: fileStat.size > 100000 ? 'read_partial' : 'read_full'
              });
            }
          }
          
          // Add project info to manifest
          manifest.projects.push({
            name: project.name,
            path: project.path,
            claudePath: project.id,
            sessionCount: projectSessionCount
          });
          
          totalSessions += projectSessionCount;
        } catch (err) {
          console.log(colors.warning(`⚠️  Could not access project: ${project.name}`));
          console.log(colors.muted(`   ${err instanceof Error ? err.message : String(err)}`));
        }
      }
      
      manifest.totalSessions = totalSessions;
      
      console.log(colors.success(`✓ Copied ${copiedFiles} session files from selected projects`));
      
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
      
      // Execute directly with Claude
      console.log(colors.muted(`Using orchestrated prompt (${updatedPrompt.length} characters)`));
      console.log(colors.muted(`System prompt adds behavioral instructions (${orchestrated.systemPrompt.length} characters)`));
      
      // Ensure temp report directory exists (already defined above)
      await fs.mkdir(tempReportDir, { recursive: true }).catch(() => {});
      
      await executeClaudePrompt(updatedPrompt, {
        systemPrompt: orchestrated.systemPrompt,  // Pass the system prompt
        cwd: tempReportDir,  // Use temp directory to isolate report generation sessions
        claudePath: claudeCheck.path,  // Pass the found Claude path
        onComplete: async (code) => {
          console.log(colors.muted(`Claude completed with exit code: ${code}`));
          
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
          console.log(colors.error(`${icons.error} Failed to execute Claude: ${error.message}`));
          
          // Show detailed error for debugging
          if (process.env.VIBELOG_DEBUG || error.stack) {
            console.log(colors.muted('Error details:'));
            console.log(colors.muted(error.stack || error.toString()));
          }
          
          console.log();
          console.log(colors.info('Please use the copy command option instead.'));
          console.log();
          
          // Show the command for manual execution
          console.log(colors.info('Command to run manually:'));
          console.log(colors.highlight(executableCommand));
          console.log();
          
          // Clean up temp directory before exiting
          const tempDir = path.join(tempReportDir, '.vibe-log-temp');
          fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
            // Ignore cleanup errors
          });
          
          // Exit gracefully without recursive call
          console.log(colors.muted('Report generation failed. Please try copying the command above.'));
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
      
      console.log();
      console.log(colors.info('Please use the copy command option instead.'));
      console.log();
      
      // Show the command for manual execution
      console.log(colors.info('Command to run manually:'));
      console.log(colors.highlight(executableCommand));
      console.log();
      
      // Clean up temp directory before exiting
      const tempDir = path.join(tempReportDir, '.vibe-log-temp');
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors
      });
      
      // Exit gracefully without recursive call
      console.log(colors.muted('Report generation failed. Please try copying the command above.'));
      return;
    }
  } else if (action === 'copy-full') {
    // Try to copy full command to clipboard
    try {
      const { execSync } = await import('child_process');
      if (process.platform === 'darwin') {
        execSync(`echo '${executableCommand.replace(/'/g, "'\\''")}'  | pbcopy`);
        console.log(colors.success('\n✓ Full orchestrated command copied to clipboard!'));
      } else if (process.platform === 'win32') {
        execSync(`echo ${executableCommand} | clip`);
        console.log(colors.success('\n✓ Full orchestrated command copied to clipboard!'));
      } else {
        console.log(colors.info('\nCommand:'));
        console.log(colors.highlight(executableCommand));
      }
    } catch {
      console.log(colors.info('\nCommand:'));
      console.log(colors.highlight(executableCommand));
    }
    
    // Exit after copying
    console.log();
    console.log(colors.accent('👋 Ready to generate your report!'));
    console.log(colors.muted('Run the command in your terminal to start the analysis.'));
    console.log(colors.warning(`📁 Report will be saved as: vibe-log-report-${new Date().toISOString().split('T')[0]}.pdf`));
    process.exit(0);
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