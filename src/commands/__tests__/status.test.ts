import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { status } from '../status';
import * as tokenAuth from '../../lib/auth/token';
import * as apiClientModule from '../../lib/api-client';
import * as ui from '../../lib/ui';
import { VibelogError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import * as cursorReader from '../../lib/readers/cursor';

// Mock dependencies
vi.mock('../../lib/auth/token');
vi.mock('../../lib/api-client');
vi.mock('../../lib/ui');
vi.mock('../../utils/logger');
vi.mock('../../lib/readers/cursor');
vi.mock('chalk', () => {
  const identity = (text: string) => text;
  const chainable = {
    cyan: identity,
    gray: identity,
    green: identity,
    yellow: identity,
    blue: identity,
    magenta: identity,
    red: identity,
    bold: identity,
    dim: identity,
  };
  // Make bold return a chainable object with color methods
  const bold = Object.assign((text: string) => text, chainable);
  return {
    default: {
      ...chainable,
      bold,
    },
  };
});

describe('Status Command', () => {
  const mockTokenAuth = vi.mocked(tokenAuth);
  const mockApiClient = vi.mocked(apiClientModule.apiClient);
  const mockUi = vi.mocked(ui);
  const mockLogger = vi.mocked(logger);
  const mockCursorReader = vi.mocked(cursorReader);

  let mockSpinner: any;

  const mockStreakData = {
    current: 5,
    longestStreak: 10,
    points: 150,
    totalSessions: 25,
    todaySessions: 2,
  };

  const mockRecentSessions = [
    {
      timestamp: '2024-01-15T10:00:00Z',
      duration: 3600,
      projectName: 'vibe-log',
    },
    {
      timestamp: '2024-01-14T14:00:00Z',
      duration: 7200,
      projectName: 'test-project',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create fresh mockSpinner for each test
    mockSpinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      text: '',
    };
    
    // Setup apiClient mocks - assign mock functions
    mockApiClient.getStreak = vi.fn().mockResolvedValue(mockStreakData);
    mockApiClient.getRecentSessions = vi.fn().mockResolvedValue(mockRecentSessions);
    
    // Setup default mocks
    mockTokenAuth.requireAuth.mockResolvedValue();
    mockUi.createSpinner.mockReturnValue(mockSpinner);
    mockUi.formatDuration.mockImplementation((seconds) => `${Math.floor(seconds / 3600)}h`);
    mockUi.formatDate.mockImplementation((date) => date.toISOString().split('T')[0]);

    // Mock cursor reader - return empty stats by default
    mockCursorReader.countCursorMessages.mockResolvedValue({
      conversationCount: 0,
      totalMessages: 0,
      userMessages: 0,
      assistantMessages: 0,
    });

    // Mock console
    global.console.log = vi.fn();
    global.console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful status display', () => {
    it('should display complete streak information', async () => {
      await status();

      expect(mockTokenAuth.requireAuth).toHaveBeenCalled();
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockApiClient.getStreak).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Stats loaded!');
      
      // Check displayed information
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Your vibe-log Stats'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Current Streak: 5 days'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Longest Streak: 10 days'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total Points: 150'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total Sessions: 25'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Sessions Today: 2'));
    });

    it('should display recent sessions', async () => {
      await status();

      expect(mockApiClient.getRecentSessions).toHaveBeenCalledWith(5);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Recent Sessions:'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('vibe-log'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test-project'));
    });

    it('should format durations correctly', async () => {
      mockUi.formatDuration.mockImplementation((seconds) => {
        if (seconds === 3600) return '1h';
        if (seconds === 7200) return '2h';
        return `${seconds}s`;
      });

      await status();

      expect(mockUi.formatDuration).toHaveBeenCalledWith(3600);
      expect(mockUi.formatDuration).toHaveBeenCalledWith(7200);
    });

    it('should show appropriate motivational messages', async () => {
      // Test different streak levels
      const testCases = [
        { current: 0, message: 'Ready to start your streak?' },
        { current: 3, message: 'Keep going! You\'re building momentum.' },
        { current: 15, message: 'Amazing progress! You\'re on fire!' },
        { current: 50, message: 'Incredible dedication! You\'re a coding machine!' },
        { current: 150, message: 'LEGENDARY STREAK! You\'re unstoppable!' },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();
        mockTokenAuth.requireAuth.mockResolvedValue();
        mockUi.createSpinner.mockReturnValue(mockSpinner as any);
        mockApiClient.getStreak.mockResolvedValue({
          ...mockStreakData,
          current: testCase.current,
        });
        mockApiClient.getRecentSessions.mockResolvedValue([]);

        await status();

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining(testCase.message));
      }
    });
  });

  describe('zero streak handling', () => {
    it('should handle zero current streak', async () => {
      mockApiClient.getStreak.mockResolvedValue({
        ...mockStreakData,
        current: 0,
        todaySessions: 0,
      });

      await status();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Current Streak: 0 days'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Start building today!'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Sessions Today: 0 - Time to code!'));
    });

    it('should handle all zero values', async () => {
      mockApiClient.getStreak.mockResolvedValue({
        current: 0,
        longestStreak: 0,
        points: 0,
        totalSessions: 0,
        todaySessions: 0,
      });

      await status();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Current Streak: 0 days'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Longest Streak: 0 days'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total Points: 0'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total Sessions: 0'));
    });
  });

  describe('error handling', () => {
    it('should handle authentication failure', async () => {
      mockTokenAuth.requireAuth.mockRejectedValue(
        new VibelogError('Not authenticated', 'AUTH_REQUIRED')
      );

      await expect(status()).rejects.toThrow(VibelogError);
      await expect(status()).rejects.toThrow('Not authenticated');
      
      expect(mockSpinner.start).not.toHaveBeenCalled();
    });

    it('should handle API failure', async () => {
      const apiError = new Error('Network error');
      mockApiClient.getStreak.mockRejectedValue(apiError);

      await expect(status()).rejects.toThrow(VibelogError);
      await expect(status()).rejects.toThrow('Failed to fetch your stats');
      
      expect(mockSpinner.fail).toHaveBeenCalledWith('Failed to fetch stats');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch status', apiError);
    });

    it('should handle invalid streak data', async () => {
      mockApiClient.getStreak.mockResolvedValue({
        current: NaN,
        longestStreak: undefined,
        points: null,
      } as any);

      await expect(status()).rejects.toThrow(VibelogError);
      await expect(status()).rejects.toThrow('Failed to fetch your stats. Please try again.');
      expect(mockSpinner.fail).toHaveBeenCalled();
    });

    it('should handle missing streak data', async () => {
      mockApiClient.getStreak.mockResolvedValue(null as any);

      await expect(status()).rejects.toThrow(VibelogError);
      await expect(status()).rejects.toThrow('Failed to fetch your stats. Please try again.');
    });

    it('should continue if recent sessions fail', async () => {
      mockApiClient.getRecentSessions.mockRejectedValue(new Error('Sessions error'));

      await status();

      // Should still display streak info
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Current Streak: 5 days'));
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Failed to fetch recent sessions',
        expect.any(Error)
      );
    });

    it('should rethrow VibelogError without wrapping', async () => {
      const customError = new VibelogError('Custom error', 'CUSTOM_CODE');
      mockApiClient.getStreak.mockRejectedValue(customError);

      await expect(status()).rejects.toThrow(customError);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('data validation', () => {
    it('should handle negative values gracefully', async () => {
      mockApiClient.getStreak.mockResolvedValue({
        current: -5,
        longestStreak: -10,
        points: -100,
        totalSessions: -25,
        todaySessions: -2,
      });

      await status();

      // Should handle negative values gracefully
      // Current streak: negative shows as 0 (due to > 0 check)
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Current Streak: 0 days'));
      // Longest streak: negative is truthy so || doesn't convert it
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Longest Streak: -10 days'));
    });

    it('should handle undefined optional fields', async () => {
      mockApiClient.getStreak.mockResolvedValue({
        current: 5,
        longestStreak: undefined,
        points: undefined,
        totalSessions: undefined,
        todaySessions: undefined,
      } as any);

      await status();

      // Should use defaults for undefined values
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Longest Streak: 0 days'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total Points: 0'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total Sessions: 0'));
    });

    it('should handle empty recent sessions array', async () => {
      mockApiClient.getRecentSessions.mockResolvedValue([]);

      await status();

      // Should not display recent sessions section
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Recent Sessions:'));
    });

    it('should handle malformed session data', async () => {
      mockApiClient.getRecentSessions.mockResolvedValue([
        {
          timestamp: 'invalid-date',
          duration: NaN,
          projectName: null,
        },
      ] as any);

      await status();

      // Should not crash - that's the main thing
      expect(mockSpinner.succeed).toHaveBeenCalled();
      // May or may not display the session depending on date parsing
    });
  });

  describe('formatting and display', () => {
    it('should use correct colors for different states', async () => {
      await status();

      // Verify color usage (mocked chalk returns plain text in tests)
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('📊 Your vibe-log Stats'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔥 Current Streak'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🏆 Longest Streak'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⭐ Total Points'));
    });

    it('should format dates correctly', async () => {
      mockUi.formatDate.mockImplementation((date) => {
        return new Date(date).toLocaleDateString();
      });

      await status();

      expect(mockUi.formatDate).toHaveBeenCalled();
    });

    it('should display divider lines', async () => {
      await status();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('═══════════════════════════════'));
    });

    it('should handle very large numbers', async () => {
      mockApiClient.getStreak.mockResolvedValue({
        current: 999999,
        longestStreak: 999999,
        points: 999999999,
        totalSessions: 999999,
        todaySessions: 999,
      });

      await status();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('999999'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('999999999'));
    });
  });

  describe('spinner behavior', () => {
    it('should start spinner with correct message', async () => {
      await status();

      expect(mockUi.createSpinner).toHaveBeenCalledWith('Fetching your stats...');
      expect(mockSpinner.start).toHaveBeenCalled();
    });

    it('should stop spinner on success', async () => {
      await status();

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Stats loaded!');
    });

    it('should stop spinner on failure', async () => {
      mockApiClient.getStreak.mockRejectedValue(new Error('API error'));

      await expect(status()).rejects.toThrow();
      
      expect(mockSpinner.fail).toHaveBeenCalledWith('Failed to fetch stats');
    });
  });

  describe('edge cases', () => {
    it('should handle Infinity values', async () => {
      mockApiClient.getStreak.mockResolvedValue({
        current: Infinity,
        longestStreak: 10,
        points: 150,
        totalSessions: 25,
        todaySessions: 2,
      } as any);

      // Infinity is technically a valid number, so it won't throw
      await status();
      
      // Should display Infinity (though unusual)
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Current Streak: Infinity days'));
    });

    it('should handle non-numeric string values', async () => {
      mockApiClient.getStreak.mockResolvedValue({
        current: 'five' as any,
        longestStreak: 10,
        points: 150,
        totalSessions: 25,
        todaySessions: 2,
      });

      await expect(status()).rejects.toThrow(VibelogError);
      await expect(status()).rejects.toThrow('Failed to fetch your stats. Please try again.');
    });

    it('should handle circular reference in data', async () => {
      const circularData: any = { current: 5 };
      circularData.self = circularData;
      
      mockApiClient.getStreak.mockResolvedValue(circularData);

      await status();

      // Should handle without crashing
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Current Streak: 5'));
    });

    it('should handle very long project names', async () => {
      mockApiClient.getRecentSessions.mockResolvedValue([
        {
          timestamp: '2024-01-15T10:00:00Z',
          duration: 3600,
          projectName: 'a'.repeat(200),
        },
      ]);

      await status();

      // Should handle long names gracefully
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('a'.repeat(200)));
    });
  });

  describe('performance', () => {
    it('should complete within reasonable time', async () => {
      const start = performance.now();
      
      await status();
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle API timeout gracefully', async () => {
      const timeoutError = new Error('ETIMEDOUT');
      mockApiClient.getStreak.mockRejectedValue(timeoutError);

      await expect(status()).rejects.toThrow(VibelogError);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch status', timeoutError);
    });
  });
});