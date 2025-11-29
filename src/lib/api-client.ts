import axios, { AxiosInstance, AxiosError } from 'axios';
import { getToken, getApiUrl, getStatusLinePersonality } from './config';
import { VibelogError } from '../utils/errors';
import { validateUrl } from './input-validator';
import { logger } from '../utils/logger';
import { isNetworkError, createNetworkError } from './errors/network-errors';
import { claudeSettingsManager } from './claude-settings-manager';
import crypto from 'crypto';
import type { CliTelemetry } from './telemetry';

export interface Session {
  tool: 'claude_code' | 'cursor' | 'vscode';
  timestamp: string;
  duration: number;
  claudeSessionId?: string;  // Claude's unique session identifier
  data: {
    projectName: string;  // Changed from projectPath to projectName
    // Privacy-preserving: We don't send actual message content
    messageSummary: string;  // JSON string with aggregated stats
    messageCount: number;
    metadata: {
      files_edited: number;
      languages: string[];
      models?: string[];         // All models used in session
      primaryModel?: string;     // Most frequently used model
      gitBranch?: string;        // Git branch from JSONL
      // Planning mode metadata
      hasPlanningMode?: boolean;        // Whether planning mode was used
      planningCycles?: number;          // Number of planning cycles
      exitPlanTimestamps?: string[];    // ISO timestamps of ExitPlanMode calls
    };
  };
}

export interface StreakInfo {
  current: number;
  points: number;
  longestStreak: number;
  totalSessions: number;
  todaySessions: number;
}

export interface PointsEarned {
  streak: number;      // Exponential streak points (2^day)
  volume: number;      // Session volume bonus (1 per session, max 30/day)
  share: number;       // Social share bonus (web platform only, included in total)
  total: number;       // Total points earned (streak + volume + share)
  message?: string;    // Optional celebratory message from server
}

export interface UploadResult {
  success: boolean;
  sessionsProcessed: number;
  analysisPreview?: string;
  streak?: StreakInfo;
  pointsEarned?: PointsEarned;  // Points earned from this upload
  created?: number;              // Number of new sessions created
  duplicates?: number;           // Number of duplicate sessions
  batchId?: string;              // Batch ID for tracking
}

export interface CLIConfiguration {
  version: string;
  origin?: string | null;
  statusline: {
    personality: 'gordon' | 'vibe-log' | 'custom';
    customPersonality?: {
      name: string;
      description: string;
      templates?: {
        poor: string;
        fair: string;
        good: string;
        excellent: string;
      };
    };
  };
  hooks: {
    sessionStartInstalled: boolean;
    preCompactInstalled: boolean;
    sessionEndInstalled: boolean;
    mode?: 'all' | 'selected';
  };
}

// Request ID for tracking
function generateRequestId(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Gather current CLI configuration for sending to server
async function gatherCLIConfiguration(origin?: string): Promise<CLIConfiguration | null> {
  try {
    // Get statusline configuration
    const statuslineConfig = getStatusLinePersonality();

    // Get hooks configuration
    const featureStatus = await claudeSettingsManager.getFeatureStatus();

    return {
      version: require('../../package.json').version,
      origin: origin || null,  // No fallback - must be explicitly set
      statusline: {
        personality: statuslineConfig.personality,
        customPersonality: statuslineConfig.customPersonality
      },
      hooks: {
        sessionStartInstalled: featureStatus.autoSync.sessionStartInstalled,
        preCompactInstalled: featureStatus.autoSync.preCompactInstalled,
        sessionEndInstalled: featureStatus.autoSync.sessionEndInstalled,
        mode: featureStatus.autoSync.mode
      }
    };
  } catch (error) {
    logger.debug('Failed to gather CLI configuration:', error);
    return null; // Don't fail upload if config gathering fails
  }
}

class SecureApiClient {
  private client: AxiosInstance;
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly MAX_REQUESTS_PER_MINUTE = 60;

  constructor() {
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `vibe-log-CLI/${require('../../package.json').version}`,
        'X-Client-Version': '1.0.0',
      },
      // Prevent automatic redirects to avoid SSRF
      maxRedirects: 0,
      // Validate response status
      validateStatus: (status) => status >= 200 && status < 300,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        // Rate limiting
        this.enforceRateLimit();
        
        // Set secure headers
        config.headers['X-Request-ID'] = generateRequestId();
        config.headers['X-Timestamp'] = new Date().toISOString();
        
        // Validate and set base URL
        const apiUrl = await this.getValidatedApiUrl();
        // Remove trailing slash from base URL to avoid double slashes
        config.baseURL = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
        
        // Add authentication
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Log request (sanitized)
        logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`, {
          fullUrl: `${config.baseURL}${config.url}`,
          method: config.method?.toUpperCase(),
          hasAuth: !!config.headers.Authorization
        });
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Validate response headers
        this.validateResponseHeaders(response.headers);
        return response;
      },
      async (error: AxiosError) => {
        // Log detailed error for debugging
        logger.debug('API Error Details', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          code: error.code,
          message: error.message,
          url: error.config?.url,
          baseURL: error.config?.baseURL
        });
        
        // Also log to console for 400 errors to see server validation messages
        if (error.response?.status === 400) {
          if (process.env.VIBELOG_DEBUG === 'true') {
            console.log('[DEBUG] 400 Error Response:', JSON.stringify(error.response?.data, null, 2));
          }
          
          // Extract validation message if available
          const responseData = error.response?.data as any;
          const validationMessage = responseData?.message || responseData?.error;
          
          // Check for specific validation errors
          if (validationMessage) {
            // Check for duration validation error
            if (validationMessage.includes('duration') && validationMessage.includes('240')) {
              throw new VibelogError(
                'Sessions must be at least 4 minutes long to be uploaded. Short sessions were rejected by the server.',
                'VALIDATION_ERROR'
              );
            }
            
            // Check for ZodError format
            if (validationMessage.includes('ZodError') || validationMessage.includes('Too small')) {
              // Try to extract the meaningful part
              if (validationMessage.includes('duration')) {
                throw new VibelogError(
                  'Sessions must be at least 4 minutes long. Please select longer sessions to upload.',
                  'VALIDATION_ERROR'
                );
              }
            }
            
            // Generic validation error
            throw new VibelogError(
              `Validation error: ${validationMessage}`,
              'VALIDATION_ERROR'
            );
          }
        }
        
        // Sanitize error messages
        const safeError = this.sanitizeError(error);
        
        if (error.response?.status === 401) {
          throw new VibelogError(
            'Your session has expired. Please authenticate again',
            'AUTH_EXPIRED'
          );
        } else if (error.response?.status === 403) {
          throw new VibelogError(
            'Access denied. Please check your permissions',
            'ACCESS_DENIED'
          );
        } else if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          throw new VibelogError(
            `Too many requests. Please wait ${retryAfter || '60'} seconds before trying again`,
            'RATE_LIMITED'
          );
        } else if (error.response?.status === 500) {
          throw new VibelogError(
            'Server error. The vibe-log service is having issues. Please try again later',
            'SERVER_ERROR'
          );
        } else if (isNetworkError(error)) {
          throw createNetworkError(error);
        } else if (error.response?.status === 404) {
          throw new VibelogError(
            'API endpoint not found. You might need to update your CLI',
            'ENDPOINT_NOT_FOUND'
          );
        }
        
        throw safeError;
      }
    );
  }

  private enforceRateLimit(): void {
    const now = Date.now();
    const windowAge = now - this.windowStart;
    
    // Reset window after 1 minute
    if (windowAge > 60000) {
      this.requestCount = 0;
      this.windowStart = now;
    }
    
    this.requestCount++;
    
    if (this.requestCount > this.MAX_REQUESTS_PER_MINUTE) {
      throw new VibelogError(
        'Client rate limit exceeded. Please wait before making more requests.',
        'CLIENT_RATE_LIMITED'
      );
    }
  }

  private async getValidatedApiUrl(): Promise<string> {
    const url = getApiUrl();
    try {
      return validateUrl(url);
    } catch (error) {
      console.error('Invalid API URL, using default');
      return 'https://app.vibe-log.dev';
    }
  }

  private validateResponseHeaders(headers: any): void {
    // Check for security headers
    const requiredHeaders = ['x-content-type-options', 'x-frame-options'];
    
    for (const header of requiredHeaders) {
      if (!headers[header]) {
        console.warn(`Missing security header: ${header}`);
      }
    }
  }

  private sanitizeError(error: AxiosError): Error {
    // Remove sensitive data from errors
    const errorData = error.response?.data as any;
    const sanitized = new Error(
      errorData?.message || 
      error.message || 
      'An error occurred'
    );
    
    // Copy safe properties
    (sanitized as any).code = error.code;
    (sanitized as any).status = error.response?.status;
    
    return sanitized;
  }

  async createAuthSession(): Promise<{ authUrl: string; token: string }> {
    const response = await this.client.post('/api/auth/cli/session', {
      timestamp: new Date().toISOString(),
    });
    
    // Validate response - React Router v7 returns sessionId as the token
    if (!response.data.authUrl || typeof response.data.authUrl !== 'string') {
      throw new Error('Invalid auth response');
    }
    
    // Handle both 'token' and 'sessionId' for compatibility
    const token = response.data.token || response.data.sessionId;
    if (!token || typeof token !== 'string') {
      throw new Error('Server did not return token');
    }
    
    return {
      authUrl: response.data.authUrl,
      token: token
    };
  }

  async checkAuthCompletion(token: string): Promise<{ success: boolean; userId?: number }> {
    try {
      // Use GET to check status without consuming the token
      const response = await this.client.get(`/api/auth/cli/complete?token=${token}`);
      
      return {
        success: response.data.success,
        userId: response.data.userId
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { success: false }; // Token not found or not completed yet
      }
      if (error.response?.status === 409) {
        throw new Error('Token already completed');
      }
      throw error;
    }
  }

  // Removed pollAuthSession - now using SSE streaming instead

  async verifyToken(): Promise<{ valid: boolean; user?: any }> {
    try {
      const response = await this.client.get('/api/auth/cli/verify');
      
      // Don't return raw user data
      return {
        valid: true,
        user: {
          id: response.data.user?.id,
          // Only return necessary fields
        },
      };
    } catch (error) {
      return { valid: false };
    }
  }

  async uploadSessions(
    sessions: Session[],
    onProgress?: (current: number, total: number, sizeKB?: number) => void,
    origin?: string
  ): Promise<any> {
    // Gather CLI configuration to send with the upload
    const cliConfig = await gatherCLIConfiguration(origin);

    // Validate and sanitize sessions
    const sanitizedSessions = sessions.map(session => this.sanitizeSession(session));

    // Chunk large uploads
    // Using 100 for better performance - modern connections can handle 300-500KB payloads
    const CHUNK_SIZE = 100;
    const chunks = [];
    
    for (let i = 0; i < sanitizedSessions.length; i += CHUNK_SIZE) {
      chunks.push(sanitizedSessions.slice(i, i + CHUNK_SIZE));
    }
    
    const results = [];
    let uploadedCount = 0;
    let uploadedSizeKB = 0;
    
    // Calculate total size
    const totalSize = Buffer.byteLength(JSON.stringify(sanitizedSessions)) / 1024;
    if (process.env.VIBELOG_DEBUG === 'true') {
      console.log('[DEBUG] Uploading in', chunks.length, 'chunks', `(Total: ${totalSize.toFixed(2)} KB)`);
    }
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const payload: any = {
        sessions: chunk,
        checksum: this.calculateChecksum(chunk),
        totalSessions: sanitizedSessions.length, // Total sessions being uploaded
        batchNumber: i + 1, // Current batch number (1-indexed)
        totalBatches: chunks.length, // Total number of batches
      };

      // On first chunk only, include telemetry
      if (i === 0) {
        const { collectTelemetry } = await import('./telemetry');
        const telemetry = await collectTelemetry();
        if (telemetry) {
          payload.telemetry = telemetry; // Add to existing payload
        }
      }
      
      // Calculate payload size in kilobytes
      const payloadSize = Buffer.byteLength(JSON.stringify(payload)) / 1024;
      
      if (process.env.VIBELOG_DEBUG === 'true') {
        console.log('[DEBUG] Uploading batch', i + 1, 'of', chunks.length, 'with', chunk.length, 'sessions', `(${payloadSize.toFixed(2)} KB)`);
        console.log('[DEBUG] Total progress:', uploadedCount, '+', chunk.length, '=', uploadedCount + chunk.length, 'of', sanitizedSessions.length);
        
        // Log first session of each chunk to debug validation issues
        if (chunk.length > 0) {
          console.log('[DEBUG] First session in chunk:', JSON.stringify(chunk[0], null, 2).substring(0, 500) + '...');
        }
      }
      
      // Log the actual HTTP request data
      logger.debug(`📤 API Request batch ${i + 1}/${chunks.length}: POST /cli/sessions`, {
        batchSessions: chunk.length,
        totalSessions: sanitizedSessions.length,
        cumulativeProgress: `${uploadedCount + chunk.length}/${sanitizedSessions.length}`,
        firstSession: chunk[0] ? {
          tool: chunk[0].tool,
          timestamp: chunk[0].timestamp,
          duration: chunk[0].duration
        } : null,
        checksum: payload.checksum
      });
      
      // Add retry logic for network failures
      let lastError: any;
      let retryCount = 0;
      const MAX_RETRIES = 1; // Basic retry - just one attempt
      
      while (retryCount <= MAX_RETRIES) {
        try {
          // Prepare configuration headers
          const configHeaders: Record<string, string> = {};
          if (cliConfig) {
            configHeaders['x-vibe-config-version'] = cliConfig.version;
            configHeaders['x-vibe-config-origin'] = cliConfig.origin || 'null';
            configHeaders['x-vibe-config-statusline'] = JSON.stringify(cliConfig.statusline);
            configHeaders['x-vibe-config-hooks'] = JSON.stringify(cliConfig.hooks);
          }

          // Use /cli/sessions endpoint for CLI uploads (bearer token auth)
          const response = await this.client.post('/cli/sessions', payload, {
            headers: configHeaders
          });
          results.push(response.data);
          
          // Update progress after successful chunk upload
          uploadedCount += chunk.length;
          uploadedSizeKB += payloadSize;
          if (process.env.VIBELOG_DEBUG === 'true') {
            console.log('[DEBUG] Progress reported:', uploadedCount, '/', sanitizedSessions.length, `(${uploadedSizeKB.toFixed(2)} KB)`);
          }
          if (onProgress) {
            onProgress(uploadedCount, sanitizedSessions.length, uploadedSizeKB);
          }
          
          // Add a small delay between chunks to avoid overwhelming the server
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error;
          retryCount++;
          
          // Only retry on network errors, not on client errors (4xx)
          const shouldRetry = error instanceof AxiosError && 
            (!error.response || error.response.status >= 500 || isNetworkError(error));
          
          if (!shouldRetry || retryCount > MAX_RETRIES) {
            throw error; // Don't retry, throw immediately
          }
          
          logger.debug(`Network error, retrying (${retryCount}/${MAX_RETRIES})...`, { error: error.message });
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      
      if (retryCount > MAX_RETRIES && lastError) {
        throw lastError;
      }
    }
    
    return this.mergeResults(results);
  }

  private sanitizeSession(session: Session): Session {
    // Remove or sanitize sensitive data
    return {
      ...session,
      data: {
        ...session.data,
        projectName: session.data?.projectName || '', // Project name is already sanitized in send.ts
        // Message content is already sanitized at this point
        // Just ensure the summary doesn't contain sensitive data
        messageSummary: session.data?.messageSummary || '',
      },
    };
  }

  private calculateChecksum(data: any): string {
    const json = JSON.stringify(data);
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  private mergeResults(results: any[]): UploadResult {
    // Merge chunked upload results - properly handle created and duplicates counts
    // Aggregate points from all batches
    const pointsEarned = results
      .filter(r => r.pointsEarned)
      .reduce((acc, r) => {
        if (!acc) return r.pointsEarned;
        return {
          streak: Math.max(acc.streak || 0, r.pointsEarned.streak || 0),  // Use highest streak points
          volume: (acc.volume || 0) + (r.pointsEarned.volume || 0),       // Sum volume bonuses
          share: Math.max(acc.share || 0, r.pointsEarned.share || 0),     // Use highest share bonus
          total: (acc.total || 0) + (r.pointsEarned.total || 0),          // Sum total points
          message: r.pointsEarned.message || acc.message                  // Use latest message
        };
      }, null as PointsEarned | null);

    return {
      success: results.every(r => r.success),
      created: results.reduce((sum, r) => sum + (r.created || 0), 0),
      duplicates: results.reduce((sum, r) => sum + (r.duplicates || 0), 0),
      sessionsProcessed: results.reduce((sum, r) => sum + ((r.created || 0) + (r.duplicates || 0)), 0),
      analysisPreview: results[0]?.analysisPreview,
      streak: results[results.length - 1]?.streak,
      pointsEarned: pointsEarned || undefined,
      batchId: results.find(r => r.batchId)?.batchId,
    };
  }

  async getStreak(): Promise<StreakInfo> {
    const response = await this.client.get('/api/user/streak');
    return response.data;
  }

  async updateTelemetry(telemetry: CliTelemetry): Promise<void> {
    // Only called if user has auth token (checked in telemetry.ts)
    await this.client.post('/api/cli-telemetry', telemetry);
  }

  async getRecentSessions(limit: number = 10, startDate?: Date, endDate?: Date): Promise<any[]> {
    // Validate limit
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const params: any = { limit: safeLimit };

    if (startDate) {
      params.start = startDate.toISOString();
    }

    if (endDate) {
      params.end = endDate.toISOString();
    }

    const response = await this.client.get('/api/sessions/recent', {
      params,
    });

    // The API returns { sessions: [...], count: number }
    // Extract just the sessions array
    if (response.data && typeof response.data === 'object' && 'sessions' in response.data) {
      return response.data.sessions;
    }

    // Fallback for backward compatibility (if API changes)
    return response.data;
  }
  
  getBaseUrl(): string {
    return this.client.defaults.baseURL || 'http://localhost:3000';
  }

  /**
   * Sync custom instructions to backend
   * @param content - The markdown instructions content
   * @param source - The source of the update ('cli' or 'web')
   * @returns Promise with success status and updated timestamp
   */
  async syncInstructions(
    content: string,
    source: 'cli' | 'web' = 'cli'
  ): Promise<{ success: boolean; updatedAt?: string }> {
    const response = await this.client.post('/api/user/instructions', {
      content,
      source,
    });
    return response.data;
  }

  /**
   * Fetch custom instructions from backend
   * @returns Promise with instructions content and metadata
   */
  async fetchInstructions(): Promise<{
    content: string | null;
    updatedAt: string | null;
    lastUpdatedFrom: 'cli' | 'web' | null;
  }> {
    const response = await this.client.get('/api/user/instructions');
    return response.data;
  }

  /**
   * Delete custom instructions from backend
   * @returns Promise with success status
   */
  async deleteInstructions(): Promise<{ success: boolean }> {
    const response = await this.client.delete('/api/user/instructions');
    return response.data;
  }
}

export const apiClient = new SecureApiClient();