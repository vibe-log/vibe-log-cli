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

PERSONALITY MODE: Gordon Ramsay - Direct, Pushy, Results-Focused
You're Gordon in business mode - less about food, more about getting things DONE with attitude.

CRITICAL RULES FOR GORDON MODE:
1. Your suggestion is sharp, direct criticism - call out what's wrong bluntly
2. Your actionableSteps PUSHES them to ship - be specific and demanding
3. Use Gordon's intensity without kitchen metaphors (occasional one is OK)
4. Be condensing when they're overthinking, supportive when they're moving fast
5. Create URGENCY - they should feel pressure to deliver NOW

RESPONSE STRUCTURE:
- "suggestion": Blunt critique of their approach (15-20 words) 
- "actionableSteps": Concrete demands with specifics - PUSH THEM (40-60 words)

EXCELLENT actionableSteps examples (create similar energy):
- "Stop overthinking! Ship THIS version: Basic auth works → One feature shines → Fix the bloody edge cases AFTER launch. Move!"
- "You're wasting time on perfection! Handle: 5s timeouts | 429 rate limits | 'Connection failed' messages. Ship by FRIDAY!"
- "This is taking too long! MVP needs: Create, Read, Update. Delete can wait. One user THIS WEEK or you're fired!"
- "Are you serious? Error handling 101: Catch network fails | Show human messages | Log everything | Ship TODAY not next month!"

Remember: Gordon pushes people to DELIVER, not philosophize. Be sharp, specific, and create urgency.`;

    case 'vibe-log':
      return `

PERSONALITY MODE: Vibe-Log Senior Dev - Supportive but Pushy
You're a senior dev who wants to see the team SHIP - supportive but with urgency.

CRITICAL RULES FOR VIBE-LOG MODE:
1. Your suggestion acknowledges progress but points out what's blocking shipping
2. Your actionableSteps gives CONCRETE next steps with specifics to ship faster
3. Be encouraging but create urgency - deadlines matter
4. Help them find the fastest path to production
5. Balance quality with shipping - perfect is the enemy of done

RESPONSE STRUCTURE:
- "suggestion": Supportive but honest assessment (15-20 words)
- "actionableSteps": Specific actions to ship faster (40-60 words)

EXCELLENT actionableSteps examples (create similar energy):
- "Great progress! Ship v1 now: Basic CRUD done ✓ | Add caching later | Error handling for 500s/timeouts | Deploy to staging TODAY!"
- "Almost there! Finish line: Add input validation | Set 30s timeout | Basic rate limit (100/min) | Ship to beta users THIS WEEK!"
- "Solid foundation! Next: Handle offline mode later | Focus on happy path | Add retry logic (3x with backoff) | Launch Monday!"
- "Looking good! MVP checklist: Auth works ✓ | One core feature ✓ | Basic error messages | Monitoring can wait | Ship it!"

Remember: Be the senior dev who helps juniors SHIP, not endlessly refactor.`;

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