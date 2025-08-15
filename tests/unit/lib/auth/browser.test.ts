import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import open from 'open';
import ora from 'ora';
import { validateAndStoreToken } from '../../../../src/lib/auth/browser';
import { apiClient } from '../../../../src/lib/api-client';
import * as config from '../../../../src/lib/config';
import { setupTestEnv, cleanupTestEnv } from '../../../test-utils';

// Mock modules
vi.mock('open');
vi.mock('ora');
vi.mock('../../../../src/lib/api-client', () => ({
  apiClient: {
    createAuthSession: vi.fn(),
    verifyToken: vi.fn(),
    uploadSessions: vi.fn(),
    getStreak: vi.fn(),
    getRecentSessions: vi.fn(),
  }
}));
vi.mock('../../../../src/lib/config');

describe('Browser Authentication Module', () => {
  let mockSpinner: any;
  let mockConsole: any;

  beforeEach(() => {
    setupTestEnv();
    
    // Mock spinner
    mockSpinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      text: '',
    };
    vi.mocked(ora).mockReturnValue(mockSpinner);
    
    // Mock console
    mockConsole = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
    
    // Mock config
    vi.mocked(config.storeToken).mockResolvedValue(undefined);
    vi.mocked(config.clearToken).mockResolvedValue(undefined);
    vi.mocked(config.getApiUrl).mockReturnValue('https://test.vibe-log.dev');
  });

  afterEach(() => {
    cleanupTestEnv();
    mockConsole.log.mockRestore();
    mockConsole.error.mockRestore();
  });

  describe('validateAndStoreToken', () => {
    it('should validate and store valid token', async () => {
      const token = 'valid-token-123456789012345678901234567890';
      const user = { id: 1 };
      
      vi.mocked(apiClient.verifyToken).mockResolvedValue({ 
        valid: true, 
        user 
      });
      
      await validateAndStoreToken(token);
      
      expect(config.storeToken).toHaveBeenCalledWith(token);
      expect(apiClient.verifyToken).toHaveBeenCalled();
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('✅ Authentication verified')
      );
    });

    it('should reject invalid token', async () => {
      const token = 'invalid';
      
      await expect(validateAndStoreToken(token)).rejects.toThrow('Invalid token format');
    });

    it('should handle verification errors', async () => {
      const token = 'errortoken123456789012345678901234567890';
      
      vi.mocked(apiClient.verifyToken).mockRejectedValue(
        new Error('Network error')
      );
      
      await expect(validateAndStoreToken(token)).rejects.toThrow('Network error');
    });

    it('should store token before verification', async () => {
      const token = 'testtoken123456789012345678901234567890';
      let storeTokenCalled = false;
      let verifyTokenCalled = false;
      
      vi.mocked(config.storeToken).mockImplementation(async () => {
        storeTokenCalled = true;
        expect(verifyTokenCalled).toBe(false);
      });
      
      vi.mocked(apiClient.verifyToken).mockImplementation(async () => {
        verifyTokenCalled = true;
        expect(storeTokenCalled).toBe(true);
        return { valid: true, user: { id: 1 } };
      });
      
      await validateAndStoreToken(token);
      
      expect(storeTokenCalled).toBe(true);
      expect(verifyTokenCalled).toBe(true);
    });
  });

  // Note: browserAuth tests are omitted because they require complex SSE mocking
  // These would be better tested as integration tests or e2e tests
});