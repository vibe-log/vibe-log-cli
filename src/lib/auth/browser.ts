import { randomBytes } from 'crypto';
import open from 'open';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import https from 'https';
import http from 'http';
import { apiClient } from '../api-client';
import { storeToken, clearToken, getApiUrl } from '../config';
import { VibelogError } from '../../utils/errors';

// Secure random sleep to prevent timing attacks
function secureRandomSleep(baseMs: number): Promise<void> {
  const jitter = randomBytes(1)[0] / 255 * 1000; // 0-1000ms random jitter
  return new Promise((resolve) => setTimeout(resolve, baseMs + jitter));
}

// Removed generateSecureSessionId - server generates the session ID

export async function browserAuth(wizardMode?: boolean): Promise<string> {
  if (!wizardMode) {
    console.log(chalk.cyan('\n🔐 Starting secure authentication...'));
  }
  
  try {
    // Clear any existing token first to ensure fresh authentication
    await clearToken();
    
    // Get auth token from server (this creates a new token each time)
    let authUrl: string;
    let token: string;
    
    try {
      const apiUrl = getApiUrl();
      if (!wizardMode) {
        console.log(chalk.gray(`Connecting to: ${apiUrl}`));
      }
      
      const result = await apiClient.createAuthSession();
      authUrl = result.authUrl;
      token = result.token;
    } catch (error: any) {
      // Handle connection errors specifically
      if (error.code === 'ECONNREFUSED') {
        console.error(chalk.red('\n❌ Cannot connect to vibe-log server'));
        console.error(chalk.yellow('\n📋 Please check:'));
        console.error(chalk.gray('   1. Is the server running? (For local development: npm run dev)'));
        console.error(chalk.gray('   2. Is the API URL correct? Current: ' + getApiUrl()));
        console.error(chalk.gray('   3. Is your firewall blocking the connection?'));
        console.error(chalk.gray('\n💡 Tip: If running locally, make sure the vibe-log server is started'));
        throw new VibelogError('Server connection refused', 'CONNECTION_REFUSED');
      } else if (error.code === 'ENOTFOUND') {
        console.error(chalk.red('\n❌ Server not found'));
        console.error(chalk.yellow('\nThe server address could not be resolved: ' + getApiUrl()));
        console.error(chalk.gray('\n💡 Check your internet connection or API URL configuration'));
        throw new VibelogError('Server not found', 'SERVER_NOT_FOUND');
      } else if (error.code === 'ETIMEDOUT' || error.code === 'TIMEOUT') {
        console.error(chalk.red('\n❌ Connection timed out'));
        console.error(chalk.yellow('\nThe server is not responding. It might be:'));
        console.error(chalk.gray('   • Down for maintenance'));
        console.error(chalk.gray('   • Experiencing high load'));
        console.error(chalk.gray('   • Blocked by network issues'));
        throw new VibelogError('Connection timed out', 'TIMEOUT');
      } else if (error.code === 'NETWORK_ERROR') {
        console.error(chalk.red('\n❌ Network error'));
        console.error(chalk.yellow('\nPlease check your internet connection and try again.'));
        throw error;
      } else {
        // Re-throw other errors to be handled by outer catch
        throw error;
      }
    }
    
    if (!wizardMode) {
      console.log(chalk.yellow('\n📱 Opening browser for authentication...'));
      console.log(chalk.gray('If the browser doesn\'t open, check your default browser settings.'));
      console.log('');
      console.log(chalk.cyan('🔐 Complete the authentication in your browser, then press ENTER here to continue...'));
    }
    
    // Open browser to auth page
    await open(authUrl);
    
    // Use SSE to wait for authentication completion
    if (!wizardMode) {
      console.log('\n' + chalk.cyan('⏳ Waiting for browser authentication...'));
      console.log(chalk.gray('   (Complete the authentication in your browser)'));
    }
    
    const spinner = ora('Monitoring authentication status...').start();
    
    try {
      // Pass the token (which is the sessionId) to SSE endpoint
      const apiToken = await waitForAuthWithSSE(token, spinner, wizardMode);
      spinner.succeed('Authentication verified successfully');
      
      // Step 2: Store the API token for CLI use
      const step2Spinner = ora('Setting up CLI session...').start();
      await secureRandomSleep(300);
      
      // Store the API token received from SSE
      await storeToken(apiToken);
      
      step2Spinner.succeed('CLI session configured');
      
      // Step 3: Final validation
      const step3Spinner = ora('Finalizing setup...').start();
      await secureRandomSleep(200);
      step3Spinner.succeed('Authentication complete!');
      
      // Only show completion messages if not in wizard mode
      if (!wizardMode) {
        console.log('');
        console.log(chalk.green('✅ Successfully authenticated with Vibe-Log!'));
        console.log(chalk.cyan('🚀 You can now use the Vibe-Log interactive menu:'));
        console.log(chalk.gray('   Run `npx vibe-log-cli` to access all features'));
        console.log('');
      }
      
      // Ensure stdin is properly closed
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      
      return apiToken;
      
    } catch (error) {
      spinner.fail('Authentication verification failed');
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Authentication failed');
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    throw error;
  }
}

async function waitForAuthWithSSE(sessionId: string, spinner: Ora, wizardMode?: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const apiUrl = getApiUrl();
    // Ensure no double slashes in URL
    const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const sseUrl = new URL(`${baseUrl}/api/auth/cli/stream/${sessionId}`);
    
    if (!wizardMode) {
      console.log(chalk.gray(`\n   Debug: Connecting to SSE endpoint: ${sseUrl.href}`));
    }
    
    const httpModule = sseUrl.protocol === 'https:' ? https : http;
    
    // let lastHeartbeat = Date.now();
    let buffer = '';
    
    // Setup timeout (5 minutes)
    const timeoutTimer = setTimeout(() => {
      req.destroy();
      reject(new VibelogError(
        'Authentication timed out. Please try again.',
        'AUTH_TIMEOUT'
      ));
    }, 5 * 60 * 1000);
    
    // Make the SSE request
    const req = httpModule.get({
      hostname: sseUrl.hostname,
      port: sseUrl.port || (sseUrl.protocol === 'https:' ? 443 : 80),
      path: sseUrl.pathname,
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      }
    }, (res) => {
      if (!wizardMode) {
        console.log(chalk.gray(`   Debug: Response status: ${res.statusCode}`));
      }
      
      if (res.statusCode !== 200) {
        req.destroy();
        clearTimeout(timeoutTimer);
        reject(new VibelogError(
          `Server returned status ${res.statusCode}`,
          'SERVER_ERROR'
        ));
        return;
      }
      
      spinner.text = 'Connected - waiting for authentication in browser...';
      
      // Process SSE stream
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          const trimmed = line.trim();
          
          // Handle heartbeats
          if (trimmed === ':heartbeat' || trimmed.startsWith(':')) {
            // lastHeartbeat = Date.now();
            continue;
          }
          
          // Handle data messages
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.substring(6);
            if (!wizardMode) {
              console.log(chalk.gray(`   Debug: Received data: ${data.substring(0, 50)}...`));
            }
            
            try {
              const parsed = JSON.parse(data);
              
              switch (parsed.status) {
                case 'pending':
                  spinner.text = 'Waiting for authentication in browser...';
                  break;
                  
                case 'success':
                  // Authentication completed successfully
                  req.destroy();
                  clearTimeout(timeoutTimer);
                  
                  if (parsed.token) {
                    resolve(parsed.token);
                  } else {
                    reject(new VibelogError(
                      'Authentication completed but no token received',
                      'NO_TOKEN'
                    ));
                  }
                  break;
                  
                case 'error':
                  req.destroy();
                  clearTimeout(timeoutTimer);
                  reject(new VibelogError(
                    parsed.message || 'Authentication failed',
                    parsed.code || 'AUTH_ERROR'
                  ));
                  break;
                  
                case 'expired':
                  req.destroy();
                  clearTimeout(timeoutTimer);
                  reject(new VibelogError(
                    'Authentication session expired. Please try again.',
                    'SESSION_EXPIRED'
                  ));
                  break;
                  
                case 'timeout':
                  req.destroy();
                  clearTimeout(timeoutTimer);
                  reject(new VibelogError(
                    'Authentication timed out. Please try again.',
                    'AUTH_TIMEOUT'
                  ));
                  break;
              }
            } catch (error) {
              console.error('Failed to parse SSE data:', data, error);
            }
          }
        }
      });
      
      res.on('end', () => {
        clearTimeout(timeoutTimer);
        reject(new VibelogError(
          'Connection to authentication server closed unexpectedly',
          'CONNECTION_CLOSED'
        ));
      });
      
      res.on('error', (error) => {
        clearTimeout(timeoutTimer);
        reject(new VibelogError(
          `Connection error: ${error.message}`,
          'CONNECTION_ERROR'
        ));
      });
    });
    
    req.on('error', (error) => {
      clearTimeout(timeoutTimer);
      if (!wizardMode) {
        console.log(chalk.red(`   Debug: Request error: ${error.message}`));
      }
      reject(new VibelogError(
        `Failed to connect to authentication server: ${error.message}`,
        'CONNECTION_FAILED'
      ));
    });
    
    // Handle process termination
    const cleanup = () => {
      req.destroy();
      clearTimeout(timeoutTimer);
    };
    
    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  });
}

function isValidTokenFormat(token: string): boolean {
  // Validate token format (adjust based on your actual token format)
  // Example: JWT format validation
  if (typeof token !== 'string' || token.length < 20) {
    return false;
  }
  
  // Check for common injection patterns
  const dangerousPatterns = [
    /[<>]/,           // HTML injection
    /[`${}]/,         // Template injection
    /[\u0000-\u001F]/,    // Control characters
    /['";\\]/,        // SQL/Command injection
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(token));
}

export async function validateAndStoreToken(token: string): Promise<void> {
  // Validate token format before any operations
  if (!isValidTokenFormat(token)) {
    throw new VibelogError('Invalid token format', 'INVALID_TOKEN');
  }
  
  // Temporarily store token to validate it
  await storeToken(token);
  
  try {
    // Verify the token works
    const { valid } = await apiClient.verifyToken();
    
    if (!valid) {
      // Clear invalid token
      await clearToken();
      throw new VibelogError('Invalid token', 'INVALID_TOKEN');
    }
    
    // Log success without exposing user data
    console.log(chalk.green('\n✅ Authentication verified'));
    
  } catch (error) {
    // Clear token on any error
    await clearToken();
    throw error;
  }
}

// Rate limiting for auth attempts
const authAttempts = new Map<string, number[]>();

export function checkAuthRateLimit(identifier: string): void {
  const now = Date.now();
  const attempts = authAttempts.get(identifier) || [];
  
  // Clean old attempts (older than 15 minutes)
  const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000);
  
  // Check rate limit (max 5 attempts per 15 minutes)
  if (recentAttempts.length >= 5) {
    throw new VibelogError(
      'Too many authentication attempts. Please try again later.',
      'RATE_LIMITED'
    );
  }
  
  recentAttempts.push(now);
  authAttempts.set(identifier, recentAttempts);
}