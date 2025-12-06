import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { browserAuth, validateAndStoreToken, checkAuthRateLimit } from '../../../src/lib/auth/browser';
import { apiClient } from '../../../src/lib/api-client';
import * as config from '../../../src/lib/config';

vi.mock('../../../src/lib/api-client', () => ({
  apiClient: {
    createAuthSession: vi.fn(),
    verifyToken: vi.fn(),
  }
}));
vi.mock('../../../src/lib/config');

describe('Secure Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Note: browserAuth tests removed - the SSE-based implementation is tested in sse-client.test.ts

  describe('validateAndStoreToken', () => {
    it('should validate token format before storing', async () => {
      const dangerousTokens = [
        '<script>alert(1)</script>',
        'token`${process.env.SECRET}`',
        'token\'; DROP TABLE users;--',
        'a', // too short
      ];

      (config.storeToken as any) = vi.fn().mockResolvedValue(undefined);

      for (const token of dangerousTokens) {
        await expect(validateAndStoreToken(token)).rejects.toThrow();
        expect(config.storeToken).not.toHaveBeenCalled();
      }
    });

    it('should verify token with API before permanent storage', async () => {
      vi.mocked(config.storeToken).mockResolvedValue(undefined);
      vi.mocked(config.clearToken).mockResolvedValue(undefined);

      vi.mocked(apiClient.verifyToken).mockResolvedValue({
        valid: false,
      });

      await expect(validateAndStoreToken('validlookingbutinvalidtoken123456789012345678901234567890'))
        .rejects.toThrow('Invalid token');

      // Should have cleared the temporarily stored token
      expect(config.clearToken).toHaveBeenCalled();
    });

    it('should store valid tokens', async () => {
      vi.mocked(config.storeToken).mockResolvedValue(undefined);
      vi.mocked(apiClient.verifyToken).mockResolvedValue({
        valid: true,
        user: { id: 'user-123' },
      });

      await validateAndStoreToken('validtokenabc123xyz789123456789012345678901234567890');

      expect(config.storeToken).toHaveBeenCalledWith('validtokenabc123xyz789123456789012345678901234567890');
      expect(config.storeToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on authentication attempts', () => {
      const identifier = 'test-user';

      // First 5 attempts should succeed
      for (let i = 0; i < 5; i++) {
        expect(() => checkAuthRateLimit(identifier)).not.toThrow();
      }

      // 6th attempt should fail
      expect(() => checkAuthRateLimit(identifier)).toThrow('Too many authentication attempts');
    });

    it('should reset rate limit after time window', () => {
      const identifier = 'test-user-2';

      // Use up rate limit
      for (let i = 0; i < 5; i++) {
        checkAuthRateLimit(identifier);
      }

      // Should be rate limited
      expect(() => checkAuthRateLimit(identifier)).toThrow();

      // Advance time past the window (15 minutes)
      vi.advanceTimersByTime(16 * 60 * 1000);

      // Should be able to authenticate again
      expect(() => checkAuthRateLimit(identifier)).not.toThrow();
    });

    it('should track rate limits per identifier', () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      // Use up rate limit for user1
      for (let i = 0; i < 5; i++) {
        checkAuthRateLimit(user1);
      }

      // user1 should be rate limited
      expect(() => checkAuthRateLimit(user1)).toThrow();

      // user2 should still be able to authenticate
      expect(() => checkAuthRateLimit(user2)).not.toThrow();
    });
  });
});