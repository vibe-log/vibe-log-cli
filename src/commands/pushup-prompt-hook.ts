/**
 * UserPromptSubmit Hook for Push-Up Challenge
 *
 * This hook runs when the user submits a message (before Claude processes it).
 * It checks for pending push-up prompts and injects them as additional context,
 * instructing Claude to use AskUserQuestion to prompt the user.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger';

const VIBE_LOG_DIR = path.join(homedir(), '.vibe-log');
const PROMPT_FILE = path.join(VIBE_LOG_DIR, 'push-up-prompt.json');

interface PendingPrompt {
  timestamp: number;
  pushUpCount: number;
  phrase: string;
  status: 'pending' | 'resolved';
}

/**
 * Check for pending push-up prompts and inject context for Claude
 * This is called from the UserPromptSubmit hook
 */
export async function checkAndInjectPushUpPrompt(): Promise<void> {
  try {
    // Check if there's a pending prompt
    if (!await fs.pathExists(PROMPT_FILE)) {
      // No pending prompt, output empty JSON (no additional context)
      console.log(JSON.stringify({}));
      return;
    }

    const promptData: PendingPrompt = await fs.readJSON(PROMPT_FILE);

    // Only inject if status is pending
    if (promptData.status !== 'pending') {
      console.log(JSON.stringify({}));
      return;
    }

    // Check if prompt is recent (within last 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    if (promptData.timestamp < fiveMinutesAgo) {
      // Prompt is stale, ignore it
      console.log(JSON.stringify({}));
      return;
    }

    // We have a pending prompt! Inject context for Claude
    const pushUpText = promptData.pushUpCount === 1
      ? '1 push-up'
      : `${promptData.pushUpCount} push-ups`;

    // Strategy: Inject as system instruction that appears BEFORE the user's message
    // This ensures Claude sees it as a high-priority directive
    const additionalContext = `
═══════════════════════════════════════════════════════════════════
🏋️ PUSH-UP CHALLENGE INTERRUPT - MUST HANDLE BEFORE PROCEEDING 🏋️
═══════════════════════════════════════════════════════════════════

SYSTEM DIRECTIVE: A push-up challenge was triggered by your previous validation phrase: "${promptData.phrase}"

USER OWES: ${pushUpText}

MANDATORY ACTION REQUIRED - YOU MUST DO THIS FIRST:

1. IMMEDIATELY use the AskUserQuestion tool (do NOT respond with text)
2. Ask the user if they completed their push-ups
3. Wait for their response before proceeding with their actual request

EXACT TOOL CALL TO MAKE:

questions: [{
  question: "You owe ${pushUpText} from my validation phrase '${promptData.phrase}'. Did you complete them?",
  header: "Push-ups",
  multiSelect: false,
  options: [
    { label: "Already did them", description: "I completed the push-ups" },
    { label: "Add to debt", description: "I'll do them later" }
  ]
}]

AFTER USER RESPONDS:
- If "Already did them": Execute: npx vibe-log-cli pushup respond --done
- If "Add to debt": Execute: npx vibe-log-cli pushup respond --debt

THEN AND ONLY THEN: Proceed with the user's actual request below.

═══════════════════════════════════════════════════════════════════
THIS IS A SYSTEM-LEVEL INTERRUPT - MUST BE HANDLED FIRST
═══════════════════════════════════════════════════════════════════
`.trim();

    // Output JSON with hookSpecificOutput format (as per Claude Code docs)
    const output = {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext
      }
    };

    console.log(JSON.stringify(output));

    // Mark the prompt as injected (but not resolved yet - that happens when they respond)
    promptData.status = 'injected' as any;
    await fs.writeJSON(PROMPT_FILE, promptData);

    logger.debug(`Push-up prompt injected for ${pushUpText}`);
  } catch (error) {
    logger.error('Error in pushup prompt hook', error);
    // On error, output empty JSON to not block the user
    console.log(JSON.stringify({}));
  }
}
