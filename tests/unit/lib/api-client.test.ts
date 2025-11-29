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
      const mockServerResponse = {
        success: true,
        created: 1,
        duplicates: 0,
        analysisPreview: 'Great coding session!',
        streak: testData.createStreakInfo(),
      };
      
      mockAxiosInstance.post.mockResolvedValue({
        data: mockServerResponse,
      });
      
      const result = await apiClient.uploadSessions(sessions);
      
      // The mergeResults method now returns additional fields
      expect(result).toEqual({
        success: true,
        created: 1,
        duplicates: 0,
        sessionsProcessed: 1, // created + duplicates
        analysisPreview: 'Great coding session!',
        streak: testData.createStreakInfo(),
        batchId: undefined,
      });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/cli/sessions',
        expect.objectContaining({
          sessions: expect.any(Array),
          checksum: expect.any(String),
          telemetry: expect.objectContaining({
            cliVersion: expect.any(String),
            statusLinePersonality: expect.any(String),
          }),
          batchNumber: expect.any(Number),
          totalBatches: expect.any(Number),
          totalSessions: expect.any(Number),
        }),
        expect.any(Object)  // headers object
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
          expect(e.message).toBe('Your session has expired. Please authenticate again');
          expect(e.code).toBe('AUTH_EXPIRED');
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
          expect(e.message).toContain('Too many requests');
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
          expect(e.message).toContain('Cannot reach vibe-log servers');
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
          expect(e.message).toContain('Connection refused');
          expect(e.code).toBe('CONNECTION_REFUSED');
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

  describe('Telemetry', () => {
    it('should update telemetry data', async () => {
      const telemetryData = {
        cliVersion: '1.0.0',
        platform: 'darwin',
        nodeVersion: 'v18.0.0',
        statusLinePersonality: 'default',
      };

      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      await apiClient.updateTelemetry(telemetryData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/cli-telemetry', telemetryData);
    });

    it('should handle telemetry update errors', async () => {
      const telemetryData = {
        cliVersion: '1.0.0',
        platform: 'darwin',
        nodeVersion: 'v18.0.0',
        statusLinePersonality: 'default',
      };

      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      // Telemetry errors are propagated (no try-catch in updateTelemetry)
      await expect(apiClient.updateTelemetry(telemetryData)).rejects.toThrow('Network error');
    });
  });

  describe('Recent Sessions with Date Filters', () => {
    it('should get recent sessions with date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const mockSessions = [
        { timestamp: '2024-01-15T10:00:00Z', duration: 3600, projectName: 'test' },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockSessions });

      const result = await apiClient.getRecentSessions(20, startDate, endDate);

      expect(result).toEqual(mockSessions);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/sessions/recent', {
        params: {
          limit: 20,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      });
    });

    it('should handle only startDate parameter', async () => {
      const startDate = new Date('2024-01-01');

      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await apiClient.getRecentSessions(10, startDate);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/sessions/recent', {
        params: {
          limit: 10,
          start: startDate.toISOString(),
        },
      });
    });
  });

  describe('Upload Error Handling', () => {
    it('should propagate upload errors', async () => {
      const sessions = [testData.createSession()];

      mockAxiosInstance.post.mockRejectedValue(new Error('Upload failed'));

      await expect(apiClient.uploadSessions(sessions)).rejects.toThrow('Upload failed');
    });

    it('should handle validation errors', async () => {
      const sessions = [testData.createSession()];

      mockAxiosInstance.post.mockRejectedValue(new Error('Invalid session data'));

      await expect(apiClient.uploadSessions(sessions)).rejects.toThrow('Invalid session data');
    });
  });

  describe('Batch Upload', () => {
    it('should handle large session batches', async () => {
      // Create 150 sessions (should be split into 2 batches of 100 and 50)
      const sessions = Array.from({ length: 150 }, () => testData.createSession());

      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, created: 100, duplicates: 0 },
      });

      await apiClient.uploadSessions(sessions);

      // Should make 2 calls for batches
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);

      // First batch should have 100 sessions
      expect(mockAxiosInstance.post.mock.calls[0][1].sessions).toHaveLength(100);
      expect(mockAxiosInstance.post.mock.calls[0][1].batchNumber).toBe(1);
      expect(mockAxiosInstance.post.mock.calls[0][1].totalBatches).toBe(2);

      // Second batch should have 50 sessions
      expect(mockAxiosInstance.post.mock.calls[1][1].sessions).toHaveLength(50);
      expect(mockAxiosInstance.post.mock.calls[1][1].batchNumber).toBe(2);
      expect(mockAxiosInstance.post.mock.calls[1][1].totalBatches).toBe(2);
    });

    it('should aggregate results from multiple batches', async () => {
      const sessions = Array.from({ length: 150 }, () => testData.createSession());

      mockAxiosInstance.post
        .mockResolvedValueOnce({
          data: { success: true, created: 80, duplicates: 20 },
        })
        .mockResolvedValueOnce({
          data: { success: true, created: 45, duplicates: 5 },
        });

      const result = await apiClient.uploadSessions(sessions);

      expect(result.created).toBe(125); // 80 + 45
      expect(result.duplicates).toBe(25); // 20 + 5
      expect(result.sessionsProcessed).toBe(150); // Total
    });

    it('should call progress callback during batch upload', async () => {
      const sessions = Array.from({ length: 150 }, () => testData.createSession());
      const progressCallback = vi.fn();

      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, created: 100, duplicates: 0 },
      });

      await apiClient.uploadSessions(sessions, progressCallback);

      // Progress should be called for each batch
      expect(progressCallback).toHaveBeenCalled();
    });
  });
});