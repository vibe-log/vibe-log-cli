import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readClaudeSessions } from '../../../../src/lib/readers/claude';
import { VibelogError } from '../../../../src/utils/errors';
import { setupTestEnv, cleanupTestEnv } from '../../../test-utils';
import { claudeSessionFixtures, claudeProjectStructure } from '../../../fixtures/claude-sessions';

// Mock modules
vi.mock('fs/promises');
vi.mock('os');

describe('Claude Reader Module', () => {
  const mockHomedir = '/test/home';
  const claudePath = path.join(mockHomedir, '.claude', 'projects');

  beforeEach(() => {
    setupTestEnv();
    vi.mocked(os.homedir).mockReturnValue(mockHomedir);
  });

  afterEach(() => {
    cleanupTestEnv();
  });

  describe('readClaudeSessions', () => {
    it('should read valid sessions from Claude directory', async () => {
      // Mock file system
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1', 'project2'] as any)
        .mockResolvedValueOnce(['session1.jsonl', 'other.txt'] as any)
        .mockResolvedValueOnce(['session2.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(claudeSessionFixtures.validSessionFile)
        .mockResolvedValueOnce(claudeSessionFixtures.multiLanguageSession);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toMatchObject({
        tool: 'claude_code',
        projectPath: expect.any(String),
        messages: expect.any(Array),
        duration: expect.any(Number),
      });
    });

    it('should throw error when Claude directory not found', async () => {
      vi.mocked(fs.access).mockRejectedValue({ code: 'ENOENT' });
      
      await expect(readClaudeSessions()).rejects.toThrow(VibelogError);
      await expect(readClaudeSessions()).rejects.toThrow('Claude Code data not found');
    });

    it('should filter sessions by date', async () => {
      const sinceDate = new Date('2024-01-15T11:00:00Z');
      
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['old.jsonl', 'new.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      // Old session (should be filtered out)
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(claudeSessionFixtures.validSessionFile)
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'new-session',
          cwd: '/test',
          timestamp: '2024-01-15T12:00:00Z',
          message: { role: 'user', content: 'test', timestamp: '2024-01-15T12:00:00Z' }
        }));
      
      const sessions = await readClaudeSessions({ since: sinceDate });
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('new-session');
    });

    it('should filter sessions by project path', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['session1.jsonl', 'session2.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(claudeSessionFixtures.validSessionFile)
        .mockResolvedValueOnce(claudeSessionFixtures.multiLanguageSession);
      
      const sessions = await readClaudeSessions({ 
        projectPath: '/home/user/fullstack' 
      });
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].projectPath).toContain('fullstack');
    });

    it('should respect limit option', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['s1.jsonl', 's2.jsonl', 's3.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.validSessionFile);
      
      const sessions = await readClaudeSessions({ limit: 2 });
      
      expect(sessions).toHaveLength(2);
    });

    it('should handle empty session files', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['empty.jsonl', 'valid.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(claudeSessionFixtures.emptySessionFile)
        .mockResolvedValueOnce(claudeSessionFixtures.validSessionFile);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].messages.length).toBeGreaterThan(0);
    });

    it('should handle corrupted JSON gracefully', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['corrupted.jsonl', 'valid.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(claudeSessionFixtures.invalidJsonFile)
        .mockResolvedValueOnce(claudeSessionFixtures.validSessionFile);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1); // Should skip corrupted file, parse valid one
    });

    it('should skip non-directory entries', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['file.txt', 'project1'] as any)
        .mockResolvedValueOnce(['session.jsonl'] as any);
      
      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ isDirectory: () => false } as any)
        .mockResolvedValueOnce({ isDirectory: () => true } as any);
      
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.validSessionFile);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
    });

    it('should skip non-jsonl files', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['readme.md', 'session.jsonl', 'data.json'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.validSessionFile);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    it('should calculate session duration correctly', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['long.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.longSessionFile);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].duration).toBeGreaterThan(0);
      expect(sessions[0].messages.length).toBeGreaterThan(10);
    });

    it('should handle negative duration by returning 0', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['reverse.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      // Create a session where messages have reversed timestamps (causing negative duration)
      const reverseSession = [
        JSON.stringify({
          sessionId: 'reverse-test',
          cwd: '/test',
          timestamp: '2024-01-15T14:00:00Z'
        }),
        JSON.stringify({ 
          message: { role: 'user', content: 'first message' }, 
          timestamp: '2024-01-15T14:00:00Z' 
        }),
        JSON.stringify({ 
          message: { role: 'assistant', content: 'second message' }, 
          timestamp: '2024-01-15T13:00:00Z'  // Earlier than first message!
        })
      ].join('\n');
      
      vi.mocked(fs.readFile).mockResolvedValue(reverseSession);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].duration).toBe(0); // Should be 0, not negative
      expect(sessions[0].messages.length).toBe(2);
    });

    it('should extract file edit metadata', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['multi.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.multiLanguageSession);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].metadata?.files_edited).toBeGreaterThan(0);
      expect(sessions[0].metadata?.languages).toContain('Python');
      expect(sessions[0].metadata?.languages).toContain('TypeScript');
      expect(sessions[0].metadata?.languages).toContain('SQL');
    });

    it('should sort sessions by timestamp', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['newer.jsonl', 'older.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      const newerSession = JSON.stringify({
        sessionId: 'newer',
        cwd: '/test',
        timestamp: '2024-01-15T14:00:00Z',
        message: { role: 'user', content: 'test', timestamp: '2024-01-15T14:00:00Z' }
      });
      
      const olderSession = JSON.stringify({
        sessionId: 'older',
        cwd: '/test',
        timestamp: '2024-01-15T10:00:00Z',
        message: { role: 'user', content: 'test', timestamp: '2024-01-15T10:00:00Z' }
      });
      
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(newerSession)
        .mockResolvedValueOnce(olderSession);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('older');
      expect(sessions[1].id).toBe('newer');
    });

    it('should handle file read errors gracefully', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['error.jsonl', 'valid.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error('Read error'))
        .mockResolvedValueOnce(claudeSessionFixtures.validSessionFile);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error parsing session file'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Language Detection', () => {
    it('should detect common programming languages', async () => {
      const testFiles = [
        'test.js', 'test.py', 'test.java', 'test.go', 'test.rs',
        'test.tsx', 'test.cpp', 'test.sql', 'test.dockerfile'
      ];
      
      const sessionData = {
        sessionId: 'lang-test',
        cwd: '/test',
        timestamp: '2024-01-15T10:00:00Z',
      };
      
      const lines = [
        JSON.stringify(sessionData),
        JSON.stringify({ message: { role: 'user', content: 'test' }, timestamp: '2024-01-15T10:00:30Z' })
      ];
      testFiles.forEach(file => {
        lines.push(JSON.stringify({
          toolUseResult: { type: 'create', filePath: file },
          timestamp: '2024-01-15T10:01:00Z'
        }));
      });
      
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['lang.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(lines.join('\n'));
      
      const sessions = await readClaudeSessions();
      
      expect(sessions[0].metadata?.languages).toContain('JavaScript');
      expect(sessions[0].metadata?.languages).toContain('Python');
      expect(sessions[0].metadata?.languages).toContain('Java');
      expect(sessions[0].metadata?.languages).toContain('Go');
      expect(sessions[0].metadata?.languages).toContain('Rust');
      expect(sessions[0].metadata?.languages).toContain('TypeScript');
      expect(sessions[0].metadata?.languages).toContain('C++');
      expect(sessions[0].metadata?.languages).toContain('SQL');
      expect(sessions[0].metadata?.languages).toContain('Docker');
    });

    it('should handle unknown file extensions', async () => {
      const sessionLines = [
        JSON.stringify({ sessionId: 'test', cwd: '/test', timestamp: '2024-01-15T10:00:00Z' }),
        JSON.stringify({ message: { role: 'user', content: 'test' }, timestamp: '2024-01-15T10:00:30Z' }),
        JSON.stringify({ toolUseResult: { type: 'create', filePath: 'test.xyz' }, timestamp: '2024-01-15T10:01:00Z' })
      ];
      
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['test.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(sessionLines.join('\n'));
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].metadata?.languages).toContain('XYZ');
    });
  });
});