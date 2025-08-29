import { executeClaude, ClaudeStreamEvent, ClaudeExecutorOptions } from '../utils/claude-executor';
import { ReportGenerator } from './report-generator';
import { colors, icons } from './ui/styles';
import { Spinner } from './ui/progress';
import { logger } from '../utils/logger';

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
 * Execute Claude with the orchestrated prompt for report generation
 * This maintains backward compatibility with the old executeClaudePrompt
 */
export async function executeClaudePrompt(
  prompt: string,
  options?: {
    systemPrompt?: string;
    cwd?: string;
    claudePath?: string;
    onStart?: () => void;
    onError?: (error: Error) => void;
    onComplete?: (code: number) => void;
  }
): Promise<void> {
  const reportGenerator = new ReportGenerator();
  let spinner: Spinner | null = null;
  let spinnerInterval: NodeJS.Timeout | null = null;
  let lastResponseTime: Date | null = null;
  let messageCount = 0;
  let hasShownThinking = false;

  console.log(colors.muted(`Prompt length: ${prompt.length} characters`));
  console.log();
  console.log(colors.accent('Starting Claude analysis...'));
  console.log(colors.muted('This will take approximately 4-5 minutes.'));
  console.log();
  console.log(colors.highlight('━'.repeat(60)));
  console.log();

  // Create a custom stream event handler
  const handleStreamEvent = (event: ClaudeStreamEvent) => {
    const now = new Date();
    
    switch (event.type) {
      case 'system':
        if (event.subtype === 'init') {
          console.log(colors.dim(formatTimestamp(now)) + ' ' + colors.muted('Claude is initializing...'));
          
          // Start spinner on a new line
          spinner = new Spinner('dots2', 'Processing...', colors.primary);
          spinnerInterval = setInterval(() => {
            process.stdout.write('\r' + spinner!.next() + '   ');
          }, 100);
        }
        break;

      case 'user':
        // User messages might contain tool results
        if (event.message?.content) {
          for (const content of event.message.content) {
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
            }
          }
        }
        break;

      case 'assistant':
        // This is the full assistant message in verbose mode
        if (event.message?.content) {
          for (const content of event.message.content) {
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
              
              // Process the message through report generator
              reportGenerator.processMessage(content.text);
              
              // If not capturing report, show the message
              if (!reportGenerator.isCapturing()) {
                const lines = content.text.split('\n');
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
            }
          }
        }
        break;

      case 'result':
        // Capture execution stats from result message
        if (event.subtype && (event.subtype === 'success' || event.subtype === 'error_max_turns' || event.subtype === 'error_during_execution')) {
          const executionStats = {
            duration_ms: event.duration_ms || 0,
            duration_api_ms: event.duration_api_ms || 0,
            num_turns: event.num_turns || 0,
            total_cost_usd: event.total_cost_usd || 0,
            session_id: event.session_id || '',
            subtype: event.subtype,
            is_error: event.is_error || false
          };
          
          reportGenerator.setExecutionStats(executionStats);
          logger.debug('Captured execution stats:', executionStats);
        }
        
        // Final result message - clear spinner before showing
        if (spinnerInterval) {
          clearInterval(spinnerInterval);
          spinnerInterval = null;
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
        }
        
        if (event.result && !event.message) {
          console.log(colors.dim(formatTimestamp(now)) + ' ' + colors.success('Final result:'));
          console.log(event.result);
        }
        break;

      case 'message_start':
        if (spinnerInterval) {
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
        }
        console.log(colors.dim(formatTimestamp(now)) + ' ' + colors.muted('Claude is starting...'));
        if (spinnerInterval && spinner) {
          process.stdout.write(spinner.next() + '   ');
        }
        break;

      case 'content_block_start':
        if (!hasShownThinking) {
          if (spinnerInterval) {
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
          }
          console.log(colors.dim(formatTimestamp(now)) + ' ' + colors.muted('Claude is thinking...'));
          hasShownThinking = true;
          if (spinnerInterval && spinner) {
            process.stdout.write(spinner.next() + '   ');
          }
        }
        break;

      case 'content_block_delta':
        // This is for non-verbose streaming
        if (event.delta?.type === 'text_delta' && event.delta?.text) {
          if (spinnerInterval) {
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
          }
          process.stdout.write(event.delta.text);
        }
        break;

      case 'message_stop':
        // Message complete - don't clear spinner
        if (!spinnerInterval && spinner) {
          // Restart spinner if it was stopped
          spinnerInterval = setInterval(() => {
            process.stdout.write('\r' + spinner!.next() + '   ');
          }, 100);
        }
        break;

      default:
        // Log unhandled message types for debugging
        logger.debug(`Unhandled message type: ${event.type}`, { 
          type: event.type, 
          subtype: event.subtype,
          hasMessage: !!event.message,
          hasContent: !!event.content,
        });
        
        if (process.env.VIBELOG_DEBUG) {
          console.log(colors.dim(`[DEBUG] ${formatTimestamp(now)} Unhandled: type=${event.type}`));
        }
    }
  };

  // Store the exit code for later use
  let exitCode = 0;
  
  // Promise that resolves when the report display is complete
  let reportDisplayComplete: Promise<void>;
  const reportDisplayCompleteResolve: { resolve?: () => void } = {};
  reportDisplayComplete = new Promise<void>(resolve => {
    reportDisplayCompleteResolve.resolve = resolve;
  });
  
  // Execute Claude with stream event handling
  const claudeOptions: ClaudeExecutorOptions = {
    systemPrompt: options?.systemPrompt,
    cwd: options?.cwd,
    claudePath: options?.claudePath,
    onStreamEvent: handleStreamEvent,
    onStart: options?.onStart,
    onError: options?.onError,
    onComplete: async (code) => {
      // Store the exit code
      exitCode = code;
      
      // Clean up spinner if it's still running
      if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
      }

      // Debug logging to understand report capture status
      console.log(colors.dim(`[DEBUG] Checking for captured report...`));
      console.log(colors.dim(`[DEBUG] hasReport: ${reportGenerator.hasReport()}`));
      console.log(colors.dim(`[DEBUG] isCapturing: ${reportGenerator.isCapturing()}`));
      
      // Save the report if we have one
      if (reportGenerator.hasReport()) {
        const result = await reportGenerator.saveReport();
        
        console.log();
        console.log(colors.highlight('━'.repeat(60)));
        console.log();
        
        if (result.success) {
          console.log(colors.dim(`[DEBUG] Report saved successfully`));
          reportGenerator.displayCompletionMessage();
        } else {
          console.log(colors.warning(`${icons.warning} Report generation failed: ${result.error}`));
        }
      } else {
        console.log();
        console.log(colors.highlight('━'.repeat(60)));
        console.log();
        
        // Check if an HTML file was created anyway (by the old 3-agent system)
        const fs = await import('fs').then(m => m.promises);
        const files = await fs.readdir(process.cwd());
        const htmlFiles = files.filter(f => f.startsWith('vibe-log-report-') && f.endsWith('.html'));
        
        if (htmlFiles.length > 0) {
          console.log(colors.success(`${icons.check} Report generation complete!`));
          console.log(colors.info(`📁 Report saved as: ${htmlFiles[htmlFiles.length - 1]}`));
          console.log(colors.muted(`📂 Location: ${process.cwd()}/${htmlFiles[htmlFiles.length - 1]}`));
          console.log();
          console.log(colors.highlight(`🌐 Open in browser:`));
          console.log(colors.accent(`   file://${process.cwd()}/${htmlFiles[htmlFiles.length - 1]}`));
        } else {
          console.log(colors.warning(`${icons.warning} Analysis complete but no report was generated`));
          console.log(colors.muted(`Claude may not have output the report in the expected format`));
        }
      }
      
      // Signal that report display is complete
      if (reportDisplayCompleteResolve.resolve) {
        reportDisplayCompleteResolve.resolve();
      }
      
      // Don't call the original onComplete here - we'll do it after waiting for user input
    }
  };

  await executeClaude(prompt, claudeOptions);
  
  // Wait for the report display to complete
  console.log(colors.dim('[DEBUG] Waiting for report display to complete...'));
  await reportDisplayComplete;
  console.log(colors.dim('[DEBUG] Report display complete'));
  
  // Now handle the "Press Enter to continue" prompt synchronously
  // This happens AFTER the report is displayed but BEFORE returning to the menu
  
  // Check if we showed a report
  const fs = await import('fs').then(m => m.promises);
  const files = await fs.readdir(process.cwd());
  const htmlFiles = files.filter(f => f.startsWith('vibe-log-report-') && f.endsWith('.html'));
  
  if (reportGenerator.hasReport() || htmlFiles.length > 0) {
    // We showed a report, so wait for user input
    console.log();
    console.log(colors.muted('Press Enter to continue...'));
    console.log(colors.dim('[DEBUG] Setting up raw stdin handler...'));
    
    // Check stdin state before we start
    console.log(colors.dim(`[DEBUG] stdin.isTTY: ${process.stdin.isTTY}`));
    console.log(colors.dim(`[DEBUG] stdin.readable: ${process.stdin.readable}`));
    console.log(colors.dim(`[DEBUG] stdin.readableFlowing: ${process.stdin.readableFlowing}`));
    console.log(colors.dim(`[DEBUG] stdin.isPaused: ${process.stdin.isPaused()}`));
    
    // Clear any pending data first
    if (process.stdin.readable && !process.stdin.isPaused()) {
      console.log(colors.dim('[DEBUG] Draining any pending stdin data...'));
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        console.log(colors.dim(`[DEBUG] Drained: ${chunk.toString('hex')}`));
      }
    }
    
    // Wait for ENTER key specifically
    await new Promise<void>(resolve => {
      try {
        console.log(colors.dim('[DEBUG] Enabling raw mode...'));
        process.stdin.setRawMode(true);
        console.log(colors.dim('[DEBUG] Resuming stdin...'));
        process.stdin.resume();
        console.log(colors.dim('[DEBUG] Waiting for Enter key...'));
        
        const handleKeyPress = (data: Buffer | any) => {
          // Simple console.log without colors to avoid formatting issues
          console.log('[DEBUG] Raw data received, type:', typeof data);
          console.log('[DEBUG] Data length:', data.length);
          
          if (data.length > 0) {
            // Try multiple ways to get the byte value
            const str = data.toString();
            const charCode = str.charCodeAt(0);
            
            console.log('[DEBUG] String:', JSON.stringify(str));
            console.log('[DEBUG] CharCode at 0:', charCode);
            console.log('[DEBUG] Is Buffer?', Buffer.isBuffer(data));
            
            // Check if it's Enter key using string comparison or charCode
            // "\r" is carriage return (Enter on most systems)
            // "\n" is line feed (Enter on some systems)
            if (str === '\r' || str === '\n' || charCode === 13 || charCode === 10) {
              console.log('[DEBUG] Enter key detected!');
              process.stdin.setRawMode(false);
              process.stdin.pause();
              process.stdin.removeListener('data', handleKeyPress);
              resolve();
            } else if (charCode === 3) {
              console.log('[DEBUG] Ctrl+C detected, exiting...');
              process.stdin.setRawMode(false);
              process.stdin.pause();
              process.stdin.removeListener('data', handleKeyPress);
              process.exit(0);
            } else {
              console.log('[DEBUG] Key ignored, waiting for Enter. CharCode was:', charCode);
            }
          } else {
            console.log('[DEBUG] Empty data received');
          }
        };
        
        process.stdin.on('data', handleKeyPress);
      } catch (err) {
        console.log(colors.error(`[DEBUG] Error setting up stdin: ${err}`));
        console.log(colors.error(`[DEBUG] Stack: ${err instanceof Error ? err.stack : 'N/A'}`));
        // Resolve anyway to prevent hanging
        resolve();
      }
    });
  }
  
  // Now call the original onComplete callback if provided
  if (options?.onComplete) {
    console.log(colors.dim('[DEBUG] Calling original onComplete callback...'));
    options.onComplete(exitCode);
  }
}