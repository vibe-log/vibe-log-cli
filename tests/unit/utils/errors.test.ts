import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import chalk from 'chalk';
import { VibelogError, handleError, logDebug } from '../../../src/utils/errors';
import { setupTestEnv, cleanupTestEnv } from '../../test-utils';

// Force chalk to use colors in tests
chalk.level = 3;

describe('Error Handling', () => {
  let mockConsole: any;
  let mockExit: any;

  beforeEach(() => {
    setupTestEnv();
    
    // Mock console methods
    mockConsole = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
    
    // Mock process.exit
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exited');
    });
  });

  afterEach(() => {
    cleanupTestEnv();
    mockConsole.log.mockRestore();
    mockConsole.error.mockRestore();
    mockExit.mockRestore();
  });

  describe('VibelogError', () => {
    it('should create error with code', () => {
      const error = new VibelogError('Test error message', 'TEST_CODE');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('VibelogError');
    });

    it('should be throwable', () => {
      expect(() => {
        throw new VibelogError('Error', 'CODE');
      }).toThrow('Error');
    });
  });

  describe('handleError', () => {
    it('should handle VibelogError with AUTH_REQUIRED code', () => {
      const error = new VibelogError('Authentication required', 'AUTH_REQUIRED');
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Error: Authentication required')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('💡 Run: npx vibe-log')
      );
    });

    it('should handle authentication errors', () => {
      const codes = ['AUTH_EXPIRED', 'AUTH_FAILED', 'INVALID_TOKEN'];
      
      codes.forEach(code => {
        mockConsole.error.mockClear();
        mockConsole.log.mockClear();
        
        const error = new VibelogError('Auth error', code);
        
        expect(() => handleError(error)).toThrow('Process exited');
        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('💡 Run: npx vibe-log and authenticate')
        );
      });
    });

    it('should handle network errors', () => {
      const error = new VibelogError('Network failure', 'NETWORK_ERROR');
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('💡 Check your internet connection')
      );
    });

    it('should handle rate limit errors', () => {
      const error = new VibelogError('Too many requests', 'RATE_LIMITED');
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('💡 Please wait a few minutes')
      );
    });

    it('should handle Claude not found errors', () => {
      const error = new VibelogError('Claude not installed', 'CLAUDE_NOT_FOUND');
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('💡 Make sure Claude Code is installed')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Visit: https://claude.ai/download')
      );
    });

    it('should handle generic Error', () => {
      const error = new Error('Generic error message');
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Error: Generic error message')
      );
    });

    it('should show stack trace in debug mode', () => {
      process.env.DEBUG = 'true';
      
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n  at test.js:10';
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Stack trace:')
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('at test.js:10')
      );
    });

    it('should handle unknown error types', () => {
      const error = { weird: 'object' };
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ An unknown error occurred')
      );
    });

    it('should show unknown error details in debug mode', () => {
      process.env.VIBELOG_DEBUG = 'true';
      
      const error = { type: 'custom', details: 'data' };
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      expect(mockConsole.error).toHaveBeenCalledWith(error);
    });

    it('should always show help link', () => {
      const error = new Error('Any error');
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('💬 Need help? Visit: https://vibe-log.dev/help')
      );
    });

    it('should exit with code 1', () => {
      const error = new Error('Test');
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('logDebug', () => {
    it('should log when DEBUG is set', () => {
      process.env.DEBUG = 'true';
      
      logDebug('Debug message');
      
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Debug message')
      );
    });

    it('should log when VIBELOG_DEBUG is set', () => {
      process.env.VIBELOG_DEBUG = 'true';
      
      logDebug('Debug message');
      
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Debug message')
      );
    });

    it('should log data when provided', () => {
      process.env.DEBUG = 'true';
      
      const data = { foo: 'bar', count: 42 };
      logDebug('Test data', data);
      
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Test data')
      );
      // The second call should contain the JSON stringified data wrapped in chalk.gray
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('"foo": "bar"')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('"count": 42')
      );
    });

    it('should not log when debug is disabled', () => {
      delete process.env.DEBUG;
      delete process.env.VIBELOG_DEBUG;
      
      logDebug('Should not appear');
      
      expect(mockConsole.log).not.toHaveBeenCalled();
    });
  });

  describe('Error Code Coverage', () => {
    it('should handle all documented error codes', () => {
      const errorCodes = [
        'AUTH_REQUIRED',
        'AUTH_EXPIRED', 
        'AUTH_FAILED',
        'INVALID_TOKEN',
        'NETWORK_ERROR',
        'RATE_LIMITED',
        'CLAUDE_NOT_FOUND',
        'UNKNOWN_CODE', // Should not have special handling
      ];
      
      errorCodes.forEach(code => {
        mockConsole.error.mockClear();
        mockConsole.log.mockClear();
        
        const error = new VibelogError(`Error with ${code}`, code);
        
        expect(() => handleError(error)).toThrow('Process exited');
        expect(mockConsole.error).toHaveBeenCalled();
      });
    });
  });

  describe('Color Output', () => {
    it('should use red color for errors', () => {
      const error = new Error('Test error');
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      const errorCall = mockConsole.error.mock.calls[0][0];
      expect(errorCall).toContain('\x1b[31m'); // Red color
    });

    it('should use yellow color for suggestions', () => {
      const error = new VibelogError('Auth required', 'AUTH_REQUIRED');
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      const suggestionCall = mockConsole.log.mock.calls.find(
        call => call[0].includes('💡')
      );
      expect(suggestionCall[0]).toContain('\x1b[33m'); // Yellow color
    });

    it('should use gray color for help link', () => {
      const error = new Error('Any error');
      
      expect(() => handleError(error)).toThrow('Process exited');
      
      const helpCall = mockConsole.log.mock.calls.find(
        call => call[0].includes('Need help?')
      );
      expect(helpCall[0]).toContain('\x1b[90m'); // Gray color
    });

    it('should use gray color for debug output', () => {
      process.env.DEBUG = 'true';
      
      logDebug('Debug message');
      
      const debugCall = mockConsole.log.mock.calls[0][0];
      expect(debugCall).toContain('\x1b[90m'); // Gray color
    });
  });
});