/**
 * List of vibe-log sub-agents for Claude Code
 * These sub-agents are installed to ~/.claude/agents/ for local analysis
 * Streamlined to 3 essential agents for fast, focused reports
 */
export const VIBE_LOG_SUB_AGENTS = [
  'vibe-log-claude-code-logs-fetcher.md',
  'vibe-log-track-analyzer.md',
  'vibe-log-report-generator.md'
] as const;

export type SubAgentName = typeof VIBE_LOG_SUB_AGENTS[number];