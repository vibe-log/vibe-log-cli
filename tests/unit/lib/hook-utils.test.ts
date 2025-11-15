import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  withTimeout,
  logHookError,
  silentErrorWrapper,
  getHooksLogPath,
  clearHooksLog,
  readHooksLog,
} from '../../../src/lib/hook-utils';
import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';

// Mock the logger to avoid log output during tests
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('hook-utils', () => {
  let logPath: string;

  beforeEach(() => {
    logPath = path.join(homedir(), '.vibe-log', 'hooks.log');
  });

  afterEach(async () => {
    // Clean up log file after each test
    try {
      await fs.unlink(logPath);
    } catch {
      // File might not exist
    }
  });

  describe('withTimeout()', () => {
    it('should execute function successfully within timeout', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await withTimeout(mockFn, 1000, 'test-context');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalled();
    });

    it('should return null when function times out', async () => {
      const slowFn = () => new Promise((resolve) =>
        setTimeout(() => resolve('too-late'), 200)
      );

      const result = await withTimeout(slowFn, 50, 'timeout-test');

      expect(result).toBeNull();
    });

    it('should return null and log error when function throws', async () => {
      const errorFn = vi.fn().mockRejectedValue(new Error('Test error'));

      const result = await withTimeout(errorFn, 1000, 'error-context');

      expect(result).toBeNull();
      expect(errorFn).toHaveBeenCalled();

      // Verify error was logged
      const logExists = await fs.access(logPath).then(() => true).catch(() => false);
      expect(logExists).toBe(true);
    });

    it('should handle different return types', async () => {
      const numberFn = vi.fn().mockResolvedValue(42);
      const objectFn = vi.fn().mockResolvedValue({ data: 'test' });
      const arrayFn = vi.fn().mockResolvedValue([1, 2, 3]);

      const numberResult = await withTimeout(numberFn, 1000, 'number-test');
      const objectResult = await withTimeout(objectFn, 1000, 'object-test');
      const arrayResult = await withTimeout(arrayFn, 1000, 'array-test');

      expect(numberResult).toBe(42);
      expect(objectResult).toEqual({ data: 'test' });
      expect(arrayResult).toEqual([1, 2, 3]);
    });

    it('should handle async functions that resolve immediately', async () => {
      const immediateFn = vi.fn().mockResolvedValue('instant');

      const result = await withTimeout(immediateFn, 5000, 'immediate-test');

      expect(result).toBe('instant');
    });
  });

  describe('logHookError()', () => {
    it('should create log file and append error', async () => {
      const error = new Error('Test error message');

      await logHookError('test-context', error);

      // Verify log file exists
      const logExists = await fs.access(logPath).then(() => true).catch(() => false);
      expect(logExists).toBe(true);

      // Verify log content
      const content = await fs.readFile(logPath, 'utf-8');
      expect(content).toContain('test-context');
      expect(content).toContain('Test error message');
      expect(content).toContain('==='); // Separator line
    });

    it('should handle non-Error objects', async () => {
      await logHookError('string-error', 'Simple string error');

      const content = await fs.readFile(logPath, 'utf-8');
      expect(content).toContain('string-error');
      expect(content).toContain('Simple string error');
    });

    it('should include stack trace for Error objects', async () => {
      const error = new Error('Error with stack');

      await logHookError('stack-test', error);

      const content = await fs.readFile(logPath, 'utf-8');
      expect(content).toContain('stack-test');
      expect(content).toContain('Error with stack');
      expect(content).toContain('Error:'); // Stack trace indicator
    });

    it('should append multiple errors to the same file', async () => {
      await logHookError('first-error', new Error('First'));
      await logHookError('second-error', new Error('Second'));
      await logHookError('third-error', new Error('Third'));

      const content = await fs.readFile(logPath, 'utf-8');
      expect(content).toContain('first-error');
      expect(content).toContain('second-error');
      expect(content).toContain('third-error');

      // Should have 3 separator lines
      const separators = content.match(/=+/g);
      expect(separators).toHaveLength(3);
    });

    it('should include timestamp in log entry', async () => {
      await logHookError('timestamp-test', new Error('Test'));

      const content = await fs.readFile(logPath, 'utf-8');
      // Check for ISO timestamp format
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should create .vibe-log directory if it does not exist', async () => {
      const logDir = path.dirname(logPath);

      // Remove directory if it exists
      try {
        await fs.rm(logDir, { recursive: true });
      } catch {
        // Directory might not exist
      }

      await logHookError('dir-test', new Error('Test'));

      // Verify directory was created
      const dirExists = await fs.access(logDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);

      // Verify file was created
      const fileExists = await fs.access(logPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should handle file system errors gracefully', async () => {
      // Mock fs.appendFile to throw an error
      const originalAppendFile = fs.appendFile;
      (fs.appendFile as any) = vi.fn().mockRejectedValue(new Error('Permission denied'));

      // Should not throw
      await expect(logHookError('fs-error-test', new Error('Test'))).resolves.toBeUndefined();

      // Restore original function
      (fs.appendFile as any) = originalAppendFile;
    });
  });

  describe('silentErrorWrapper()', () => {
    it('should return result when operation succeeds', async () => {
      const successOp = vi.fn().mockResolvedValue('success');

      const result = await silentErrorWrapper(successOp, 'success-test');

      expect(result).toBe('success');
      expect(successOp).toHaveBeenCalled();
    });

    it('should return null and log error when operation fails', async () => {
      const failOp = vi.fn().mockRejectedValue(new Error('Operation failed'));

      const result = await silentErrorWrapper(failOp, 'fail-test');

      expect(result).toBeNull();
      expect(failOp).toHaveBeenCalled();

      // Verify error was logged
      const logExists = await fs.access(logPath).then(() => true).catch(() => false);
      expect(logExists).toBe(true);

      const content = await fs.readFile(logPath, 'utf-8');
      expect(content).toContain('fail-test');
      expect(content).toContain('Operation failed');
    });

    it('should handle operations with different return types', async () => {
      const numberOp = vi.fn().mockResolvedValue(123);
      const objectOp = vi.fn().mockResolvedValue({ key: 'value' });

      const numberResult = await silentErrorWrapper(numberOp, 'number');
      const objectResult = await silentErrorWrapper(objectOp, 'object');

      expect(numberResult).toBe(123);
      expect(objectResult).toEqual({ key: 'value' });
    });

    it('should not throw errors from wrapped operation', async () => {
      const throwingOp = async () => {
        throw new Error('Should be caught');
      };

      // Should not throw
      await expect(silentErrorWrapper(throwingOp, 'throw-test')).resolves.toBeNull();
    });
  });

  describe('getHooksLogPath()', () => {
    it('should return correct log path', () => {
      const path = getHooksLogPath();

      expect(path).toContain('.vibe-log');
      expect(path).toContain('hooks.log');
      expect(path).toContain(homedir());
    });

    it('should return consistent path across multiple calls', () => {
      const path1 = getHooksLogPath();
      const path2 = getHooksLogPath();

      expect(path1).toBe(path2);
    });
  });

  describe('clearHooksLog()', () => {
    it('should delete existing log file', async () => {
      // Create a log file first
      await logHookError('test', new Error('Test'));
      expect(await fs.access(logPath).then(() => true).catch(() => false)).toBe(true);

      // Clear the log
      await clearHooksLog();

      // Verify file was deleted
      const exists = await fs.access(logPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should not throw when log file does not exist', async () => {
      // Ensure log doesn't exist
      try {
        await fs.unlink(logPath);
      } catch {
        // File might not exist
      }

      // Should not throw
      await expect(clearHooksLog()).resolves.toBeUndefined();
    });

    it('should clear log file and allow new logs', async () => {
      // Create initial log
      await logHookError('first', new Error('First error'));

      // Clear log
      await clearHooksLog();

      // Add new log
      await logHookError('second', new Error('Second error'));

      // Verify only new log exists
      const content = await fs.readFile(logPath, 'utf-8');
      expect(content).not.toContain('First error');
      expect(content).toContain('Second error');
    });
  });

  describe('readHooksLog()', () => {
    it('should return log content when file exists', async () => {
      // Create log entries
      await logHookError('error-1', new Error('First error'));
      await logHookError('error-2', new Error('Second error'));

      const content = await readHooksLog();

      expect(content).toContain('error-1');
      expect(content).toContain('First error');
      expect(content).toContain('error-2');
      expect(content).toContain('Second error');
    });

    it('should return "No hook logs found" when file does not exist', async () => {
      // Ensure log doesn't exist
      try {
        await fs.unlink(logPath);
      } catch {
        // File might not exist
      }

      const content = await readHooksLog();

      expect(content).toBe('No hook logs found.');
    });

    it('should return last N lines when specified', async () => {
      // Create multiple log entries
      await logHookError('line-1', new Error('Error 1'));
      await logHookError('line-2', new Error('Error 2'));
      await logHookError('line-3', new Error('Error 3'));

      // Read only last 5 lines
      const content = await readHooksLog(5);

      // Should be much shorter than full log
      const fullContent = await fs.readFile(logPath, 'utf-8');
      expect(content.length).toBeLessThan(fullContent.length);

      // Should contain recent entries
      expect(content).toContain('Error 3');
    });

    it('should handle empty log file', async () => {
      // Create empty log file
      const logDir = path.dirname(logPath);
      await fs.mkdir(logDir, { recursive: true });
      await fs.writeFile(logPath, '');

      const content = await readHooksLog();

      expect(content).toBe('');
    });

    it('should read full file when lines parameter is larger than file', async () => {
      await logHookError('single', new Error('Single entry'));

      const content = await readHooksLog(1000); // More lines than exist

      expect(content).toContain('single');
      expect(content).toContain('Single entry');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete error logging flow', async () => {
      // Simulate a hook operation that times out
      const slowOp = () => new Promise((resolve) =>
        setTimeout(() => resolve('done'), 200)
      );

      const result = await withTimeout(slowOp, 50, 'integration-test');

      expect(result).toBeNull();

      // Verify error was logged
      const logContent = await readHooksLog();
      expect(logContent).toContain('integration-test');
      expect(logContent).toContain('Timeout after 50ms');
    });

    it('should handle silent error wrapper with log reading', async () => {
      const failingOp = async () => {
        throw new Error('Integration error');
      };

      await silentErrorWrapper(failingOp, 'integration-silent');

      // Read the log
      const content = await readHooksLog();
      expect(content).toContain('integration-silent');
      expect(content).toContain('Integration error');

      // Clear and verify
      await clearHooksLog();
      const afterClear = await readHooksLog();
      expect(afterClear).toBe('No hook logs found.');
    });
  });
});
