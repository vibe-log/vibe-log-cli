import { homedir } from 'os';
import { join } from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

/**
 * Custom Instructions File Management
 * Handles reading, writing, and creating the ~/.vibe-log/instructions.md file
 */

const INSTRUCTIONS_DIR = join(homedir(), '.vibe-log');
const INSTRUCTIONS_FILE = join(INSTRUCTIONS_DIR, 'instructions.md');

/**
 * Default template for instructions.md
 * Based on the comprehensive template from PLAN_custom_instructions.md
 */
const DEFAULT_TEMPLATE = `# Custom Instructions for AI Analysis

> **Tips for effective instructions:**
> - **Be project-specific**: Even though these are global instructions, mention actual project names!
>   - Good: "The 'payment-api' project is production-critical, 'weekend-hacks' is exploratory"
>   - Bad: "Some projects are important, others aren't"
> - **Use concrete examples**: File paths, folder names, specific patterns you follow
>   - Good: "Files in 'src/demos/' are mockups, not features"
>   - Bad: "Some code is just for demos"
> - **Explain the WHY**: Help AI understand your reasoning
>   - Good: "Refactoring 'legacy-app' is valuable because we're modernizing a critical system"
>   - Bad: "Refactoring is important"
> - **Update regularly**: As projects change, update your instructions to stay relevant

## Work Context
<!-- What type of work are you doing? Be specific about your role and projects. -->

**Example (Good):** "I'm a senior engineer working on 'payment-api' (production) and learning Rust through weekend side projects. Production work requires tests and reviews; side projects are exploratory."

**Example (Too Vague):** "I do programming work."

YOUR CONTEXT:


## Goals & What Matters
<!-- What indicates meaningful progress for YOU? What patterns show your best work? -->

**Example (Good):** "Deep focus sessions with thoughtful commits matter most. I work best in 2-3 hour blocks. Rapid-fire commits usually mean I'm debugging or context-switching, not deep work."

**Example (Too Vague):** "Writing good code."

YOUR GOALS:


## What to Ignore or Discount
<!-- Specific projects, file patterns, or activities that shouldn't count as productivity -->

**Example (Good):** "The 'client-demos' folder contains UI mockups for sales presentations, not real features. The 'tutorial-projects' folder is from online courses - it's learning, not production work."

**Example (Too Vague):** "Some stuff doesn't matter."

WHAT TO IGNORE:


## Project-Specific Context
<!-- Constraints, requirements, or patterns for specific projects -->

**Example:** "'legacy-monolith' is a 5-year-old codebase. Refactoring and modernization work is valuable even if metrics look low. 'mobile-app' targets old Android devices, so we use older JS patterns intentionally."

YOUR PROJECTS:


## Additional Notes
<!-- Any other patterns, preferences, or context that helps understand your work -->


`;

/**
 * Get the path to the instructions file
 */
export function getInstructionsPath(): string {
  return INSTRUCTIONS_FILE;
}

/**
 * Get the directory containing the instructions file
 */
export function getInstructionsDir(): string {
  return INSTRUCTIONS_DIR;
}

/**
 * Check if the instructions file exists
 */
export async function instructionsFileExists(): Promise<boolean> {
  try {
    await fs.access(INSTRUCTIONS_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the instructions file
 * Returns null if file doesn't exist
 */
export async function readInstructions(): Promise<string | null> {
  try {
    const exists = await instructionsFileExists();
    if (!exists) {
      return null;
    }

    const content = await fs.readFile(INSTRUCTIONS_FILE, 'utf-8');
    return content;
  } catch (error) {
    logger.error('Error reading instructions file:', error);
    return null;
  }
}

/**
 * Write instructions to file
 * Creates directory if it doesn't exist
 */
export async function writeInstructions(content: string): Promise<void> {
  try {
    // Ensure the .vibe-log directory exists
    await fs.mkdir(INSTRUCTIONS_DIR, { recursive: true });

    // Write the instructions file
    await fs.writeFile(INSTRUCTIONS_FILE, content, 'utf-8');

    logger.info('Instructions saved successfully');
  } catch (error) {
    logger.error('Error writing instructions file:', error);
    throw new Error('Failed to save instructions');
  }
}

/**
 * Create the instructions file with the default template
 * Only creates if file doesn't already exist
 */
export async function createDefaultInstructions(): Promise<void> {
  try {
    const exists = await instructionsFileExists();
    if (exists) {
      logger.info('Instructions file already exists, skipping creation');
      return;
    }

    await writeInstructions(DEFAULT_TEMPLATE);
    logger.info('Created instructions file with default template');
  } catch (error) {
    logger.error('Error creating default instructions:', error);
    throw error;
  }
}

/**
 * Delete the instructions file
 */
export async function deleteInstructions(): Promise<void> {
  try {
    const exists = await instructionsFileExists();
    if (!exists) {
      logger.info('Instructions file does not exist, nothing to delete');
      return;
    }

    await fs.unlink(INSTRUCTIONS_FILE);
    logger.info('Instructions file deleted successfully');
  } catch (error) {
    logger.error('Error deleting instructions file:', error);
    throw new Error('Failed to delete instructions');
  }
}

/**
 * Get the character count of the instructions
 */
export async function getInstructionsCharCount(): Promise<number> {
  const content = await readInstructions();
  if (!content) {
    return 0;
  }
  return content.length;
}

/**
 * Get instructions metadata
 */
export async function getInstructionsMetadata(): Promise<{
  exists: boolean;
  characterCount: number;
  lastModified?: Date;
}> {
  const exists = await instructionsFileExists();

  if (!exists) {
    return {
      exists: false,
      characterCount: 0,
    };
  }

  try {
    const stats = await fs.stat(INSTRUCTIONS_FILE);
    const characterCount = await getInstructionsCharCount();

    return {
      exists: true,
      characterCount,
      lastModified: stats.mtime,
    };
  } catch (error) {
    logger.error('Error getting instructions metadata:', error);
    return {
      exists: false,
      characterCount: 0,
    };
  }
}
