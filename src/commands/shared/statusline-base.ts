/**
 * Shared utilities for statusline commands
 * Provides common functionality used by both prompt analysis and challenge statuslines
 */

import { appendFileSync } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Output format types for statuslines
 */
export type OutputFormat = 'compact' | 'detailed' | 'emoji' | 'minimal' | 'json';

/**
 * Debug logging function - writes directly to file
 * Silently fails if unable to write (non-blocking)
 */
export function debugLog(message: string, logFileName: string = 'statusline-debug.log'): void {
  try {
    const homeDir = os.homedir();
    const debugFile = path.join(homeDir, '.vibe-log', logFileName);
    const timestamp = new Date().toISOString();
    appendFileSync(debugFile, `[${timestamp}] ${message}\n`);
  } catch (err) {
    // Silently fail if we can't write debug log
  }
}

/**
 * Read stdin with a timeout to get Claude Code context
 * Increased timeout to 500ms to allow Claude Code time to send session context
 *
 * @param timeoutMs - Timeout in milliseconds (default 500ms)
 * @returns Promise resolving to stdin data or null if timeout/error
 */
export async function readStdinWithTimeout(timeoutMs: number = 500): Promise<string | null> {
  return new Promise((resolve) => {
    let input = '';
    let hasData = false;
    let resolved = false;

    // Set timeout to return null if no data arrives
    const timeout = setTimeout(() => {
      if (!hasData && !resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);

    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        hasData = true;
        input += chunk;
      }
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(hasData ? input : null);
      }
    });

    // Handle error gracefully
    process.stdin.on('error', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
  });
}

/**
 * Validate and normalize output format option
 * Returns 'compact' as default if invalid format provided
 */
export function validateOutputFormat(format: string | undefined): OutputFormat {
  const validFormats: OutputFormat[] = ['compact', 'detailed', 'emoji', 'minimal', 'json'];
  const normalized = (format || 'compact').toLowerCase() as OutputFormat;

  return validFormats.includes(normalized) ? normalized : 'compact';
}

/**
 * Extract session ID from Claude Code context JSON
 * Returns undefined if parsing fails or session_id not found
 */
export function extractSessionId(stdinData: string | null): string | undefined {
  if (!stdinData) return undefined;

  try {
    const claudeContext = JSON.parse(stdinData);
    return claudeContext.session_id;
  } catch (parseError) {
    return undefined;
  }
}
