import { logger } from '../utils/logger';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Analysis result for a prompt
 */
export interface PromptAnalysis {
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  missing: string[];
  suggestion: string;
  score: number;
  timestamp: string;
  sessionId?: string;
  originalPrompt?: string;  // The original prompt that was analyzed
}

/**
 * Options for prompt analysis
 */
export interface AnalysisOptions {
  sessionId?: string;
  timeout?: number; // Default 10 seconds
  model?: 'haiku' | 'sonnet'; // For future use when model selection is available
  verbose?: boolean;
}

// Cache the SDK import to avoid re-importing on every analysis
let cachedSDK: { query: any } | null = null;

// Constant for the analysis prompt prefix to prevent recursion
const ANALYSIS_PROMPT_PREFIX = 'Analyze this Claude Code user prompt:';

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
   * Generate the system prompt for analysis
   */
  private getSystemPrompt(): string {
    return `Analyze the prompt quality. Respond ONLY with JSON:
{
  "quality": "poor|fair|good|excellent",
  "missing": ["1-3 missing elements"],
  "suggestion": "One improvement (max 15 words)",
  "score": 0-100
}
Scoring: poor(0-40) fair(41-60) good(61-80) excellent(81-100)
Evaluate: clarity, context, success criteria, examples if needed.`;
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
      verbose = false
    } = options;

    // Recursion detection - check if this is a recursive call from our own analysis
    if (promptText.includes(ANALYSIS_PROMPT_PREFIX)) {
      logger.warn('Recursion detected - prompt contains analysis prefix, skipping to prevent infinite loop');
      // Return a special analysis indicating recursion was prevented
      return {
        quality: 'fair',
        missing: [],
        suggestion: 'Recursion prevented - analysis skipped',
        score: 50,
        timestamp: new Date().toISOString(),
        sessionId,
        originalPrompt: '[Recursion detected - not saved]'
      };
    }

    logger.debug(`Starting prompt analysis - length: ${promptText.length} chars`);

    // Ensure the analysis directory exists
    await this.ensureAnalysisDir();

    // Build the analysis prompt using the constant prefix
    const analysisPrompt = `${ANALYSIS_PROMPT_PREFIX}

---
${promptText}
---

Respond with JSON only.`;

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
            customSystemPrompt: this.getSystemPrompt(), // Use proper system prompt
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
          
          // Return a fallback analysis
          analysisResult = this.getFallbackAnalysis(promptText, sessionId);
        }
      } else {
        logger.warn('No response received from Claude SDK');
        analysisResult = this.getFallbackAnalysis(promptText, sessionId);
      }

    } catch (error) {
      logger.error('Error during SDK prompt analysis:', error);
      
      // Check if it's an abort/timeout
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
        logger.warn('SDK analysis timed out (aborted), using fallback');
      } else if (error instanceof Error && error.message.includes('overloaded')) {
        logger.warn('Model overloaded, fallback should have been used automatically');
      }
      
      analysisResult = this.getFallbackAnalysis(promptText, sessionId);
    }

    // Save the analysis result
    if (analysisResult) {
      await this.saveAnalysis(analysisResult, sessionId);
    }

    return analysisResult!;
  }

  /**
   * Get a fallback analysis when Claude analysis fails
   */
  private getFallbackAnalysis(promptText: string, sessionId?: string): PromptAnalysis {
    // Basic heuristic analysis
    const wordCount = promptText.split(/\s+/).length;
    const hasQuestion = /\?/.test(promptText);
    const hasCode = /```|`/.test(promptText);
    const hasPath = /\/[\w.-]+|\\[\w.-]+/.test(promptText);

    let score = 30; // Base score
    let quality: PromptAnalysis['quality'] = 'poor';
    const missing: string[] = [];
    let suggestion = 'Add more context and be specific about what you want';

    // Scoring based on heuristics
    if (wordCount > 10) score += 10;
    if (wordCount > 30) score += 10;
    if (wordCount > 50) score += 10;
    if (hasQuestion) score += 5;
    if (hasCode) score += 15;
    if (hasPath) score += 10;

    // Determine quality and feedback
    if (score >= 80) {
      quality = 'excellent';
      suggestion = 'Great prompt! Consider adding success criteria';
    } else if (score >= 60) {
      quality = 'good';
      suggestion = 'Good context. Add specific examples if applicable';
      if (!hasCode) missing.push('code examples');
    } else if (score >= 40) {
      quality = 'fair';
      suggestion = 'Add more context about your project';
      if (wordCount < 30) missing.push('detailed context');
      if (!hasCode && !hasPath) missing.push('specific files or code');
    } else {
      quality = 'poor';
      missing.push('clear objective', 'context', 'specific details');
    }

    return {
      quality,
      missing: missing.slice(0, 3), // Max 3 items
      suggestion,
      score,
      timestamp: new Date().toISOString(),
      sessionId,
      originalPrompt: promptText  // Include original prompt in fallback too
    };
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

      // Create/update the latest symlink
      const latestPath = path.join(this.analysisDir, 'latest.json');
      
      // Remove old symlink if it exists
      try {
        await fs.unlink(latestPath);
      } catch {
        // Ignore if doesn't exist
      }

      // Create new symlink
      try {
        await fs.symlink(filename, latestPath);
      } catch (symlinkError) {
        // On Windows, symlinks might fail, so copy the file instead
        await fs.copyFile(filepath, latestPath);
      }

      logger.debug(`Analysis saved to: ${filepath}`);
      logger.debug(`Latest symlink updated: ${latestPath}`);

    } catch (error) {
      logger.error('Failed to save analysis:', error);
    }
  }

  /**
   * Load the latest analysis
   */
  public async loadLatestAnalysis(): Promise<PromptAnalysis | null> {
    try {
      const latestPath = path.join(this.analysisDir, 'latest.json');
      const content = await fs.readFile(latestPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.debug('No latest analysis found:', error);
      return null;
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
        if (file === 'latest.json') continue; // Don't delete the latest symlink

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