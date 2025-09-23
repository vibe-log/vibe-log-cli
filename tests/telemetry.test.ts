import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectTelemetry, sendTelemetryUpdate } from '../src/lib/telemetry';

// Mock dependencies
vi.mock('../src/lib/config', () => ({
  getToken: vi.fn(),
  getStatusLinePersonality: vi.fn(() => ({ personality: 'gordon' }))
}));

vi.mock('../src/lib/detector', () => ({
  detectSetupState: vi.fn(() => ({
    hasHooks: true,
    trackingMode: 'all' as const,
    trackedProjectCount: 2,
    hasStatusLine: true
  }))
}));

vi.mock('../src/lib/hooks/hooks-controller', () => ({
  getHooksStatus: vi.fn(() => ({
    sessionStartHook: { version: '1.0.0' },
    preCompactHook: { version: '1.0.0' }
  }))
}));

vi.mock('../src/lib/api-client', () => ({
  apiClient: {
    updateTelemetry: vi.fn()
  }
}));

vi.mock('../src/utils/logger', () => ({
  logger: {
    debug: vi.fn()
  }
}));

describe('Telemetry Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('collectTelemetry', () => {
    it('should return null when no auth token is present', async () => {
      const { getToken } = await import('../src/lib/config');
      vi.mocked(getToken).mockResolvedValue(null);

      const result = await collectTelemetry();

      expect(result).toBeNull();
    });

    it('should collect telemetry data when authenticated', async () => {
      const { getToken } = await import('../src/lib/config');
      vi.mocked(getToken).mockResolvedValue('test-token');

      const result = await collectTelemetry();

      expect(result).toBeDefined();
      expect(result?.hooksInstalled).toBe(true);
      expect(result?.hookMode).toBe('all');
      expect(result?.trackedProjectCount).toBe(2);
      expect(result?.statusLineInstalled).toBe(true);
      expect(result?.statusLinePersonality).toBe('gordon');
      expect(result?.hookVersion).toBe('1.0.0');
      expect(result?.lastTelemetryUpdate).toBeDefined();
    });
  });

  describe('sendTelemetryUpdate', () => {
    it('should skip telemetry when no auth token', async () => {
      const { getToken } = await import('../src/lib/config');
      const { logger } = await import('../src/utils/logger');
      vi.mocked(getToken).mockResolvedValue(null);

      await sendTelemetryUpdate();

      expect(logger.debug).toHaveBeenCalledWith('Skipping telemetry - no auth token');
    });

    it('should send telemetry when authenticated', async () => {
      const { getToken } = await import('../src/lib/config');
      const { apiClient } = await import('../src/lib/api-client');
      const { logger } = await import('../src/utils/logger');
      vi.mocked(getToken).mockResolvedValue('test-token');

      await sendTelemetryUpdate();

      expect(apiClient.updateTelemetry).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Telemetry updated successfully');
    });

    it('should handle telemetry update failures gracefully', async () => {
      const { getToken } = await import('../src/lib/config');
      const { apiClient } = await import('../src/lib/api-client');
      const { logger } = await import('../src/utils/logger');

      vi.mocked(getToken).mockResolvedValue('test-token');
      vi.mocked(apiClient.updateTelemetry).mockRejectedValue(new Error('Network error'));

      await sendTelemetryUpdate();

      expect(logger.debug).toHaveBeenCalledWith('Telemetry update failed:', expect.any(Error));
    });
  });
});