import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { readGlobalSettings, writeGlobalSettings } from './claude-settings-reader';
import { getCliPath } from './config';

/**
 * Status line installation state
 */
export type StatusLineState = 'NOT_INSTALLED' | 'PARTIALLY_INSTALLED' | 'FULLY_INSTALLED';

/**
 * Status line configuration details
 */
export interface StatusLineConfig {
  state: StatusLineState;
  hasAnalyzeHook: boolean;
  hasStatusLine: boolean;
  analyzeCommand?: string;
  statuslineCommand?: string;
}

/**
 * Get the proper CLI command for the current environment
 */
function getCliCommand(): string {
  const cliPath = getCliPath();
  
  // For development, if cliPath is the default npx command,
  // use the local built version with node
  if (cliPath === 'npx vibe-log-cli') {
    // Check if we're in development by looking for the local dist file
    const localDistPath = path.join(__dirname, '..', 'index.js');
    try {
      // This will resolve to the actual dist path when bundled
      if (require.resolve(localDistPath)) {
        return `node ${localDistPath}`;
      }
    } catch {
      // Not in local development, use the configured path
    }
  }
  
  return cliPath;
}

/**
 * Build the analyze-prompt hook command with dynamic path
 */
export function buildAnalyzePromptCommand(): string {
  // Use dynamic CLI path that works across different installations
  const cliCommand = getCliCommand();
  return `${cliCommand} analyze-prompt --silent --stdin`;
}

/**
 * Build the statusline display command with dynamic path
 */
export function buildStatuslineCommand(): string {
  // Use dynamic CLI path that works across different installations
  const cliCommand = getCliCommand();
  return `${cliCommand} statusline`;
}

/**
 * Check if a command is our analyze-prompt command
 */
function isAnalyzePromptCommand(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes('analyze-prompt') && 
         (command.includes('vibe-log') || command.includes('vibelog-cli'));
}

/**
 * Check if a command is our statusline command
 */
function isStatuslineCommand(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes('statusline') && 
         (command.includes('vibe-log') || command.includes('vibelog-cli'));
}

/**
 * Detect status line installation state
 */
export async function detectStatusLineState(): Promise<StatusLineConfig> {
  try {
    const settings = await readGlobalSettings();
    if (!settings) {
      return {
        state: 'NOT_INSTALLED',
        hasAnalyzeHook: false,
        hasStatusLine: false
      };
    }

    let hasAnalyzeHook = false;
    let analyzeCommand: string | undefined;
    
    // Check for UserPromptSubmit hook with analyze-prompt command
    if (settings.hooks?.UserPromptSubmit) {
      const hookConfigs = settings.hooks.UserPromptSubmit;
      for (const config of hookConfigs) {
        if (config.hooks) {
          for (const hook of config.hooks) {
            if (isAnalyzePromptCommand(hook.command)) {
              hasAnalyzeHook = true;
              analyzeCommand = hook.command;
              break;
            }
          }
        }
        if (hasAnalyzeHook) break;
      }
    }

    // Check for statusLine configuration
    let hasStatusLine = false;
    let statuslineCommand: string | undefined;
    
    if (settings.statusLine?.command) {
      if (isStatuslineCommand(settings.statusLine.command)) {
        hasStatusLine = true;
        statuslineCommand = settings.statusLine.command;
      }
    }

    // Determine overall state
    let state: StatusLineState;
    if (hasAnalyzeHook && hasStatusLine) {
      state = 'FULLY_INSTALLED';
    } else if (hasAnalyzeHook || hasStatusLine) {
      state = 'PARTIALLY_INSTALLED';
    } else {
      state = 'NOT_INSTALLED';
    }

    return {
      state,
      hasAnalyzeHook,
      hasStatusLine,
      analyzeCommand,
      statuslineCommand
    };
  } catch (error) {
    logger.error('Failed to detect status line state:', error);
    return {
      state: 'NOT_INSTALLED',
      hasAnalyzeHook: false,
      hasStatusLine: false
    };
  }
}

/**
 * Install status line components (both hook and display together)
 */
export async function installStatusLine(): Promise<void> {
  try {
    const settings = await readGlobalSettings() || {};
    
    // Initialize hooks object if it doesn't exist
    if (!settings.hooks) {
      settings.hooks = {};
    }

    // Install UserPromptSubmit hook for analyze-prompt
    const analyzeCommand = buildAnalyzePromptCommand();
    
    // Initialize UserPromptSubmit if it doesn't exist
    if (!settings.hooks.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = [];
    }

    // Check if our hook is already installed
    let hasOurHook = false;
    for (const config of settings.hooks.UserPromptSubmit) {
      if (config.hooks) {
        for (const hook of config.hooks) {
          if (isAnalyzePromptCommand(hook.command)) {
            hasOurHook = true;
            // Update command path if needed
            hook.command = analyzeCommand;
            hook.timeout = 5; // Ensure timeout is set
            break;
          }
        }
      }
      if (hasOurHook) break;
    }

    // Add our hook if not present
    if (!hasOurHook) {
      settings.hooks.UserPromptSubmit.push({
        hooks: [{
          type: 'command',
          command: analyzeCommand,
          timeout: 5  // 5 second timeout for analysis
        }]
      });
    }

    // Install statusLine configuration
    const statuslineCommand = buildStatuslineCommand();
    settings.statusLine = {
      type: 'command',
      command: statuslineCommand,
      padding: 0
    };

    // Write updated settings
    await writeGlobalSettings(settings);
    
    logger.info('Status line installed successfully');
  } catch (error) {
    logger.error('Failed to install status line:', error);
    throw new Error(`Failed to install status line: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Uninstall status line components (both hook and display together)
 */
export async function uninstallStatusLine(): Promise<void> {
  try {
    const settings = await readGlobalSettings();
    if (!settings) return;

    // Remove UserPromptSubmit hook
    if (settings.hooks?.UserPromptSubmit) {
      // Filter out our analyze-prompt hook
      settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter((config: any) => {
        if (config.hooks) {
          // Keep only hooks that are NOT our analyze-prompt command
          config.hooks = config.hooks.filter((hook: any) => !isAnalyzePromptCommand(hook.command));
          return config.hooks.length > 0;
        }
        return true;
      });

      // Remove UserPromptSubmit entirely if no hooks left
      if (settings.hooks.UserPromptSubmit.length === 0) {
        delete settings.hooks.UserPromptSubmit;
      }
    }

    // Remove statusLine configuration if it's ours
    if (settings.statusLine?.command && isStatuslineCommand(settings.statusLine.command)) {
      delete settings.statusLine;
    }

    // Write updated settings
    await writeGlobalSettings(settings);
    
    logger.info('Status line uninstalled successfully');
  } catch (error) {
    logger.error('Failed to uninstall status line:', error);
    throw new Error(`Failed to uninstall status line: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get status line statistics (for display purposes)
 */
export async function getStatusLineStats(): Promise<{
  analysisCount: number;
  lastAnalysis?: Date;
  averageScore?: number;
}> {
  try {
    const analysisDir = path.join(process.env.HOME || '', '.vibe-log', 'analyzed-prompts');
    const files = await fs.readdir(analysisDir).catch(() => []);
    
    // Filter JSON files (excluding latest.json symlink)
    const analysisFiles = files.filter(f => f.endsWith('.json') && f !== 'latest.json');
    
    if (analysisFiles.length === 0) {
      return { analysisCount: 0 };
    }

    // Get stats from latest file
    let lastAnalysis: Date | undefined;
    let totalScore = 0;
    let validScores = 0;

    for (const file of analysisFiles.slice(-10)) { // Check last 10 files for stats
      try {
        const content = await fs.readFile(path.join(analysisDir, file), 'utf8');
        const analysis = JSON.parse(content);
        
        if (analysis.timestamp) {
          const date = new Date(analysis.timestamp);
          if (!lastAnalysis || date > lastAnalysis) {
            lastAnalysis = date;
          }
        }
        
        if (typeof analysis.score === 'number') {
          totalScore += analysis.score;
          validScores++;
        }
      } catch {
        // Skip invalid files
      }
    }

    return {
      analysisCount: analysisFiles.length,
      lastAnalysis,
      averageScore: validScores > 0 ? Math.round(totalScore / validScores) : undefined
    };
  } catch (error) {
    logger.error('Failed to get status line stats:', error);
    return { analysisCount: 0 };
  }
}