import { Command } from 'commander';
import { PromptAnalyzer } from '../lib/prompt-analyzer';
import { logger } from '../utils/logger';
import { colors } from '../lib/ui/styles';
import { promises as fs } from 'fs';
import path from 'path';
import { extractConversationContext, extractSessionMetadata, DEFAULT_CONVERSATION_TURNS_TO_EXTRACT_AS_CONTEXT } from '../lib/session-context-extractor';
import { getStatusLinePersonality } from '../lib/personality-manager';
import { getLoadingMessage } from '../types/loading-state';
import { SessionMetadata } from '../lib/prompt-analyzer';

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
    .option('--background-mode', 'Background processing mode (internal use)', false)
    .option('--context <text>', 'Conversation context for analysis')
    .action(async (options) => {
      let { sessionId, prompt } = options;
      const { context: providedContext } = options;
      const { timeout, verbose, silent, backgroundMode } = options;
      let transcriptPath: string | undefined;

      // Enable debug logging if verbose mode
      if (verbose) {
        process.env.DEBUG_PERSONALITY = 'true';
      }

      // In silent or background mode, suppress all console output
      if (silent || backgroundMode) {
        console.log = () => {};
        console.error = () => {};
      }

      try {
        // Skip stdin check in background mode (prompt already provided)
        if (!backgroundMode && (!prompt || options.stdin)) {
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
              const homeDir = process.env.HOME || process.env.USERPROFILE;
              if (!homeDir) {
                logger.warn('Unable to determine home directory for debug logging');
                return;
              }
              const logDir = path.join(homeDir, '.vibe-log');
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

        // Extract conversation context from transcript if available, or use provided context
        let conversationContext: string | undefined = providedContext;
        let sessionMetadata: SessionMetadata | undefined;
        
        if (transcriptPath) {
          try {
            // Extract conversation context if not provided
            if (!conversationContext) {
              conversationContext = await extractConversationContext(transcriptPath, DEFAULT_CONVERSATION_TURNS_TO_EXTRACT_AS_CONTEXT) || undefined;
              if (conversationContext) {
                logger.debug('Extracted conversation context', {
                  length: conversationContext.length,
                  preview: conversationContext.substring(0, 100)
                });
              }
            }
            
            // Always extract session metadata when we have a transcript
            sessionMetadata = await extractSessionMetadata(transcriptPath, prompt);
            logger.debug('Extracted session metadata', sessionMetadata);
            
          } catch (error) {
            logger.debug('Could not extract context or metadata from transcript:', error);
          }
        } else if (conversationContext) {
          logger.debug('Using provided conversation context', {
            length: conversationContext.length,
            preview: conversationContext.substring(0, 100)
          });
          
          // Create minimal metadata when no transcript available
          sessionMetadata = {
            isFirstPrompt: false, // Assume not first if context provided
            hasImages: /\[\d+\s+image\s+attachments?\]/i.test(prompt),
            imageCount: 0
          };
          
          const imageMatch = prompt.match(/\[(\d+)\s+image\s+attachments?\]/i);
          if (imageMatch) {
            sessionMetadata.imageCount = parseInt(imageMatch[1], 10);
          }
        }

        logger.debug('Starting prompt analysis', {
          sessionId,
          promptLength: prompt.length,
          timeout,
          hasContext: !!conversationContext
        });

        // Create analyzer instance (no Claude CLI check needed - using SDK)
        const analyzer = new PromptAnalyzer();

        // Analyze the prompt using Claude SDK
        const startTime = Date.now();
        
        if (!silent && verbose) {
          console.log(colors.muted('Analyzing prompt quality...'));
        }

        // In silent mode (hook), spawn background process and exit immediately
        if (silent && sessionId) {
          logger.debug('Hook mode detected - spawning background analysis');
          
          // Import spawn for background processing
          const { spawn } = await import('child_process');
          
          // Write a loading state immediately for instant feedback
          const homeDir = process.env.HOME || process.env.USERPROFILE;
          if (!homeDir) {
            logger.warn('Unable to determine home directory for pending analysis');
            return;
          }
          const pendingPath = path.join(homeDir, '.vibe-log', 'analyzed-prompts', `${sessionId}.json`);
          const personality = getStatusLinePersonality();
          const customName = personality.personality === 'custom' ? personality.customPersonality?.name : undefined;
          const pendingState = {
            status: 'loading',  // Must be 'loading' for statusline to recognize it
            timestamp: new Date().toISOString(),
            sessionId,
            personality: personality.personality,
            message: getLoadingMessage(personality.personality, customName)
          };
          
          await fs.writeFile(pendingPath, JSON.stringify(pendingState, null, 2)).catch(() => {});
          logger.debug('Written loading state, spawning background process');
          
          // Prepare arguments for background process
          // Use process.argv[1] which is the script being executed
          const scriptPath = process.argv[1];
          const backgroundArgs = [
            scriptPath,
            'analyze-prompt',
            '--prompt', prompt,
            '--session-id', sessionId,
            '--timeout', timeout,
            '--background-mode'  // Special flag to indicate background processing
          ];
          
          // Add conversation context if available
          if (conversationContext) {
            backgroundArgs.push('--context', conversationContext);
          }
          
          // Spawn detached background process
          const child = spawn('node', backgroundArgs, {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, VIBE_LOG_BACKGROUND: 'true' }
          });
          
          // Unref to allow parent to exit
          child.unref();
          
          logger.debug('Background analysis spawned, exiting hook');
          process.exit(0);  // Exit immediately to avoid timeout
        }

        // Normal mode or background mode - perform full analysis
        const analysis = await analyzer.analyze(prompt, {
          sessionId,
          timeout: parseInt(timeout),
          verbose,
          conversationContext,
          sessionMetadata
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
            if (sessionId) {
              console.log(colors.dim(`Session ID: ${sessionId}`));
            }
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
        
        // Write error state to the session file so statusline doesn't hang on loading
        if (sessionId) {
          const errorAnalysis = {
            quality: 'fair' as const,
            missing: ['error occurred'],
            suggestion: 'Analysis temporarily unavailable - please try again',
            score: 50,
            contextualEmoji: '⚠️',
            timestamp: new Date().toISOString(),
            sessionId,
            originalPrompt: prompt?.substring(0, 100) || '',
            promotionalTip: ''
          };
          
          const homeDir = process.env.HOME || process.env.USERPROFILE;
          if (!homeDir) {
            logger.warn('Unable to determine home directory for analysis storage');
            return;
          }
          const logDir = path.join(homeDir, '.vibe-log', 'analyzed-prompts');
          const sessionPath = path.join(logDir, `${sessionId}.json`);
          
          try {
            await fs.mkdir(logDir, { recursive: true });
            await fs.writeFile(sessionPath, JSON.stringify(errorAnalysis, null, 2), 'utf8');
            logger.debug('Wrote error state to session file');
          } catch (writeError) {
            logger.error('Failed to write error state:', writeError);
          }
        }
        
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