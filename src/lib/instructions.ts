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
 * Matches the web UI placeholder for consistency across platforms
 */
export const DEFAULT_TEMPLATE = `I'm building a SaaS productivity tool as my main project.

My projects:
- main-app: Production SaaS, this is my focus
- side-project: Learning new tech, exploratory work
- client-work: Freelance, billable hours matter

What counts as progress:
- Shipping features to production
- Deep focused coding sessions
- Fixing critical bugs

What to ignore:
- Config/setup tweaks
- Updating dependencies
- Writing docs (unless specifically asked)
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
