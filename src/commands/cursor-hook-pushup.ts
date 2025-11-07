import {
  getPushUpChallengeConfig,
  incrementPushUpDebt,
  incrementTodayDebt
} from '../lib/config';
import { syncPushUpStats } from '../lib/push-up-sync';
import { logger } from '../utils/logger';
import { getLatestAssistantMessage } from '../lib/readers/cursor';

/**
 * Detect validation phrases in text
 * Only checks for "absolutely right" variations
 * Handles both ASCII apostrophe (') and smart apostrophe (')
 */
function detectValidationPhrases(text: string): string[] {
  const patterns = [
    // Matches: "you're", "you're" (smart apostrophe), "you are"
    { regex: /you(['']re|\s+are)\s+absolutely\s+right/i, phrase: "you're absolutely right" },
  ];

  const detected: string[] = [];
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      detected.push(pattern.phrase);
    }
  }

  return detected;
}

/**
 * Hook command for Cursor afterAgentResponse - detects validation phrases
 * Workaround: Cursor hooks don't send stdin data, so we scan the database
 *
 * Logging: Always logs to ~/.vibe-log/cursor-hook.log for debugging
 */
export async function cursorHookPushup(): Promise<void> {
  // Force file logging to hardcoded path (Cursor doesn't pass env vars reliably on Windows)
  const os = await import('os');
  const path = await import('path');
  process.env.VIBE_LOG_OUTPUT = path.join(os.homedir(), '.vibe-log', 'cursor-hook.log');

  // Enable debug logging since we're forcing file output
  logger.setLevel('debug');

  try {
    logger.debug('Cursor hook triggered - scanning database for latest message');

    // Get latest assistant message from database
    const latestMessage = await getLatestAssistantMessage();

    logger.debug('Latest message retrieved', {
      hasMessage: !!latestMessage,
      messageLength: latestMessage?.length || 0,
      messagePreview: latestMessage?.substring(0, 200) || 'NO MESSAGE'
    });

    if (!latestMessage) {
      logger.debug('No latest message found in database');
      return;
    }

    // Check if challenge is enabled
    const config = getPushUpChallengeConfig();
    logger.debug('Challenge config', { enabled: config.enabled, rate: config.pushUpsPerTrigger });

    if (!config.enabled) {
      logger.debug('Challenge disabled, skipping detection');
      return;
    }

    // Detect validation phrases
    const detectedPhrases = detectValidationPhrases(latestMessage);
    logger.debug('Detection result', {
      found: detectedPhrases.length,
      phrases: detectedPhrases,
      textLength: latestMessage.length
    });

    if (detectedPhrases.length === 0) {
      logger.debug('No validation phrases detected');
      return; // No validation detected
    }

    // Add push-ups to debt
    const amount = config.pushUpsPerTrigger * detectedPhrases.length;
    incrementPushUpDebt(amount);
    incrementTodayDebt(amount);

    // Log for debugging (silent to user)
    logger.debug('✅ Cursor validation detected - debt incremented', {
      count: detectedPhrases.length,
      phrases: detectedPhrases,
      debt: amount,
    });

    // Sync to backend (silent, fire-and-forget)
    syncPushUpStats().catch(err => {
      logger.debug('Failed to sync push-up stats', err);
    });
  } catch (error) {
    // Fail silently - don't disrupt user's workflow
    logger.error('Cursor push-up hook failed', error);
  }
}
