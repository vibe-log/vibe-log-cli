import { describe, it, expect } from 'vitest';
import {
  getClaudeSystemPrompt,
  getYesterdayWorkingDay,
  getDayName,
  formatDuration,
  groupSessionsByProject,
} from '../../../src/lib/standup-utils';

describe('standup-utils', () => {
  describe('getClaudeSystemPrompt', () => {
    it('should return base prompt when no custom instructions provided', () => {
      const result = getClaudeSystemPrompt();
      expect(result).toContain('developer standup meeting assistant');
      expect(result).not.toContain('USER INSTRUCTIONS');
    });

    it('should include custom instructions when provided', () => {
      const customInstructions = 'Focus on my React project goals';
      const result = getClaudeSystemPrompt(customInstructions);
      expect(result).toContain('developer standup meeting assistant');
      expect(result).toContain('USER INSTRUCTIONS');
      expect(result).toContain('Focus on my React project goals');
    });

    it('should append instructions at the end with clear formatting', () => {
      const customInstructions = 'Track time spent on bug fixes';
      const result = getClaudeSystemPrompt(customInstructions);
      // Instructions should come after the base prompt
      const basePromptEnd = result.indexOf('Return ONLY valid JSON.');
      const instructionsStart = result.indexOf('USER INSTRUCTIONS');
      expect(instructionsStart).toBeGreaterThan(basePromptEnd);
    });

    it('should handle empty string as no instructions', () => {
      const result = getClaudeSystemPrompt('');
      expect(result).not.toContain('USER INSTRUCTIONS');
    });

    it('should handle whitespace-only as no instructions', () => {
      const result = getClaudeSystemPrompt('   \n\t  ');
      expect(result).not.toContain('USER INSTRUCTIONS');
    });
  });

  describe('getYesterdayWorkingDay', () => {
    it('should return a Date object', () => {
      const result = getYesterdayWorkingDay();
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('getDayName', () => {
    it('should return correct day names', () => {
      // Sunday = 0, Monday = 1, etc.
      expect(getDayName(new Date('2024-01-07'))).toBe('Sunday');
      expect(getDayName(new Date('2024-01-08'))).toBe('Monday');
      expect(getDayName(new Date('2024-01-12'))).toBe('Friday');
    });
  });

  describe('formatDuration', () => {
    it('should format minutes correctly', () => {
      expect(formatDuration(300)).toBe('5 minutes');
      expect(formatDuration(1800)).toBe('30 minutes');
    });

    it('should format hours correctly', () => {
      expect(formatDuration(3600)).toBe('1.0 hours');
      expect(formatDuration(7200)).toBe('2.0 hours');
      expect(formatDuration(5400)).toBe('1.5 hours');
    });
  });

  describe('groupSessionsByProject', () => {
    it('should group sessions by project name', () => {
      const sessions = [
        { projectPath: '/path/to/project-a', messages: [] },
        { projectPath: '/path/to/project-b', messages: [] },
        { projectPath: '/path/to/project-a', messages: [] },
      ] as any;

      const result = groupSessionsByProject(sessions);
      expect(Object.keys(result)).toHaveLength(2);
      expect(result['project-a']).toHaveLength(2);
      expect(result['project-b']).toHaveLength(1);
    });

    it('should handle empty array', () => {
      const result = groupSessionsByProject([]);
      expect(result).toEqual({});
    });
  });
});
