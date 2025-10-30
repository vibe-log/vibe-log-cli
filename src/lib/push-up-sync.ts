import { apiClient } from './api-client';
import { getPushUpStats, getPushUpChallengeConfig } from './config';
import { logger } from '../utils/logger';

/**
 * Sync push-up stats to backend
 * Silent fail - don't break user flow
 */
export async function syncPushUpStats(): Promise<void> {
  logger.info('[PUSHUP-SYNC-CLI] Starting push-up stats sync...');

  const stats = getPushUpStats();
  const config = getPushUpChallengeConfig();

  logger.debug('[PUSHUP-SYNC-CLI] Current stats:', { stats, config });

  try {
    // Convert lastCompletedDate from string to Unix timestamp (seconds)
    let lastCompletedTimestamp: number | null = null;
    if (stats.lastCompletedDate) {
      const date = new Date(stats.lastCompletedDate);
      lastCompletedTimestamp = Math.floor(date.getTime() / 1000);
    }

    // Convert enabledDate from string to Unix timestamp (seconds)
    let enabledDateTimestamp: number | null = null;
    if (config.enabledDate) {
      const date = new Date(config.enabledDate);
      enabledDateTimestamp = Math.floor(date.getTime() / 1000);
    }

    const payload = {
      enabled: config.enabled,
      rate: config.pushUpsPerTrigger,
      debt: stats.debt,
      completed: stats.completed,
      streakDays: stats.streakDays,
      lastCompletedDate: lastCompletedTimestamp,
      enabledDate: enabledDateTimestamp,
      todayDebt: stats.todayDebt,
      todayCompleted: stats.todayCompleted,
    };

    logger.debug('[PUSHUP-SYNC-CLI] Payload to send:', payload);

    const response = await apiClient.syncPushUpChallenge(payload);

    logger.info('[PUSHUP-SYNC-CLI] ✓ Sync successful!');
    logger.debug('[PUSHUP-SYNC-CLI] Response:', response);
  } catch (error) {
    // Log error but don't break user flow
    logger.error('[PUSHUP-SYNC-CLI] ✗ Sync failed:', error);
    // Log the full error for debugging
    if (error instanceof Error) {
      logger.error('[PUSHUP-SYNC-CLI] Error details:', {
        message: error.message,
        stack: error.stack
      });
    }
  }
}

/**
 * Fetch push-up stats from backend
 * Used to sync local state with server state
 */
export async function fetchPushUpStats(): Promise<{
  enabled: boolean;
  rate: number;
  debt: number;
  completed: number;
  streakDays: number;
  lastCompletedDate?: string;
  enabledDate?: string;
} | null> {
  try {
    const response = await apiClient.fetchPushUpChallengeStats();
    logger.debug('Push-up stats fetched successfully');
    return response;
  } catch (error) {
    logger.debug('Failed to fetch push-up stats', error);
    return null;
  }
}
