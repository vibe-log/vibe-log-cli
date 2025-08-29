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
  const systemPrompt = `You are a vibe-log ORCHESTRATOR coordinating batch analysis.

CRITICAL RULES:
- DO NOT analyze session files yourself - delegate ALL analysis to sub-agents
- DO NOT use Grep, Read (except manifest), or other analysis tools on session files
- Batch sessions to limit parallel agents (MAX 9 agents total)
- Your role: Read manifest → Launch batch analyzers → Collect results → Launch report generator → Capture and output HTML

BATCHING REQUIREMENTS:
- NEVER launch more than 9 agents total
- For 17 sessions: Use 2-3 agents MAX (each handling 6-9 sessions)
- Launch ALL agents in ONE message with multiple Task calls
- Do NOT launch agents one by one - they must be parallel
- WRONG: 17 sessions = 17 agents ❌
- RIGHT: 17 sessions = 2-3 agents ✓

REPORT HANDLING:
- Report generator will OUTPUT HTML between === REPORT START === and === REPORT END ===
- You MUST capture this HTML and OUTPUT it again yourself (do NOT use Write tool)
- Just OUTPUT the HTML exactly as you received it from the report generator
- The system will handle saving it to a file

EXECUTION FLOW:
1. Read manifest.json to discover session files
2. Group sessions into batches (max 9 batches)
3. Launch ALL batch analyzers in parallel (one message, multiple Task calls)
4. Collect all analysis results
5. Launch report generator with aggregated data
6. When report generator outputs HTML, OUTPUT it again yourself (between the same markers)

COMMUNICATION:
- Announce batching strategy clearly
- Show how many agents are being launched
- Keep updates concise`;

  // Main prompt focused on the task
  const prompt = `Analyze my Claude Code sessions from ${timeframeDesc} using vibe-log sub-agents.

Projects to analyze:
${projectList}

Execute this streamlined workflow using per-session analysis:

## Phase 1 - Discovery (3 seconds)
Read .vibe-log-temp/manifest.json to understand:
- Total sessions available
- Session files and their sizes
- Projects involved

Output: "Found X sessions across Y projects, launching parallel analyzers..."

## Phase 2 - Parallel Batch Analysis (20 seconds)
Group sessions into batches and launch parallel analyzers (MAX 9 agents):

BATCHING STRATEGY (MAX 9 AGENTS TOTAL):
- If 1-9 sessions: 1 agent handles ALL sessions
- If 10-18 sessions: 2 agents, each handles 5-9 sessions
- If 19-27 sessions: 3 agents, each handles 6-9 sessions
- If 28-45 sessions: 5 agents, each handles 6-9 sessions
- If >45 sessions: 9 agents, split evenly (5-10 sessions each)

For each batch of sessions, launch:
Task(subagent_type="vibe-log-session-analyzer", 
     description="Analyze batch of [X] sessions",
     prompt="You are analyzing a BATCH of Claude Code session files.

FILES TO ANALYZE: 
[List the specific .vibe-log-temp/filename for each session in this batch]
[Include isLarge flag for each file]

INSTRUCTIONS:
1. Process EACH file in your batch sequentially
2. For each file:
   - If isLarge=true: Sample with limit:50 
   - If isLarge=false: Read the full file
3. Extract from EACH session:

SESSION METADATA:
- Timestamp/date of session
- Duration (if available)
- Project name
- Number of interactions

ACTIVITY ANALYSIS:
- Primary activity type:
  * Development (new features/implementation)
  * Debugging (fixing errors/troubleshooting)
  * Refactoring (code cleanup/restructuring)
  * Code Review (analyzing existing code)
  * Learning (tutorials/understanding)
  * Research (exploring options/documentation)
  * Planning (architecture/design)
  * Testing (writing tests/validation)

ACCOMPLISHMENTS:
- Specific features implemented
- Bugs fixed
- Code improvements made
- Problems solved
- Key decisions made

PROMPT QUALITY:
- Were prompts clear and specific?
- Did user provide good context?
- Any vague or unclear requests?
- Suggestions for improvement

RETURN FORMAT (JSON array for your batch):
[
  {
    'session_file': 'filename1',
    'timestamp': 'ISO date',
    'duration_minutes': number,
    'project': 'project name',
    'activity_type': 'primary activity',
    'accomplishments': ['list', 'of', 'achievements'],
    'prompt_quality': 'poor/fair/good/excellent',
    'prompt_insights': 'specific observations',
    'notable_patterns': 'any interesting patterns'
  },
  // ... one object for each session in your batch
]

CRITICAL: Process ALL files in your batch. Return an array with one object per session.")

IMPORTANT:
- Group sessions into batches based on the strategy above
- Launch ALL batch analyzers in ONE message with multiple Task calls (max 9)
- Each agent processes their entire batch of sessions
- All agents work in parallel - DO NOT wait between launches
- Examples:
  * 17 sessions = 2 agents, each handling 8-9 sessions
  * 25 sessions = 3 agents, each handling 8-9 sessions  
  * 57 sessions = 9 agents, each handling 6-7 sessions

## Phase 3 - Report Generation (10 seconds)
After collecting ALL session analysis results, launch the report generator:

Task(subagent_type="vibe-log-report-generator",
     description="Generate HTML report from session analyses",
     prompt="Generate a comprehensive HTML report from the session analysis data.

INPUT: You will receive arrays of session analysis results from the batch analyzers.

YOUR TASK:
1. Flatten and aggregate all session data
2. Calculate overall metrics and statistics
3. OUTPUT a complete HTML report between the markers

CRITICAL: You MUST output the HTML between these exact markers:
=== REPORT START ===
<!DOCTYPE html>
<html>
<head>
  <title>Vibe-log Report</title>
  <style>/* Include beautiful CSS styling */</style>
</head>
<body>
  <!-- Executive Summary -->
  <section>
    <h2>Executive Summary</h2>
    <ul>
      <li>Total coding time: X hours across Y sessions</li>
      <li>Most productive project: [project]</li>
      <li>Primary activity: [most common activity type]</li>
      <li>Prompt quality trend: [assessment]</li>
    </ul>
  </section>

  <!-- Activity Breakdown Chart -->
  <section>
    <h2>Activity Distribution</h2>
    <!-- Create horizontal bar chart from activity type counts -->
    <!-- Use colors: Development (green), Debugging (orange), Refactoring (blue), etc. -->
  </section>

  <!-- Key Accomplishments -->
  <section>
    <h2>Key Accomplishments</h2>
    <!-- List top 5-7 accomplishments from all sessions -->
  </section>

  <!-- Prompt Engineering Insights -->
  <section>
    <h2>Prompt Quality Analysis</h2>
    <!-- Table with prompt patterns and recommendations -->
  </section>

  <!-- Project Summary -->
  <section>
    <h2>Project Breakdown</h2>
    <!-- Summary for each project -->
  </section>
</body>
</html>
=== REPORT END ===

CRITICAL INSTRUCTIONS:
- OUTPUT the complete HTML between the markers above
- Do NOT use Write tool - just OUTPUT the text as plain text
- Include ALL sections with real data
- Make the HTML self-contained with inline CSS
- Return the HTML to the orchestrator who will output it")

IMPORTANT: The report generator OUTPUTS HTML to you. You then OUTPUT it again. Do NOT try to save it.

## Critical Performance Rules
- Phase 1: Read manifest (3 seconds)
- Phase 2: Launch batch analyzers (MAX 9 agents, 5 seconds to launch, 20-30 seconds to run)
- Phase 3: Launch report generator (5 seconds)
- Total time: ~35-45 seconds regardless of session count

KEY POINTS:
- Batch sessions to limit parallel agents (max 9)
- All batch analyzers launch IN ONE MESSAGE with multiple Task calls
- Each agent handles 5-10 sessions (not just one)
- Report generator OUTPUTS HTML between markers
- Orchestrator OUTPUTS the same HTML again (do NOT use Write tool)
- The system automatically saves the HTML to a file`;

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