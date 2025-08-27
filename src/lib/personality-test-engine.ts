import { PromptAnalyzer, PromptAnalysis } from './prompt-analyzer';
import { transformSuggestion } from './personality-manager';
import { logger } from '../utils/logger';

/**
 * Test prompt structure
 */
export interface TestPrompt {
  text: string;
  description: string;
}

/**
 * Result from personality testing
 */
export interface PersonalityTestResult {
  prompt: string;
  promptDescription: string;
  aiScore: number;
  aiQuality: 'poor' | 'fair' | 'good' | 'excellent';
  aiSuggestion: string;
  personalityTransformed: string;
  emoji: string;
  processingTime: number;
  error?: string;
}

/**
 * Options for running personality tests
 */
export interface PersonalityTestOptions {
  verbose?: boolean;
  personality?: 'gordon' | 'vibe-log' | 'custom';
  onProgress?: (message: string) => void;
}

/**
 * Get emoji based on score
 */
function getScoreEmoji(score: number): string {
  if (score <= 40) return '🔴';
  if (score <= 60) return '🟠';
  if (score <= 80) return '🟡';
  return '🟢';
}


/**
 * Run personality test with real Claude SDK calls
 * This is the single source of truth for testing personalities
 */
export async function runPersonalityTest(
  prompts: TestPrompt[],
  options: PersonalityTestOptions = {}
): Promise<PersonalityTestResult[]> {
  const { verbose = false, personality, onProgress } = options;
  const results: PersonalityTestResult[] = [];
  const analyzer = new PromptAnalyzer();
  
  // Enable debug if verbose
  if (verbose) {
    process.env.DEBUG_PERSONALITY = 'true';
  }
  
  for (const testPrompt of prompts) {
    const startTime = Date.now();
    
    try {
      // Notify progress
      if (onProgress) {
        onProgress(`Analyzing: "${testPrompt.text.substring(0, 50)}..."`);
      }
      
      // Get real analysis from Claude
      const analysis: PromptAnalysis = await analyzer.analyze(testPrompt.text, {
        verbose,
        timeout: 15000 // 15 second timeout
      });
      
      const processingTime = Date.now() - startTime;
      
      // Apply personality transformation
      const transformed = transformSuggestion(
        analysis.suggestion,
        analysis.score,
        personality
      );
      
      // Build result
      const result: PersonalityTestResult = {
        prompt: testPrompt.text,
        promptDescription: testPrompt.description,
        aiScore: analysis.score,
        aiQuality: analysis.quality,
        aiSuggestion: analysis.suggestion,
        personalityTransformed: transformed,
        emoji: getScoreEmoji(analysis.score),
        processingTime
      };
      
      results.push(result);
      
      if (verbose) {
        logger.debug('Test result:', result);
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Add error result
      results.push({
        prompt: testPrompt.text,
        promptDescription: testPrompt.description,
        aiScore: 0,
        aiQuality: 'poor',
        aiSuggestion: 'Analysis failed',
        personalityTransformed: 'Analysis failed',
        emoji: '❌',
        processingTime,
        error: error instanceof Error ? error.message : String(error)
      });
      
      logger.error('Test failed for prompt:', error);
    }
  }
  
  // Clean up debug flag
  if (verbose) {
    delete process.env.DEBUG_PERSONALITY;
  }
  
  return results;
}

/**
 * Standard test prompts for personality testing
 */
export const STANDARD_TEST_PROMPTS: TestPrompt[] = [
  {
    text: 'fix this',
    description: 'Minimal context, no details'
  },
  {
    text: 'I need help with my React component that handles user authentication',
    description: 'Some context, needs specifics'
  },
  {
    text: 'My UserProfile component at src/components/UserProfile.tsx is not updating when user data changes. Using React 18 with TypeScript.',
    description: 'Good context, could use examples'
  },
  {
    text: 'I need to implement debounced search in React. After 500ms of no typing, query /api/search endpoint. Response: array of {id, title, description}. Display in dropdown with keyboard navigation. Using TypeScript and React 18.',
    description: 'Complete requirements, clear goals'
  }
];

/**
 * Format test results for display
 */
export function formatTestResult(result: PersonalityTestResult): string[] {
  const lines: string[] = [];
  
  lines.push(`Prompt: "${result.prompt.substring(0, 60)}${result.prompt.length > 60 ? '...' : ''}"`);
  lines.push(`Description: ${result.promptDescription}`);
  
  if (result.error) {
    lines.push(`Error: ${result.error}`);
  } else {
    lines.push(`AI Score: ${result.emoji} ${result.aiScore}/100 (${result.aiQuality})`);
    lines.push(`AI Suggestion: "${result.aiSuggestion}"`);
    lines.push(`With Personality: "${result.personalityTransformed}"`);
    lines.push(`Processing Time: ${(result.processingTime / 1000).toFixed(1)}s`);
  }
  
  return lines;
}