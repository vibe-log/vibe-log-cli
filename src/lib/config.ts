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

export interface PushUpPendingPrompt {
  timestamp: string;
  amount: number;
  phrase: string;
}

export interface ValidationDetection {
  phrase: string;
  timestamp: string; // ISO date string
  source: 'claude' | 'cursor';
  pushUpsAdded: number;
}

export interface PushUpChallengeConfig {
  enabled: boolean;
  cursorIntegrationEnabled?: boolean; // Enable/disable Cursor IDE validation tracking
  pushUpsPerTrigger: number;
  totalDebt: number;
  totalCompleted: number;
  streakDays: number;
  lastCompletedDate?: string;
  enabledDate?: string;
  todayDebt: number;
  todayCompleted: number;
  lastResetDate?: string;
  // Cursor IDE tracking
  lastCursorMessageTimestamp?: number; // Unix timestamp in milliseconds
  lastCursorCheckDate?: string;
  // Validation history (for Claude Code stats - Cursor calculates from database directly)
  validationHistory?: ValidationDetection[];
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
  statusLine?: {
    personality: 'gordon' | 'vibe-log' | 'custom';
    customPersonality?: {
      name: string;
      description: string;
      templates?: {
        poor: string;      // Template for 0-40
        fair: string;      // Template for 41-60
        good: string;      // Template for 61-80
        excellent: string; // Template for 81-100
      };
    };
  };
  statusLineBackup?: {
    originalCommand?: string;
    originalType?: string;
    originalPadding?: number;
    backupDate: string;
    backupReason?: string; // Why it was backed up (e.g., "Replaced by vibe-log status line")
  };
  pushUpChallenge?: PushUpChallengeConfig;
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
      default: 'npx vibe-log-cli@latest',
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
  return config.get('cliPath') || 'npx vibe-log-cli@latest';
}

export function setCliPath(path: string): void {
  config.set('cliPath', path);
}

export function getStatusLinePersonality(): NonNullable<ConfigSchema['statusLine']> {
  const statusLine = config.get('statusLine');
  // Default to 'gordon' personality for new installations
  if (!statusLine) {
    return { personality: 'gordon' };
  }
  return statusLine;
}

export function setStatusLinePersonality(personality: 'gordon' | 'vibe-log' | 'custom'): void {
  const current = config.get('statusLine') || {};
  config.set('statusLine', {
    ...current,
    personality
  });
}

export function setCustomPersonality(customPersonality: NonNullable<ConfigSchema['statusLine']>['customPersonality']): void {
  const current = config.get('statusLine') || {};
  config.set('statusLine', {
    ...current,
    personality: 'custom',
    customPersonality
  });
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

// Status line backup management functions
export function saveStatusLineBackup(backup: {
  originalCommand?: string;
  originalType?: string;
  originalPadding?: number;
  backupReason?: string;
}): void {
  config.set('statusLineBackup', {
    ...backup,
    backupDate: new Date().toISOString()
  });
  logger.debug('Status line backup saved:', backup);
}

export function getStatusLineBackup(): ConfigSchema['statusLineBackup'] | undefined {
  return config.get('statusLineBackup');
}

export function clearStatusLineBackup(): void {
  config.delete('statusLineBackup');
  logger.debug('Status line backup cleared');
}

// Push-Up Challenge Configuration Functions

export function getPushUpChallengeConfig(): PushUpChallengeConfig {
  const pushUpConfig = config.get('pushUpChallenge');

  // Return with defaults if not configured
  return pushUpConfig || {
    enabled: false,
    pushUpsPerTrigger: 1,
    totalDebt: 0,
    totalCompleted: 0,
    streakDays: 0,
    todayDebt: 0,
    todayCompleted: 0,
    lastCursorMessageTimestamp: 0,
    lastCursorCheckDate: undefined
  };
}

export function setPushUpChallengeEnabled(
  enabled: boolean,
  pushUpsPerTrigger = 1
): void {
  const current = getPushUpChallengeConfig();

  config.set('pushUpChallenge', {
    ...current,
    enabled,
    pushUpsPerTrigger,
    enabledDate: enabled && !current.enabledDate ? new Date().toISOString() : current.enabledDate,
    // Reset daily counters when enabling
    todayDebt: enabled ? 0 : current.todayDebt,
    todayCompleted: enabled ? 0 : current.todayCompleted,
    lastResetDate: enabled ? new Date().toISOString().split('T')[0] : current.lastResetDate
  });

  logger.debug(`Push-up challenge ${enabled ? 'enabled' : 'disabled'}`);
}

export function setCursorIntegrationEnabled(enabled: boolean): void {
  const current = getPushUpChallengeConfig();

  // When enabling Cursor integration for the first time, set timestamp to NOW
  // This prevents historical validations from being counted
  const shouldSetTimestamp = enabled && (!current.lastCursorMessageTimestamp || current.lastCursorMessageTimestamp === 0);

  config.set('pushUpChallenge', {
    ...current,
    cursorIntegrationEnabled: enabled,
    // Set to current time when enabling for the first time (prevents counting historical validations)
    lastCursorMessageTimestamp: shouldSetTimestamp ? Date.now() : current.lastCursorMessageTimestamp
  });

  logger.debug(`Cursor integration ${enabled ? 'enabled' : 'disabled'}${shouldSetTimestamp ? ' (starting from now)' : ''}`);
}


export function incrementPushUpDebt(amount: number): void {
  const current = getPushUpChallengeConfig();

  config.set('pushUpChallenge', {
    ...current,
    totalDebt: Math.max(0, current.totalDebt + amount)
  });
}

export function recordPushUpsCompleted(amount: number): void {
  const current = getPushUpChallengeConfig();
  const today = new Date().toISOString().split('T')[0];

  config.set('pushUpChallenge', {
    ...current,
    totalCompleted: current.totalCompleted + amount,
    todayCompleted: current.todayCompleted + amount,
    lastCompletedDate: today
  });
}

export function incrementTodayDebt(amount: number): void {
  const current = getPushUpChallengeConfig();

  config.set('pushUpChallenge', {
    ...current,
    todayDebt: current.todayDebt + amount
  });
}

export function incrementTodayCompleted(amount: number): void {
  const current = getPushUpChallengeConfig();

  config.set('pushUpChallenge', {
    ...current,
    todayCompleted: current.todayCompleted + amount
  });
}

export interface PushUpStats {
  debt: number;
  completed: number;
  streakDays: number;
  startDate?: string;
  todayDebt: number;
  todayCompleted: number;
  lastCompletedDate?: string;
}

export function getPushUpStats(): PushUpStats {
  const config = getPushUpChallengeConfig();

  return {
    debt: config.totalDebt,
    completed: config.totalCompleted,
    streakDays: config.streakDays,
    startDate: config.enabledDate,
    todayDebt: config.todayDebt,
    todayCompleted: config.todayCompleted,
    lastCompletedDate: config.lastCompletedDate
  };
}

export function incrementStreak(): void {
  const current = getPushUpChallengeConfig();

  config.set('pushUpChallenge', {
    ...current,
    streakDays: current.streakDays + 1
  });
}

export function resetStreak(): void {
  const current = getPushUpChallengeConfig();

  config.set('pushUpChallenge', {
    ...current,
    streakDays: 0
  });
}


export function setPushUpChallengeConfig(pushUpConfig: Partial<PushUpChallengeConfig>): void {
  const current = getPushUpChallengeConfig();

  config.set('pushUpChallenge', {
    ...current,
    ...pushUpConfig
  });
}

export function resetPushUpStats(): void {
  const current = getPushUpChallengeConfig();
  const today = new Date().toISOString();

  config.set('pushUpChallenge', {
    ...current,
    totalDebt: 0,
    totalCompleted: 0,
    todayDebt: 0,
    todayCompleted: 0,
    streakDays: 0,
    lastResetDate: today,
    lastCompletedDate: undefined,
    enabledDate: current.enabledDate || today
  });
}

// Cursor IDE Push-Up Tracking
// Note: Cursor tracking is automatically enabled when push-up challenge is enabled
// Detects same validation phrases as Claude Code

// Shared validation patterns for push-up challenge
export const VALIDATION_PATTERNS = [
  { regex: /you('re|\s+are)\s+absolutely\s+right/i, phrase: "you're absolutely right" },
  { regex: /you('re|\s+are)\s+totally\s+right/i, phrase: "you're totally right" },
  { regex: /you('re|\s+are)\s+completely\s+correct/i, phrase: "you're completely correct" },
  { regex: /that('s|\s+is)\s+absolutely\s+correct/i, phrase: "that's absolutely correct" },
  { regex: /absolutely\s+right/i, phrase: "absolutely right" },
  { regex: /perfect(ly)?\s+(right|correct)/i, phrase: "perfectly correct" },
  { regex: /you\s+nailed\s+it/i, phrase: "you nailed it" },
  { regex: /spot\s+on/i, phrase: "spot on" },
];

/**
 * Calculate time-based statistics from validation history
 */
export function calculateTimeStats(source?: 'claude' | 'cursor'): TimeBasedStats {
  const current = getPushUpChallengeConfig();
  const history = current.validationHistory || [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Calculate week boundaries (Monday to Sunday)
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday is 0, Monday is 1
  const thisWeekStart = new Date(todayStart);
  thisWeekStart.setDate(todayStart.getDate() - daysToMonday);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);

  // Calculate month boundaries
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Calculate year boundaries
  const thisYearStart = new Date(now.getFullYear(), 0, 1);

  // Filter by source if specified
  const filteredHistory = source
    ? history.filter(v => v.source === source)
    : history;

  return {
    thisWeek: filteredHistory.filter(v => {
      const date = new Date(v.timestamp);
      return date >= thisWeekStart;
    }).reduce((sum, v) => sum + v.pushUpsAdded, 0),

    lastWeek: filteredHistory.filter(v => {
      const date = new Date(v.timestamp);
      return date >= lastWeekStart && date < lastWeekEnd;
    }).reduce((sum, v) => sum + v.pushUpsAdded, 0),

    thisMonth: filteredHistory.filter(v => {
      const date = new Date(v.timestamp);
      return date >= thisMonthStart;
    }).reduce((sum, v) => sum + v.pushUpsAdded, 0),

    thisYear: filteredHistory.filter(v => {
      const date = new Date(v.timestamp);
      return date >= thisYearStart;
    }).reduce((sum, v) => sum + v.pushUpsAdded, 0)
  };
}

export interface TimeBasedStats {
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
  thisYear: number;
}

/**
 * Calculate time-based statistics from Cursor messages directly
 */
export function calculateCursorTimeStats(messages: any[], pushUpsPerTrigger: number): TimeBasedStats {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Calculate week boundaries (Monday to Sunday)
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = new Date(todayStart);
  thisWeekStart.setDate(todayStart.getDate() - daysToMonday);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);

  // Calculate month boundaries
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Calculate year boundaries
  const thisYearStart = new Date(now.getFullYear(), 0, 1);

  const stats: TimeBasedStats = {
    thisWeek: 0,
    lastWeek: 0,
    thisMonth: 0,
    thisYear: 0
  };

  // Scan all messages for validation patterns
  for (const message of messages) {
    // Only check assistant messages (type 2)
    if (message.type === 2) {
      const matchedPattern = VALIDATION_PATTERNS.find(p => p.regex.test(message.text));
      if (matchedPattern) {
        const messageDate = new Date(message.timestamp);
        const pushups = pushUpsPerTrigger;

        // Check which time periods this validation falls into
        if (messageDate >= thisWeekStart) {
          stats.thisWeek += pushups;
        }
        if (messageDate >= lastWeekStart && messageDate < lastWeekEnd) {
          stats.lastWeek += pushups;
        }
        if (messageDate >= thisMonthStart) {
          stats.thisMonth += pushups;
        }
        if (messageDate >= thisYearStart) {
          stats.thisYear += pushups;
        }
      }
    }
  }

  return stats;
}

export interface CursorPushUpResult {
  newMessages: number;
  pushUpsAdded: number;
  totalDebt: number;
  validationPhrasesDetected?: string[];
  timeStats?: TimeBasedStats;
}

export async function checkAndUpdateCursorPushUps(): Promise<CursorPushUpResult> {
  const current = getPushUpChallengeConfig();

  // If main challenge is not enabled OR cursor integration is not enabled, return early
  if (!current.enabled || !current.cursorIntegrationEnabled) {
    return {
      newMessages: 0,
      pushUpsAdded: 0,
      totalDebt: current.totalDebt
    };
  }

  const lastTimestamp = current.lastCursorMessageTimestamp || 0;

  // Get messages from Cursor database
  const { getCursorMessagesSince } = await import('./readers/cursor');
  const result = await getCursorMessagesSince(lastTimestamp);

  const newMessages = result.messages.length;
  const validationPhrasesDetected: string[] = [];
  let pushUpsAdded = 0;

  // Scan NEW assistant messages for validation patterns (for debt tracking)
  for (const message of result.messages) {
    // Only check assistant messages (type 2)
    if (message.type === 2) {
      const matchedPattern = VALIDATION_PATTERNS.find(p => p.regex.test(message.text));
      if (matchedPattern) {
        pushUpsAdded += current.pushUpsPerTrigger;
        validationPhrasesDetected.push(matchedPattern.phrase);
        logger.debug(`Cursor validation detected: "${matchedPattern.phrase}"`);
      }
    }
  }

  if (pushUpsAdded > 0) {
    incrementPushUpDebt(pushUpsAdded);
    incrementTodayDebt(pushUpsAdded);
    logger.debug(`Added ${pushUpsAdded} push-ups from ${validationPhrasesDetected.length} validations in Cursor`);
  }

  // Get FRESH config after increments
  const updated = getPushUpChallengeConfig();

  // Update last message timestamp and check date
  config.set('pushUpChallenge', {
    ...updated,
    lastCursorMessageTimestamp: result.maxTimestamp,
    lastCursorCheckDate: new Date().toISOString().split('T')[0]
  });

  // Calculate time-based stats from ALL messages
  const timeStats = calculateCursorTimeStats(result.allMessages, updated.pushUpsPerTrigger);

  return {
    newMessages,
    pushUpsAdded,
    totalDebt: updated.totalDebt,
    validationPhrasesDetected,
    timeStats
  };
}