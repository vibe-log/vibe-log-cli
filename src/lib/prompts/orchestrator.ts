import { PromptContext, OrchestratedPrompt } from '../../types/prompts';

/**
 * Build an orchestrated prompt that guides Claude through multi-phase analysis
 * using the installed vibe-log sub-agents
 */
export function buildOrchestratedPrompt(context: PromptContext): OrchestratedPrompt {
  const { timeframe, days, projectPaths, projectNames } = context;
  
  // Build the project list for the prompt
  const projectList = projectPaths.map((path, i) => 
    `- ${projectNames[i]}: ${path}`
  ).join('\n');

  // Create the timeframe description
  const timeframeDesc = days === 1 ? 'the last 24 hours' : `the last ${days} days`;

  // Separate system prompt for behavioral instructions
  const systemPrompt = `You are a vibe-log ORCHESTRATOR. Your ONLY job is to coordinate sub-agents.

CRITICAL RULES:
- DO NOT analyze session files yourself - delegate ALL analysis to sub-agents
- DO NOT use Grep, Read (except manifest), or other analysis tools on session files
- DO NOT spend more than 30 seconds total - most time should be waiting for agents
- Your role: Read manifest → Launch agents → Collect results → Generate report

FILE ACCESS RESTRICTIONS (CRITICAL FOR PERFORMANCE):
- ALL agents must ONLY access files in .vibe-log-temp/ directory
- Agents must NOT use LS, Glob, or Read on parent directories
- Agents must NOT access project source code or any files outside .vibe-log-temp/
- Everything needed is already pre-fetched to .vibe-log-temp/ for optimal performance
- Accessing other directories wastes time and degrades performance

PERMISSIONS:
- Session files are pre-copied to .vibe-log-temp/ directory
- Read ONLY the manifest.json to understand what's available
- Launch parallel sub-agents to do ALL the actual analysis work

COMMUNICATION:
- Announce each phase clearly
- Show which agents are being launched
- Display progress as agents work
- Keep user informed but be an orchestrator, not an analyst`;

  // Main prompt focused on the task
  const prompt = `Analyze my Claude Code sessions from ${timeframeDesc} using vibe-log sub-agents.

Projects to analyze:
${projectList}

Execute this FAST orchestration workflow (target: <1 minute total):

## Phase 1 - Quick Discovery (5 seconds max)
Read ONLY .vibe-log-temp/manifest.json to see:
- Total number of sessions available
- Projects involved
- DO NOT read or analyze any session files yourself

Output: "Found X sessions across Y projects, launching parallel analysis..."

## Phase 2 - Parallel Agent Deployment (15 seconds max)
Launch 3-5 parallel agents with Task tool, each with specific focus:

Agent 1 - Productivity Metrics:
Task(subagent_type="vibe-log-track-analyzer", prompt="CRITICAL: Only access .vibe-log-temp/ directory. Do NOT use LS, Glob, or Read on any parent directories or project files.
1. Read .vibe-log-temp/manifest.json to see available sessions (check isLarge flag)
2. For files marked isLarge=true: Read with limit:10 to sample
3. For normal files: Read fully if needed (but prefer sampling)
4. Calculate: total coding hours, sessions per project, average session duration
5. Return structured metrics. Skip files that fail to read.")

Agent 2 - Tool Usage Analysis:  
Task(subagent_type="vibe-log-track-analyzer", prompt="CRITICAL: Only access .vibe-log-temp/ directory. Do NOT access project files or parent directories.
1. Read .vibe-log-temp/manifest.json first (note isLarge flags)
2. Sample each file: limit:20 for large files, full read for small
3. Look for tool usage patterns in first 20 lines of each session
4. Count: Read, Write, Edit, Bash operations from sampled data
5. Return tool statistics. Skip files that fail after 2 attempts.")

Agent 3 - Key Accomplishments:
Task(subagent_type="vibe-log-track-analyzer", prompt="CRITICAL: Only work with files in .vibe-log-temp/ directory. Do NOT explore the filesystem.
1. Start with .vibe-log-temp/manifest.json (check file sizes)
2. Sample recent sessions: Read first 30 lines of each file
3. Look for: commits, features, bug fixes in the sampled content
4. Extract 3-5 concrete accomplishments from what you find
5. Return list. If file fails to read, skip it.")
${days > 1 ? `
Agent 4 - Pattern Analysis:
Task(subagent_type="vibe-log-track-analyzer", prompt="CRITICAL: Restrict all file access to .vibe-log-temp/ directory only.
1. Read .vibe-log-temp/manifest.json (note file sizes)
2. Sample timestamps from first 5 lines of each session file
3. Find: peak productivity times, session frequency patterns
4. Return pattern insights based on timestamps found
5. Skip any files that fail to read.")` : ''}

IMPORTANT: 
- Launch ALL agents in a SINGLE message with multiple Task tool calls
- Each agent works independently on ALL sessions
- DO NOT wait for one to complete before launching the next
- DO NOT analyze files yourself - agents do this

PERFORMANCE NOTE: Agents are restricted to .vibe-log-temp/ directory because:
- All necessary data is pre-fetched there for optimal performance
- Exploring the filesystem wastes time and slows execution
- Accessing project files is unnecessary - session data contains everything needed
- This restriction ensures fastest possible analysis (target: <60 seconds total)

## Phase 3 - Comprehensive Report Generation
Generate a beautiful HTML report combining all agent insights:

1. Collect results from ALL parallel agents
2. Generate comprehensive HTML report:
   • First output: "=== REPORT START ==="
   • Create a styled HTML dashboard with:
     - Executive summary
     - Productivity metrics (hours coded, sessions, averages)
     - Tool usage breakdown with charts
     - Key accomplishments list
     - Activity patterns and insights
     - Project-by-project breakdown
 
   • Finally output: "=== REPORT END ==="
   
IMPORTANT: Do NOT use the Write tool. OUTPUT the HTML directly between the markers.

## Critical Performance Rules
- Phase 1: Read manifest ONLY (5 seconds)
- Phase 2: Launch agents in PARALLEL (10 seconds)
- Phase 3: Collect & report (20 seconds)
- Total orchestrator active time: <35 seconds
- Total end-to-end time: <60 seconds (agents work in parallel)

Remember: You are an ORCHESTRATOR, not an analyst. Let the agents do the work!`;

  // Build a shorter, more user-friendly command for display
  const displayCommand = `claude "Analyze my Claude Code sessions from ${timeframeDesc} using vibe-log sub-agents..."`;
  
  return {
    prompt,
    systemPrompt, // Include system prompt for behavioral instructions
    command: displayCommand, // Show abbreviated version in UI
    description: `Comprehensive ${timeframe} analysis across ${projectNames.length} project${projectNames.length > 1 ? 's' : ''}`
  };
}

/**
 * Build a simple command for quick analysis without full orchestration
 */
export function buildSimplePrompt(context: PromptContext): string {
  const { timeframe, projectNames } = context;
  
  const projectList = projectNames.join(', ');
  
  return `@vibe-log-report-generator analyze my coding sessions from the last ${timeframe} for projects: ${projectList}. Focus on productivity insights and key accomplishments.`;
}

/**
 * Get the full command with proper escaping for clipboard/terminal
 */
export function getExecutableCommand(prompt: string): string {
  // Escape for shell execution
  const escaped = prompt
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/\n/g, '\\n');
    
  return `claude "${escaped}"`;
}