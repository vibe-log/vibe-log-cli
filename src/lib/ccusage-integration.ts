/**
 * CCUsage Integration Module
 * 
 * This module integrates with ccusage (https://www.npmjs.com/package/ccusage)
 * to provide real-time token usage metrics for Claude Code sessions.
 * 
 * Credit: Special thanks to the ccusage project for providing 
 * comprehensive token tracking capabilities for Claude Code.
 */

import { spawn } from 'child_process';
import { logger } from '../utils/logger';
import os from 'os';
import path from 'path';

// Cache for ccusage output to avoid repeated calls
interface CacheEntry {
  output: string | null;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30000; // 30 seconds cache

/**
 * Get ccusage metrics for the current session
 * @param claudeContext - The full Claude Code context object
 * @param timeout - Maximum time to wait for ccusage response
 * @returns The ccusage output or null if unavailable
 */
export async function getCCUsageMetrics(
  claudeContext: any,
  timeout: number = 1500  // Default 1.5 seconds since ccusage takes ~1s to output
): Promise<string | null> {
  logger.debug('getCCUsageMetrics called with timeout:', timeout);
  
  // No context, can't get metrics
  if (!claudeContext || !claudeContext.session_id) {
    logger.debug('No Claude context provided for ccusage');
    return null;
  }

  logger.debug('Claude context session_id:', claudeContext.session_id);

  // Check cache first
  const cacheKey = claudeContext.session_id;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug('Using cached ccusage output:', cached.output);
    return cached.output;
  }
  
  logger.debug('No cache hit, calling ccusage...');

  // Set up cross-platform debug log path
  const debugLogPath = path.join(os.homedir(), '.vibe-log', 'ccusage-debug.log');

  return new Promise((resolve) => {
    let output = '';
    let errorOutput = '';
    let timedOut = false;
    let processExited = false;

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      logger.debug(`ccusage timed out after ${timeout}ms`);
      const fs = require('fs');
      fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] TIMEOUT after ${timeout}ms - output so far: "${output}"\n`);
      
      // On timeout, return the last successful result if available
      const existingCache = cache.get(cacheKey);
      if (existingCache && existingCache.output) {
        fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] Returning cached result after timeout\n`);
        resolve(existingCache.output);
      } else {
        resolve(null);
      }
    }, timeout);

    try {
      // Debug logging to file
      const fs = require('fs');
      fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] Spawning ccusage process\n`);
      
      // Spawn ccusage process using npx with @latest to ensure v16+
      const ccusage = spawn('npx', ['ccusage@latest', 'statusline'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      });

      // Send the full Claude context to stdin (ccusage expects all these fields)
      const inputData = JSON.stringify(claudeContext);
      fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] Sending data length: ${inputData.length}\n`);
      ccusage.stdin.write(inputData);
      ccusage.stdin.end();

      // Capture stdout
      ccusage.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        logger.debug('ccusage stdout:', chunk);
      });

      // Capture stderr
      ccusage.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        logger.debug('ccusage stderr:', chunk);
      });

      // Handle process completion
      ccusage.on('close', (code) => {
        const fs = require('fs');
        fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] Process closed with code ${code}, timedOut: ${timedOut}, output: "${output}"\n`);
        
        if (processExited) return;
        processExited = true;
        clearTimeout(timeoutHandle);
        
        if (timedOut) return;

        if (code === 0 && output && output.trim()) {
          // Success - cache and return the output
          const result = output.trim();
          cache.set(cacheKey, { output: result, timestamp: Date.now() });
          logger.debug('Successfully got ccusage output, length:', result.length);
          logger.debug('ccusage result:', result);
          resolve(result);
        } else {
          // Failed - log error if present
          logger.debug(`ccusage failed with code ${code}, output: "${output}", error: "${errorOutput}"`);
          if (errorOutput && !errorOutput.includes('npm warn')) {
            logger.debug('ccusage error details:', errorOutput);
          }
          // Don't cache failures - return the last successful result if available
          const existingCache = cache.get(cacheKey);
          if (existingCache && existingCache.output) {
            logger.debug('ccusage failed, returning last successful result');
            resolve(existingCache.output);
          } else {
            resolve(null);
          }
        }
      });

      // Handle process errors
      ccusage.on('error', (err) => {
        if (processExited) return;
        processExited = true;
        clearTimeout(timeoutHandle);
        
        if (timedOut) return;
        
        logger.debug('Failed to spawn ccusage:', err.message);
        // Don't cache failures - return last successful result if available
        const existingCache = cache.get(cacheKey);
        if (existingCache && existingCache.output) {
          logger.debug('ccusage error, returning last successful result');
          resolve(existingCache.output);
        } else {
          resolve(null);
        }
      });

    } catch (error) {
      clearTimeout(timeoutHandle);
      logger.debug('Error calling ccusage:', error);
      resolve(null);
    }
  });
}

/**
 * Clear the ccusage cache
 */
export function clearCCUsageCache(): void {
  cache.clear();
}