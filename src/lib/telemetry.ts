import packageJson from '../../package.json';
import { getToken, getStatusLinePersonality } from './config';
import { detectSetupState } from './detector';
import { getHooksStatus } from './hooks/hooks-controller';
import { logger } from '../utils/logger';

export interface CliTelemetry {
  // Installation state
  hooksInstalled: boolean;
  hookMode: 'all' | 'selected' | 'none';
  trackedProjectCount: number;
  statusLineInstalled: boolean;
  statusLinePersonality: string;

  // Version info
  cliVersion: string;
  hookVersion?: string; // Deprecated - kept for backward compatibility
  sessionStartHookVersion?: string;
  preCompactHookVersion?: string;
  sessionEndHookVersion?: string;

  // Timestamps
  lastTelemetryUpdate: string;
}

export async function collectTelemetry(): Promise<CliTelemetry | null> {
  // CRITICAL: Check for auth token FIRST
  const token = await getToken();
  if (!token) {
    // NO TOKEN = NO TELEMETRY
    return null;
  }

  // Only proceed if user has authenticated
  const state = await detectSetupState();
  const statusLine = getStatusLinePersonality();
  const hookStatus = await getHooksStatus();

  return {
    hooksInstalled: state.hasHooks,
    hookMode: state.trackingMode,
    trackedProjectCount: state.trackedProjectCount,
    statusLineInstalled: state.hasStatusLine,
    statusLinePersonality: statusLine?.personality || 'gordon',
    cliVersion: packageJson.version,
    hookVersion: hookStatus.sessionStartHook?.version || hookStatus.preCompactHook?.version, // Deprecated
    sessionStartHookVersion: hookStatus.sessionStartHook?.version,
    preCompactHookVersion: hookStatus.preCompactHook?.version,
    sessionEndHookVersion: hookStatus.sessionEndHook?.version,
    lastTelemetryUpdate: new Date().toISOString()
  };
}

export async function sendTelemetryUpdate(): Promise<void> {
  // CRITICAL: Check for auth token FIRST
  const token = await getToken();
  if (!token) {
    // No auth = no telemetry, silently exit
    logger.debug('Skipping telemetry - no auth token');
    return;
  }

  const telemetry = await collectTelemetry();
  if (!telemetry) return;

  try {
    // Import api-client dynamically to avoid circular dependency
    const { apiClient } = await import('./api-client');

    // This will only happen for cloud users
    await apiClient.updateTelemetry(telemetry);
    logger.debug('Telemetry updated successfully');
  } catch (error) {
    // Silent fail - never break user flow
    logger.debug('Telemetry update failed:', error);
  }
}