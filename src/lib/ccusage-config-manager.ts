/**
 * CCUsage Configuration Manager
 * Manages the integration of ccusage metrics with vibe-log statusline
 */

import { logger } from '../utils/logger';
import { readGlobalSettings, writeGlobalSettings } from './claude-settings-reader';

export interface CCUsageConfig {
  enabled: boolean;
  lastChecked?: Date;
  version?: string;
}

/**
 * Get the current ccusage configuration
 */
export async function getCCUsageConfig(): Promise<CCUsageConfig> {
  try {
    const settings = await readGlobalSettings();
    
    // Check if ccusage is enabled in the statusline command
    const statusLineCommand = settings?.statusLine?.command || '';
    const isEnabled = statusLineCommand.includes('--with-usage');
    
    return {
      enabled: isEnabled,
      lastChecked: new Date()
    };
  } catch (error) {
    logger.error('Error getting ccusage config:', error);
    return {
      enabled: false
    };
  }
}

/**
 * Enable ccusage integration
 */
export async function enableCCUsage(): Promise<void> {
  try {
    logger.debug('Enabling ccusage integration');
    
    const settings = await readGlobalSettings();
    if (!settings) {
      throw new Error('No settings found');
    }
    
    // Update the statusline command to include --with-usage
    if (settings.statusLine?.command) {
      const baseCommand = settings.statusLine.command.replace(/ --with-usage.*$/, '');
      settings.statusLine.command = `${baseCommand} --with-usage`;
      
      await writeGlobalSettings(settings);
      logger.debug('ccusage integration enabled');
    } else {
      throw new Error('Status line not installed');
    }
  } catch (error) {
    logger.error('Error enabling ccusage:', error);
    throw new Error(`Failed to enable ccusage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Disable ccusage integration
 */
export async function disableCCUsage(): Promise<void> {
  try {
    logger.debug('Disabling ccusage integration');
    
    const settings = await readGlobalSettings();
    if (!settings) {
      throw new Error('No settings found');
    }
    
    // Remove --with-usage flag from statusline command
    if (settings.statusLine?.command) {
      settings.statusLine.command = settings.statusLine.command.replace(/ --with-usage.*$/, '');
      
      await writeGlobalSettings(settings);
      logger.debug('ccusage integration disabled');
    }
  } catch (error) {
    logger.error('Error disabling ccusage:', error);
    throw new Error(`Failed to disable ccusage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

