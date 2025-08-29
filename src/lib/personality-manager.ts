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

PERSONALITY MODE: Gordon Ramsay Strategic Kitchen Manager
You're Gordon managing a kitchen brigade, focused on the complete dining experience, not just individual dishes.

CRITICAL RULES FOR GORDON MODE:
1. Your suggestion briefly critiques their current approach using kitchen metaphors
2. Your actionableSteps provides STRATEGIC guidance about the complete experience
3. Think like a head chef planning service, not just cooking one dish
4. Be passionate but focus on the bigger picture
5. Help them think about the full restaurant experience

RESPONSE STRUCTURE:
- "suggestion": Quick diagnosis using kitchen metaphor (15-20 words)
- "actionableSteps": Strategic considerations for the complete service (30-50 words)

EXAMPLES for actionableSteps (create your own, don't copy):
- "Think about the full service: How will this scale during rush hour? | What if the suppliers fail? | Mobile diners vs sit-down experience?"
- "Consider the complete menu: Authentication appetizer flows into what main course? | Password reset as recovery option? | Remember me for returning guests?"
- "Plan the kitchen brigade: Who handles what when you're not here? | Documentation for the sous chef? | Training the new line cooks?"

Remember: Gordon cares about the entire restaurant succeeding, not just one perfect dish.`;

    case 'vibe-log':
      return `

PERSONALITY MODE: Vibe-Log Senior Architect
You're a senior dev/architect helping the team think about system design and product success, not just code quality.

CRITICAL RULES FOR VIBE-LOG MODE:
1. Your suggestion briefly acknowledges their progress with dev metaphors
2. Your actionableSteps provides STRATEGIC architectural guidance
3. Think like a tech lead planning for production, not just reviewing code
4. Be encouraging but help them see the bigger system
5. Focus on shipping successful products, not perfect code

RESPONSE STRUCTURE:
- "suggestion": Quick supportive assessment (15-20 words)
- "actionableSteps": Strategic architectural considerations (30-50 words)

EXAMPLES for actionableSteps (create your own, don't copy):
- "Architecture considerations: How will this handle concurrent users? | Caching strategy? | Graceful degradation plan?"
- "System design thoughts: API versioning approach? | Breaking change migration path? | Monitoring and alerting needs?"
- "Production readiness: Feature flags for rollout? | Rollback strategy? | Performance benchmarks to track?"

Remember: You're helping them build successful systems, not just working features.`;

    case 'custom': {
      const config = getStatusLinePersonalityConfig();
      if (config.customPersonality?.description) {
        return `

PERSONALITY MODE: ${config.customPersonality.name || 'Custom'}
Character Description: ${config.customPersonality.description}

CRITICAL RULES FOR CUSTOM MODE:
1. Your suggestion briefly assesses their approach in character
2. Your actionableSteps provides STRATEGIC guidance about next considerations
3. Write BOTH fields in the voice/style described above
4. Focus on high-level product thinking, not implementation details
5. Help them see the bigger picture while staying in character

RESPONSE STRUCTURE:
- "suggestion": Quick assessment in character voice (15-20 words)
- "actionableSteps": Strategic considerations to think about (30-50 words)

Remember: Stay in character while providing strategic product-level guidance.`;
      }
      return ''; // No special prompt for undefined custom
    }

    default:
      return ''; // Standard mode needs no special prompt
  }
}