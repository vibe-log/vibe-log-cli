/**
 * Refresh Push-Up Challenge Statusline Command
 *
 * This is a lightweight no-op command that exists solely to trigger
 * Claude Code's statusline refresh mechanism. When installed as a
 * UserPromptSubmit hook, it ensures the push-up challenge statusline
 * updates after every user message.
 *
 * Why this is needed:
 * - The Stop hook updates push-up stats when validations are detected
 * - But Claude Code only refreshes the statusline when a hook runs
 * - This UserPromptSubmit hook triggers the refresh without doing heavy work
 */

import { Command } from 'commander';

/**
 * Create the refresh command
 * This command does nothing except exit successfully, triggering a statusline refresh
 */
export function createRefreshPushUpChallengeStatuslineCommand(): Command {
  const command = new Command('refresh-push-up-challenge-statusline')
    .description('Trigger statusline refresh for push-up challenge (internal use)')
    .action(async () => {
      // No-op: This command's only purpose is to trigger Claude Code's statusline refresh
      // When this runs as a UserPromptSubmit hook, Claude Code will re-render the statusline
      // which will execute statusline-challenge and show updated stats

      // Exit immediately with success
      process.exitCode = 0;
    });

  // Mark as hidden since this is for internal use only
  return command;
}
