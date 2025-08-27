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

/**
 * Gordon Ramsay personality templates
 */
const GORDON_TEMPLATES: PersonalityTemplate = {
  poor: [
    "This prompt is RAW! Where's the bloody context?!",
    "Are you trying to serve me frozen prompts?! Add some heat!",
    "This is a disaster! Start over with actual requirements!",
    "You call this a prompt? My grandmother could write better!",
    "WHAT ARE YOU?! An idiot sandwich! Add context!",
    "This prompt is so undercooked, it's still typing!",
    "Come on! You're better than this rubbish!"
  ],
  fair: [
    "It's edible but bland. Season it with details!",
    "You're halfway there, but this needs more flavor!",
    "Not terrible, but where's the passion? Add specifics!",
    "This is amateur hour! Professional prompts need examples!",
    "Wake up! Your prompt is sleeping! Add energy!",
    "It's like you're cooking with one hand tied! Use both!",
    "Mediocre! Push yourself to excellence!"
  ],
  good: [
    "Not bad, but you can do better, chef!",
    "Good technique, now perfect the presentation!",
    "Finally showing some skill! Now add finesse!",
    "You're getting there! Just needs final touches!",
    "Respectable work, but I expect excellence!",
    "Almost there! Don't lose focus now!",
    "Good foundation, now make it shine!"
  ],
  excellent: [
    "Finally, some good prompting! Well done!",
    "THAT'S how it's done! Beautiful work!",
    "Perfection! You've earned your apron!",
    "Outstanding! This is restaurant quality!",
    "Brilliant! You're a natural!",
    "YES! That's the standard I expect!",
    "Masterclass! Take a bow, chef!"
  ]
};

/**
 * Vibe-Log personality templates (encouraging developer style)
 */
const VIBELOG_TEMPLATES: PersonalityTemplate = {
  poor: [
    "Let's build this prompt up - needs foundation!",
    "Your idea needs structure - add the blueprint!",
    "Time to debug this prompt - missing core logic!",
    "Compile error! Add required context parameters!",
    "This needs refactoring - start with clear requirements!",
    "Missing dependencies! Import some context!",
    "Let's scaffold this properly - add the basics!"
  ],
  fair: [
    "Getting there! Add some implementation details",
    "Good start! Now let's add the business logic",
    "Framework is there, needs more configuration!",
    "Half-deployed! Complete the specification",
    "The MVP works, now add the features!",
    "Code review: needs more documentation!",
    "Decent prototype! Time to productionize!"
  ],
  good: [
    "Solid work! Polish with specific examples",
    "Clean code! Just needs some optimization",
    "Looking good! Add edge case handling",
    "Well structured! Consider adding tests",
    "Nice implementation! Final review needed",
    "Almost production-ready! Minor tweaks left",
    "Great architecture! Just needs fine-tuning"
  ],
  excellent: [
    "Ship it! This prompt is production-ready!",
    "10x developer prompt! Exceptional clarity!",
    "Merged to main! Outstanding work!",
    "Zero bugs! This is how it's done!",
    "Full test coverage! Brilliant prompting!",
    "Clean, scalable, perfect! Well done!",
    "This prompt scales! Exceptional engineering!"
  ]
};

/**
 * Get a random template from an array
 */
function getRandomTemplate(templates: string[]): string {
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Transform a suggestion based on the active personality
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
    }

    const range = getScoreRange(score);

    // Handle different personality types
    switch (personality) {
      case 'gordon':
        return getRandomTemplate(GORDON_TEMPLATES[range]);
      
      case 'vibe-log':
        return getRandomTemplate(VIBELOG_TEMPLATES[range]);
      
      case 'custom': {
        // For custom personality, check if templates are defined
        const config = getStatusLinePersonalityConfig();
        if (config.customPersonality?.templates?.[range]) {
          // Use the custom template directly
          return config.customPersonality.templates[range];
        }
        // Fall back to original suggestion if no custom template
        return originalSuggestion;
      }
      
      default:
        // Standard mode - return original suggestion
        return originalSuggestion;
    }
  } catch (error) {
    logger.error('Failed to transform suggestion with personality:', error);
    // On any error, return the original suggestion
    return originalSuggestion;
  } finally {
    // Log the final transformation result
    if (process.env.VIBELOG_DEBUG === 'true' || process.env.DEBUG_PERSONALITY === 'true') {
      logger.debug('Transformed suggestion:', originalSuggestion);
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
PERSONALITY MODE: Gordon Ramsay
- Be brutally honest but ultimately encouraging
- Use cooking/kitchen metaphors
- Express frustration creatively (no actual profanity)
- Push for excellence with tough love
- Suggestions should be direct and commanding`;

    case 'vibe-log':
      return `
PERSONALITY MODE: Vibe-Log Developer
- Be encouraging but direct about improvements
- Use programming/development metaphors  
- Frame feedback as code reviews or debugging
- Celebrate progress while pushing for better
- Suggestions should feel like pair programming advice`;

    case 'custom': {
      const config = getStatusLinePersonalityConfig();
      if (config.customPersonality?.description) {
        return `
PERSONALITY MODE: ${config.customPersonality.name || 'Custom'}
Style: ${config.customPersonality.description}
- Transform suggestions to match this personality style
- Keep feedback helpful while matching the tone
- Use appropriate metaphors for the character`;
      }
      return ''; // No special prompt for undefined custom
    }

    default:
      return ''; // Standard mode needs no special prompt
  }
}