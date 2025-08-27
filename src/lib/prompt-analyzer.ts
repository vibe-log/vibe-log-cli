import { logger } from '../utils/logger';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getPersonalitySystemPrompt, getStatusLinePersonality } from './personality-manager';
import { getToken } from './config';
import { LoadingState, getLoadingMessage } from '../types/loading-state';

/**
 * Analysis result for a prompt
 */
export interface PromptAnalysis {
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  missing: string[];
  suggestion: string;
  score: number;
  contextualEmoji?: string;  // Emoji indicating what needs improvement
  timestamp: string;
  sessionId?: string;
  originalPrompt?: string;  // The original prompt that was analyzed
  promotionalTip?: string;  // Pre-generated promotional tip (10% chance)
}

/**
 * Options for prompt analysis
 */
export interface AnalysisOptions {
  sessionId?: string;
  timeout?: number; // Default 10 seconds
  model?: 'haiku' | 'sonnet'; // For future use when model selection is available
  verbose?: boolean;
  previousAssistantMessage?: string; // Context from previous assistant message
}

// Cache the SDK import to avoid re-importing on every analysis
let cachedSDK: { query: any } | null = null;


/**
 * Get the Claude SDK, caching it after first import
 */
async function getClaudeSDK(): Promise<{ query: any }> {
  if (!cachedSDK) {
    logger.debug('Loading Claude SDK for first time...');
    cachedSDK = await import('@anthropic-ai/claude-code');
  } else {
    logger.debug('Using cached Claude SDK');
  }
  return cachedSDK;
}

/**
 * Analyzes prompt quality using Claude SDK
 * Provides concise feedback on what's missing and how to improve
 */
export class PromptAnalyzer {
  private analysisDir: string;

  constructor() {
    // Set up the analysis directory
    const homeDir = os.homedir();
    this.analysisDir = path.join(homeDir, '.vibe-log', 'analyzed-prompts');
  }

  /**
   * Ensure the analysis directory exists
   */
  private async ensureAnalysisDir(): Promise<void> {
    await fs.mkdir(this.analysisDir, { recursive: true });
  }

  /**
   * Generate promotional tip (10% chance)
   * Returns empty string 90% of the time
   */
  private async generatePromotionalTip(): Promise<string> {
    // Only show tip 10% of the time
    if (Math.random() > 0.1) {
      return '';
    }
    
    // Check if user is authenticated (cloud mode)
    const token = await getToken();
    
    if (token) {
      // Cloud mode: Show clickable hyperlink to analytics dashboard
      // Terminal hyperlink format: OSC 8 escape sequence
      const analyticsUrl = 'https://app.vibe-log.dev/dashboard/analytics?tab=improve&time=week';
      const linkText = 'click here to see your improvements';
      // Using \u001b format and adding color for better visibility
      const yellow = '\u001b[93m';
      const reset = '\u001b[0m';
      const linkStart = `\u001b]8;;${analyticsUrl}\u001b\\`;
      const linkEnd = `\u001b]8;;\u001b\\`;
      const hyperlink = `${linkStart}${yellow}${linkText}${reset}${linkEnd}`;
      return `\n💡 See detailed prompt analysis here ${hyperlink}`;
    } else {
      // Local mode: Show npx command suggestion
      return '\n💡 run: \`npx vibe-log-cli\` → Generate Local Report to see your productivity over time';
    }
  }

  /**
   * Generate the system prompt for analysis
   */
  private getSystemPrompt(hasContext: boolean = false): string {
    const contextAwareness = hasContext ? `
IMPORTANT Context Rules:
- If the previous assistant message ends with "?" it's a QUESTION
- Direct answers to questions (even 1-2 words) should score 80-100
- "PostgreSQL" answering "PostgreSQL or MySQL?" = excellent (90+ score)
- "Yes" or "No" to yes/no questions = excellent (90+ score)
- Short responses are PERFECT when answering direct questions
- Use ✅ emoji for direct answers to questions
- DO NOT ask for more context when user is answering a question
- Suggestion for direct answers should be "Direct answer" or "Good response"` : '';

    // Get personality-specific system prompt addition
    const personalityPrompt = getPersonalitySystemPrompt();
    
    // Debug logging to verify personality is being applied
    if (process.env.VIBELOG_DEBUG === 'true' || process.env.DEBUG_PERSONALITY === 'true') {
      logger.debug('=== PERSONALITY SYSTEM PROMPT DEBUG ===');
      logger.debug('Personality prompt addition:', personalityPrompt);
      logger.debug('=======================================');
    }

    return `Analyze the prompt quality. Respond ONLY with JSON:
{
  "quality": "poor|fair|good|excellent",
  "missing": ["1-3 missing elements"],
  "suggestion": "One improvement (max 15 words)",
  "score": 0-100,
  "contextualEmoji": "emoji"
}
Scoring: poor(0-40) fair(41-60) good(61-80) excellent(81-100)
Evaluate: clarity, context, success criteria, examples if needed.${contextAwareness}${personalityPrompt}

Emoji selection:
- 📏 if lacking specificity, measurements, or exact details
- 📝 if missing context, project info, or background
- 🎯 if missing success criteria or goals
- 💭 if vague, unclear, or ambiguous
- ✨ if excellent (score 81-89)
- ✅ if perfect (score 90+)
- 💡 for general improvements`;
  }

  /**
   * Analyze a prompt and return quality feedback using Claude SDK
   */
  public async analyze(
    promptText: string,
    options: AnalysisOptions = {}
  ): Promise<PromptAnalysis> {
    const { 
      sessionId, 
      timeout = 10000, // 10 seconds default
      verbose = false,
      previousAssistantMessage
    } = options;

    // Check for recursion guard in the prompt itself
    // This prevents infinite loops when SDK triggers UserPromptSubmit hook
    const guardMatch = promptText.match(/<!--VIBE_LOG_GUARD:(\d+)-->/); 
    if (guardMatch) {
      const depth = parseInt(guardMatch[1]);
      if (depth > 0) {
        logger.debug(`Recursion guard detected (depth: ${depth}) - skipping analysis`);
        // Return minimal skip response without saving
        return {
          quality: 'fair',
          missing: [],
          suggestion: 'Analysis in progress...',
          score: 50,
          contextualEmoji: '⏭️',
          timestamp: new Date().toISOString(),
          sessionId,
          originalPrompt: '[Recursive call - skipped]',
          promotionalTip: ''
        };
      }
    }

    logger.debug(`Starting prompt analysis - length: ${promptText.length} chars`);

    // Write loading state immediately for instant feedback
    await this.writeLoadingState(sessionId);
    
    // Add a small delay to ensure loading state is visible
    // This helps with very fast analyses that complete in <100ms
    if (process.env.VIBELOG_DEBUG === 'true') {
      logger.debug('Loading state written, ensuring visibility...');
    }
    await new Promise(resolve => setTimeout(resolve, 100));

    // Ensure the analysis directory exists (already done in writeLoadingState but kept for clarity)
    await this.ensureAnalysisDir();

    // Build the analysis prompt
    let analysisPrompt = `Analyze this Claude Code user prompt:

---
${promptText}
---
`;

    // Add context if available
    if (previousAssistantMessage) {
      analysisPrompt += `
Previous assistant message for context:
---
${previousAssistantMessage.substring(0, 500)}${previousAssistantMessage.length > 500 ? '...' : ''}
---
`;
      logger.debug('Including previous assistant message in analysis');
    }

    analysisPrompt += '\nRespond with JSON only.';
    
    // Add recursion guard to prevent infinite loops
    // This guard is invisible to Claude but detectable by our code
    analysisPrompt += '\n<!--VIBE_LOG_GUARD:1-->';

    let analysisResult: PromptAnalysis | null = null;
    let rawResponse = '';

    try {
      // Get Claude SDK (cached after first import)
      const { query } = await getClaudeSDK();
      
      // Use model from options or default to haiku
      const selectedModel = options.model || 'haiku';
      logger.debug(`Using Claude SDK with ${selectedModel} model for analysis`);
      
      // Set up abort controller for cleaner timeout handling
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        logger.debug('Analysis timeout - aborting SDK call');
        abortController.abort();
      }, timeout);

      try {
        // Create the SDK query with optimized settings
        for await (const message of query({
          prompt: analysisPrompt,
          options: {
            maxTurns: 1,                    // Single turn only
            model: selectedModel,           // Use selected model (haiku by default)
            fallbackModel: 'sonnet',        // Fallback if primary model is overloaded
            disallowedTools: ['*'],         // No tools needed for JSON response
            customSystemPrompt: this.getSystemPrompt(!!previousAssistantMessage), // Context-aware system prompt
            maxThinkingTokens: 1000,        // Limit thinking for speed
            abortController                 // Clean cancellation support
          }
        })) {
          // Simplified message handling - only care about assistant text
          if (message.type === 'assistant' && message.message?.content) {
            const textContent = message.message.content.find((c: any) => c.type === 'text');
            if (textContent?.text) {
              rawResponse = textContent.text;
            }
          } else if (message.type === 'result' && verbose) {
            logger.debug('Analysis metrics:', {
              duration_ms: message.duration_ms,
              cost_usd: message.total_cost_usd,
              model_used: message.model || selectedModel
            });
          }
        }
      } finally {
        // Clean up timeout
        clearTimeout(timeoutId);
      }

      // Parse the response
      if (rawResponse) {
        try {
          // Extract JSON from the response (in case there's extra text)
          const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validate and normalize the response
            analysisResult = {
              quality: parsed.quality || 'fair',
              missing: Array.isArray(parsed.missing) ? parsed.missing : [],
              suggestion: parsed.suggestion || 'Add more context to your prompt',
              score: typeof parsed.score === 'number' ? parsed.score : 50,
              contextualEmoji: parsed.contextualEmoji || '💡',
              timestamp: new Date().toISOString(),
              sessionId,
              originalPrompt: promptText  // Add the original prompt for debugging
            };

            logger.debug('Parsed SDK analysis result:', analysisResult);
          } else {
            throw new Error('No JSON found in SDK response');
          }
        } catch (parseError) {
          logger.error('Failed to parse SDK response:', parseError);
          logger.debug('Raw SDK response was:', rawResponse);
          throw new Error(`Failed to parse analysis response: ${parseError}`);
        }
      } else {
        throw new Error('No response received from Claude SDK - please try again');
      }

    } catch (error) {
      logger.error('Error during SDK prompt analysis:', error);
      
      // Check if it's an abort/timeout
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
        throw new Error('Analysis timed out - please try again');
      } else if (error instanceof Error && error.message.includes('overloaded')) {
        throw new Error('Claude is currently overloaded - please try again in a moment');
      }
      
      // Re-throw the error for proper error handling
      throw error;
    }

    // Generate promotional tip for this analysis (10% chance)
    if (analysisResult) {
      analysisResult.promotionalTip = await this.generatePromotionalTip();
      await this.saveAnalysis(analysisResult, sessionId);
    }

    return analysisResult!;
  }

  /**
   * Write loading state to session file
   * This provides immediate feedback while analysis is running
   */
  private async writeLoadingState(sessionId?: string): Promise<void> {
    if (!sessionId) {
      logger.debug('No session ID provided, skipping loading state');
      return;
    }
    
    try {
      // Ensure the analysis directory exists
      await this.ensureAnalysisDir();
      
      // Get current personality for loading message
      const personality = getStatusLinePersonality();
      const customName = personality.personality === 'custom' ? personality.customPersonality?.name : undefined;
      
      // Create loading state
      const loadingState: LoadingState = {
        status: 'loading',
        timestamp: new Date().toISOString(),
        sessionId,
        personality: personality.personality,
        message: getLoadingMessage(personality.personality, customName)
      };
      
      // Write to session-specific file
      const sessionPath = path.join(this.analysisDir, `${sessionId}.json`);
      await fs.writeFile(
        sessionPath,
        JSON.stringify(loadingState, null, 2),
        'utf8'
      );
      
      logger.debug(`Loading state written to session file: ${sessionId}.json`);
    } catch (error) {
      logger.error('Failed to write loading state:', error);
      // Don't throw - loading state is nice-to-have, not critical
    }
  }

  /**
   * Save analysis to file system
   */
  private async saveAnalysis(
    analysis: PromptAnalysis,
    sessionId?: string
  ): Promise<void> {
    try {
      // Save with session ID if provided, otherwise use timestamp
      const filename = sessionId 
        ? `${sessionId}.json`
        : `analysis-${Date.now()}.json`;
      
      const filepath = path.join(this.analysisDir, filename);
      
      // Save the analysis
      await fs.writeFile(
        filepath,
        JSON.stringify(analysis, null, 2),
        'utf8'
      );

      logger.debug(`Analysis saved to: ${filepath}`);

    } catch (error) {
      logger.error('Failed to save analysis:', error);
    }
  }


  /**
   * Load analysis by session ID
   */
  public async loadAnalysisBySessionId(sessionId: string): Promise<PromptAnalysis | null> {
    try {
      const filepath = path.join(this.analysisDir, `${sessionId}.json`);
      const content = await fs.readFile(filepath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.debug(`No analysis found for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Clean up old analysis files (older than 7 days)
   */
  public async cleanupOldAnalyses(): Promise<void> {
    try {
      const files = await fs.readdir(this.analysisDir);
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;

      for (const file of files) {
        // Skip non-JSON files and old latest.json files
        if (!file.endsWith('.json')) continue;

        const filepath = path.join(this.analysisDir, file);
        const stats = await fs.stat(filepath);
        
        if (now - stats.mtime.getTime() > sevenDays) {
          await fs.unlink(filepath);
          logger.debug(`Deleted old analysis file: ${file}`);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up old analyses:', error);
    }
  }
}