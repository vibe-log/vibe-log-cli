import { spawn, ChildProcess } from 'child_process';
import { platform } from 'os';

/**
 * Cross-platform test helpers for running CLI commands
 */

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Run a command with optional input, works on Windows/Mac/Linux
 */
export async function runCommand(
  command: string,
  args: string[] = [],
  options: {
    input?: string;
    env?: Record<string, string>;
    timeout?: number;
  } = {}
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      shell: false, // Don't use shell to avoid platform issues
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Set timeout if specified
    const timer = options.timeout
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, options.timeout)
      : null;

    // Capture output
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Send input if provided
    if (options.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    }

    // Handle completion
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      
      if (timedOut) {
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      } else {
        resolve({
          stdout,
          stderr,
          exitCode: code,
        });
      }
    });

    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Simulate user input for interactive commands
 */
export async function runInteractiveCommand(
  command: string,
  args: string[] = [],
  interactions: Array<{
    waitFor: string | RegExp;
    respond: string;
    timeout?: number;
  }>,
  env?: Record<string, string>
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
    });

    let stdout = '';
    let stderr = '';
    let currentInteraction = 0;

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;

      // Check if we need to respond
      if (currentInteraction < interactions.length) {
        const { waitFor, respond } = interactions[currentInteraction];
        const matcher = typeof waitFor === 'string' 
          ? stdout.includes(waitFor)
          : waitFor.test(stdout);

        if (matcher) {
          child.stdin.write(respond);
          currentInteraction++;
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code,
      });
    });

    child.on('error', reject);
  });
}

/**
 * Get the node executable path (handles Windows .exe)
 */
export function getNodePath(): string {
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

/**
 * Get the correct path separator for the platform
 */
export function getPathSeparator(): string {
  return process.platform === 'win32' ? ';' : ':';
}

/**
 * Join paths in a cross-platform way
 */
export function joinPath(...parts: string[]): string {
  return parts.join(process.platform === 'win32' ? '\\' : '/');
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return process.platform === 'linux';
}