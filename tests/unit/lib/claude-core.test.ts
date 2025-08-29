import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import { 
  discoverProjects, 
  getCurrentProject,
  setFileSystem,
  resetFileSystem
} from '../../../src/lib/claude-core';
import { IClaudeFileSystem } from '../../../src/lib/claude-fs';
import { SessionFileInfo } from '../../../src/lib/claude-project-parser';

// Mock the logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

describe('Claude Core Module', () => {
  let mockFileSystem: IClaudeFileSystem;
  
  beforeEach(() => {
    // Create a mock file system
    mockFileSystem = {
      exists: vi.fn(),
      getProjectDirectories: vi.fn(),
      getSessionFiles: vi.fn(),
      readSessionFile: vi.fn(),
      isDirectory: vi.fn()
    };
    
    // Set the mock file system
    setFileSystem(mockFileSystem);
  });
  
  afterEach(() => {
    resetFileSystem();
    vi.clearAllMocks();
  });
  
  describe('discoverProjects()', () => {
    it('should discover projects with valid cwd in JSONL files', async () => {
      // Use recent dates for active projects
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5); // 5 days ago
      const olderDate = new Date();
      olderDate.setDate(olderDate.getDate() - 10); // 10 days ago
      
      // Mock project directories
      vi.mocked(mockFileSystem.getProjectDirectories).mockResolvedValue([
        '/test/home/.claude/projects/-Users-testuser-vibe-log',
        '/test/home/.claude/projects/-Users-testuser-another-project'
      ]);
      
      // Mock session files for first project
      const vibeLogSessions: SessionFileInfo[] = [
        { path: '/test/home/.claude/projects/-Users-testuser-vibe-log/session1.jsonl', size: 1024, mtime: recentDate },
        { path: '/test/home/.claude/projects/-Users-testuser-vibe-log/session2.jsonl', size: 1024, mtime: olderDate }
      ];
      
      // Mock session files for second project
      const anotherProjectSessions: SessionFileInfo[] = [
        { path: '/test/home/.claude/projects/-Users-testuser-another-project/session3.jsonl', size: 2048, mtime: olderDate }
      ];
      
      vi.mocked(mockFileSystem.getSessionFiles)
        .mockResolvedValueOnce(vibeLogSessions)
        .mockResolvedValueOnce(anotherProjectSessions);
      
      // Mock session file contents
      const vibeLogSession = `{"sessionId":"session-1","cwd":"/Users/testuser/vibe-log","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"test"},"timestamp":"2024-01-15T10:01:00Z"}`;
      
      const anotherProjectSession = `{"sessionId":"session-2","cwd":"/Users/testuser/another-project","timestamp":"2024-01-14T10:00:00Z"}
{"message":{"role":"user","content":"test"},"timestamp":"2024-01-14T10:01:00Z"}`;
      
      vi.mocked(mockFileSystem.readSessionFile)
        .mockResolvedValueOnce(vibeLogSession)
        .mockResolvedValueOnce(anotherProjectSession);
      
      const projects = await discoverProjects();
      
      expect(projects).toHaveLength(2);
      expect(projects[0]).toMatchObject({
        name: 'vibe-log',
        actualPath: '/Users/testuser/vibe-log',
        sessions: 2,
        isActive: true
      });
      expect(projects[1]).toMatchObject({
        name: 'another-project',
        actualPath: '/Users/testuser/another-project',
        sessions: 1,
        isActive: true
      });
    });
    
    it('should skip projects without cwd in JSONL files', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      
      vi.mocked(mockFileSystem.getProjectDirectories).mockResolvedValue([
        '/test/home/.claude/projects/project-without-cwd',
        '/test/home/.claude/projects/-Users-testuser-valid-project'
      ]);
      
      const noCwdSessions: SessionFileInfo[] = [
        { path: '/test/home/.claude/projects/project-without-cwd/session1.jsonl', size: 1024, mtime: recentDate }
      ];
      
      const validSessions: SessionFileInfo[] = [
        { path: '/test/home/.claude/projects/-Users-testuser-valid-project/session2.jsonl', size: 1024, mtime: recentDate }
      ];
      
      vi.mocked(mockFileSystem.getSessionFiles)
        .mockResolvedValueOnce(noCwdSessions)
        .mockResolvedValueOnce(validSessions);
      
      // Mock JSONL files - first one without cwd
      const noCwdSession = `{"sessionId":"session-1","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"test"},"timestamp":"2024-01-15T10:01:00Z"}`;
      
      const validSession = `{"sessionId":"session-2","cwd":"/Users/testuser/valid-project","timestamp":"2024-01-14T10:00:00Z"}
{"message":{"role":"user","content":"test"},"timestamp":"2024-01-14T10:01:00Z"}`;
      
      vi.mocked(mockFileSystem.readSessionFile)
        .mockResolvedValueOnce(noCwdSession)
        .mockResolvedValueOnce(validSession);
      
      const projects = await discoverProjects();
      
      // Should only have one project (the one with cwd)
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        name: 'valid-project',
        actualPath: '/Users/testuser/valid-project'
      });
    });
    
    it('should handle directories with no session files', async () => {
      vi.mocked(mockFileSystem.getProjectDirectories).mockResolvedValue([
        '/test/home/.claude/projects/-Users-testuser-empty-project'
      ]);
      
      vi.mocked(mockFileSystem.getSessionFiles).mockResolvedValue([]);
      
      const projects = await discoverProjects();
      
      expect(projects).toHaveLength(0);
    });
    
    it('should handle Claude directory not existing', async () => {
      vi.mocked(mockFileSystem.getProjectDirectories).mockResolvedValue([]);
      
      const projects = await discoverProjects();
      
      expect(projects).toHaveLength(0);
    });
    
    it('should extract project name from cwd basename', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      
      vi.mocked(mockFileSystem.getProjectDirectories).mockResolvedValue([
        '/test/home/.claude/projects/-complex-encoded-name'
      ]);
      
      const sessions: SessionFileInfo[] = [
        { path: '/test/home/.claude/projects/-complex-encoded-name/session.jsonl', size: 1024, mtime: recentDate }
      ];
      
      vi.mocked(mockFileSystem.getSessionFiles).mockResolvedValue(sessions);
      
      const session = `{"sessionId":"s1","cwd":"/Users/testuser/dev/my-awesome-project","timestamp":"2024-01-15T10:00:00Z"}`;
      
      vi.mocked(mockFileSystem.readSessionFile).mockResolvedValue(session);
      
      const projects = await discoverProjects();
      
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('my-awesome-project');
      expect(projects[0].actualPath).toBe('/Users/testuser/dev/my-awesome-project');
    });
  });
  
  describe('getCurrentProject()', () => {
    it('should return project matching current working directory', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      
      // Mock current working directory
      vi.spyOn(process, 'cwd').mockReturnValue('/Users/testuser/vibe-log');
      
      vi.mocked(mockFileSystem.getProjectDirectories).mockResolvedValue([
        '/test/home/.claude/projects/-Users-testuser-vibe-log',
        '/test/home/.claude/projects/-Users-testuser-other-project'
      ]);
      
      const vibeLogSessions: SessionFileInfo[] = [
        { path: '/test/home/.claude/projects/-Users-testuser-vibe-log/session1.jsonl', size: 1024, mtime: recentDate }
      ];
      
      const otherSessions: SessionFileInfo[] = [
        { path: '/test/home/.claude/projects/-Users-testuser-other-project/session2.jsonl', size: 1024, mtime: recentDate }
      ];
      
      vi.mocked(mockFileSystem.getSessionFiles)
        .mockResolvedValueOnce(vibeLogSessions)
        .mockResolvedValueOnce(otherSessions);
      
      const vibeLogSession = `{"sessionId":"s1","cwd":"/Users/testuser/vibe-log","timestamp":"2024-01-15T10:00:00Z"}`;
      const otherSession = `{"sessionId":"s2","cwd":"/Users/testuser/other-project","timestamp":"2024-01-15T10:00:00Z"}`;
      
      vi.mocked(mockFileSystem.readSessionFile)
        .mockResolvedValueOnce(vibeLogSession)
        .mockResolvedValueOnce(otherSession);
      
      const currentProject = await getCurrentProject();
      
      expect(currentProject).not.toBeNull();
      expect(currentProject?.name).toBe('vibe-log');
      expect(currentProject?.actualPath).toBe('/Users/testuser/vibe-log');
    });
    
    it('should return project when in subdirectory', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      
      // Mock current working directory (subdirectory of project)
      vi.spyOn(process, 'cwd').mockReturnValue('/Users/testuser/vibe-log/src/lib');
      
      vi.mocked(mockFileSystem.getProjectDirectories).mockResolvedValue([
        '/test/home/.claude/projects/-Users-testuser-vibe-log'
      ]);
      
      const sessions: SessionFileInfo[] = [
        { path: '/test/home/.claude/projects/-Users-testuser-vibe-log/session1.jsonl', size: 1024, mtime: recentDate }
      ];
      
      vi.mocked(mockFileSystem.getSessionFiles).mockResolvedValue(sessions);
      
      const session = `{"sessionId":"s1","cwd":"/Users/testuser/vibe-log","timestamp":"2024-01-15T10:00:00Z"}`;
      
      vi.mocked(mockFileSystem.readSessionFile).mockResolvedValue(session);
      
      const currentProject = await getCurrentProject();
      
      expect(currentProject).not.toBeNull();
      expect(currentProject?.actualPath).toBe('/Users/testuser/vibe-log');
    });
    
    it('should return null when not in any project', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      
      // Mock current working directory
      vi.spyOn(process, 'cwd').mockReturnValue('/Users/testuser/random-folder');
      
      vi.mocked(mockFileSystem.getProjectDirectories).mockResolvedValue([
        '/test/home/.claude/projects/-Users-testuser-vibe-log'
      ]);
      
      const sessions: SessionFileInfo[] = [
        { path: '/test/home/.claude/projects/-Users-testuser-vibe-log/session1.jsonl', size: 1024, mtime: recentDate }
      ];
      
      vi.mocked(mockFileSystem.getSessionFiles).mockResolvedValue(sessions);
      
      const session = `{"sessionId":"s1","cwd":"/Users/testuser/vibe-log","timestamp":"2024-01-15T10:00:00Z"}`;
      
      vi.mocked(mockFileSystem.readSessionFile).mockResolvedValue(session);
      
      const currentProject = await getCurrentProject();
      
      expect(currentProject).toBeNull();
    });
  });
});