import axios from 'axios';
import { getApiUrl, getToken, getPushUpStats, getPushUpChallengeConfig } from './config';
import { logger } from '../utils/logger';

/**
 * Sync push-up stats to backend
 * Silent fail - don't break user flow
 */
export async function syncPushUpStats(): Promise<void> {
  const stats = getPushUpStats();
  const config = getPushUpChallengeConfig();
  const apiUrl = getApiUrl();

  let token: string | null;
  try {
    token = await getToken();
  } catch (error) {
    logger.debug('Failed to get token for push-up sync', error);
    return;
  }

  if (!token) {
    // Not authenticated yet - skip sync
    logger.debug('No auth token - skipping push-up sync');
    return;
  }

  try {
    const response = await axios.post(
      `${apiUrl}/api/push-up-challenge/sync`,
      {
        enabled: config.enabled,
        rate: config.pushUpsPerTrigger,
        debt: stats.debt,
        completed: stats.completed,
        streakDays: stats.streakDays,
        lastCompletedDate: stats.lastCompletedDate,
        todayDebt: stats.todayDebt,
        todayCompleted: stats.todayCompleted,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      }
    );

    logger.debug('Push-up stats synced successfully', response.data);
  } catch (error) {
    // Silent fail - don't break user flow
    if (axios.isAxiosError(error)) {
      logger.debug('Failed to sync push-up stats', {
        status: error.response?.status,
        message: error.message
      });
    } else {
      logger.debug('Failed to sync push-up stats', error);
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
  const apiUrl = getApiUrl();

  let token: string | null;
  try {
    token = await getToken();
  } catch (error) {
    logger.debug('Failed to get token for fetching push-up stats', error);
    return null;
  }

  if (!token) {
    logger.debug('No auth token - skipping push-up stats fetch');
    return null;
  }

  try {
    const response = await axios.get(
      `${apiUrl}/api/push-up-challenge/stats`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      }
    );

    logger.debug('Push-up stats fetched successfully');
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.debug('Failed to fetch push-up stats', {
        status: error.response?.status,
        message: error.message
      });
    } else {
      logger.debug('Failed to fetch push-up stats', error);
    }
    return null;
  }
}
