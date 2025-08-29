import { logger } from '../utils/logger';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getStatusLinePersonality } from './personality-manager';
import { getToken } from './config';
import { LoadingState, getLoadingMessage } from '../types/loading-state';
import { generatePromotionalTip } from './promotional-tips';

/**
 * Analysis result for a prompt
 */
export interface PromptAnalysis {
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  missing: string[];
  suggestion: string;
  actionableSteps?: string;  // Concrete "TRY THIS" steps with examples
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
  conversationContext?: string; // Context from previous 2-3 conversation turns
  previousAssistantMessage?: string; // Deprecated: Use conversationContext instead
}

// Cache the SDK import to avoid re-importing on every analysis
let cachedSDK: { query: any } | null = null;

// Removed session-based recursion tracker - now using loading state detection

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
   * Note: Currently not used - removed from SDK options to debug hanging issue
   */
  /* private getSystemPrompt(hasContext: boolean = false): string {
    const contextAwareness = hasContext ? `
IMPORTANT Context Rules:
- You are given conversation context with multiple previous messages (labeled as "Previous User" and "Previous Assistant")
- Consider the FULL conversation flow, not just the last message
- If the conversation shows an ongoing discussion, score based on continuity
- If the previous assistant message ends with "?" it's a QUESTION
- Direct answers to questions (even 1-2 words) should score 80-100
- "PostgreSQL" answering "PostgreSQL or MySQL?" = excellent (90+ score)
- "Yes" or "No" to yes/no questions = excellent (90+ score)
- Short responses are PERFECT when answering direct questions
- If user is continuing a multi-part discussion coherently = good (70+ score)
- If user is providing requested clarification = excellent (80+ score)
- Use ✅ emoji for direct answers to questions
- DO NOT ask for more context when user is answering a question or continuing discussion
- Suggestion for direct answers should be "Direct answer" or "Good response"
- Consider if the user is building upon previous messages in the conversation` : '';

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
  "suggestion": "Specific diagnosis of what's wrong with THIS prompt (max 20 words)",
  "actionableSteps": "Concrete steps to fix it, with examples (max 25 words)",
  "score": 0-100,
  "contextualEmoji": "emoji"
}
Scoring: poor(0-40) fair(41-60) good(61-80) excellent(81-100)
Evaluate: clarity, context, success criteria, examples if needed.${contextAwareness}${personalityPrompt}

IMPORTANT: Your response must have TWO parts:
1. "suggestion": Diagnose the SPECIFIC issue with THIS prompt (not generic advice)
2. "actionableSteps": Provide CONCRETE steps with examples they can immediately apply

Example responses:
- suggestion: "Mixing database migration with UI updates in one request"
  actionableSteps: "Split into: 1) Migrate user table, 2) Update login form, 3) Test auth flow"
  
- suggestion: "No context about existing code structure or framework"
  actionableSteps: "Add: 'Using Next.js 14 with app router and Prisma ORM'"

Emoji selection:
- 📏 if lacking specificity, measurements, or exact details
- 📝 if missing context, project info, or background
- 🎯 if missing success criteria or goals
- 💭 if vague, unclear, or ambiguous
- ✨ if excellent (score 81-89)
- ✅ if perfect (score 90+)
- 💡 for general improvements`;
  } */

  /**
   * Analyze a prompt and return quality feedback using Claude SDK
   */
  public async analyze(
    promptText: string,
    options: AnalysisOptions = {}
  ): Promise<PromptAnalysis> {
    const { 
      sessionId,
      verbose = false,
      conversationContext,
      previousAssistantMessage // For backward compatibility
    } = options;
    
    // Use conversationContext if available, fallback to previousAssistantMessage for compatibility
    const context = conversationContext || previousAssistantMessage;

    // RECURSION PREVENTION: Check for HTML comment guard FIRST
    // This guard is invisible to Claude but prevents infinite recursion
    if (promptText.includes('<!--VIBE_LOG_GUARD:')) {
      logger.debug('Detected vibe-log guard - preventing infinite recursion');
      await this.logToDebugFile(`HTML GUARD DETECTED: Preventing recursion for ${sessionId}`);
      return this.getSkipResponse(sessionId, 'vibe-log-guard-detected');
    }
    
    // Note: We removed the loading state check here because it was preventing
    // the original analysis from running. The signature check above is sufficient.

    // Debug log to file for hook troubleshooting
    await this.logToDebugFile(`Starting analysis for session ${sessionId}, prompt length: ${promptText.length}`);

    try {
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

    // Build the analysis prompt with CLEAR instructions
    let analysisPrompt = `You are a strategic product advisor analyzing a developer's prompt WHILE Claude is already processing their request.
Your role is to provide high-level strategic guidance, not implementation details.

User's current prompt:
---
${promptText}
---
`;

    // Add conversation context if available
    if (context) {
      analysisPrompt += `
Conversation context:
---
${context.substring(0, 1500)}${context.length > 1500 ? '...' : ''}
---
`;
      logger.debug('Including conversation context in analysis', {
        contextLength: context.length,
        hasOriginalMission: context.includes('ORIGINAL MISSION'),
        isMultiMessage: context.includes('Previous User') || context.includes('Previous Assistant')
      });
    }

    // Add explicit JSON format instructions with product manager focus
    analysisPrompt += `
Analyze the prompt and provide strategic product-level guidance.

You must respond with ONLY a JSON object in this exact format:
{
  "quality": "poor" | "fair" | "good" | "excellent",
  "missing": ["1-2 strategic considerations they might be overlooking"],
  "suggestion": "Brief diagnosis of their approach (15-20 words)",
  "actionableSteps": "Strategic next steps to think about - NOT code to write (30-50 words)",
  "score": 0-100,
  "contextualEmoji": "🎯" | "🚀" | "⚡" | "🔄" | "📊" | "🎨" | "🔍" | "✅"
}

CRITICAL for actionableSteps field:
- This is your PRIMARY VALUE - make it count!
- Focus on STRATEGIC thinking, not tactical implementation
- Consider their ORIGINAL MISSION (if available) and current progress
- Suggest what to THINK ABOUT next, not what to CODE
- Include considerations like: edge cases, user experience, scaling, security
- Help them see the forest while they're in the trees

Good actionableSteps examples:
- "Consider: How will errors appear to users? | Recovery strategies? | Offline behavior?"
- "Think about: Permission boundaries | Rate limiting needs | Mobile experience differences"
- "Next considerations: Onboarding flow | Analytics events | Team documentation needs"

Bad actionableSteps (too prescriptive/technical):
- "Add JWT tokens to your auth flow"
- "Implement try-catch blocks"
- "Create a /api/login endpoint"

Scoring: 
- poor(0-40): Missing critical context or unclear goal
- fair(41-60): Basic request but lacks depth
- good(61-80): Clear request with good context
- excellent(81-100): Comprehensive with clear success criteria

For the contextualEmoji:
- 🎯 = Need clearer goals/objectives
- 🚀 = Ready to ship, think about deployment
- ⚡ = Consider performance/optimization
- 🔄 = Think about the iteration/feedback loop
- 📊 = Consider metrics/monitoring
- 🎨 = UX/design considerations needed
- 🔍 = Edge cases to explore
- ✅ = Well-structured, complete thinking

Respond with JSON only, no explanation.`;
    
    // Add invisible HTML comment guard to prevent recursion
    // This guard is detected if the SDK tries to analyze this prompt
    analysisPrompt += '\n<!--VIBE_LOG_GUARD:1-->';

    let analysisResult: PromptAnalysis | null = null;
    let rawResponse = '';

    try {
      // Get Claude SDK (cached after first import)
      logger.debug('Getting Claude SDK...');
      await this.logToDebugFile(`Getting Claude SDK for session ${sessionId}...`);
      const { query } = await getClaudeSDK();
      logger.debug('SDK loaded successfully');
      await this.logToDebugFile(`SDK loaded successfully for session ${sessionId}`);
      
      // Use model from options or default to haiku
      // In hook mode (when sessionId exists), prioritize speed over accuracy
      const selectedModel = options.model || (sessionId ? 'haiku' : 'haiku');
      logger.debug(`Using Claude SDK with ${selectedModel} model for analysis`);
      
      // No timeout - let the SDK complete naturally
      logger.debug('Starting SDK query with prompt length:', analysisPrompt.length);
      
      // Simplified options - optimize for speed in hook mode
      const queryOptions = {
        maxTurns: 1,                    // Single turn only
        model: selectedModel,           // Use selected model (haiku by default)
        disallowedTools: ['*']          // No tools needed for JSON response
      };
      
      logger.debug('Query options:', queryOptions);
      await this.logToDebugFile(`Starting SDK query for session ${sessionId} with model ${selectedModel}`);
        
        for await (const message of query({
          prompt: analysisPrompt,
          options: queryOptions
        })) {
          // Log every message type we receive
          logger.debug(`Received message type: ${message.type}`, message.type === 'result' ? message : '');
          
          if (message.type === 'assistant' && message.message?.content) {
            const textContent = message.message.content.find((c: any) => c.type === 'text');
            if (textContent?.text) {
              rawResponse = textContent.text;
              logger.debug('Got raw response from SDK:', rawResponse.substring(0, 200));
              await this.logToDebugFile(`Raw SDK response: ${rawResponse.substring(0, 500)}`);
            }
          } else if (message.type === 'result' && verbose) {
            logger.debug('Analysis metrics:', {
              duration_ms: message.duration_ms,
              cost_usd: message.total_cost_usd,
              model_used: message.model || selectedModel
            });
          }
        }

      await this.logToDebugFile(`SDK query completed for session ${sessionId}, got response: ${rawResponse ? 'YES' : 'NO'}`);

      // Parse the response
      if (rawResponse) {
        try {
          // Extract JSON from the response (in case there's extra text)
          const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validate and normalize the response - NO FALLBACKS!
            // If SDK doesn't return proper data, we should fail and fix it
            if (!parsed.quality || !parsed.suggestion || typeof parsed.score !== 'number') {
              logger.error('SDK response missing required fields:', parsed);
              await this.logToDebugFile(`INCOMPLETE SDK RESPONSE: ${JSON.stringify(parsed)}`);
              throw new Error(`SDK response missing required fields: quality=${parsed.quality}, suggestion=${parsed.suggestion}, score=${parsed.score}`);
            }
            
            analysisResult = {
              quality: parsed.quality,
              missing: Array.isArray(parsed.missing) ? parsed.missing : [],
              suggestion: parsed.suggestion,
              actionableSteps: parsed.actionableSteps || undefined,  // Include if present
              score: parsed.score,
              contextualEmoji: parsed.contextualEmoji || '💡',  // Only emoji can have fallback
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
        // Check authentication status for promotional tip
        const token = await getToken();
        analysisResult.promotionalTip = generatePromotionalTip(!!token);
        await this.saveAnalysis(analysisResult, sessionId);
      }

      return analysisResult!;
    } catch (error) {
      // Log errors to debug file
      await this.logToDebugFile(`ERROR in analysis for ${sessionId}: ${error}`);
      throw error;
    } finally {
      // Cleanup handled by file state updates
      logger.debug(`Analysis completed for session ${sessionId}`);
      await this.logToDebugFile(`Analysis finished for session ${sessionId}`);
    }
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

  // Note: Removed checkExistingLoadingState method as it was causing issues
  // The signature-based recursion prevention is sufficient

  // Note: Removed containsVibeLogSignature method - no longer needed
  // We now use HTML comment guard which is cleaner and more reliable

  /**
   * Log to debug file for troubleshooting hook issues
   */
  private async logToDebugFile(message: string): Promise<void> {
    try {
      const debugPath = path.join(this.analysisDir, 'hook-debug.log');
      const timestamp = new Date().toISOString();
      await fs.appendFile(debugPath, `[${timestamp}] ${message}\n`, 'utf8');
    } catch (error) {
      // Ignore logging errors
    }
  }

  /**
   * Return a skip response when recursion is detected
   * This prevents infinite loops while providing valid output
   */
  private getSkipResponse(sessionId?: string, reason: string = 'recursion'): PromptAnalysis {
    logger.debug(`Returning skip response for session ${sessionId}`, { reason });
    
    return {
      quality: 'good',
      missing: [],
      suggestion: 'Analysis in progress...',
      score: 70,
      contextualEmoji: '⏳',
      timestamp: new Date().toISOString(),
      sessionId,
      originalPrompt: `[Skipped: ${reason}]`,
      promotionalTip: ''
    };
  }
}