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
- Report generator will output a JSON object with report data
- You MUST capture this JSON and OUTPUT it yourself as a code block
- The JSON will be automatically processed by the template engine
- The system will handle converting JSON to HTML and saving it

EXECUTION FLOW:
1. Read manifest.json to discover session files
2. Group sessions into batches (max 9 batches)
3. Launch ALL batch analyzers in parallel (one message, multiple Task calls)
4. Collect all analysis results
5. Launch report generator with aggregated data
6. When report generator outputs JSON, OUTPUT it again yourself in a code block

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
- Rate each session: poor/fair/good/excellent
- Assign numerical score (0-100):
  * Excellent (90-100): Clear, specific, great context, examples provided
  * Good (70-89): Generally clear with minor gaps
  * Fair (50-69): Somewhat vague or missing context
  * Poor (0-49): Very vague or confusing
- Consider:
  * Clarity of requirements
  * Context provided (files, examples)
  * Outcome achievement
  * Number of clarifications needed
- Provide specific insights about prompt patterns

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
    'prompt_score': number (0-100),
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
     description="Generate JSON report data from session analyses",
     prompt="Generate comprehensive report data from the session analysis results.

INPUT: You will receive arrays of session analysis results from the batch analyzers.
STATUS LINE INSTALLED: ${context.statusLineInstalled ? 'Yes' : 'No'}

YOUR TASK:
1. Flatten and aggregate all session data
2. Calculate overall metrics and statistics
3. OUTPUT a JSON object with the report data

You must return a JSON object with this structure:
{
  'metadata': {
    'totalSessions': number,
    'dataProcessed': 'size string',
    'activeDevelopment': 'hours string',
    'projects': number,
    'generatedAt': 'ISO timestamp',
    'dateRange': 'date range string'
  },
  'executiveSummary': ['3-4 key insights'],
  'activityDistribution': {
    'Development': percentage,
    'Debugging': percentage,
    'Testing': percentage,
    // etc...
  },
  'keyAccomplishments': ['5-6 major accomplishments'],
  'promptQuality': {
    'methodology': 'how prompts were analyzed',
    'breakdown': {
      'excellent': percentage,
      'good': percentage,
      'fair': percentage,
      'poor': percentage
    },
    'insights': 'key insight about prompt patterns',
    'averageScore': number (0-100)
  },
  'projectBreakdown': [
    {
      'name': 'project name',
      'sessions': count,
      'largestSession': 'duration',
      'focus': 'main activity'
    }
  ]
}

CRITICAL INSTRUCTIONS:
- Return ONLY the JSON object
- Do NOT use Write tool - just OUTPUT the JSON
- Do NOT include HTML, markers, or explanations
- Calculate prompt quality from session analyses
- Return pure JSON to the orchestrator")

IMPORTANT: The report generator outputs JSON to you. You then OUTPUT it again in a code block.

## Critical Performance Rules
- Phase 1: Read manifest (3 seconds)
- Phase 2: Launch batch analyzers (MAX 9 agents, 5 seconds to launch, 20-30 seconds to run)
- Phase 3: Launch report generator (5 seconds)
- Total time: ~35-45 seconds regardless of session count

KEY POINTS:
- Batch sessions to limit parallel agents (max 9)
- All batch analyzers launch IN ONE MESSAGE with multiple Task calls
- Each agent handles 5-10 sessions (not just one)
- Report generator outputs JSON data
- Orchestrator OUTPUTS the JSON again in a code block
- The system automatically converts JSON to HTML and saves it`;

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