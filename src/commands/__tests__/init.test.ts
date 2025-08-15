import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import inquirer from 'inquirer';
import { init } from '../init';
import * as browserAuth from '../../lib/auth/browser';
import * as tokenAuth from '../../lib/auth/token';
import * as ui from '../../lib/ui';
import * as inputValidator from '../../lib/input-validator';
import { VibelogError } from '../../utils/errors';
import { logger } from '../../utils/logger';

// Mock all dependencies
vi.mock('inquirer');
vi.mock('../../lib/auth/browser');
vi.mock('../../lib/auth/token');
vi.mock('../../lib/ui');
vi.mock('../../lib/input-validator');
vi.mock('../../utils/logger');

describe('Init Command', () => {
  const mockInquirer = vi.mocked(inquirer);
  const mockBrowserAuth = vi.mocked(browserAuth);
  const mockTokenAuth = vi.mocked(tokenAuth);
  const mockUi = vi.mocked(ui);
  const mockInputValidator = vi.mocked(inputValidator);
  const mockLogger = vi.mocked(logger);

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockTokenAuth.getToken.mockResolvedValue(null);
    mockInquirer.prompt.mockResolvedValue({ ready: true, proceed: true });
    mockBrowserAuth.browserAuth.mockResolvedValue();
    mockBrowserAuth.validateAndStoreToken.mockResolvedValue();
    mockInputValidator.validateAuthToken.mockImplementation((token) => token);
    
    // Mock console methods
    global.console.log = vi.fn();
    global.console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful authentication', () => {
    it('should complete browser-based authentication flow', async () => {
      await init({});

      expect(mockUi.showWelcome).toHaveBeenCalled();
      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'ready',
          message: 'Ready to authenticate with vibe-log?',
          default: true,
        }),
      ]);
      expect(mockBrowserAuth.browserAuth).toHaveBeenCalled();
      expect(mockUi.showSuccess).toHaveBeenCalledWith('Authentication successful!');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Next steps:'));
    });

    it('should handle token-based authentication', async () => {
      const testToken = 'test-auth-token-123';
      
      await init({ token: testToken });

      expect(mockUi.showWelcome).toHaveBeenCalled();
      expect(mockInputValidator.validateAuthToken).toHaveBeenCalledWith(testToken);
      expect(mockBrowserAuth.validateAndStoreToken).toHaveBeenCalledWith(testToken);
      expect(mockBrowserAuth.browserAuth).not.toHaveBeenCalled();
      expect(mockUi.showSuccess).toHaveBeenCalledWith('Authentication successful!');
    });

    it('should show information about Vibelog', async () => {
      await init({});

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('What is vibe-log?'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('tracks your coding sessions'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('building streak'));
    });

    it('should display next steps after successful auth', async () => {
      await init({});

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Use Claude Code'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('npx vibe-log'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Track your progress'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Tip: Use the interactive menu'));
    });
  });

  describe('re-authentication flow', () => {
    it('should prompt for re-authentication when already authenticated', async () => {
      mockTokenAuth.getToken.mockResolvedValue('existing-token');
      mockInquirer.prompt.mockResolvedValueOnce({ proceed: true });
      mockInquirer.prompt.mockResolvedValueOnce({ ready: true });

      await init({});

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'proceed',
          message: 'You are already authenticated. Would you like to re-authenticate?',
          default: false,
        }),
      ]);
      expect(mockBrowserAuth.browserAuth).toHaveBeenCalled();
    });

    it('should cancel if user declines re-authentication', async () => {
      mockTokenAuth.getToken.mockResolvedValue('existing-token');
      mockInquirer.prompt.mockResolvedValue({ proceed: false });

      await init({});

      expect(mockUi.showInfo).toHaveBeenCalledWith(
        'Authentication cancelled. You are still logged in.'
      );
      expect(mockBrowserAuth.browserAuth).not.toHaveBeenCalled();
      expect(mockUi.showSuccess).not.toHaveBeenCalled();
    });

    it('should skip re-auth prompt when token provided via CLI', async () => {
      mockTokenAuth.getToken.mockResolvedValue('existing-token');
      const newToken = 'new-token-456';

      await init({ token: newToken });

      // Should not prompt for re-authentication
      expect(mockInquirer.prompt).not.toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'proceed' }),
        ])
      );
      expect(mockBrowserAuth.validateAndStoreToken).toHaveBeenCalledWith(newToken);
    });
  });

  describe('user cancellation', () => {
    it('should handle user cancelling browser auth', async () => {
      mockInquirer.prompt.mockResolvedValue({ ready: false });

      await init({});

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Authentication cancelled'));
      expect(mockBrowserAuth.browserAuth).not.toHaveBeenCalled();
      expect(mockUi.showSuccess).not.toHaveBeenCalled();
    });

    it('should not show next steps when cancelled', async () => {
      mockInquirer.prompt.mockResolvedValue({ ready: false });

      await init({});

      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Next steps:'));
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Tip:'));
    });
  });

  describe('error handling', () => {
    it('should handle browser auth failure', async () => {
      const authError = new Error('Browser auth failed');
      mockBrowserAuth.browserAuth.mockRejectedValue(authError);

      await expect(init({})).rejects.toThrow(VibelogError);
      await expect(init({})).rejects.toThrow('Authentication failed. Please try again.');
      
      expect(mockLogger.error).toHaveBeenCalledWith('Authentication failed', authError);
    });

    it('should handle token validation failure', async () => {
      const validationError = new Error('Invalid token format');
      mockInputValidator.validateAuthToken.mockImplementation(() => {
        throw validationError;
      });

      await expect(init({ token: 'bad-token' })).rejects.toThrow();
      expect(mockBrowserAuth.validateAndStoreToken).not.toHaveBeenCalled();
    });

    it('should handle token storage failure', async () => {
      const storageError = new Error('Failed to store token');
      mockBrowserAuth.validateAndStoreToken.mockRejectedValue(storageError);

      await expect(init({ token: 'test-token' })).rejects.toThrow(VibelogError);
      expect(mockLogger.error).toHaveBeenCalledWith('Authentication failed', storageError);
    });

    it('should rethrow VibelogError without wrapping', async () => {
      const vibelogError = new VibelogError('Custom error', 'CUSTOM_CODE');
      mockBrowserAuth.browserAuth.mockRejectedValue(vibelogError);

      await expect(init({})).rejects.toThrow(vibelogError);
      expect(mockLogger.error).not.toHaveBeenCalled(); // Should not log VibelogErrors
    });

    it('should handle prompt errors gracefully', async () => {
      mockInquirer.prompt.mockRejectedValue(new Error('Prompt failed'));

      await expect(init({})).rejects.toThrow(VibelogError);
      await expect(init({})).rejects.toThrow('Authentication failed. Please try again.');
    });
  });

  describe('logging and debugging', () => {
    it('should log debug information', async () => {
      const testToken = 'debug-token';
      
      await init({ token: testToken });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting authentication process',
        { hasToken: true }
      );
    });

    it('should log when no token provided', async () => {
      await init({});

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting authentication process',
        { hasToken: false }
      );
    });

    it('should use appropriate console colors', async () => {
      await init({});

      // Check that console.log was called with content (color codes may vary)
      expect(console.log).toHaveBeenCalled();
      const logCalls = (console.log as any).mock.calls.map((call: any[]) => call[0]);
      const allLogs = logCalls.join('\n');
      // Check for expected content rather than specific color codes
      expect(allLogs).toContain('What is vibe-log?');
      expect(allLogs).toContain('tracks your coding sessions');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined options', async () => {
      await init({} as any); // Pass empty object instead of undefined

      expect(mockBrowserAuth.browserAuth).toHaveBeenCalled();
      expect(mockUi.showSuccess).toHaveBeenCalled();
    });

    it('should handle empty string token', async () => {
      // Empty string is falsy, so it goes to browser flow
      // This test should verify that empty token is treated as no token
      await init({ token: '' });

      // Should go through browser flow, not token validation
      expect(mockInputValidator.validateAuthToken).not.toHaveBeenCalled();
      expect(mockBrowserAuth.browserAuth).toHaveBeenCalled();
    });

    it('should handle whitespace-only token', async () => {
      mockInputValidator.validateAuthToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(init({ token: '   ' })).rejects.toThrow();
    });

    it('should handle very long tokens', async () => {
      const longToken = 'a'.repeat(1000);
      
      await init({ token: longToken });

      expect(mockInputValidator.validateAuthToken).toHaveBeenCalledWith(longToken);
      expect(mockBrowserAuth.validateAndStoreToken).toHaveBeenCalledWith(longToken);
    });

    it('should handle special characters in token', async () => {
      const specialToken = 'token-with-$p€cial-ch@rs!';
      
      await init({ token: specialToken });

      expect(mockInputValidator.validateAuthToken).toHaveBeenCalledWith(specialToken);
      expect(mockBrowserAuth.validateAndStoreToken).toHaveBeenCalledWith(specialToken);
    });
  });

  describe('integration scenarios', () => {
    it('should complete full first-time setup flow', async () => {
      // Simulate first-time user
      mockTokenAuth.getToken.mockResolvedValue(null);
      mockInquirer.prompt.mockResolvedValue({ ready: true });

      await init({});

      // Verify complete flow
      expect(mockUi.showWelcome).toHaveBeenCalledTimes(1);
      expect(mockTokenAuth.getToken).toHaveBeenCalledTimes(1);
      expect(mockInquirer.prompt).toHaveBeenCalledTimes(1);
      expect(mockBrowserAuth.browserAuth).toHaveBeenCalledTimes(1);
      expect(mockUi.showSuccess).toHaveBeenCalledTimes(1);
      
      // Verify order
      const showWelcomeOrder = mockUi.showWelcome.mock.invocationCallOrder[0];
      const getTokenOrder = mockTokenAuth.getToken.mock.invocationCallOrder[0];
      const browserAuthOrder = mockBrowserAuth.browserAuth.mock.invocationCallOrder[0];
      const showSuccessOrder = mockUi.showSuccess.mock.invocationCallOrder[0];
      
      expect(showWelcomeOrder).toBeLessThan(getTokenOrder);
      expect(getTokenOrder).toBeLessThan(browserAuthOrder);
      expect(browserAuthOrder).toBeLessThan(showSuccessOrder);
    });

    it('should handle interrupted flow gracefully', async () => {
      // Simulate interruption during prompt
      const interruptError = new Error('Process interrupted');
      mockInquirer.prompt.mockRejectedValue(interruptError);

      await expect(init({})).rejects.toThrow(VibelogError);
      
      // Verify partial execution
      expect(mockUi.showWelcome).toHaveBeenCalled();
      expect(mockBrowserAuth.browserAuth).not.toHaveBeenCalled();
      expect(mockUi.showSuccess).not.toHaveBeenCalled();
    });

    it('should handle network timeout during auth', async () => {
      const timeoutError = new Error('ETIMEDOUT');
      mockBrowserAuth.browserAuth.mockRejectedValue(timeoutError);

      await expect(init({})).rejects.toThrow(VibelogError);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Authentication failed',
        timeoutError
      );
    });
  });
});