/**
 * Unified Claude Settings Manager
 * 
 * Single source of truth for ALL vibe-log modifications to Claude settings.
 * Manages hooks and UI configurations as feature units to ensure consistency
 * and prevent conflicts or duplicates.
 */

import { 
  readGlobalSettings, 
  writeGlobalSettings,
  readProjectLocalSettings,
  ClaudeSettings
} from './claude-settings-reader';
import { getCliPath } from './config';
import { logger } from '../utils/logger';

/**
 * Feature status information
 */
export interface StatusLineFeatureStatus {
  installed: boolean;
  hookInstalled: boolean;
  displayInstalled: boolean;
  isComplete: boolean;
  cliPath?: string;
}

export interface AutoSyncFeatureStatus {
  sessionStartInstalled: boolean;
  preCompactInstalled: boolean;
  mode?: 'all' | 'selected';
  trackedProjects?: string[];
}

export interface FeatureStatus {
  statusLine: StatusLineFeatureStatus;
  autoSync: AutoSyncFeatureStatus;
}

/**
 * Configuration for installing features
 */
export interface StatusLineConfig {
  cliPath?: string; // Optional, will use default if not provided
}

export interface AutoSyncConfig {
  installSessionStart?: boolean;
  installPreCompact?: boolean;
  mode?: 'all' | 'selected';
  projectPath?: string; // For project-specific installation
  cliPath?: string;
}

/**
 * Centralized manager for all vibe-log Claude settings modifications
 */
export class ClaudeSettingsManager {
  
  /**
   * Core detection logic - CRITICAL for preventing duplicates
   * This must detect ALL vibe-log related commands regardless of CLI path format
   * Currently not used but kept for future reference
   */
  /*
  private isVibeLogCommand(command: string | undefined): boolean {
    if (!command) return false;
    
    // Robust detection that works with any CLI path format
    // These patterns identify vibe-log commands regardless of how they're invoked
    const vibelogIndicators = [
      'analyze-prompt',        // Status line analysis hook
      'statusline',           // Status line display command
      'send --silent',        // Auto-sync hooks
      'send --background',    // Auto-sync hooks
      '--hook-trigger',       // Auto-sync hook marker
      'vibe-log',            // Generic vibe-log commands
      'vibelog-cli',         // NPX package name
      '@vibe-log'            // Possible future package scope
    ];
    
    return vibelogIndicators.some(indicator => command.includes(indicator));
  }
  */
  
  /**
   * Check if a command is specifically the analyze-prompt hook
   */
  private isAnalyzePromptCommand(command: string | undefined): boolean {
    if (!command) return false;
    return command.includes('analyze-prompt') && 
           command.includes('--silent') && 
           command.includes('--stdin');
  }
  
  /**
   * Check if a command is specifically the statusline display command
   */
  private isStatuslineCommand(command: string | undefined): boolean {
    if (!command) return false;
    return command.includes('statusline') && !command.includes('--');
  }
  
  /**
   * Check if a command is an auto-sync hook (SessionStart or PreCompact)
   */
  private isAutoSyncCommand(command: string | undefined): boolean {
    if (!command) return false;
    return command.includes('send') && 
           command.includes('--silent') && 
           command.includes('--background') &&
           command.includes('--hook-trigger');
  }
  
  /**
   * Install the Status Line feature (UserPromptSubmit hook + statusLine display)
   * These must be installed together as they're useless separately
   */
  async installStatusLineFeature(config?: StatusLineConfig): Promise<void> {
    logger.info('Installing status line feature');
    
    const cliPath = config?.cliPath || getCliPath();
    const settings = await readGlobalSettings() || { hooks: {} };
    
    // 1. Remove any existing status line components to prevent duplicates
    this.removeStatusLineComponents(settings);
    
    // 2. Install UserPromptSubmit hook for analysis
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
    
    const analyzeCommand = `${cliPath} analyze-prompt --silent --stdin`;
    settings.hooks.UserPromptSubmit.push({
      hooks: [{
        type: 'command',
        command: analyzeCommand,
        timeout: 5
      }]
    });
    
    logger.debug(`Added UserPromptSubmit hook: ${analyzeCommand}`);
    
    // 3. Install statusLine display configuration
    const statuslineCommand = `${cliPath} statusline`;
    settings.statusLine = {
      type: 'command',
      command: statuslineCommand,
      padding: 0
    };
    
    logger.debug(`Added statusLine config: ${statuslineCommand}`);
    
    // 4. Save settings
    await writeGlobalSettings(settings);
    logger.info('Status line feature installed successfully');
  }
  
  /**
   * Remove the Status Line feature completely
   */
  async removeStatusLineFeature(): Promise<void> {
    logger.info('Removing status line feature');
    
    const settings = await readGlobalSettings();
    if (!settings) return;
    
    this.removeStatusLineComponents(settings);
    
    await writeGlobalSettings(settings);
    logger.info('Status line feature removed successfully');
  }
  
  /**
   * Helper to remove status line components from settings object
   */
  private removeStatusLineComponents(settings: ClaudeSettings): void {
    // Remove UserPromptSubmit hooks that are vibe-log analyze-prompt
    if (settings.hooks?.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter((config: any) => {
        if (!config.hooks) return true; // Keep configs without hooks array
        
        // Filter out vibe-log analyze-prompt hooks
        config.hooks = config.hooks.filter((hook: any) => 
          !this.isAnalyzePromptCommand(hook.command)
        );
        
        // Keep config only if it still has hooks
        return config.hooks.length > 0;
      });
      
      // Remove UserPromptSubmit entirely if empty
      if (settings.hooks.UserPromptSubmit.length === 0) {
        delete settings.hooks.UserPromptSubmit;
      }
    }
    
    // Remove statusLine display if it's ours
    if (settings.statusLine?.command && this.isStatuslineCommand(settings.statusLine.command)) {
      delete settings.statusLine;
    }
  }
  
  /**
   * Install Auto-Sync hooks (SessionStart and/or PreCompact)
   */
  async installAutoSyncHooks(config: AutoSyncConfig): Promise<void> {
    logger.info(`Installing auto-sync hooks: ${JSON.stringify(config)}`);
    
    const cliPath = config.cliPath || getCliPath();
    
    // Determine target settings (global or project)
    let settings: ClaudeSettings | null;
    if (config.projectPath && config.mode === 'selected') {
      settings = await readProjectLocalSettings(config.projectPath) || { hooks: {} };
    } else {
      settings = await readGlobalSettings() || { hooks: {} };
    }
    
    if (!settings.hooks) settings.hooks = {};
    
    // Install SessionStart hook if requested
    if (config.installSessionStart) {
      if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
      
      // Remove existing vibe-log SessionStart hooks
      this.removeAutoSyncHook(settings, 'SessionStart');
      
      const command = this.buildAutoSyncCommand(cliPath, 'sessionstart', config.mode);
      settings.hooks.SessionStart.push({
        matcher: 'startup|clear',
        hooks: [{
          type: 'command',
          command
        }]
      });
      
      logger.debug(`Added SessionStart hook: ${command}`);
    }
    
    // Install PreCompact hook if requested
    if (config.installPreCompact) {
      if (!settings.hooks.PreCompact) settings.hooks.PreCompact = [];
      
      // Remove existing vibe-log PreCompact hooks
      this.removeAutoSyncHook(settings, 'PreCompact');
      
      const command = this.buildAutoSyncCommand(cliPath, 'precompact', config.mode);
      settings.hooks.PreCompact.push({
        matcher: 'auto',
        hooks: [{
          type: 'command',
          command
        }]
      });
      
      logger.debug(`Added PreCompact hook: ${command}`);
    }
    
    // Save to appropriate location
    if (config.projectPath && config.mode === 'selected') {
      // For project-specific settings, we need to write to the project's local settings file
      // Since writeProjectLocalSettings doesn't exist, we'll use writeGlobalSettings for now
      // TODO: Implement project-specific settings writing when needed
      logger.warn('Project-specific hooks not fully implemented yet');
      await writeGlobalSettings(settings);
    } else {
      await writeGlobalSettings(settings);
    }
    
    logger.info('Auto-sync hooks installed successfully');
  }
  
  /**
   * Build auto-sync command string
   */
  private buildAutoSyncCommand(cliPath: string, trigger: string, mode?: 'all' | 'selected'): string {
    if (mode === 'all') {
      return `${cliPath} send --silent --background --hook-trigger=${trigger} --hook-version=2.0.0 --all`;
    }
    // Default or selected mode uses project directory variable
    return `${cliPath} send --silent --background --hook-trigger=${trigger} --hook-version=2.0.0 --claude-project-dir="$CLAUDE_PROJECT_DIR"`;
  }
  
  /**
   * Remove specific auto-sync hook type
   */
  private removeAutoSyncHook(settings: ClaudeSettings, type: 'SessionStart' | 'PreCompact'): void {
    const hooks = settings.hooks?.[type];
    if (!hooks) return;
    
    // Filter out vibe-log auto-sync hooks
    settings.hooks![type] = hooks.filter(config => {
      if (!config.hooks) return true;
      
      config.hooks = config.hooks.filter(hook => 
        !this.isAutoSyncCommand(hook.command)
      );
      
      return config.hooks.length > 0;
    });
    
    // Remove entirely if empty
    if (settings.hooks![type]!.length === 0) {
      delete settings.hooks![type];
    }
  }
  
  /**
   * Remove ALL vibe-log hooks and configurations
   */
  async removeAllVibeLogSettings(): Promise<void> {
    logger.info('Removing all vibe-log settings');
    
    const settings = await readGlobalSettings();
    if (!settings) return;
    
    // Remove status line components
    this.removeStatusLineComponents(settings);
    
    // Remove auto-sync hooks
    this.removeAutoSyncHook(settings, 'SessionStart');
    this.removeAutoSyncHook(settings, 'PreCompact');
    
    await writeGlobalSettings(settings);
    logger.info('All vibe-log settings removed successfully');
  }
  
  /**
   * Get comprehensive status of all vibe-log features
   */
  async getFeatureStatus(): Promise<FeatureStatus> {
    const settings = await readGlobalSettings();
    
    return {
      statusLine: this.getStatusLineStatus(settings),
      autoSync: this.getAutoSyncStatus(settings)
    };
  }
  
  /**
   * Get status line feature status
   */
  private getStatusLineStatus(settings: ClaudeSettings | null): StatusLineFeatureStatus {
    const hookInstalled = this.hasAnalyzePromptHook(settings);
    const displayInstalled = this.hasStatusLineDisplay(settings);
    
    return {
      installed: hookInstalled && displayInstalled,
      hookInstalled,
      displayInstalled,
      isComplete: hookInstalled && displayInstalled,
      cliPath: this.extractCliPath(settings)
    };
  }
  
  /**
   * Get auto-sync feature status
   */
  private getAutoSyncStatus(settings: ClaudeSettings | null): AutoSyncFeatureStatus {
    return {
      sessionStartInstalled: this.hasSessionStartHook(settings),
      preCompactInstalled: this.hasPreCompactHook(settings),
      mode: this.detectAutoSyncMode(settings)
    };
  }
  
  /**
   * Check if analyze-prompt hook is installed
   */
  private hasAnalyzePromptHook(settings: ClaudeSettings | null): boolean {
    if (!settings?.hooks?.UserPromptSubmit) return false;
    
    return settings.hooks.UserPromptSubmit.some((config: any) =>
      config.hooks?.some((hook: any) => this.isAnalyzePromptCommand(hook.command))
    );
  }
  
  /**
   * Check if statusLine display is configured
   */
  private hasStatusLineDisplay(settings: ClaudeSettings | null): boolean {
    return !!(settings?.statusLine?.command && 
              this.isStatuslineCommand(settings.statusLine.command));
  }
  
  /**
   * Check if SessionStart hook is installed
   */
  private hasSessionStartHook(settings: ClaudeSettings | null): boolean {
    if (!settings?.hooks?.SessionStart) return false;
    
    return settings.hooks.SessionStart.some(config =>
      config.hooks?.some(hook => this.isAutoSyncCommand(hook.command))
    );
  }
  
  /**
   * Check if PreCompact hook is installed
   */
  private hasPreCompactHook(settings: ClaudeSettings | null): boolean {
    if (!settings?.hooks?.PreCompact) return false;
    
    return settings.hooks.PreCompact.some(config =>
      config.hooks?.some(hook => this.isAutoSyncCommand(hook.command))
    );
  }
  
  /**
   * Detect auto-sync mode from hook commands
   */
  private detectAutoSyncMode(settings: ClaudeSettings | null): 'all' | 'selected' | undefined {
    const hooks = [
      ...(settings?.hooks?.SessionStart || []),
      ...(settings?.hooks?.PreCompact || [])
    ];
    
    for (const config of hooks) {
      for (const hook of config.hooks || []) {
        if (hook.command?.includes('--all')) return 'all';
        if (hook.command?.includes('--claude-project-dir')) return 'selected';
      }
    }
    
    return undefined;
  }
  
  /**
   * Extract CLI path from existing commands
   */
  private extractCliPath(settings: ClaudeSettings | null): string | undefined {
    // Try to extract from statusLine command
    if (settings?.statusLine?.command) {
      const match = settings.statusLine.command.match(/^(.*?) statusline/);
      if (match) return match[1];
    }
    
    // Try UserPromptSubmit hooks
    if (settings?.hooks?.UserPromptSubmit) {
      for (const config of settings.hooks.UserPromptSubmit) {
        for (const hook of config.hooks || []) {
          if (hook.command?.includes('analyze-prompt')) {
            const match = hook.command.match(/^(.*?) analyze-prompt/);
            if (match) return match[1];
          }
        }
      }
    }
    
    return undefined;
  }
  
  /**
   * Update CLI path for all vibe-log commands
   * Useful when switching between development and production
   */
  async updateCliPath(newCliPath: string): Promise<void> {
    logger.info(`Updating CLI path for all vibe-log commands: ${newCliPath}`);
    
    const settings = await readGlobalSettings();
    if (!settings) return;
    
    // Update UserPromptSubmit hooks
    if (settings.hooks?.UserPromptSubmit) {
      for (const config of settings.hooks.UserPromptSubmit) {
        for (const hook of config.hooks || []) {
          if (this.isAnalyzePromptCommand(hook.command)) {
            hook.command = `${newCliPath} analyze-prompt --silent --stdin`;
          }
        }
      }
    }
    
    // Update statusLine
    if (settings.statusLine?.command && this.isStatuslineCommand(settings.statusLine.command)) {
      settings.statusLine.command = `${newCliPath} statusline`;
    }
    
    // Update SessionStart hooks
    if (settings.hooks?.SessionStart) {
      for (const config of settings.hooks.SessionStart) {
        for (const hook of config.hooks || []) {
          if (this.isAutoSyncCommand(hook.command)) {
            const mode = hook.command.includes('--all') ? 'all' : 'selected';
            hook.command = this.buildAutoSyncCommand(newCliPath, 'sessionstart', mode);
          }
        }
      }
    }
    
    // Update PreCompact hooks
    if (settings.hooks?.PreCompact) {
      for (const config of settings.hooks.PreCompact) {
        for (const hook of config.hooks || []) {
          if (this.isAutoSyncCommand(hook.command)) {
            const mode = hook.command.includes('--all') ? 'all' : 'selected';
            hook.command = this.buildAutoSyncCommand(newCliPath, 'precompact', mode);
          }
        }
      }
    }
    
    await writeGlobalSettings(settings);
    logger.info('CLI path updated successfully');
  }
}

// Export singleton instance
export const claudeSettingsManager = new ClaudeSettingsManager();