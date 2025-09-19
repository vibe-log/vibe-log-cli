import { spawn, execSync, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger';

/**
 * Stream event types from Claude SDK
 */
export type ClaudeStreamEvent = {
  type: string;
  subtype?: string;
  message?: any;
  delta?: any;
  content?: any;
  result?: any;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  session_id?: string;
  is_error?: boolean;
};

/**
 * Options for Claude execution
 */
export interface ClaudeExecutorOptions {
  systemPrompt?: string;
  cwd?: string;
  claudePath?: string;
  model?: string; // Model to use (defaults to 'sonnet')
  timeout?: number; // Timeout in milliseconds
  onStreamEvent?: (event: ClaudeStreamEvent) => void;
  onStart?: () => void;
  onError?: (error: Error) => void;
  onComplete?: (code: number) => void;
}

/**
 * Check if Claude CLI is installed and available
 */
export async function checkClaudeInstalled(): Promise<{ installed: boolean; version?: string; path?: string }> {
  // First try the standard PATH lookup
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    logger.debug(`Checking for Claude using command: ${command} claude`);
    
    const claudePath = execSync(`${command} claude`, { encoding: 'utf8' }).trim();
    logger.debug(`Found Claude at: ${claudePath}`);
    
    try {
      const version = execSync('claude --version', { encoding: 'utf8' }).trim();
      logger.debug(`Claude version: ${version}`);
      return { installed: true, version, path: claudePath };
    } catch (versionError) {
      logger.debug(`Could not get Claude version: ${versionError}`);
      return { installed: true, path: claudePath };
    }
  } catch (error) {
    logger.debug(`Claude not found in PATH: ${error}`);
    
    // Try common installation locations
    const commonPaths = [
      path.join(os.homedir(), '.claude', 'local', 'claude'),
      path.join(os.homedir(), '.claude', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude'
    ];
    
    for (const claudePath of commonPaths) {
      try {
        logger.debug(`Checking path: ${claudePath}`);
        // Check if file exists and is executable
        await fs.access(claudePath, fs.constants.X_OK);
        logger.debug(`Found Claude at ${claudePath}`);
        
        try {
          const version = execSync(`"${claudePath}" --version`, { encoding: 'utf8' }).trim();
          return { installed: true, version, path: claudePath };
        } catch {
          return { installed: true, path: claudePath };
        }
      } catch {
        // Path doesn't exist or isn't executable, continue checking
      }
    }
    
    logger.debug('Claude not found in common paths either');
    return { installed: false };
  }
}

/**
 * Execute Claude with the given prompt and stream responses
 * This is a clean executor that only handles Claude SDK interaction
 */
export async function executeClaude(
  prompt: string,
  options: ClaudeExecutorOptions = {}
): Promise<void> {
  const { 
    systemPrompt, 
    cwd = process.cwd(), 
    claudePath = 'claude',
    model = 'sonnet',
    timeout,
    onStreamEvent,
    onStart, 
    onError, 
    onComplete 
  } = options;
  
  let tempPromptFile: string | null = null;
  let child: ChildProcess | null = null;
  let timeoutHandle: NodeJS.Timeout | null = null;
  
  logger.debug(`Claude executor starting - prompt length: ${prompt.length} characters`);
  
  try {
    if (onStart) {
      onStart();
    }
    
    // Use CLI with stream-json output format for real-time updates
    const isWindows = process.platform === 'win32';
    
    let args: string[];
    let spawnOptions: any;
    let executablePath = claudePath;
    
    if (isWindows) {
      // Windows: Use PowerShell to pipe the file content to Claude
      // This avoids command line length limits and batch file issues

      // Write prompt to a temporary file in .vibe-log folder for consistency
      const tempDir = path.join(os.homedir(), '.vibe-log', 'temp-prompts');
      await fs.mkdir(tempDir, { recursive: true });

      // Clean up old prompt files (older than 1 hour)
      try {
        const files = await fs.readdir(tempDir);
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        for (const file of files) {
          if (file.startsWith('claude-prompt-')) {
            const timestamp = parseInt(file.replace('claude-prompt-', '').replace('.txt', ''), 10);
            if (!isNaN(timestamp) && timestamp < oneHourAgo) {
              await fs.unlink(path.join(tempDir, file)).catch(() => {});
            }
          }
        }
      } catch {
        // Ignore cleanup errors
      }

      tempPromptFile = path.join(tempDir, `claude-prompt-${Date.now()}.txt`);
      await fs.writeFile(tempPromptFile, prompt, 'utf8');
      logger.debug(`Windows: Wrote prompt to temp file: ${tempPromptFile}`);
      
      // Build the Claude command with arguments
      const claudeArgs = ['-p'];
      
      // Add model selection
      claudeArgs.push('--model', model);
      
      // Add system prompt if provided
      if (systemPrompt) {
        claudeArgs.push('--append-system-prompt', `"${systemPrompt}"`);
      }
      
      // Add output format with verbose
      claudeArgs.push('--output-format', 'stream-json', '--verbose');
      
      // Use PowerShell to read the file and pipe it to Claude
      const psCommand = `Get-Content -Path "${tempPromptFile}" -Raw | & claude ${claudeArgs.join(' ')}`;
      
      args = ['-NoProfile', '-Command', psCommand];
      
      spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd,
        shell: false
      };
      
      // Use PowerShell as the executable
      executablePath = 'powershell.exe';
      
      logger.debug(`Windows mode: Using PowerShell to pipe file content`);
    } else {
      // Mac/Linux: Use the existing approach with prompt as argument
      args = ['-p'];
      
      // Add model selection
      args.push('--model', model);
      
      // Add system prompt if provided
      if (systemPrompt) {
        args.push('--append-system-prompt', systemPrompt);
      }
      
      // Add output format and the main prompt as argument
      args.push('--output-format', 'stream-json', '--verbose', prompt);
      
      spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd
      };
      
      logger.debug(`Unix mode: Using command argument for prompt`);
    }
    
    // Spawn the Claude process
    child = spawn(executablePath, args, spawnOptions);
    
    logger.debug(`Claude process spawned with PID: ${child.pid}`);
    
    // Set up timeout if specified
    if (timeout) {
      timeoutHandle = setTimeout(() => {
        if (child) {
          logger.debug(`Claude execution timeout after ${timeout}ms`);
          child.kill('SIGTERM');
          const error = new Error(`Claude execution timed out after ${timeout}ms`);
          if (onError) {
            onError(error);
          }
        }
      }, timeout);
    }
    
    let buffer = '';
    let stderrOutput = '';
    
    // Handle stdout (stream-json output)
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';  // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const json = JSON.parse(line);
            
            // Send the parsed event to the callback if provided
            if (onStreamEvent) {
              onStreamEvent(json);
            }
            
            // Log specific event types for debugging
            if (json.type === 'result') {
              logger.debug('Claude result event:', {
                subtype: json.subtype,
                duration_ms: json.duration_ms,
                num_turns: json.num_turns,
                total_cost_usd: json.total_cost_usd
              });
            }
          } catch (e) {
            // Not valid JSON, might be partial line
            logger.debug(`Failed to parse JSON line: ${line}`);
          }
        }
      });
    }
    
    // Handle stderr
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        const stderr = data.toString();
        stderrOutput += stderr;
        logger.debug(`Claude stderr: ${stderr}`);
      });
    }
    
    return new Promise((resolve, reject) => {
      child!.on('error', (error) => {
        logger.error('Failed to spawn Claude:', error);
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (onError) {
          onError(error);
        }
        reject(error);
      });
      
      child!.on('exit', async (code) => {
        // Clear timeout if it was set
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        
        // Clean up temp file on Windows
        if (isWindows && tempPromptFile) {
          try {
            await fs.unlink(tempPromptFile);
          } catch {
            // Ignore errors, file will be cleaned up by OS eventually
          }
        }
        
        if (code === 0) {
          logger.debug(`Claude completed successfully`);
          if (onComplete) {
            onComplete(code);
          }
          resolve();
        } else if (code !== null) {
          // Non-zero exit code
          let errorMessage = `Claude exited with code ${code}`;
          
          // Include stderr output if available
          if (stderrOutput.trim()) {
            errorMessage += `\n\nClaude stderr output:\n${stderrOutput.trim()}`;
          }
          
          // Check for common Windows-specific issues
          if (process.platform === 'win32') {
            if (stderrOutput.includes('command not found') || stderrOutput.includes('is not recognized')) {
              errorMessage += '\n\nWindows-specific issue: Claude command may not be in PATH or needs full path.';
            }
            if (stderrOutput.includes('Access is denied') || stderrOutput.includes('Permission denied')) {
              errorMessage += '\n\nWindows-specific issue: Permission denied. Try running as administrator.';
            }
          }
          
          const error = new Error(errorMessage);
          
          if (onError) {
            onError(error);
          }
          reject(error);
        } else {
          // Process was killed or terminated abnormally
          let errorMessage = 'Claude process terminated unexpectedly';
          if (stderrOutput.trim()) {
            errorMessage += `\n\nClaude stderr output:\n${stderrOutput.trim()}`;
          }
          const error = new Error(errorMessage);
          
          if (onError) {
            onError(error);
          }
          reject(error);
        }
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in Claude executor: ${errorMessage}`);
    
    // Clean up timeout if it was set
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    
    // Clean up temp file on Windows
    if (process.platform === 'win32' && tempPromptFile) {
      try {
        await fs.unlink(tempPromptFile);
      } catch {
        // Ignore errors
      }
    }
    
    if (onError) {
      onError(error instanceof Error ? error : new Error(errorMessage));
    }
    
    throw error;
  }
}

/**
 * Show instructions for installing Claude
 */
export function showClaudeInstallInstructions(): void {
  console.log();
  console.log(`⚠️  Claude CLI is not installed`);
  console.log();
  console.log('To use this feature, you need to install Claude:');
  console.log();
  console.log('Option 1: Install from claude.ai');
  console.log('  1. Visit https://claude.ai/code');
  console.log('  2. Download and install Claude Code');
  console.log();
  console.log('Option 2: Use the copy command option');
  console.log('  Select "Copy command to clipboard" instead');
  console.log('  Then paste and run in your terminal');
  console.log();
}