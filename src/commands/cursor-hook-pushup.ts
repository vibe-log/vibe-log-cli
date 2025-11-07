import {
  getPushUpChallengeConfig,
  incrementPushUpDebt,
  incrementTodayDebt
} from '../lib/config';
import { syncPushUpStats } from '../lib/push-up-sync';
import { logger } from '../utils/logger';

/**
 * Read stdin with a timeout
 * Reusing the same pattern from analyze-prompt.ts
 */
async function readStdin(timeoutMs = 1000): Promise<string | null> {
  return new Promise((resolve) => {
    let input = '';
    let hasData = false;

    // Set timeout to check if stdin has data
    const timeout = setTimeout(() => {
      if (!hasData) {
        resolve(null); // No stdin data
      }
    }, timeoutMs);

    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        hasData = true;
        input += chunk;
      }
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(hasData ? input : null);
    });
  });
}

/**
 * Detect validation phrases in text
 * Only checks for "absolutely right" variations
 */
function detectValidationPhrases(text: string): string[] {
  const patterns = [
    { regex: /you('re|\s+are)\s+absolutely\s+right/i, phrase: "you're absolutely right" },
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
 * Zero computational cost - just local state update
 */
export async function cursorHookPushup(): Promise<void> {
  // Silence all logger output for hooks (Cursor expects only JSON/no stdout)
  logger.setLevel('error');

  try {
    // Read hook payload from stdin
    const stdin = await readStdin();

    // Debug: Log hook invocation
    logger.debug('Cursor hook invoked', {
      hasStdin: !!stdin,
      stdinLength: stdin?.length || 0,
      stdinPreview: stdin?.substring(0, 200) || 'NO DATA'
    });

    if (!stdin) {
      logger.debug('No stdin data received');
      return; // No data to analyze
    }

    // Parse payload - afterAgentResponse sends {"text": "..."}
    let payload: { text?: string } = {};
    try {
      payload = JSON.parse(stdin);
      logger.debug('Parsed as JSON', { hasText: !!payload.text });
    } catch {
      // If not JSON, treat entire stdin as text
      payload = { text: stdin };
      logger.debug('Not JSON, treating as plain text');
    }

    if (!payload.text) {
      logger.debug('No text field in payload', { payload });
      return; // No text to analyze
    }

    // Check if challenge is enabled
    const config = getPushUpChallengeConfig();
    logger.debug('Challenge config', { enabled: config.enabled, rate: config.pushUpsPerTrigger });

    if (!config.enabled) {
      logger.debug('Challenge disabled, skipping detection');
      return;
    }

    // Detect validation phrases
    const detectedPhrases = detectValidationPhrases(payload.text);
    logger.debug('Detection result', {
      found: detectedPhrases.length,
      phrases: detectedPhrases,
      textLength: payload.text.length
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
