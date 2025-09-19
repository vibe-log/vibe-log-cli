import path from 'path';
import os from 'os';

/**
 * Temporary directory names for isolating automated Claude sessions
 * These directories are used to prevent cluttering real project sessions
 */
export const TEMP_DIRECTORIES = {
  PROMPT_ANALYSIS: 'temp-prompt-analysis',
  PRODUCTIVITY_REPORT: 'temp-productivity-report',
  STANDUP_ANALYSIS: 'temp-standup',
} as const;

/**
 * Get the full path to a temp directory
 */
export function getTempDirectoryPath(type: keyof typeof TEMP_DIRECTORIES): string {
  return path.join(os.homedir(), '.vibe-log', TEMP_DIRECTORIES[type]);
}

/**
 * List of all temp directory names (for filtering)
 */
export const TEMP_DIRECTORY_NAMES = Object.values(TEMP_DIRECTORIES);

/**
 * Check if a project name is a temp directory
 */
export function isTempDirectory(projectName: string): boolean {
  return TEMP_DIRECTORY_NAMES.some(tempName => projectName === tempName);
}

/**
 * Check if a Claude project folder name contains a temp directory
 * Claude folder names are like: -Users-danny--vibe-log-temp-prompt-analysis
 */
export function isClaudeTempProject(claudeFolderName: string): boolean {
  // Check if any temp directory name appears in the Claude folder name
  return TEMP_DIRECTORY_NAMES.some(tempName => 
    claudeFolderName.includes(tempName)
  );
}