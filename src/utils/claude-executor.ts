import { spawn, execSync, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { colors, icons } from '../lib/ui/styles';
import { logger } from './logger';
import { Spinner } from '../lib/ui/progress';
import { parseProjectName } from '../lib/ui/project-display';

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
 * Format a timestamp for display
 */
function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `[${hours}:${minutes}:${seconds}]`;
}

/**
 * Get elapsed time between two dates in seconds
 */
function getElapsedSeconds(start: Date, end: Date): string {
  const elapsed = Math.floor((end.getTime() - start.getTime()) / 1000);
  return `+${elapsed}s`;
}

/**
 * Format milliseconds into readable duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format execution stats for display
 */
function formatExecutionStats(stats: {
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  session_id: string;
  subtype: string;
  is_error: boolean;
}): string[] {
  const lines: string[] = [];
  
  lines.push(colors.highlight('📊 Execution Statistics:'));
  lines.push(colors.muted('  ⏱️  Duration: ') + colors.accent(formatDuration(stats.duration_ms)));
  lines.push(colors.muted('  🚀 API Time: ') + colors.accent(formatDuration(stats.duration_api_ms)));
  lines.push(colors.muted('  🔄 Turns Used: ') + colors.accent(stats.num_turns.toString()));
  lines.push(colors.muted('  💰 Cost: ') + colors.accent(`$${stats.total_cost_usd.toFixed(4)}`));
  
  // Show session ID only if present
  if (stats.session_id) {
    const shortSessionId = stats.session_id.length > 12 
      ? stats.session_id.substring(0, 12) + '...' 
      : stats.session_id;
    lines.push(colors.muted('  🆔 Session: ') + colors.dim(shortSessionId));
  }
  
  // Add status indicator based on result type
  if (stats.subtype === 'error_max_turns') {
    lines.push(colors.warning('  ⚠️  Status: Maximum turns reached'));
  } else if (stats.subtype === 'error_during_execution') {
    lines.push(colors.error('  ❌ Status: Error during execution'));
  }
  
  return lines;
}

/**
 * Execute Claude with the orchestrated prompt using CLI with streaming
 */
export async function executeClaudePrompt(
  prompt: string,
  options?: {
    systemPrompt?: string;  // Optional system prompt for behavioral instructions
    cwd?: string;
    claudePath?: string;
    onStart?: () => void;
    onError?: (error: Error) => void;
    onComplete?: (code: number) => void;
  }
): Promise<void> {
  const { systemPrompt, cwd = process.cwd(), claudePath = 'claude', onStart, onError, onComplete } = options || {};
  
  let tempPromptFile: string | null = null;
  
  console.log(colors.muted(`Prompt length: ${prompt.length} characters`));
  
  try {
    if (onStart) {
      onStart();
    }
    
    console.log();
    console.log(colors.accent('Starting Claude analysis...'));
    console.log(colors.muted('This will take approximately 4-5 minutes.'));
    console.log();
    console.log(colors.highlight('━'.repeat(60)));
    console.log();
    
    // Use CLI with stream-json output format for real-time updates
    // Windows has issues with stdin and batch files, so we use PowerShell
    const isWindows = process.platform === 'win32';
    
    let args: string[];
    let spawnOptions: any;
    let executablePath = claudePath;  // Store the executable path to use
    
    if (isWindows) {
      // Windows: Try using PowerShell to pipe the file content to Claude
      // This avoids command line length limits and batch file issues
      
      // Write prompt to a temporary file
      const tempDir = os.tmpdir();
      tempPromptFile = path.join(tempDir, `claude-prompt-${Date.now()}.txt`);
      await fs.writeFile(tempPromptFile, prompt, 'utf8');
      logger.debug(`Windows: Wrote prompt to temp file: ${tempPromptFile}`);
      
      // Build the Claude command with arguments
      const claudeArgs = ['-p'];
      
      // Add system prompt if provided
      if (systemPrompt) {
        claudeArgs.push('--append-system-prompt', `"${systemPrompt}"`);
      }
      
      // Add output format with verbose
      claudeArgs.push('--output-format', 'stream-json', '--verbose');
      
      // Use PowerShell to read the file and pipe it to Claude
      // This works around batch file stdin limitations
      const psCommand = `Get-Content -Path "${tempPromptFile}" -Raw | & claude ${claudeArgs.join(' ')}`;
      
      args = ['-NoProfile', '-Command', psCommand];
      
      spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd,
        shell: false  // Don't use shell, we're calling PowerShell directly
      };
      
      // Use PowerShell as the executable
      executablePath = 'powershell.exe';
      
      logger.debug(`Windows mode: Using PowerShell to pipe file content (${prompt.length} chars)`);
    } else {
      // Mac/Linux: Use the existing approach with prompt as argument
      args = ['-p'];
      
      // Add system prompt if provided
      if (systemPrompt) {
        args.push('--append-system-prompt', systemPrompt);
      }
      
      // Add output format and the main prompt as argument
      args.push('--output-format', 'stream-json', '--verbose', prompt);
      
      spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],  // ignore stdin for Mac/Linux
        cwd
      };
      
      logger.debug(`Unix mode: Using command argument for prompt`);
    }
    
    // Debug: Log the command being executed
    logger.debug(`Executing: ${executablePath} ${args.join(' ')}`);
    if (process.env.VIBELOG_DEBUG) {
      console.log(colors.dim(`[DEBUG] Executable: ${executablePath}`));
      console.log(colors.dim(`[DEBUG] Working directory: ${cwd}`));
      console.log(colors.dim(`[DEBUG] Platform: ${process.platform}`));
      console.log(colors.dim(`[DEBUG] Prompt delivery: ${isWindows ? 'PowerShell pipe from temp file' : 'command argument'}`));
      if (isWindows && tempPromptFile) {
        console.log(colors.dim(`[DEBUG] Temp prompt file: ${tempPromptFile}`));
      }
    }
    
    const child: ChildProcess = spawn(executablePath, args, spawnOptions);
    
    // Debug: Check if process started
    if (process.env.VIBELOG_DEBUG) {
      console.log(colors.dim(`[DEBUG] Claude process spawned with PID: ${child.pid}`));
      console.log(colors.dim(`[DEBUG] stdout available: ${!!child.stdout}`));
      console.log(colors.dim(`[DEBUG] stderr available: ${!!child.stderr}`));
    }
    
    let buffer = '';
    let hasShownThinking = false;
    let spinner: Spinner | null = null;
    let spinnerInterval: NodeJS.Timeout | null = null;
    let lastResponseTime: Date | null = null;
    let messageCount = 0;
    let stderrOutput = '';  // Capture stderr for error reporting
    
    // Report capture variables
    let capturingReport = false;
    let reportContent = '';
    let reportSaved = false;
    let reportFilePath = '';  // Store the path for later use
    
    // Execution stats tracking
    let executionStats: {
      duration_ms: number;
      duration_api_ms: number;
      num_turns: number;
      total_cost_usd: number;
      session_id: string;
      subtype: string;
      is_error: boolean;
    } | null = null;
    
    // Handle stdout (stream-json output)
    if (child.stdout) {
      // Debug: Log first data received
      let firstDataReceived = false;
      
      child.stdout.on('data', (data) => {
        if (!firstDataReceived && process.env.VIBELOG_DEBUG) {
          firstDataReceived = true;
          console.log(colors.dim(`[DEBUG] First stdout data received (${data.length} bytes)`));
        }
        
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';  // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const json = JSON.parse(line);
            
            // Handle different message types based on verbose stream-json output
            if (json.type === 'system' && json.subtype === 'init') {
              const now = new Date();
              console.log(colors.dim(formatTimestamp(now)) + ' ' + colors.muted('Claude is initializing...'));
              
              // Start spinner on a new line
              spinner = new Spinner('dots2', 'Processing...', colors.primary);
              spinnerInterval = setInterval(() => {
                // Clear current line, write spinner, but don't newline
                process.stdout.write('\r' + spinner!.next() + '   ');
              }, 100);
              
            } else if (json.type === 'user') {
              // User messages might contain tool results
              const now = new Date();
              if (json.message?.content) {
                for (const content of json.message.content) {
                  if (content.type === 'tool_result') {
                    // Clear spinner and show tool result
                    if (spinnerInterval) {
                      process.stdout.write('\r' + ' '.repeat(80) + '\r');
                    }
                    
                    const isError = content.is_error || false;
                    
                    if (isError) {
                      console.log(colors.dim(formatTimestamp(now)) + ' ❌ ' + colors.error('Tool failed'));
                    } else {
                      console.log(colors.dim(formatTimestamp(now)) + ' ✓ ' + colors.success('Tool completed'));
                      
                      // Show brief result preview in debug mode
                      if (process.env.VIBELOG_DEBUG && content.content) {
                        const resultPreview = String(content.content).slice(0, 100);
                        console.log(colors.dim(`     Result: ${resultPreview}${resultPreview.length >= 100 ? '...' : ''}`));
                      }
                    }
                    
                    // Update spinner
                    if (spinner) {
                      spinner.setMessage('Processing tool results...');
                    }
                    
                    if (spinnerInterval && spinner) {
                      process.stdout.write(spinner.next() + '   ');
                    }
                  } else {
                    // Catch-all for unknown content types in user messages
                    if (process.env.VIBELOG_DEBUG) {
                      console.log(colors.dim(`[DEBUG] Unknown content type in user message: ${content.type}`));
                      console.log(colors.dim(`       Keys: ${Object.keys(content).join(', ')}`));
                    }
                  }
                }
              }
              
            } else if (json.type === 'assistant') {
              // This is the full assistant message in verbose mode
              const now = new Date();
              
              // Check if this message contains tool use
              if (json.message?.content) {
                // Handle both text and tool_use content blocks
                for (const content of json.message.content) {
                  if (content.type === 'text' && content.text) {
                    messageCount++;
                    
                    // Clear spinner line before writing message
                    if (spinnerInterval) {
                      process.stdout.write('\r' + ' '.repeat(80) + '\r');
                    }
                    
                    // Show timestamp and elapsed time since last response
                    let timeInfo = colors.dim(formatTimestamp(now));
                    if (lastResponseTime) {
                      timeInfo += ' ' + colors.dim(getElapsedSeconds(lastResponseTime, now));
                    }
                    
                    if (!hasShownThinking) {
                      console.log(timeInfo + ' ' + colors.muted('Claude is responding...'));
                      hasShownThinking = true;
                    }
                    
                    // Check for report markers
                    const hasStartMarker = content.text.includes('=== REPORT START ===');
                    const hasEndMarker = content.text.includes('=== REPORT END ===');
                    
                    // Case 1: Both markers in same message
                    if (hasStartMarker && hasEndMarker) {
                      console.log(colors.dim('[DEBUG] Found BOTH markers in same message'));
                      console.log(timeInfo + ' ' + colors.success('📝 Generating HTML report...'));
                      
                      // Extract content between markers
                      const match = content.text.match(/=== REPORT START ===([\s\S]*?)=== REPORT END ===/);
                      if (match && match[1]) {
                        reportContent = match[1];
                        console.log(colors.dim(`[DEBUG] Extracted content between markers: ${reportContent.length} chars`));
                        
                        // Store the report path for later
                        const reportFile = `vibe-log-report-${new Date().toISOString().split('T')[0]}.html`;
                        reportFilePath = path.join(process.cwd(), reportFile);
                        
                        console.log(colors.dim(`[DEBUG] Will save report to: ${reportFilePath} after stats are available`));
                        console.log(colors.dim(`[DEBUG] Report size: ${reportContent.length} bytes`));
                      }
                      
                      // Show any content before/after markers
                      const beforeStart = content.text.split('=== REPORT START ===')[0];
                      if (beforeStart.trim()) {
                        console.log('  ' + beforeStart);
                      }
                      const afterEnd = content.text.split('=== REPORT END ===')[1];
                      if (afterEnd && afterEnd.trim()) {
                        console.log('  ' + afterEnd);
                      }
                    }
                    // Case 2: Only start marker
                    else if (hasStartMarker) {
                      console.log(colors.dim('[DEBUG] Found REPORT START marker'));
                      capturingReport = true;
                      reportContent = '';
                      console.log(timeInfo + ' ' + colors.success('📝 Generating HTML report...'));
                      
                      // Don't display the marker itself
                      const beforeMarker = content.text.split('=== REPORT START ===')[0];
                      if (beforeMarker.trim()) {
                        console.log('  ' + beforeMarker);
                      }
                      // Start capturing after the marker
                      const afterMarker = content.text.split('=== REPORT START ===')[1];
                      if (afterMarker) {
                        reportContent += afterMarker;
                        console.log(colors.dim(`[DEBUG] Started capturing, initial content: ${afterMarker.length} chars`));
                      }
                    }
                    // Case 3: Only end marker
                    else if (hasEndMarker) {
                      console.log(colors.dim('[DEBUG] Found REPORT END marker'));
                      // Capture content before the end marker
                      const beforeMarker = content.text.split('=== REPORT END ===')[0];
                      if (capturingReport && beforeMarker) {
                        reportContent += beforeMarker;
                        console.log(colors.dim(`[DEBUG] Final content length: ${reportContent.length} chars`));
                      }
                      
                      if (capturingReport && reportContent.trim()) {
                        // Store the report for later processing
                        capturingReport = false;
                        const reportFile = `vibe-log-report-${new Date().toISOString().split('T')[0]}.html`;
                        reportFilePath = path.join(process.cwd(), reportFile);
                        
                        console.log(colors.dim(`[DEBUG] Will save report to: ${reportFilePath} after stats are available`));
                        console.log(colors.dim(`[DEBUG] Report size: ${reportContent.length} bytes`));
                      } else {
                        console.log(colors.dim(`[DEBUG] Not saving - capturing: ${capturingReport}, content length: ${reportContent?.length || 0}`));
                      }
                      
                      // Show any content after the end marker
                      const afterMarker = content.text.split('=== REPORT END ===')[1];
                      if (afterMarker && afterMarker.trim()) {
                        console.log('  ' + afterMarker);
                      }
                    }
                    // Case 4: Content between markers (multi-message capture)
                    else if (capturingReport) {
                      // Capture report content but don't display it
                      reportContent += content.text;
                      console.log(colors.dim(`[DEBUG] Capturing content: ${content.text.length} chars, total: ${reportContent.length}`));
                      // Show progress indicator
                      if (!spinner) {
                        console.log(timeInfo + ' ' + colors.muted(`Generating report... (${(reportContent.length / 1024).toFixed(1)} KB)`));
                      }
                    } else {
                      // Normal output - not capturing report
                      const lines = content.text.split('\n');
                      
                      // Add timestamp to first line
                      console.log(timeInfo + ' ' + colors.accent('━━━'));
                      lines.forEach((line: string) => {
                        console.log('  ' + line);
                      });
                      console.log();
                    }
                    
                    lastResponseTime = now;
                    
                    // Update spinner message
                    if (spinner) {
                      spinner.setMessage(`Waiting for next response... (${messageCount} messages so far)`);
                    }
                    
                    // Restart spinner on new line
                    if (spinnerInterval) {
                      process.stdout.write(spinner!.next() + '   ');
                    }
                  } else if (content.type === 'tool_use') {
                    // Handle tool use in assistant message
                    if (spinnerInterval) {
                      process.stdout.write('\r' + ' '.repeat(80) + '\r');
                    }
                    
                    const toolName = content.name || 'Unknown tool';
                    
                    // Special handling for Task tool to show sub-agent
                    if (toolName === 'Task' && content.input?.subagent_type) {
                      const subagentType = content.input.subagent_type;
                      console.log(colors.dim(formatTimestamp(now)) + ' 🚀 ' + colors.accent(`Launching sub-agent: ${subagentType}...`));
                    } else {
                      console.log(colors.dim(formatTimestamp(now)) + ' 🔧 ' + colors.primary(`Calling ${toolName}...`));
                    }
                    
                    // Show tool input if in debug mode
                    if (process.env.VIBELOG_DEBUG && content.input) {
                      const inputPreview = JSON.stringify(content.input).slice(0, 200);
                      console.log(colors.dim(`     Input: ${inputPreview}${inputPreview.length >= 200 ? '...' : ''}`));
                    }
                    
                    // Update spinner
                    if (spinner) {
                      spinner.setMessage(`Running ${toolName}...`);
                    }
                    
                    if (spinnerInterval && spinner) {
                      process.stdout.write(spinner.next() + '   ');
                    }
                  } else {
                    // Catch-all for unknown content types
                    if (process.env.VIBELOG_DEBUG) {
                      console.log(colors.dim(`[DEBUG] Unknown content type in assistant message: ${content.type}`));
                      console.log(colors.dim(`       Keys: ${Object.keys(content).join(', ')}`));
                    }
                  }
                }
              }
            } else if (json.type === 'result') {
              // Capture execution stats from result message
              if (json.subtype && (json.subtype === 'success' || json.subtype === 'error_max_turns' || json.subtype === 'error_during_execution')) {
                executionStats = {
                  duration_ms: json.duration_ms || 0,
                  duration_api_ms: json.duration_api_ms || 0,
                  num_turns: json.num_turns || 0,
                  total_cost_usd: json.total_cost_usd || 0,
                  session_id: json.session_id || '',
                  subtype: json.subtype,
                  is_error: json.is_error || false
                };
                
                logger.debug('Captured execution stats:', executionStats);
              }
              
              // Final result message - clear spinner before showing
              if (spinnerInterval) {
                clearInterval(spinnerInterval);
                spinnerInterval = null;
                process.stdout.write('\r' + ' '.repeat(80) + '\r');
              }
              
              if (json.result && !json.message) {
                // Only show result if we haven't already shown the message
                const now = new Date();
                console.log(colors.dim(formatTimestamp(now)) + ' ' + colors.success('Final result:'));
                console.log(json.result);
              }
            } else if (json.type === 'message_start') {
              // Don't clear spinner here
              const now = new Date();
              if (spinnerInterval) {
                process.stdout.write('\r' + ' '.repeat(80) + '\r');
              }
              console.log(colors.dim(formatTimestamp(now)) + ' ' + colors.muted('Claude is starting...'));
              if (spinnerInterval && spinner) {
                process.stdout.write(spinner.next() + '   ');
              }
            } else if (json.type === 'content_block_start') {
              if (!hasShownThinking) {
                const now = new Date();
                if (spinnerInterval) {
                  process.stdout.write('\r' + ' '.repeat(80) + '\r');
                }
                console.log(colors.dim(formatTimestamp(now)) + ' ' + colors.muted('Claude is thinking...'));
                hasShownThinking = true;
                if (spinnerInterval && spinner) {
                  process.stdout.write(spinner.next() + '   ');
                }
              }
            } else if (json.type === 'content_block_delta') {
              // This is for non-verbose streaming
              if (json.delta?.type === 'text_delta' && json.delta?.text) {
                if (spinnerInterval) {
                  process.stdout.write('\r' + ' '.repeat(80) + '\r');
                }
                process.stdout.write(json.delta.text);
              }
            } else if (json.type === 'message_stop') {
              // Message complete - don't clear spinner
              if (!spinnerInterval && spinner) {
                // Restart spinner if it was stopped
                spinnerInterval = setInterval(() => {
                  process.stdout.write('\r' + spinner!.next() + '   ');
                }, 100);
              }
            } else {
              // Log unhandled message types to understand what we're missing
              const now = new Date();
              
              // Check for tool-related events
              if (json.type === 'tool_use' || json.type === 'function_call' || 
                  json.type === 'tool_call' || json.type === 'tools') {
                // Clear spinner line and show tool usage
                if (spinnerInterval) {
                  process.stdout.write('\r' + ' '.repeat(80) + '\r');
                }
                
                const toolName = json.name || json.tool || json.function || 'Unknown tool';
                console.log(colors.dim(formatTimestamp(now)) + ' 🔧 ' + colors.primary(`Running ${toolName}...`));
                
                // Update spinner message
                if (spinner) {
                  spinner.setMessage(`Executing ${toolName}...`);
                }
                
                // Restart spinner
                if (spinnerInterval && spinner) {
                  process.stdout.write(spinner.next() + '   ');
                }
              } else if (json.type === 'tool_result' || json.type === 'function_result' || 
                         json.type === 'tool_response') {
                // Clear spinner line and show tool result
                if (spinnerInterval) {
                  process.stdout.write('\r' + ' '.repeat(80) + '\r');
                }
                
                console.log(colors.dim(formatTimestamp(now)) + ' ✓ ' + colors.success('Tool completed'));
                
                // Update spinner for next operation
                if (spinner) {
                  spinner.setMessage('Processing results...');
                }
                
                // Restart spinner
                if (spinnerInterval && spinner) {
                  process.stdout.write(spinner.next() + '   ');
                }
              } else {
                // Debug: Log any other unhandled message types
                logger.debug(`Unhandled message type: ${json.type}`, { 
                  type: json.type, 
                  subtype: json.subtype,
                  hasMessage: !!json.message,
                  hasContent: !!json.content,
                  keys: Object.keys(json).join(', ')
                });
                
                // Also log to console in development for visibility
                if (process.env.VIBELOG_DEBUG) {
                  console.log(colors.dim(`[DEBUG] ${formatTimestamp(now)} Unhandled: type=${json.type}, keys=${Object.keys(json).join(', ')}`));
                }
              }
            }
          } catch (e) {
            // Not valid JSON, might be partial line
            logger.debug(`Failed to parse JSON line: ${line}`);
          }
        }
      });
    }
    
    // Handle stderr - capture for error reporting
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        const stderr = data.toString();
        stderrOutput += stderr;
        logger.debug(`Claude stderr: ${stderr}`);
        
        // Also display critical errors immediately
        if (stderr.includes('Error:') || stderr.includes('error:')) {
          if (spinnerInterval) {
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
          }
          console.log(colors.error(`Claude error: ${stderr.trim()}`));
          if (spinnerInterval && spinner) {
            process.stdout.write(spinner.next() + '   ');
          }
        }
      });
    }
    
    return new Promise((resolve, reject) => {
      child.on('error', (error) => {
        logger.error('Failed to spawn Claude:', error);
        if (onError) {
          onError(error);
        }
        reject(error);
      });
      
      child.on('exit', async (code) => {
        // Clean up spinner if it's still running
        if (spinnerInterval) {
          clearInterval(spinnerInterval);
          spinnerInterval = null;
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
        }
        
        // Process and save the report if we have content
        if (reportContent.trim() && reportFilePath) {
          console.log(colors.dim('[DEBUG] Processing report with stats...'));
          
          // Post-process the HTML
          let processedContent = reportContent.trim();
          
          // 1. Convert vibe-log.dev text to clickable links (if any)
          processedContent = processedContent.replace(
            /vibe-log\.dev/g,
            '<a href="https://vibe-log.dev" style="color: inherit; text-decoration: none;">vibe-log.dev</a>'
          );
          
          // 2. Inject execution stats and promotional footer before </body>
          if (processedContent.includes('</body>')) {
            let statsHtml = '';
            
            // Add stats if available
            if (executionStats) {
              statsHtml = `
    <div style="background: white; 
                margin: 40px auto 20px; 
                max-width: 800px; 
                padding: 25px; 
                border-radius: 12px; 
                border: 2px solid #e2e8f0;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="font-size: 16px; color: #2d3748; margin-bottom: 20px; font-weight: 600;">
        📊 Report Generation Stats
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="text-align: center; background: #f7fafc; padding: 15px; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #5a67d8;">${formatDuration(executionStats.duration_ms)}</div>
          <div style="font-size: 12px; color: #4a5568; margin-top: 5px; font-weight: 500;">⏱️ Duration</div>
        </div>
        <div style="text-align: center; background: #f7fafc; padding: 15px; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #5a67d8;">${formatDuration(executionStats.duration_api_ms)}</div>
          <div style="font-size: 12px; color: #4a5568; margin-top: 5px; font-weight: 500;">🚀 API Time</div>
        </div>
        <div style="text-align: center; background: #f7fafc; padding: 15px; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #5a67d8;">${executionStats.num_turns}</div>
          <div style="font-size: 12px; color: #4a5568; margin-top: 5px; font-weight: 500;">🔄 Turns</div>
        </div>
        <div style="text-align: center; background: #f7fafc; padding: 15px; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #5a67d8;">$${executionStats.total_cost_usd.toFixed(2)}</div>
          <div style="font-size: 12px; color: #4a5568; margin-top: 5px; font-weight: 500;">💰 Cost</div>
        </div>
      </div>
      <div style="text-align: center; padding-top: 20px; border-top: 2px solid #e2e8f0;">
        <div style="font-size: 14px; color: #2d3748; margin-bottom: 12px; font-weight: 500;">
          💡 Get instant reports without using your Claude Code subscription
        </div>
        <a href="https://vibe-log.dev" style="display: inline-block; 
           background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
           color: white; 
           text-decoration: none; 
           padding: 10px 24px; 
           border-radius: 6px; 
           font-size: 14px;
           font-weight: 600;
           box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
           transition: transform 0.2s, box-shadow 0.2s;">
          Visit vibe-log.dev →
        </a>
      </div>
    </div>`;
            } else {
              // Even without stats, add a promotional footer
              statsHtml = `
    <div style="text-align: center; margin: 40px auto 20px; max-width: 600px; 
                padding: 25px;
                background: white;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="font-size: 14px; color: #2d3748; margin-bottom: 12px; font-weight: 500;">
        💡 Get instant productivity reports with vibe-log.dev
      </div>
      <a href="https://vibe-log.dev" style="display: inline-block; 
         background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
         color: white; 
         text-decoration: none; 
         padding: 10px 24px; 
         border-radius: 6px; 
         font-size: 14px;
         font-weight: 600;
         box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
        Visit vibe-log.dev →
      </a>
    </div>`;
            }
            
            processedContent = processedContent.replace(
              '</body>',
              statsHtml + '\n</body>'
            );
          }
          
          // Now save the processed report
          try {
            await fs.writeFile(reportFilePath, processedContent);
            reportSaved = true;
            const reportFile = parseProjectName(reportFilePath);
            console.log(colors.success(`✅ Report saved as: ${reportFile}`));
            console.log(colors.muted(`   Size: ${(processedContent.length / 1024).toFixed(2)} KB`));
          } catch (error) {
            console.log(colors.error(`❌ Failed to save report: ${error}`));
            reportSaved = false;
          }
        }
        
        console.log();
        console.log(colors.highlight('━'.repeat(60)));
        console.log();
        
        if (code === 0) {
          console.log(colors.dim(`[DEBUG] reportSaved status: ${reportSaved}`));
          // Check if report was saved
          if (reportSaved && reportFilePath) {
            const reportFile = parseProjectName(reportFilePath);
            
            console.log(colors.success(`${icons.check} Report generation complete!`));
            console.log(colors.info(`📁 Report saved as: ${reportFile}`));
            console.log(colors.muted(`📂 Location: ${reportFilePath}`));
            console.log();
            console.log(colors.highlight(`🌐 Open in browser:`));
            console.log(colors.accent(`   file://${reportFilePath}`));
            
            // Display execution stats if available
            if (executionStats) {
              console.log();
              const statsLines = formatExecutionStats(executionStats);
              statsLines.forEach(line => console.log(line));
            }
            
            // Wait for user to acknowledge before returning to menu
            console.log();
            console.log(colors.muted('Press Enter to continue...'));
            
            // Wait for Enter key
            await new Promise<void>(resolve => {
              process.stdin.setRawMode(true);
              process.stdin.resume();
              process.stdin.once('data', () => {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                resolve();
              });
            });
          } else {
            console.log(colors.warning(`${icons.warning} Analysis complete but no report was generated`));
            console.log(colors.muted(`Claude may not have output the report in the expected format`));
            
            // Still show execution stats even if no report was generated
            if (executionStats) {
              console.log();
              const statsLines = formatExecutionStats(executionStats);
              statsLines.forEach(line => console.log(line));
            }
          }
          
          // Clean up temp file on Windows
          if (isWindows && tempPromptFile) {
            fs.unlink(tempPromptFile).catch(() => {
              // Ignore errors, file will be cleaned up by OS eventually
            });
          }
          
          if (onComplete) {
            onComplete(code);
          }
          // Always resolve successfully when code is 0
          resolve();
        } else if (code !== null) {
          // Only reject if we got a non-zero exit code
          let errorMessage = `Claude exited with code ${code}`;
          
          // Include stderr output if available
          if (stderrOutput.trim()) {
            errorMessage += `\n\nClaude stderr output:\n${stderrOutput.trim()}`;
          }
          
          // Also check for common Windows-specific issues
          if (process.platform === 'win32') {
            if (stderrOutput.includes('command not found') || stderrOutput.includes('is not recognized')) {
              errorMessage += '\n\nWindows-specific issue: Claude command may not be in PATH or needs full path.';
            }
            if (stderrOutput.includes('Access is denied') || stderrOutput.includes('Permission denied')) {
              errorMessage += '\n\nWindows-specific issue: Permission denied. Try running as administrator.';
            }
          }
          
          const error = new Error(errorMessage);
          
          // Clean up temp file on Windows
          if (isWindows && tempPromptFile) {
            fs.unlink(tempPromptFile).catch(() => {
              // Ignore errors
            });
          }
          
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
          
          // Clean up temp file on Windows
          if (isWindows && tempPromptFile) {
            fs.unlink(tempPromptFile).catch(() => {
              // Ignore errors
            });
          }
          
          if (onError) {
            onError(error);
          }
          reject(error);
        }
      });
    });
  } catch (error) {
    console.log();
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(colors.error(`Error: ${errorMessage}`));
    
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
  console.log(colors.warning(`${icons.warning} Claude CLI is not installed`));
  console.log();
  console.log(colors.primary('To use this feature, you need to install Claude:'));
  console.log();
  console.log(colors.accent('Option 1: Install from claude.ai'));
  console.log(colors.highlight('  1. Visit https://claude.ai/code'));
  console.log(colors.highlight('  2. Download and install Claude Code'));
  console.log();
  console.log(colors.accent('Option 2: Use the copy command option'));
  console.log(colors.highlight('  Select "Copy command to clipboard" instead'));
  console.log(colors.highlight('  Then paste and run in your terminal'));
  console.log();
}