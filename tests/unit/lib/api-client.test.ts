import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { VibelogError } from '../../../src/utils/errors';
import * as config from '../../../src/lib/config';
import { setupTestEnv, cleanupTestEnv, testData } from '../../test-utils';

// Mock modules
vi.mock('axios');
vi.mock('../../../src/lib/config');

describe('API Client Module', () => {
  let mockAxiosInstance: any;
  let apiClient: any;

  beforeEach(async () => {
    setupTestEnv();
    
    // Clear module cache
    vi.resetModules();
    
    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    };
    
    // Mock axios.create to return our mock instance
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);
    
    // Mock config functions
    vi.mocked(config.getApiUrl).mockReturnValue('https://test.vibe-log.dev');
    vi.mocked(config.getToken).mockResolvedValue('testtoken123456789012345678901234567890');
    
    // Import apiClient after mocks are set up
    const apiClientModule = await import('../../../src/lib/api-client');
    apiClient = apiClientModule.apiClient;
  });

  afterEach(() => {
    cleanupTestEnv();
  });

  describe('Authentication', () => {
    it('should create auth session', async () => {
      const authUrl = 'https://vibe-log.dev/auth/cli/test-session-123';
      const token = 'session-token-123456789012345678901234567890';
      
      mockAxiosInstance.post.mockResolvedValue({
        data: { authUrl, sessionId: token },
      });
      
      const result = await apiClient.createAuthSession();
      
      expect(result).toEqual({ authUrl, token });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/auth/cli/session', {
        timestamp: expect.any(String),
      });
    });

    it('should check auth completion', async () => {
      const token = 'test-token-123456789012345678901234567890';
      const mockResponse = { success: true, userId: 1 };
      
      mockAxiosInstance.get.mockResolvedValue({
        data: mockResponse,
      });
      
      const result = await apiClient.checkAuthCompletion(token);
      
      expect(result).toEqual(mockResponse);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/api/auth/cli/complete?token=${token}`
      );
    });

    it('should verify token', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { valid: true, user: { id: 1, email: 'test@example.com' } },
      });
      
      const result = await apiClient.verifyToken();
      
      expect(result).toEqual({
        valid: true,
        user: { id: 1 },
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/auth/cli/verify');
    });

    it('should return invalid for failed token verification', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Unauthorized'));
      
      const result = await apiClient.verifyToken();
      
      expect(result).toEqual({ valid: false });
    });
  });

  describe('Session Management', () => {
    it('should upload sessions', async () => {
      const sessions = [testData.createSession()];
      const mockResult = {
        success: true,
        sessionsProcessed: 1,
        analysisPreview: 'Great coding session!',
        streak: testData.createStreakInfo(),
      };
      
      mockAxiosInstance.post.mockResolvedValue({
        data: mockResult,
      });
      
      const result = await apiClient.uploadSessions(sessions);
      
      expect(result).toEqual(mockResult);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/cli/sessions', 
        expect.objectContaining({
          sessions: expect.any(Array),
          checksum: expect.any(String),
        })
      );
    });

    it('should get streak info', async () => {
      const streakInfo = testData.createStreakInfo();
      
      mockAxiosInstance.get.mockResolvedValue({
        data: streakInfo,
      });
      
      const result = await apiClient.getStreak();
      
      expect(result).toEqual(streakInfo);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/user/streak');
    });

    it('should get recent sessions', async () => {
      const recentSessions = [
        { timestamp: '2024-01-15T10:00:00Z', duration: 3600, projectName: 'test-project' },
      ];
      
      mockAxiosInstance.get.mockResolvedValue({
        data: recentSessions,
      });
      
      const result = await apiClient.getRecentSessions(5);
      
      expect(result).toEqual(recentSessions);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/sessions/recent', {
        params: { limit: 5 },
      });
    });

    it('should use default limit for recent sessions', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });
      
      await apiClient.getRecentSessions();
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/sessions/recent', {
        params: { limit: 10 },
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 errors', async () => {
      const error = {
        response: { status: 401, data: {}, headers: {} },
        isAxiosError: true,
        message: 'Unauthorized',
        config: {},
      };
      
      // Get the response error interceptor
      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0]?.[1];
      
      if (errorInterceptor) {
        try {
          await errorInterceptor(error);
          expect.fail('Should have thrown an error');
        } catch (e: any) {
          expect(e.message).toBe('Authentication required');
          expect(e.code).toBe('AUTH_REQUIRED');
        }
      }
    });

    it('should handle 429 rate limit errors', async () => {
      const error = {
        response: { status: 429, data: {}, headers: { 'retry-after': '60' } },
        isAxiosError: true,
        message: 'Too Many Requests',
        config: {},
      };
      
      // Get the response error interceptor
      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0]?.[1];
      
      if (errorInterceptor) {
        try {
          await errorInterceptor(error);
          expect.fail('Should have thrown an error');
        } catch (e: any) {
          expect(e.message).toContain('Rate limit exceeded');
          expect(e.code).toBe('RATE_LIMITED');
        }
      }
    });

    it('should handle network errors', async () => {
      const error: any = {
        code: 'ENOTFOUND',
        isAxiosError: true,
        message: 'Network error',
        config: { baseURL: 'https://test.vibe-log.dev' },
      };
      
      // Get the response error interceptor
      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0]?.[1];
      
      if (errorInterceptor) {
        try {
          await errorInterceptor(error);
          expect.fail('Should have thrown an error');
        } catch (e: any) {
          expect(e.message).toContain('Cannot connect to server');
          expect(e.code).toBe('NETWORK_ERROR');
        }
      }
    });

    it('should handle connection refused errors', async () => {
      const error: any = {
        code: 'ECONNREFUSED',
        isAxiosError: true,
        message: 'Connection refused',
        config: { baseURL: 'https://test.vibe-log.dev' },
      };
      
      // Get the response error interceptor
      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0]?.[1];
      
      if (errorInterceptor) {
        try {
          await errorInterceptor(error);
          expect.fail('Should have thrown an error');
        } catch (e: any) {
          expect(e.message).toContain('Cannot connect to server');
          expect(e.code).toBe('NETWORK_ERROR');
        }
      }
    });

    it('should propagate other errors', async () => {
      const error = new Error('Unknown error');
      
      mockAxiosInstance.get.mockRejectedValue(error);
      
      await expect(apiClient.getStreak()).rejects.toThrow('Unknown error');
    });
  });

  describe('Request Interceptors', () => {
    it('should add authorization header when token exists', async () => {
      // Get the request interceptor function
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      
      const config = { headers: {} };
      const result = await requestInterceptor(config);
      
      expect(result.headers.Authorization).toBe('Bearer testtoken123456789012345678901234567890');
      expect(result.baseURL).toBe('https://test.vibe-log.dev');
    });

    it('should not add authorization header when no token', async () => {
      vi.mocked(config.getToken).mockResolvedValue(null);
      
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      
      const requestConfig = { headers: {} };
      const result = await requestInterceptor(requestConfig);
      
      expect(result.headers.Authorization).toBeUndefined();
    });
  });

  describe('Timeout and Headers', () => {
    it('should configure axios with correct defaults', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });
});