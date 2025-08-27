import { Command } from 'commander';
import { PromptAnalyzer } from '../lib/prompt-analyzer';
import { logger } from '../utils/logger';
import { colors } from '../lib/ui/styles';
import { promises as fs } from 'fs';
import path from 'path';
import { extractLastAssistantMessage } from '../lib/session-context-extractor';

/**
 * Read stdin with a timeout
 */
async function readStdin(timeoutMs: number = 1000): Promise<string | null> {
  return new Promise((resolve) => {
    let input = '';
    let hasData = false;
    
    // Set timeout to check if stdin has data
    const timeout = setTimeout(() => {
      if (!hasData) {
        resolve(null); // No stdin data
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
      resolve(hasData ? input : null);
    });
  });
}

/**
 * Analyze a prompt for quality and provide feedback
 * This command is designed to be called from Claude Code hooks
 * Can accept input via stdin (for hooks) or command-line arguments
 */
export function createAnalyzePromptCommand(): Command {
  const command = new Command('analyze-prompt')
    .description('Analyze prompt quality and provide improvement suggestions')
    .option('--session-id <id>', 'Claude Code session ID')
    .option('--prompt <text>', 'The prompt text to analyze')
    .option('--timeout <ms>', 'Analysis timeout in milliseconds', '10000')
    .option('--verbose', 'Show detailed output', false)
    .option('--silent', 'Silent mode for hook execution', false)
    .option('--stdin', 'Read input from stdin (auto-detected for hooks)', false)
    .action(async (options) => {
      let { sessionId, prompt } = options;
      const { timeout, verbose, silent } = options;
      let transcriptPath: string | undefined;

      // In silent mode, suppress all console output
      if (silent) {
        console.log = () => {};
        console.error = () => {};
      }

      try {
        // Check if we should read from stdin
        if (!prompt || options.stdin) {
          const stdinData = await readStdin();
          
          if (stdinData) {
            try {
              // Parse JSON input from Claude Code hook
              const hookData = JSON.parse(stdinData);
              prompt = hookData.prompt || prompt;
              sessionId = hookData.session_id || sessionId;
              transcriptPath = hookData.transcript_path;
              
              logger.debug('Received hook input via stdin:', {
                sessionId: hookData.session_id,
                promptLength: hookData.prompt?.length,
                transcriptPath: hookData.transcript_path
              });
              
              // Log to debug file for testing
              const logDir = path.join(process.env.HOME || '', '.vibe-log');
              await fs.mkdir(logDir, { recursive: true }).catch(() => {});
              const logFile = path.join(logDir, 'hook-debug.log');
              const timestamp = new Date().toISOString();
              await fs.appendFile(logFile, `\n[${timestamp}] analyze-prompt received:\n`).catch(() => {});
              await fs.appendFile(logFile, `  Session: ${sessionId}\n`).catch(() => {});
              await fs.appendFile(logFile, `  Prompt preview: ${prompt?.substring(0, 50)}...\n`).catch(() => {});
            } catch (parseError) {
              // If not JSON, treat as plain text prompt
              if (!prompt) {
                prompt = stdinData.trim();
                logger.debug('Received plain text prompt via stdin');
              }
            }
          }
        }

        // Validate inputs
        if (!prompt) {
          if (!silent) {
            console.error(colors.error('Error: No prompt provided (use --prompt or provide via stdin)'));
          }
          logger.error('analyze-prompt called without prompt');
          process.exit(1);
        }

        // Extract context from transcript if available
        let previousAssistantMessage: string | undefined;
        if (transcriptPath) {
          try {
            previousAssistantMessage = await extractLastAssistantMessage(transcriptPath) || undefined;
            if (previousAssistantMessage) {
              logger.debug('Extracted previous assistant message for context', {
                length: previousAssistantMessage.length
              });
            }
          } catch (error) {
            logger.debug('Could not extract context from transcript:', error);
          }
        }

        logger.debug('Starting prompt analysis', {
          sessionId,
          promptLength: prompt.length,
          timeout,
          hasContext: !!previousAssistantMessage
        });

        // Create analyzer instance (no Claude CLI check needed - using SDK)
        const analyzer = new PromptAnalyzer();

        // Analyze the prompt using Claude SDK
        const startTime = Date.now();
        
        if (!silent && verbose) {
          console.log(colors.muted('Analyzing prompt quality...'));
        }

        const analysis = await analyzer.analyze(prompt, {
          sessionId,
          timeout: parseInt(timeout),
          verbose,
          previousAssistantMessage
        });

        const duration = Date.now() - startTime;
        logger.debug(`Analysis completed in ${duration}ms`, analysis);

        // Output results based on mode
        if (!silent) {
          if (verbose) {
            // Detailed output for testing
            console.log();
            console.log(colors.highlight('=== Prompt Analysis Results ==='));
            console.log();
            console.log(colors.accent(`Quality: ${analysis.quality.toUpperCase()}`));
            console.log(colors.info(`Score: ${analysis.score}/100`));
            
            if (analysis.missing.length > 0) {
              console.log(colors.warning('Missing:'));
              analysis.missing.forEach(item => {
                console.log(colors.muted(`  - ${item}`));
              });
            }
            
            console.log(colors.primary(`Suggestion: ${analysis.suggestion}`));
            console.log();
            console.log(colors.dim(`Session ID: ${sessionId || 'N/A'}`));
            console.log(colors.dim(`Analysis time: ${duration}ms`));
          } else {
            // Concise output for normal use
            const qualityColor = 
              analysis.quality === 'excellent' ? colors.success :
              analysis.quality === 'good' ? colors.primary :
              analysis.quality === 'fair' ? colors.warning :
              colors.error;
            
            console.log(qualityColor(`[${analysis.quality.toUpperCase()}] ${analysis.suggestion}`));
          }
        }

        // Success exit
        process.exit(0);

      } catch (error) {
        logger.error('Error analyzing prompt:', error);
        
        if (!silent) {
          console.error(colors.error('Failed to analyze prompt'));
          if (verbose && error instanceof Error) {
            console.error(colors.dim(error.message));
          }
        }
        
        // Exit with error code
        process.exit(1);
      }
    });

  return command;
}

/**
 * Direct execution entry point for testing
 */
export async function analyzePrompt(
  promptText: string,
  options?: {
    sessionId?: string;
    timeout?: number;
    verbose?: boolean;
  }
): Promise<void> {
  const analyzer = new PromptAnalyzer();
  
  const analysis = await analyzer.analyze(promptText, {
    sessionId: options?.sessionId,
    timeout: options?.timeout || 10000,
    verbose: options?.verbose
  });

  // Display results
  console.log();
  console.log(colors.highlight('Prompt Analysis:'));
  console.log(colors.accent(`  Quality: ${analysis.quality}`));
  console.log(colors.info(`  Score: ${analysis.score}/100`));
  
  if (analysis.missing.length > 0) {
    console.log(colors.warning('  Missing:'));
    analysis.missing.forEach(item => {
      console.log(colors.muted(`    - ${item}`));
    });
  }
  
  console.log(colors.primary(`  Suggestion: ${analysis.suggestion}`));
}