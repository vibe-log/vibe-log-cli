import * as fs from 'fs-extra';
import * as path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import {
  getPushUpChallengeConfig,
  recordPushUpsCompleted,
  incrementPushUpDebt,
  incrementTodayCompleted
} from './config';
import { syncPushUpStats } from './push-up-sync';
import { logger } from '../utils/logger';

// Use the same vibe-log directory for consistency
const VIBE_LOG_DIR = path.join(homedir(), '.vibe-log');

/**
 * Prompt user to acknowledge push-ups
 * This appears as a seamless question in Claude conversation
 */
export async function promptPushUpAction(pushUpCount: number, phrase: string): Promise<void> {
  // This function will be expanded by debugger agent to show actual prompts
  // For now, just log the trigger
  logger.debug(`Push-up prompt triggered: ${pushUpCount} push-ups for "${phrase}"`);

  // Write to special file that can be read by hooks/statusline
  const promptFile = path.join(VIBE_LOG_DIR, 'push-up-prompt.json');

  try {
    await fs.ensureDir(VIBE_LOG_DIR);
    await fs.writeJSON(promptFile, {
      timestamp: Date.now(),
      pushUpCount,
      phrase,
      status: 'pending',
    });
  } catch (error) {
    logger.debug('Failed to write push-up prompt file', error);
  }

  // Output formatted message for potential AskUserQuestion integration
  // For now, this outputs to console but can be integrated with Claude's API later
  console.log('\n' + chalk.bold.yellow('━'.repeat(50)));
  console.log(chalk.bold.cyan('💪 Push-Up Challenge Triggered!'));
  console.log(chalk.gray(`Claude said: "${phrase}"`));
  console.log(chalk.bold.white(`${pushUpCount} push-up${pushUpCount > 1 ? 's' : ''} owed!`));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.green('1) ✅ Already did them'));
  console.log(chalk.yellow('2) 📝 Add to debt'));
  console.log(chalk.bold.yellow('━'.repeat(50)) + '\n');

  // In interactive mode, we would normally wait for user input
  // For now, we'll just log that the prompt was shown
  logger.debug(`Push-up prompt shown for ${pushUpCount} push-ups`);

  // Note: The actual response handling would be integrated with Claude's
  // AskUserQuestion API when available. For now, we provide a separate
  // function that can be called to handle the response.
}

/**
 * Handle user response to push-up prompt
 * This can be called from a CLI command or integrated with Claude's response system
 */
export async function handlePushUpResponse(
  response: 'done' | 'debt',
  amount?: number
): Promise<void> {
  const config = getPushUpChallengeConfig();
  const actualAmount = amount || config.pushUpsPerTrigger;

  if (response === 'done') {
    // User did the push-ups
    recordPushUpsCompleted(actualAmount);
    incrementTodayCompleted(actualAmount);

    // Decrement debt if any
    if (config.totalDebt >= actualAmount) {
      incrementPushUpDebt(-actualAmount);
    }

    console.log(chalk.green(`✅ Great! ${actualAmount} push-up(s) logged.`));
    console.log(chalk.gray(`Total completed: ${config.totalCompleted + actualAmount}`));

    // Check if debt is cleared
    const newDebt = Math.max(0, config.totalDebt - actualAmount);
    if (newDebt === 0 && config.totalDebt > 0) {
      console.log(chalk.bold.green('🎉 Debt cleared! Great job!'));
    } else if (newDebt > 0) {
      console.log(chalk.yellow(`Remaining debt: ${newDebt}`));
    }
  } else {
    // Add to debt (already incremented in detectValidation)
    console.log(chalk.yellow(`📝 Added ${actualAmount} to debt.`));
    console.log(chalk.gray(`Current debt: ${config.totalDebt}`));

    // Provide motivation
    if (config.totalDebt > 10) {
      console.log(chalk.dim('💡 Tip: Try asking more specific questions to reduce validation responses'));
    }
  }

  // Update prompt file status
  const promptFile = path.join(VIBE_LOG_DIR, 'push-up-prompt.json');

  try {
    if (await fs.pathExists(promptFile)) {
      const promptData = await fs.readJSON(promptFile);
      promptData.status = 'resolved';
      promptData.response = response;
      promptData.resolvedAt = Date.now();
      await fs.writeJSON(promptFile, promptData);
    }
  } catch (error) {
    logger.debug('Failed to update push-up prompt file', error);
  }

  // Sync to backend (fire-and-forget)
  syncPushUpStats().catch(err => {
    logger.debug('Failed to sync push-up stats after response', err);
  });
}

/**
 * Show a batch summary of pending push-ups
 * Used in batch mode to show all accumulated push-ups
 */
export async function showBatchSummary(
  prompts: Array<{ timestamp: string; amount: number; phrase: string }>
): Promise<void> {
  const totalAmount = prompts.reduce((sum, p) => sum + p.amount, 0);

  console.log('\n' + chalk.bold.yellow('━'.repeat(50)));
  console.log(chalk.bold.cyan('💪 Batch Push-Up Summary'));
  console.log(chalk.gray(`${prompts.length} validation${prompts.length > 1 ? 's' : ''} detected`));
  console.log(chalk.bold.white(`Total: ${totalAmount} push-ups owed`));
  console.log(chalk.gray('─'.repeat(50)));

  // Show each trigger
  prompts.forEach((prompt, index) => {
    const time = new Date(prompt.timestamp).toLocaleTimeString();
    console.log(chalk.gray(`${index + 1}. ${time} - "${prompt.phrase}" → ${prompt.amount} push-ups`));
  });

  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.dim('Use "vibe-log pushup review" to handle these push-ups'));
  console.log(chalk.bold.yellow('━'.repeat(50)) + '\n');
}

/**
 * Get the current push-up prompt status
 * Useful for checking if there's a pending prompt
 */
export async function getPromptStatus(): Promise<{
  pending: boolean;
  pushUpCount?: number;
  phrase?: string;
  timestamp?: number;
} | null> {
  const promptFile = path.join(VIBE_LOG_DIR, 'push-up-prompt.json');

  try {
    if (await fs.pathExists(promptFile)) {
      const data = await fs.readJSON(promptFile);
      return {
        pending: data.status === 'pending',
        pushUpCount: data.pushUpCount,
        phrase: data.phrase,
        timestamp: data.timestamp
      };
    }
  } catch (error) {
    logger.debug('Failed to read push-up prompt status', error);
  }

  return null;
}