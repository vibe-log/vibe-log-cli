import { getStatusLinePersonality as getStatusLinePersonalityConfig, setStatusLinePersonality as setStatusLinePersonalityConfig } from './config';
import { logger } from '../utils/logger';

// Re-export config functions for convenience
export const getStatusLinePersonality = getStatusLinePersonalityConfig;
export const setStatusLinePersonality = setStatusLinePersonalityConfig;

/**
 * Personality type definitions
 */
export type PersonalityType = 'gordon' | 'vibe-log' | 'custom';

/**
 * Score range type for categorizing prompt quality
 */
export type ScoreRange = 'poor' | 'fair' | 'good' | 'excellent';

/**
 * Personality template for different score ranges
 */
export interface PersonalityTemplate {
  poor: string[];      // 0-40
  fair: string[];      // 41-60
  good: string[];      // 61-80
  excellent: string[]; // 81-100
}

/**
 * Get score range based on numeric score
 */
function getScoreRange(score: number): ScoreRange {
  if (score <= 40) return 'poor';
  if (score <= 60) return 'fair';
  if (score <= 80) return 'good';
  return 'excellent';
}

// Legacy template arrays - preserved for reference but no longer used
// The personality system now uses system prompts to guide Claude's natural language generation
// This prevents repetitive canned responses while maintaining personality flavor

// Note: These templates are kept for documentation purposes and potential future use
// They show the kind of language each personality should naturally generate
// But we no longer do direct template substitution to preserve Claude's intelligence

/**
 * Transform a suggestion based on the active personality
 * 
 * IMPORTANT: This function now preserves Claude's original suggestions
 * The personality influence happens through system prompts, not template replacement
 */
export function transformSuggestion(
  originalSuggestion: string,
  score: number,
  personality?: PersonalityType
): string {
  try {
    // Get the configured personality if not provided
    if (!personality) {
      const config = getStatusLinePersonalityConfig();
      personality = config.personality;
    }

    // Debug logging
    if (process.env.VIBELOG_DEBUG === 'true' || process.env.DEBUG_PERSONALITY === 'true') {
      logger.debug('=== PERSONALITY TRANSFORMATION DEBUG ===');
      logger.debug('Active personality:', personality);
      logger.debug('Score:', score);
      logger.debug('Original suggestion:', originalSuggestion);
      logger.debug('Preserving original suggestion (no template replacement)');
    }

    // For custom personality with legacy templates, optionally use them
    // This provides backward compatibility if someone has configured custom templates
    if (personality === 'custom') {
      const config = getStatusLinePersonalityConfig();
      const range = getScoreRange(score);
      if (config.customPersonality?.templates?.[range]) {
        // If custom templates exist, use them for backward compatibility
        logger.debug('Using custom template for backward compatibility');
        return config.customPersonality.templates[range];
      }
    }

    // Return the original suggestion - personality is now applied via system prompts
    // This preserves Claude's contextual intelligence while maintaining personality
    return originalSuggestion;
    
  } catch (error) {
    logger.error('Failed to process suggestion with personality:', error);
    // On any error, return the original suggestion
    return originalSuggestion;
  } finally {
    // Log the final result
    if (process.env.VIBELOG_DEBUG === 'true' || process.env.DEBUG_PERSONALITY === 'true') {
      logger.debug('Final suggestion:', originalSuggestion);
      logger.debug('========================================');
    }
  }
}

/**
 * Get personality icon for display
 */
export function getPersonalityIcon(personality?: PersonalityType): string {
  if (!personality) {
    const config = getStatusLinePersonalityConfig();
    personality = config.personality;
  }

  switch (personality) {
    case 'gordon':
      return '🔥';
    case 'vibe-log':
      return '💜';
    case 'custom':
      return '✨';
    default:
      return '📊';
  }
}

/**
 * Get personality display name
 */
export function getPersonalityDisplayName(personality?: PersonalityType): string {
  if (!personality) {
    const config = getStatusLinePersonalityConfig();
    personality = config.personality;
    
    // For custom personality, return the custom name if available
    if (personality === 'custom' && config.customPersonality?.name) {
      return config.customPersonality.name;
    }
  }

  switch (personality) {
    case 'gordon':
      return 'Gordon';
    case 'vibe-log':
      return 'Vibe-Log';
    case 'custom': {
      // Try to get custom name from config
      const config = getStatusLinePersonalityConfig();
      return config.customPersonality?.name || 'Custom';
    }
    default:
      return 'Standard';
  }
}

/**
 * Get system prompt addition for personality
 */
export function getPersonalitySystemPrompt(personality?: PersonalityType): string {
  if (!personality) {
    const config = getStatusLinePersonalityConfig();
    personality = config.personality;
  }

  switch (personality) {
    case 'gordon':
      return `

PERSONALITY MODE: Gordon Ramsay Chef Mode
You must write BOTH "suggestion" and "actionableSteps" fields as Gordon Ramsay would speak - passionate, direct, using kitchen/cooking metaphors.

CRITICAL RULES FOR GORDON MODE:
1. Your suggestion must diagnose the SPECIFIC issue with THIS prompt
2. Your actionableSteps must provide CONCRETE steps using kitchen metaphors
3. Use kitchen/cooking metaphors naturally (raw, undercooked, seasoning, mise en place, etc.)
4. Be tough but constructive - Gordon wants excellence
5. NEVER use the same phrase twice - be creative each time

RESPONSE STRUCTURE:
- "suggestion": Diagnose what's wrong (like Gordon spotting a cooking mistake)
- "actionableSteps": Concrete fix using kitchen terms (like Gordon teaching proper technique)

EXAMPLES (DO NOT COPY - create your own):
Poor prompt:
- suggestion: "This request is completely raw - no context about your bloody database!"
- actionableSteps: "Prep your ingredients: 1) List tables, 2) Show relationships, 3) Define the query!"

Fair prompt:
- suggestion: "It's bland - missing the seasoning of specific error messages!"
- actionableSteps: "Season properly: Add exact error text, line numbers, and stack trace!"

Good prompt:
- suggestion: "Decent technique but where's the garnish - the expected output?"
- actionableSteps: "Finish the dish: Show example JSON response or UI mockup!"

Remember: Gordon diagnoses problems precisely, then teaches you to fix them properly.`;

    case 'vibe-log':
      return `

PERSONALITY MODE: Vibe-Log Developer Mode
You must write BOTH "suggestion" and "actionableSteps" fields as an encouraging developer would - supportive, technical, using programming metaphors.

CRITICAL RULES FOR VIBE-LOG MODE:
1. Your suggestion must diagnose the SPECIFIC issue with THIS prompt
2. Your actionableSteps must provide CONCRETE technical steps
3. Use programming/dev metaphors naturally (compile, debug, refactor, ship it, etc.)
4. Be encouraging but direct - like a helpful code reviewer
5. NEVER use the same phrase twice - be creative each time

RESPONSE STRUCTURE:
- "suggestion": Diagnose the issue (like a code review finding)
- "actionableSteps": Concrete fix (like suggesting a refactor approach)

EXAMPLES (DO NOT COPY - create your own):
Poor prompt:
- suggestion: "Missing imports - no context about your tech stack or dependencies!"
- actionableSteps: "Import these modules: 1) Framework (React/Vue), 2) State management, 3) API client!"

Fair prompt:
- suggestion: "Good base code but needs type definitions for the interfaces!"
- actionableSteps: "Add types: Define User interface, specify return types, add generics!"

Good prompt:
- suggestion: "Solid logic! Just missing test coverage for edge cases!"
- actionableSteps: "Add tests for: null inputs, empty arrays, timeout scenarios!"

Remember: Be the supportive senior dev providing actionable code review feedback.`;

    case 'custom': {
      const config = getStatusLinePersonalityConfig();
      if (config.customPersonality?.description) {
        return `

PERSONALITY MODE: ${config.customPersonality.name || 'Custom'}
Character Description: ${config.customPersonality.description}

CRITICAL RULES FOR CUSTOM MODE:
1. Your suggestion must diagnose the SPECIFIC issue with THIS prompt
2. Your actionableSteps must provide CONCRETE steps to fix it
3. Write BOTH fields in the voice/style described above
4. Use appropriate metaphors and language for this character
5. NEVER use the same phrase twice - be creative each time

RESPONSE STRUCTURE:
- "suggestion": Diagnose what's wrong (in character voice)
- "actionableSteps": Concrete fix steps (maintaining personality)

Remember: Stay in character while providing specific diagnosis and actionable steps.`;
      }
      return ''; // No special prompt for undefined custom
    }

    default:
      return ''; // Standard mode needs no special prompt
  }
}