import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger';

/**
 * Execute a function with a timeout
 * @param fn The function to execute
 * @param timeout Maximum execution time in milliseconds
 * @param context Context for error logging
 * @returns The result of the function or null if timeout/error
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeout: number,
  context: string
): Promise<T | null> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } catch (error) {
    await logHookError(context, error);
    return null;
  }
}

/**
 * Log hook errors to a file
 * @param context The context where the error occurred
 * @param error The error object
 */
export async function logHookError(context: string, error: any): Promise<void> {
  try {
    const logDir = path.join(homedir(), '.vibe-log');
    const logPath = path.join(logDir, 'hooks.log');
    
    // Ensure directory exists
    await fs.mkdir(logDir, { recursive: true });
    
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stackTrace = error instanceof Error && error.stack ? error.stack : '';
    
    const logEntry = `[${timestamp}] ${context}: ${errorMessage}\n${stackTrace}\n${'='.repeat(80)}\n`;
    
    // Append to log file
    await fs.appendFile(logPath, logEntry);
    
    // Also log to debug logger
    logger.debug(`Hook error logged: ${context}`, { error });
  } catch (logError) {
    // Silently fail if we can't write logs
    logger.error('Failed to write hook error log', logError);
  }
}

/**
 * Silent error wrapper for hook operations
 * Catches and logs errors without disrupting user experience
 */
export async function silentErrorWrapper<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    await logHookError(context, error);
    return null;
  }
}

/**
 * Get the path to the hooks log file
 */
export function getHooksLogPath(): string {
  return path.join(homedir(), '.vibe-log', 'hooks.log');
}

/**
 * Clear the hooks log file
 */
export async function clearHooksLog(): Promise<void> {
  const logPath = getHooksLogPath();
  try {
    await fs.unlink(logPath);
  } catch (error) {
    // File might not exist, that's ok
  }
}

/**
 * Read recent hook log entries
 * @param lines Number of lines to read from the end
 */
export async function readHooksLog(lines: number = 50): Promise<string> {
  const logPath = getHooksLogPath();
  try {
    const content = await fs.readFile(logPath, 'utf-8');
    const allLines = content.split('\n');
    const recentLines = allLines.slice(-lines);
    return recentLines.join('\n');
  } catch (error) {
    return 'No hook logs found.';
  }
}