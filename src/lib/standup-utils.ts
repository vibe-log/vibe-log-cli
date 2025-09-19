/**
 * Utility functions for standup command
 * Extracted from standup.ts for reusability
 * These are pure functions with no side effects
 */

import { SessionData } from './readers/types';
import { extractProjectName } from './claude-project-parser';

/**
 * Get yesterday's working day (accounting for weekends)
 * Monday returns Friday, Sunday returns Friday, others return yesterday
 */
export function getYesterdayWorkingDay(): Date {
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

/**
 * Get day name from date
 */
export function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Group sessions by project name
 */
export function groupSessionsByProject(sessions: SessionData[]): Record<string, SessionData[]> {
  const grouped: Record<string, SessionData[]> = {};

  for (const session of sessions) {
    const project = extractProjectName(session.projectPath);
    if (!grouped[project]) {
      grouped[project] = [];
    }
    grouped[project].push(session);
  }

  return grouped;
}

/**
 * Format duration for display
 */
export function formatDuration(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  if (hours >= 1) {
    return `${hours.toFixed(1)} hours`;
  }
  return `${Math.round(totalSeconds / 60)} minutes`;
}

/**
 * Build the standup analysis prompt for Claude
 * This is the exact prompt from the working version
 */
export function buildStandupPrompt(tempDir: string, targetDate: Date): string {
  const dateStr = targetDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

  return `<think_hard>
You are analyzing coding sessions to extract ACTUAL DEVELOPER ACCOMPLISHMENTS for a daily standup meeting.

CRITICAL RULES TO PREVENT HALLUCINATION:
1. ONLY extract accomplishments that are DIRECTLY mentioned in the session messages
2. Look for SPECIFIC file names, function names, or clear descriptions of work done
3. If you cannot find specific evidence of work in the messages, use generic but accurate descriptions
4. NEVER make up features or work that isn't explicitly in the data

Task:
1. Read ${tempDir}/standup-manifest.json to see available sessions
2. Read the JSONL session files, focusing on sessions from ${dateStr}
3. Extract ONLY work that is ACTUALLY DESCRIBED in the messages

When reading messages, look for:
- File paths that indicate what was worked on (e.g., "editing login.tsx" → "Worked on login functionality")
- Error messages that were fixed (e.g., "fixed TypeError in payment.js" → "Fixed payment processing bug")
- Feature names mentioned in conversations (e.g., "implementing leaderboard" → "Implemented leaderboard feature")
- Database/API work (e.g., "created users table" → "Set up user data storage")
- UI components created (e.g., "added ProfileCard component" → "Built user profile UI")

TRANSLATION EXAMPLES (from technical to user-facing business value):
- "Modified auth.ts and login.tsx" → "Improved user authentication flow"
- "Fixed null pointer in checkout" → "Fixed checkout bug affecting customer purchases"
- "Created D1 migrations" → "Enhanced data storage for better performance"
- "Added API endpoint /users" → "Built user profile management feature"
- "Styled navbar component" → "Improved site navigation experience"
- "Fixed leaderboard query" → "Fixed leaderboard loading issues for users"
- "Added OAuth provider" → "Enabled Google/GitHub login for users"
- "Optimized database queries" → "Reduced page load times by 50%"

If work is unclear from messages, use SAFE business-focused descriptions:
- "Improved [project] stability and reliability"
- "Fixed user-reported issues in [project]"
- "Enhanced [project] performance for better user experience"
- "Updated [project] security and dependencies"
- "Refined [project] features based on requirements"

For "todayFocus", base suggestions on:
- Actual unfinished work visible in the sessions
- Common patterns (if testing was done, suggest deployment)
- Logical next steps based on what was actually built
</think_hard>

Your response must be ONLY this JSON structure:
{
  "yesterday": {
    "date": "${dateStr}",
    "projects": [
      {
        "name": "project-name",
        "accomplishments": [
          "User-facing feature or business value delivered",
          "Bug fix or improvement that affects users",
          "Integration or functionality users care about"
        ],
        "duration": "X.X hours"
      }
    ]
  },
  "todayFocus": [
    "Complete [unfinished feature from yesterday]",
    "Fix [issue discovered yesterday]",
    "Continue [partially implemented feature]"
  ],
  "blockers": []
}

IMPORTANT: Return ONLY the JSON object, nothing else. No explanations, no markdown code blocks, just the raw JSON.`;
}

/**
 * Get the system prompt for Claude execution
 */
export function getClaudeSystemPrompt(): string {
  return 'You are a developer standup meeting assistant. Extract REAL USER-FACING FEATURES and BUSINESS VALUE from coding sessions. Focus on what developers actually discuss in standups: features built, bugs fixed, integrations completed, performance improvements. AVOID technical implementation details about agents, tools, or internal systems. CRITICAL: Only extract work that is EXPLICITLY mentioned in the session messages - never hallucinate or make up features. Translate technical details into business value. Return ONLY valid JSON.';
}