import Conf from 'conf';
import crypto from 'crypto';
import { homedir } from 'os';
import { join } from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

export interface ProjectSyncData {
  oldestSyncedTimestamp?: string;
  newestSyncedTimestamp?: string;
  lastSyncTime?: string;
  projectName?: string;
  sessionCount?: number;
}

interface ConfigSchema {
  apiUrl: string;
  cliPath?: string;
  token?: string;
  lastSync?: string;
  preferences?: {
    colorScheme?: 'default' | 'minimal';
    verboseOutput?: boolean;
  };
  // PROJECT TRACKING REMOVED - Now handled by hooks in Claude settings
  projectSyncData?: {
    [claudeFolderName: string]: ProjectSyncData;
  };
  lastSyncSummary?: {
    timestamp: string;
    description: string;
  };
}

const config = new Conf<ConfigSchema>({
  projectName: 'vibe-log',
  cwd: join(homedir(), '.vibe-log'), // Store config in ~/.vibe-log instead of default location
  schema: {
    apiUrl: {
      type: 'string',
      default: 'https://app.vibe-log.dev',
    },
    cliPath: {
      type: 'string',
      default: 'npx vibe-log-cli',
    },
    token: {
      type: 'string',
    },
    lastSync: {
      type: 'string',
    },
    preferences: {
      type: 'object',
      properties: {
        colorScheme: {
          type: 'string',
          enum: ['default', 'minimal'],
          default: 'default',
        },
        verboseOutput: {
          type: 'boolean',
          default: false,
        },
      },
    },
    // PROJECT TRACKING REMOVED - Now handled by hooks in Claude settings
  },
});

// Secure key management
const KEY_FILE = join(homedir(), '.vibe-log', '.key');
const algorithm = 'aes-256-gcm';

async function getOrCreateKey(): Promise<Buffer> {
  try {
    const keyData = await fs.readFile(KEY_FILE);
    return Buffer.from(keyData.toString(), 'hex');
  } catch (error) {
    // Generate new key if doesn't exist
    const key = crypto.randomBytes(32);
    await fs.mkdir(join(homedir(), '.vibe-log'), { recursive: true });
    // Apply Unix file permissions only on non-Windows platforms
    const writeOptions = process.platform !== 'win32' ? { mode: 0o600 } : {};
    await fs.writeFile(KEY_FILE, key.toString('hex'), writeOptions);
    return key;
  }
}

async function encrypt(text: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

async function decrypt(encryptedData: string): Promise<string> {
  const key = await getOrCreateKey();
  
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export async function storeToken(token: string): Promise<void> {
  // Validate token format
  if (!token || typeof token !== 'string' || token.length < 10) {
    throw new Error('Invalid token format');
  }
  
  const encrypted = await encrypt(token);
  config.set('token', encrypted);
}

export async function getToken(): Promise<string | null> {
  const encrypted = config.get('token');
  if (!encrypted) return null;
  
  try {
    return await decrypt(encrypted);
  } catch (error) {
    // Log security event without exposing details
    console.error('Token decryption failed. Re-authentication required.');
    return null;
  }
}

export async function clearToken(): Promise<void> {
  config.delete('token');
}

export function getApiUrl(): string {
  const envUrl = process.env.VIBELOG_API_URL;
  const configUrl = config.get('apiUrl');
  const url = envUrl || configUrl;
  
  logger.debug('API URL Configuration', {
    envUrl: envUrl || '(not set)',
    configUrl: configUrl || '(default)',
    selectedUrl: url
  });
  
  // Validate URL
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Invalid protocol');
    }
    
    // Allow localhost for development
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return url;
    }
    
    // Only allow *.vibe-log.dev domains in production
    if (!parsed.hostname.endsWith('vibe-log.dev')) {
      throw new Error(`Invalid API host: ${parsed.hostname}. Only *.vibe-log.dev domains allowed.`);
    }
    
    return url;
  } catch (error) {
    throw new Error(`Invalid API URL: ${url}`);
  }
}

export function getDashboardUrl(): string {
  const apiUrl = getApiUrl();
  
  try {
    const parsed = new URL(apiUrl);
    
    // Special handling for production API
    if (parsed.hostname === 'vibe-log.dev' || parsed.hostname === 'www.vibe-log.dev') {
      // Production API uses app subdomain for dashboard
      return `${parsed.protocol}//app.vibe-log.dev/dashboard`;
    }
    
    // For all other URLs (localhost, staging, etc.), append /dashboard
    // Remove trailing slash from API URL if present
    const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    return `${baseUrl}/dashboard`;
  } catch (error) {
    // Fallback to production dashboard if URL parsing fails
    return 'https://app.vibe-log.dev/dashboard';
  }
}

export function setApiUrl(url: string): void {
  // Validate URL before storing
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Only HTTP(S) protocols are allowed');
    }
    config.set('apiUrl', url);
  } catch (error) {
    throw new Error('Invalid API URL format');
  }
}

export function getCliPath(): string {
  // Check environment variable first for override
  const envPath = process.env.VIBELOG_CLI_PATH;
  if (envPath) {
    return envPath;
  }
  
  // Use configured path or default to npx command
  return config.get('cliPath') || 'npx vibe-log-cli';
}

export function setCliPath(path: string): void {
  config.set('cliPath', path);
}

export function getLastSync(): Date | null {
  const lastSync = config.get('lastSync');
  if (!lastSync) return null;
  
  try {
    const date = new Date(lastSync);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch {
    return null;
  }
}

export function setLastSync(date: Date): void {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }
  config.set('lastSync', date.toISOString());
}

export function getPreferences(): ConfigSchema['preferences'] {
  return config.get('preferences') || {};
}

export function setPreference<K extends keyof NonNullable<ConfigSchema['preferences']>>(
  key: K,
  value: NonNullable<ConfigSchema['preferences']>[K]
): void {
  const preferences = getPreferences() || {};
  
  // Validate preference values
  if (key === 'colorScheme' && !['default', 'minimal'].includes(value as string)) {
    throw new Error('Invalid color scheme');
  }
  if (key === 'verboseOutput' && typeof value !== 'boolean') {
    throw new Error('Invalid verbose output value');
  }
  
  preferences[key] = value;
  config.set('preferences', preferences);
}

// PROJECT TRACKING REMOVED - Now handled by hooks in Claude settings files
// The source of truth for project tracking is now:
// - Global hooks in ~/.claude/settings.json (for 'all' mode)
// - Project-specific hooks in project/.claude/settings.local.json (for 'selected' mode)
// Use getHookMode() and getTrackedProjects() from claude-settings-reader.ts instead

export function getAllConfig(): ConfigSchema {
  // Only return config if the file actually exists
  // This prevents default values from being treated as configured state
  const configPath = join(homedir(), '.vibe-log', 'config.json');
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').accessSync(configPath);
    // Config file exists, return actual values
    return {
      apiUrl: config.get('apiUrl'),
      token: config.get('token') ? '<redacted>' : undefined,
      lastSync: config.get('lastSync'),
      preferences: config.get('preferences'),
      projectSyncData: config.get('projectSyncData'),
      lastSyncSummary: config.get('lastSyncSummary'),
    };
  } catch {
    // Config file doesn't exist, return empty object
    return {} as ConfigSchema;
  }
}

// Project sync data management
export function getProjectSyncData(claudeFolderName: string): ProjectSyncData | undefined {
  const projectData = config.get('projectSyncData') || {};
  return projectData[claudeFolderName];
}

export function setProjectSyncData(claudeFolderName: string, data: ProjectSyncData): void {
  const projectData = config.get('projectSyncData') || {};
  projectData[claudeFolderName] = data;
  config.set('projectSyncData', projectData);
}

export function updateProjectSyncBoundaries(
  claudeFolderName: string, 
  oldestTimestamp: string | undefined,
  newestTimestamp: string | undefined,
  projectName?: string,
  sessionCount?: number
): void {
  const existing = getProjectSyncData(claudeFolderName) || {};
  
  const updated: ProjectSyncData = {
    ...existing,
    lastSyncTime: new Date().toISOString(),
    projectName: projectName || existing.projectName,
    sessionCount: sessionCount !== undefined ? sessionCount : existing.sessionCount
  };
  
  // Update oldest boundary
  if (oldestTimestamp) {
    if (!existing.oldestSyncedTimestamp || oldestTimestamp < existing.oldestSyncedTimestamp) {
      updated.oldestSyncedTimestamp = oldestTimestamp;
    }
  }
  
  // Update newest boundary
  if (newestTimestamp) {
    if (!existing.newestSyncedTimestamp || newestTimestamp > existing.newestSyncedTimestamp) {
      updated.newestSyncedTimestamp = newestTimestamp;
    }
  }
  
  setProjectSyncData(claudeFolderName, updated);
}

export function setLastSyncSummary(description: string): void {
  config.set('lastSyncSummary', {
    timestamp: new Date().toISOString(),
    description
  });
  // Also update legacy lastSync for compatibility
  config.set('lastSync', new Date().toISOString());
}

export function getLastSyncSummary(): { timestamp: string; description: string } | undefined {
  return config.get('lastSyncSummary');
}

export function getConfigValue(key: keyof ConfigSchema): any {
  if (key === 'token') {
    return config.get('token') ? '<redacted>' : undefined;
  }
  return config.get(key);
}

export async function clearAllConfig(): Promise<void> {
  config.clear();
  // Also remove encryption key
  try {
    await fs.unlink(KEY_FILE);
  } catch {
    // Ignore if key doesn't exist
  }
}

export function getConfigPath(): string {
  return config.path;
}