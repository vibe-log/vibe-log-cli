import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readClaudeSessions } from '../../../../src/lib/readers/claude';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

vi.mock('fs/promises');
vi.mock('os');

describe('Claude Reader - Directory Filtering', () => {
  const mockHomedir = '/home/user';
  const mockClaudePath = path.join(mockHomedir, '.claude', 'projects');
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomedir);
  });
  
  describe('projectPath filtering', () => {
    it('should filter sessions by exact project path match', async () => {
      const targetProject = 'C:\\projects\\my-app';
      const otherProject = 'C:\\projects\\other-app';
      
      // Mock file system
      vi.mocked(fs.access).mockResolvedValue();
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1', 'project2'] as any)
        .mockResolvedValueOnce(['session1.jsonl'] as any)
        .mockResolvedValueOnce(['session2.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      // Mock session files with different project paths
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session1',
          cwd: targetProject,
          timestamp: new Date().toISOString(),
          message: { role: 'user', content: 'Hello from my-app' }
        }) + '\n')
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session2',
          cwd: otherProject,
          timestamp: new Date().toISOString(),
          message: { role: 'user', content: 'Hello from other-app' }
        }) + '\n');
      
      const sessions = await readClaudeSessions({ projectPath: targetProject });
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].projectPath).toBe(targetProject);
    });
    
    it('should include sessions from subdirectories of the target project', async () => {
      const targetProject = 'C:\\projects\\my-app';
      const subProject = 'C:\\projects\\my-app\\frontend';
      
      vi.mocked(fs.access).mockResolvedValue();
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['session1.jsonl', 'session2.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      // Mock sessions from main project and subdirectory
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session1',
          cwd: targetProject,
          timestamp: new Date().toISOString(),
          message: { role: 'user', content: 'Hello from root' }
        }) + '\n')
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session2',
          cwd: subProject,
          timestamp: new Date().toISOString(),
          message: { role: 'user', content: 'Hello from frontend' }
        }) + '\n');
      
      const sessions = await readClaudeSessions({ projectPath: targetProject });
      
      expect(sessions).toHaveLength(2);
      expect(sessions[0].projectPath).toBe(targetProject);
      expect(sessions[1].projectPath).toBe(subProject);
    });
    
    it('should not include sessions from parent directories', async () => {
      const targetProject = 'C:\\projects\\my-app\\frontend';
      const parentProject = 'C:\\projects\\my-app';
      
      vi.mocked(fs.access).mockResolvedValue();
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['session1.jsonl', 'session2.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session1',
          cwd: targetProject,
          timestamp: new Date().toISOString(),
          message: { role: 'user', content: 'Hello from frontend' }
        }) + '\n')
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session2',
          cwd: parentProject,
          timestamp: new Date().toISOString(),
          message: { role: 'user', content: 'Hello from parent' }
        }) + '\n');
      
      const sessions = await readClaudeSessions({ projectPath: targetProject });
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].projectPath).toBe(targetProject);
    });
    
    it('should handle case-insensitive path matching on Windows', async () => {
      const targetProject = 'C:\\Projects\\My-App';
      const sameProjectDifferentCase = 'c:\\projects\\my-app';
      
      vi.mocked(fs.access).mockResolvedValue();
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['session1.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        sessionId: 'session1',
        cwd: sameProjectDifferentCase,
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: 'Hello' }
      }) + '\n');
      
      // Mock Windows platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      
      const sessions = await readClaudeSessions({ projectPath: targetProject });
      
      // On Windows, paths should match case-insensitively
      if (process.platform === 'win32') {
        expect(sessions).toHaveLength(1);
      }
      
      // Restore platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });
    
    it('should return all sessions when projectPath is not specified', async () => {
      vi.mocked(fs.access).mockResolvedValue();
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1', 'project2'] as any)
        .mockResolvedValueOnce(['session1.jsonl'] as any)
        .mockResolvedValueOnce(['session2.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session1',
          cwd: 'C:\\projects\\app1',
          timestamp: new Date().toISOString(),
          message: { role: 'user', content: 'Hello from app1' }
        }) + '\n')
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session2',
          cwd: 'C:\\projects\\app2',
          timestamp: new Date().toISOString(),
          message: { role: 'user', content: 'Hello from app2' }
        }) + '\n');
      
      const sessions = await readClaudeSessions({});
      
      expect(sessions).toHaveLength(2);
      expect(sessions[0].projectPath).toBe('C:\\projects\\app1');
      expect(sessions[1].projectPath).toBe('C:\\projects\\app2');
    });
  });
  
  describe('Combined filters', () => {
    it('should apply both projectPath and since filters', async () => {
      const targetProject = 'C:\\projects\\my-app';
      const sinceDate = new Date('2024-01-01');
      
      vi.mocked(fs.access).mockResolvedValue();
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project1'] as any)
        .mockResolvedValueOnce(['session1.jsonl', 'session2.jsonl', 'session3.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      
      // Three sessions: right project + after date, wrong project + after date, right project + before date
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session1',
          cwd: targetProject,
          timestamp: '2024-01-15T10:00:00Z',
          message: { role: 'user', content: 'Valid session' }
        }) + '\n')
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session2',
          cwd: 'C:\\projects\\other-app',
          timestamp: '2024-01-15T10:00:00Z',
          message: { role: 'user', content: 'Wrong project' }
        }) + '\n')
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session3',
          cwd: targetProject,
          timestamp: '2023-12-15T10:00:00Z',
          message: { role: 'user', content: 'Too old' }
        }) + '\n');
      
      const sessions = await readClaudeSessions({ 
        projectPath: targetProject,
        since: sinceDate 
      });
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].projectPath).toBe(targetProject);
      expect(sessions[0].timestamp.getTime()).toBeGreaterThan(sinceDate.getTime());
    });
  });
});