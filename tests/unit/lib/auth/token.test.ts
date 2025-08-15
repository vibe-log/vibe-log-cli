import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isAuthenticated, requireAuth } from '../../../../src/lib/auth/token';
import { apiClient } from '../../../../src/lib/api-client';
import * as config from '../../../../src/lib/config';
import { setupTestEnv, cleanupTestEnv } from '../../../test-utils';

// Mock modules
vi.mock('../../../../src/lib/api-client');
vi.mock('../../../../src/lib/config');

describe('Token Authentication Module', () => {
  beforeEach(() => {
    setupTestEnv();
  });

  afterEach(() => {
    cleanupTestEnv();
  });

  describe('isAuthenticated', () => {
    it('should return true for valid token', async () => {
      vi.mocked(config.getToken).mockResolvedValue('validtoken123456789012345678901234567890');
      vi.mocked(apiClient.verifyToken).mockResolvedValue({ 
        valid: true, 
        user: { email: 'test@example.com' } 
      });
      
      const result = await isAuthenticated();
      
      expect(result).toBe(true);
      expect(config.getToken).toHaveBeenCalled();
      expect(apiClient.verifyToken).toHaveBeenCalled();
    });

    it('should return false when no token exists', async () => {
      vi.mocked(config.getToken).mockResolvedValue(null);
      
      const result = await isAuthenticated();
      
      expect(result).toBe(false);
      expect(apiClient.verifyToken).not.toHaveBeenCalled();
    });

    it('should return false for invalid token', async () => {
      vi.mocked(config.getToken).mockResolvedValue('invalidtoken12345678901234567890123456789');
      vi.mocked(apiClient.verifyToken).mockResolvedValue({ 
        valid: false 
      });
      
      const result = await isAuthenticated();
      
      expect(result).toBe(false);
    });

    it('should return false on verification error', async () => {
      vi.mocked(config.getToken).mockResolvedValue('errortoken123456789012345678901234567890');
      vi.mocked(apiClient.verifyToken).mockRejectedValue(
        new Error('Network error')
      );
      
      const result = await isAuthenticated();
      
      expect(result).toBe(false);
    });
  });

  describe('requireAuth', () => {
    it('should not throw when authenticated', async () => {
      vi.mocked(config.getToken).mockResolvedValue('validtoken123456789012345678901234567890');
      vi.mocked(apiClient.verifyToken).mockResolvedValue({ 
        valid: true, 
        user: { email: 'test@example.com' } 
      });
      
      await expect(requireAuth()).resolves.not.toThrow();
    });

    it('should throw when not authenticated', async () => {
      vi.mocked(config.getToken).mockResolvedValue(null);
      
      await expect(requireAuth()).rejects.toThrow(
        'Authentication required. Please run: npx vibe-log'
      );
    });

    it('should throw when token is invalid', async () => {
      vi.mocked(config.getToken).mockResolvedValue('invalidtoken12345678901234567890123456789');
      vi.mocked(apiClient.verifyToken).mockResolvedValue({ 
        valid: false 
      });
      
      await expect(requireAuth()).rejects.toThrow(
        'Authentication required. Please run: npx vibe-log'
      );
    });

    it('should throw on verification error', async () => {
      vi.mocked(config.getToken).mockResolvedValue('errortoken123456789012345678901234567890');
      vi.mocked(apiClient.verifyToken).mockRejectedValue(
        new Error('API error')
      );
      
      await expect(requireAuth()).rejects.toThrow(
        'Authentication required. Please run: npx vibe-log'
      );
    });
  });

  describe('Re-exports', () => {
    it('should re-export getToken from config', async () => {
      const { getToken } = await import('../../../../src/lib/auth/token');
      expect(getToken).toBe(config.getToken);
    });

    it('should re-export clearToken from config', async () => {
      const { clearToken } = await import('../../../../src/lib/auth/token');
      expect(clearToken).toBe(config.clearToken);
    });

    it('should re-export storeToken from config', async () => {
      const { storeToken } = await import('../../../../src/lib/auth/token');
      expect(storeToken).toBe(config.storeToken);
    });
  });
});