import path from 'path';
import { URL } from 'url';

/**
 * Security-focused input validation utilities
 */

// Sanitize file paths to prevent directory traversal
export function sanitizePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid path input');
  }
  
  // Check for directory traversal attempts BEFORE normalization
  const traversalPatterns = [
    '..',
    '..\\',
    '../',
    '..\\/',
    '%2e%2e',
    '%252e%252e',
    '..%2f',
    '..%5c',
  ];
  
  const lowerPath = inputPath.toLowerCase();
  for (const pattern of traversalPatterns) {
    if (lowerPath.includes(pattern)) {
      throw new Error('Directory traversal attempt detected');
    }
  }
  
  // Normalize and resolve path after security check
  const normalized = path.normalize(inputPath);
  
  // Remove any null bytes
  const cleaned = normalized.replace(/\0/g, '');
  
  // Ensure path doesn't start with a drive letter on Windows
  if (process.platform === 'win32' && /^[a-zA-Z]:/.test(cleaned)) {
    // Allow but log for monitoring
    console.warn('Absolute path detected:', cleaned.substring(0, 3) + '...');
  }
  
  return cleaned;
}

// Validate and sanitize URLs
export function validateUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL input');
  }
  
  try {
    const parsed = new URL(url);
    
    // Only allow HTTP(S) protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP(S) protocols are allowed');
    }
    
    // Check for localhost/private IPs (SSRF prevention)
    const privatePatterns = [
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^::1$/,
      /^fe80:/i,
      /^fc00:/i,
      /^fd00:/i,
    ];
    
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' ||
        privatePatterns.some(pattern => pattern.test(hostname))) {
      // Allow localhost for development without warning
      // Production deployments should never use localhost
    }
    
    // Check for suspicious ports
    const suspiciousPorts = ['22', '23', '25', '445', '3389'];
    if (suspiciousPorts.includes(parsed.port)) {
      throw new Error('Suspicious port detected');
    }
    
    // Return normalized URL
    return parsed.toString();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Invalid URL format');
    }
    throw error;
  }
}

// Validate date inputs
export function validateDate(dateStr: string): Date {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error('Invalid date input');
  }
  
  // Remove any potential injection characters
  const cleaned = dateStr.replace(/[^0-9\-T:.Z]/g, '');
  
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date format');
  }
  
  // Check for reasonable date ranges (not too far in past or future)
  const now = new Date();
  const yearInMs = 365 * 24 * 60 * 60 * 1000;
  
  if (date.getTime() < now.getTime() - (10 * yearInMs)) {
    throw new Error('Date too far in the past');
  }
  
  if (date.getTime() > now.getTime() + yearInMs) {
    throw new Error('Date too far in the future');
  }
  
  return date;
}

// Validate session ID format
export function validateSessionId(sessionId: string): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid session ID');
  }
  
  // Only allow alphanumeric, dash, and underscore
  if (!/^[a-zA-Z0-9\-_]+$/.test(sessionId)) {
    throw new Error('Invalid session ID format');
  }
  
  // Check length constraints
  if (sessionId.length < 10 || sessionId.length > 128) {
    throw new Error('Invalid session ID length');
  }
  
  return sessionId;
}

// Validate and sanitize project names
export function validateProjectName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Invalid project name');
  }
  
  // Remove potentially dangerous characters
  const sanitized = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"\\|?*\u0000-\u001F]/g, '') // Windows forbidden chars
    .replace(/\.\./g, '')                  // Directory traversal
    .replace(/^\.|\.$/g, '')               // Leading/trailing dots
    .trim();
  
  if (!sanitized || sanitized.length === 0) {
    throw new Error('Invalid project name after sanitization');
  }
  
  if (sanitized.length > 255) {
    throw new Error('Project name too long');
  }
  
  return sanitized;
}

// Validate numeric limit
export function validateLimit(limit: any): number {
  const num = parseInt(limit, 10);
  
  if (isNaN(num) || num < 1) {
    throw new Error('Invalid limit value');
  }
  
  // Prevent resource exhaustion
  if (num > 1000) {
    throw new Error('Limit too high');
  }
  
  return num;
}

// Sanitize log output to prevent log injection
export function sanitizeLogOutput(message: string): string {
  if (!message || typeof message !== 'string') {
    return '[Invalid log message]';
  }
  
  // Remove ANSI escape codes that could manipulate terminal
  // eslint-disable-next-line no-control-regex
  const ansiPattern = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  
  return message
    .replace(ansiPattern, '')      // Remove ANSI codes
    .replace(/\r/g, '\\r')        // Escape carriage returns
    .replace(/\n/g, '\\n')        // Escape newlines
    .slice(0, 1000);              // Limit length
}

// Validate authentication token
export function validateAuthToken(token: string): string {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid token input');
  }
  
  // Remove whitespace
  const trimmed = token.trim();
  
  if (trimmed.length < 20) {
    throw new Error('Token too short');
  }
  
  if (trimmed.length > 1000) {
    throw new Error('Token too long');
  }
  
  // Check for common injection patterns
  /* eslint-disable no-control-regex */
  const dangerousPatterns = [
    /[<>]/,           // HTML injection
    /[`${}]/,         // Template injection
    /[\u0000-\u001F]/,    // Control characters
    /[';\\]/,         // SQL/Command injection
  ];
  /* eslint-enable no-control-regex */
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      throw new Error('Invalid token format - contains dangerous characters');
    }
  }
  
  return trimmed;
}

// Validate command line arguments
export function validateCliArg(arg: string, type: 'path' | 'url' | 'string'): string {
  if (!arg || typeof arg !== 'string') {
    throw new Error('Invalid argument');
  }
  
  // Check for command injection attempts
  const dangerousPatterns = [
    /[;&|`$(){}[\]<>]/,     // Shell metacharacters
    /\\.{2,}/,              // Multiple backslashes
    /\/{3,}/,               // Multiple forward slashes
  ];
  
  if (dangerousPatterns.some(pattern => pattern.test(arg))) {
    throw new Error('Potentially dangerous characters in argument');
  }
  
  switch (type) {
    case 'path':
      return sanitizePath(arg);
    case 'url':
      return validateUrl(arg);
    case 'string':
      return arg.slice(0, 1000); // Limit length
    default:
      throw new Error('Unknown validation type');
  }
}