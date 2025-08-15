import chalk from 'chalk';
import {
  getAllConfig,
  getConfigValue,
  setApiUrl,
  setPreference,
  getConfigPath,
  getCliPath,
  setCliPath,
} from '../lib/config';
import { showSuccess, showInfo } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { validateUrl } from '../lib/input-validator';

interface ConfigOptions {
  list?: boolean;
  set?: string;
  get?: string;
}

export async function config(options: ConfigOptions): Promise<void> {
  if (options.list) {
    // List all configuration
    const allConfig = getAllConfig();
    
    console.log(chalk.cyan('\n⚙️  vibe-log Configuration'));
    console.log(chalk.gray('═══════════════════════════════\n'));
    
    console.log(chalk.cyan('Config File:'), getConfigPath());
    console.log(chalk.cyan('API URL:'), allConfig.apiUrl);
    console.log(chalk.cyan('CLI Path:'), getCliPath());
    console.log(chalk.cyan('Token:'), allConfig.token ? '<redacted>' : chalk.gray('Not set'));
    console.log(chalk.cyan('Last Sync:'), allConfig.lastSync || chalk.gray('Never'));
    
    if (allConfig.preferences) {
      console.log(chalk.cyan('\nPreferences:'));
      Object.entries(allConfig.preferences).forEach(([key, value]) => {
        console.log(`  ${chalk.gray(key)}:`, value);
      });
    }
    
    return;
  }
  
  if (options.get) {
    // Get specific configuration value
    const validKeys = ['apiUrl', 'token', 'lastSync', 'preferences'];
    
    if (!validKeys.includes(options.get)) {
      throw new VibelogError(
        `Invalid configuration key. Valid keys: ${validKeys.join(', ')}`,
        'INVALID_CONFIG_KEY'
      );
    }
    
    const value = getConfigValue(options.get as any);
    
    if (value === undefined) {
      showInfo(`${options.get}: Not set`);
    } else if (typeof value === 'object') {
      console.log(`${options.get}:`, JSON.stringify(value, null, 2));
    } else {
      console.log(`${options.get}: ${value}`);
    }
    
    return;
  }
  
  if (options.set) {
    // Set configuration value
    const [key, ...valueParts] = options.set.split('=');
    const value = valueParts.join('=');
    
    if (!key || !value) {
      throw new VibelogError(
        'Invalid format. Use: --set key=value',
        'INVALID_FORMAT'
      );
    }
    
    switch (key) {
      case 'apiUrl':
        // Validate URL using secure validator
        const validatedUrl = validateUrl(value);
        setApiUrl(validatedUrl);
        showSuccess(`API URL set to: ${validatedUrl}`);
        break;
        
      case 'preferences.colorScheme':
        if (!['default', 'minimal'].includes(value)) {
          throw new VibelogError(
            'Invalid color scheme. Use: default or minimal',
            'INVALID_VALUE'
          );
        }
        setPreference('colorScheme', value as 'default' | 'minimal');
        showSuccess(`Color scheme set to: ${value}`);
        break;
        
      case 'preferences.verboseOutput':
        const boolValue = value.toLowerCase() === 'true';
        setPreference('verboseOutput', boolValue);
        showSuccess(`Verbose output set to: ${boolValue}`);
        break;
        
      case 'cliPath':
        setCliPath(value);
        showSuccess(`CLI path set to: ${value}`);
        showInfo('Remember to reinstall hooks after changing the CLI path');
        break;
        
      default:
        throw new VibelogError(
          `Cannot set '${key}'. Configurable keys: apiUrl, cliPath, preferences.colorScheme, preferences.verboseOutput`,
          'INVALID_CONFIG_KEY'
        );
    }
    
    return;
  }
  
  // No options provided, show help
  console.log(chalk.cyan('\n⚙️  vibe-log Configuration'));
  console.log(chalk.gray('\nUsage:'));
  console.log('  vibe-log config --list              List all configuration');
  console.log('  vibe-log config --get <key>         Get a configuration value');
  console.log('  vibe-log config --set <key=value>   Set a configuration value');
  console.log(chalk.gray('\nExamples:'));
  console.log('  vibe-log config --list');
  console.log('  vibe-log config --get apiUrl');
  console.log('  vibe-log config --set apiUrl=https://api.vibe-log.dev');
  console.log('  vibe-log config --set cliPath="/path/to/vibe-log.js"');
  console.log('  vibe-log config --set preferences.colorScheme=minimal');
}