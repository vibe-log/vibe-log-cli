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

  describe('Model Tracking', () => {
    it('should extract model from assistant messages', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['model.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.sessionWithSingleModel);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].modelInfo).toBeDefined();
      expect(sessions[0].modelInfo?.models).toContain('claude-opus-4-1-20250805');
      expect(sessions[0].modelInfo?.primaryModel).toBe('claude-opus-4-1-20250805');
      expect(sessions[0].modelInfo?.modelUsage['claude-opus-4-1-20250805']).toBe(3);
      expect(sessions[0].modelInfo?.modelSwitches).toBe(0);
    });

    it('should ignore model field in user messages', async () => {
      const sessionWithUserModel = `{"sessionId":"test","cwd":"/test","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","model":"should-be-ignored","content":"test"},"timestamp":"2024-01-15T10:01:00Z"}
{"message":{"role":"assistant","model":"claude-opus-4-1-20250805","content":"response"},"timestamp":"2024-01-15T10:02:00Z"}`;
      
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['test.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(sessionWithUserModel);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions[0].modelInfo?.models).toEqual(['claude-opus-4-1-20250805']);
      expect(sessions[0].modelInfo?.modelUsage).toEqual({
        'claude-opus-4-1-20250805': 1
      });
    });

    it('should handle sessions without model info', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['legacy.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.sessionWithoutModelInfo);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].modelInfo).toBeUndefined();
    });

    it('should count model usage correctly', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['multi.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.sessionWithMultipleModels);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions[0].modelInfo?.modelUsage).toEqual({
        'claude-opus-4-1-20250805': 3,
        'claude-sonnet-4-20250514': 1
      });
    });

    it('should identify primary model as most used', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['primary.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.sessionWithMultipleModels);
      
      const sessions = await readClaudeSessions();
      
      // Opus used 3 times, Sonnet 1 time
      expect(sessions[0].modelInfo?.primaryModel).toBe('claude-opus-4-1-20250805');
    });

    it('should handle tie in model usage', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['tied.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.sessionWithTiedModelUsage);
      
      const sessions = await readClaudeSessions();
      
      // Both models used 2 times each
      expect(sessions[0].modelInfo?.modelUsage).toEqual({
        'claude-opus-4-1-20250805': 2,
        'claude-sonnet-4-20250514': 2
      });
      // Primary model should be one of them (deterministic based on reduce)
      expect(['claude-opus-4-1-20250805', 'claude-sonnet-4-20250514'])
        .toContain(sessions[0].modelInfo?.primaryModel);
    });

    it('should detect model switches', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['switch.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.sessionWithModelSwitches);
      
      const sessions = await readClaudeSessions();
      
      // Switches: Opus->Sonnet, Sonnet->Opus4, Opus4->Opus4.1, Opus4.1->Haiku = 4 switches
      expect(sessions[0].modelInfo?.modelSwitches).toBe(4);
    });

    it('should not count first model as switch', async () => {
      const firstModelSession = `{"sessionId":"first","cwd":"/test","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"test"},"timestamp":"2024-01-15T10:01:00Z"}
{"message":{"role":"assistant","model":"claude-opus-4-1-20250805","content":"first"},"timestamp":"2024-01-15T10:02:00Z"}
{"message":{"role":"assistant","model":"claude-opus-4-1-20250805","content":"second"},"timestamp":"2024-01-15T10:03:00Z"}`;
      
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['first.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(firstModelSession);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions[0].modelInfo?.modelSwitches).toBe(0);
    });

    it('should handle multiple consecutive switches', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['rapid.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.sessionWithRapidModelSwitches);
      
      const sessions = await readClaudeSessions();
      
      // 5 assistant messages, 4 switches between them
      expect(sessions[0].modelInfo?.modelSwitches).toBe(4);
      expect(sessions[0].modelInfo?.models).toHaveLength(4);
    });

    it('should handle malformed model fields', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['malformed.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.sessionWithMalformedModel);
      
      const sessions = await readClaudeSessions();
      
      // Should only count the valid model
      expect(sessions[0].modelInfo?.models).toEqual(['claude-opus-4-1-20250805']);
      expect(sessions[0].modelInfo?.modelUsage).toEqual({
        'claude-opus-4-1-20250805': 1
      });
    });

    it('should handle sessions with only user messages', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['useronly.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.sessionWithOnlyUserMessages);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].modelInfo).toBeUndefined();
    });

    it('should process very long sessions with many model switches', async () => {
      // Generate a session with 100 messages alternating between models
      const longSession = [`{"sessionId":"long","cwd":"/test","timestamp":"2024-01-15T10:00:00Z"}`];
      const models = [
        'claude-opus-4-1-20250805',
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514'
      ];
      
      for (let i = 0; i < 100; i++) {
        const time = new Date(`2024-01-15T10:${String(i % 60).padStart(2, '0')}:00Z`);
        longSession.push(
          `{"message":{"role":"user","content":"msg ${i}"},"timestamp":"${time.toISOString()}"}`,
          `{"message":{"role":"assistant","model":"${models[i % 3]}","content":"response ${i}"},"timestamp":"${time.toISOString()}"}`
        );
      }
      
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['long.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(longSession.join('\n'));
      
      const sessions = await readClaudeSessions();
      
      expect(sessions[0].modelInfo).toBeDefined();
      expect(sessions[0].modelInfo?.models).toHaveLength(3);
      // Each model used ~33 times
      expect(sessions[0].modelInfo?.modelUsage['claude-opus-4-1-20250805']).toBeGreaterThan(30);
      // Many switches between the 3 models
      expect(sessions[0].modelInfo?.modelSwitches).toBeGreaterThan(60);
    });

    it('should include all unique models in models array', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['all.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(claudeSessionFixtures.sessionWithModelSwitches);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions[0].modelInfo?.models).toEqual(expect.arrayContaining([
        'claude-opus-4-1-20250805',
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514',
        'claude-haiku-3-20240307'
      ]));
    });

    it('should track model info alongside language detection', async () => {
      // Session with both model info and file edits
      const combinedSession = `{"sessionId":"combined","cwd":"/test","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"create files"},"timestamp":"2024-01-15T10:01:00Z"}
{"message":{"role":"assistant","model":"claude-opus-4-1-20250805","content":"creating"},"timestamp":"2024-01-15T10:02:00Z"}
{"toolUseResult":{"type":"create","filePath":"test.ts"},"timestamp":"2024-01-15T10:03:00Z"}
{"message":{"role":"assistant","model":"claude-sonnet-4-20250514","content":"done"},"timestamp":"2024-01-15T10:04:00Z"}
{"toolUseResult":{"type":"create","filePath":"test.py"},"timestamp":"2024-01-15T10:05:00Z"}`;
      
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['combined.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(combinedSession);
      
      const sessions = await readClaudeSessions();
      
      // Should have both model info and languages
      expect(sessions[0].modelInfo).toBeDefined();
      expect(sessions[0].modelInfo?.models).toContain('claude-opus-4-1-20250805');
      expect(sessions[0].modelInfo?.models).toContain('claude-sonnet-4-20250514');
      expect(sessions[0].metadata?.languages).toContain('TypeScript');
      expect(sessions[0].metadata?.languages).toContain('Python');
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

    it('should ignore non-programming file extensions', async () => {
      const sessionLines = [
        JSON.stringify({ sessionId: 'test', cwd: '/test', timestamp: '2024-01-15T10:00:00Z' }),
        JSON.stringify({ message: { role: 'user', content: 'test' }, timestamp: '2024-01-15T10:00:30Z' }),
        JSON.stringify({ toolUseResult: { type: 'create', filePath: 'test.png' }, timestamp: '2024-01-15T10:01:00Z' }),
        JSON.stringify({ toolUseResult: { type: 'create', filePath: 'test.jpg' }, timestamp: '2024-01-15T10:01:30Z' }),
        JSON.stringify({ toolUseResult: { type: 'create', filePath: 'test.ts' }, timestamp: '2024-01-15T10:02:00Z' })
      ];
      
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['test.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValue(sessionLines.join('\n'));
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      // Should only contain TypeScript, not PNG or JPG
      expect(sessions[0].metadata?.languages).toEqual(['TypeScript']);
      expect(sessions[0].metadata?.languages).not.toContain('PNG');
      expect(sessions[0].metadata?.languages).not.toContain('JPG');
    });
  });
});