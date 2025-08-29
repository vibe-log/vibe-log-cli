import { describe, it, expect } from 'vitest';
import {
  parseSessionContent,
  extractProjectName,
  createProjectFromSessionData,
  matchProjectToPath,
  sortProjectsByActivity,
  filterActiveProjects,
  ClaudeProject,
  SessionFileInfo
} from '../../../src/lib/claude-project-parser';

describe('Claude Project Parser', () => {
  describe('parseSessionContent()', () => {
    it('should extract cwd from first line with cwd field', () => {
      const content = `{"sessionId":"s1","cwd":"/Users/testuser/project","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"test"},"timestamp":"2024-01-15T10:01:00Z"}
{"cwd":"/Users/testuser/other","timestamp":"2024-01-15T10:02:00Z"}`;
      
      const result = parseSessionContent(content);
      
      expect(result).not.toBeNull();
      expect(result?.cwd).toBe('/Users/testuser/project');
      expect(result?.sessionId).toBe('s1');
    });
    
    it('should skip invalid JSON lines', () => {
      const content = `invalid json line
{"sessionId":"s1","timestamp":"2024-01-15T10:00:00Z"}
{"cwd":"/Users/testuser/project","timestamp":"2024-01-15T10:01:00Z"}`;
      
      const result = parseSessionContent(content);
      
      expect(result).not.toBeNull();
      expect(result?.cwd).toBe('/Users/testuser/project');
    });
    
    it('should return null if no cwd found', () => {
      const content = `{"sessionId":"s1","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"test"},"timestamp":"2024-01-15T10:01:00Z"}`;
      
      const result = parseSessionContent(content);
      
      expect(result).toBeNull();
    });
    
    it('should handle empty content', () => {
      const result = parseSessionContent('');
      expect(result).toBeNull();
    });
  });
  
  describe('extractProjectName()', () => {
    it('should extract last segment of path', () => {
      expect(extractProjectName('/Users/testuser/dev/vibe-log')).toBe('vibe-log');
      expect(extractProjectName('/Users/testuser/my-project')).toBe('my-project');
      expect(extractProjectName('/home/user/workspace/app')).toBe('app');
    });
    
    it('should handle root paths', () => {
      expect(extractProjectName('/')).toBe('');  // Root path returns empty string
      expect(extractProjectName('/Users')).toBe('Users');
    });
  });
  
  describe('createProjectFromSessionData()', () => {
    // Use recent dates for tests
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5); // 5 days ago
    const olderDate = new Date();
    olderDate.setDate(olderDate.getDate() - 10); // 10 days ago
    
    const sessionFiles: SessionFileInfo[] = [
      { path: '/test/session1.jsonl', size: 1024, mtime: recentDate },
      { path: '/test/session2.jsonl', size: 2048, mtime: olderDate }
    ];
    
    it('should create project from valid session data', () => {
      const sessionData = {
        cwd: '/Users/testuser/vibe-log',
        sessionId: 's1',
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const project = createProjectFromSessionData(
        '/test/home/.claude/projects/-Users-testuser-vibe-log',
        '-Users-testuser-vibe-log',
        sessionData,
        sessionFiles
      );
      
      expect(project).not.toBeNull();
      expect(project?.name).toBe('vibe-log');
      expect(project?.actualPath).toBe('/Users/testuser/vibe-log');
      expect(project?.claudePath).toBe('/test/home/.claude/projects/-Users-testuser-vibe-log');
      expect(project?.sessions).toBe(2);
      expect(project?.size).toBe(3072);
      expect(project?.isActive).toBe(true);
      expect(project?.lastActivity).toEqual(recentDate);
    });
    
    it('should return null if no cwd in session data', () => {
      const sessionData = {
        sessionId: 's1',
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const project = createProjectFromSessionData(
        '/test/home/.claude/projects/project',
        'project',
        sessionData,
        sessionFiles
      );
      
      expect(project).toBeNull();
    });
    
    it('should return null if session data is null', () => {
      const project = createProjectFromSessionData(
        '/test/home/.claude/projects/project',
        'project',
        null,
        sessionFiles
      );
      
      expect(project).toBeNull();
    });
    
    it('should mark old projects as inactive', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45); // 45 days ago
      
      const oldSessions: SessionFileInfo[] = [
        { path: '/test/session1.jsonl', size: 1024, mtime: oldDate }
      ];
      
      const sessionData = {
        cwd: '/Users/testuser/old-project',
        sessionId: 's1'
      };
      
      const project = createProjectFromSessionData(
        '/test/home/.claude/projects/old-project',
        'old-project',
        sessionData,
        oldSessions
      );
      
      expect(project).not.toBeNull();
      expect(project?.isActive).toBe(false);
    });
  });
  
  describe('matchProjectToPath()', () => {
    const projects: ClaudeProject[] = [
      {
        name: 'vibe-log',
        claudePath: '/test/.claude/projects/-Users-testuser-vibe-log',
        actualPath: '/Users/testuser/vibe-log',
        sessions: 2,
        lastActivity: new Date('2024-01-15T10:00:00Z'),
        isActive: true,
        size: 1024
      },
      {
        name: 'another-project',
        claudePath: '/test/.claude/projects/-Users-testuser-another-project',
        actualPath: '/Users/testuser/another-project',
        sessions: 1,
        lastActivity: new Date('2024-01-14T10:00:00Z'),
        isActive: true,
        size: 2048
      }
    ];
    
    it('should match exact project path', () => {
      const match = matchProjectToPath(projects, '/Users/testuser/vibe-log');
      expect(match).not.toBeNull();
      expect(match?.name).toBe('vibe-log');
    });
    
    it('should match subdirectory of project', () => {
      const match = matchProjectToPath(projects, '/Users/testuser/vibe-log/src/lib');
      expect(match).not.toBeNull();
      expect(match?.name).toBe('vibe-log');
    });
    
    it('should return null for non-matching path', () => {
      const match = matchProjectToPath(projects, '/Users/testuser/random-folder');
      expect(match).toBeNull();
    });
    
    it('should handle empty project list', () => {
      const match = matchProjectToPath([], '/Users/testuser/vibe-log');
      expect(match).toBeNull();
    });
  });
  
  describe('sortProjectsByActivity()', () => {
    it('should sort projects by last activity (most recent first)', () => {
      const projects: ClaudeProject[] = [
        {
          name: 'old',
          claudePath: '/test/old',
          actualPath: '/old',
          sessions: 1,
          lastActivity: new Date('2024-01-10T10:00:00Z'),
          isActive: true,
          size: 1024
        },
        {
          name: 'newest',
          claudePath: '/test/newest',
          actualPath: '/newest',
          sessions: 1,
          lastActivity: new Date('2024-01-20T10:00:00Z'),
          isActive: true,
          size: 1024
        },
        {
          name: 'middle',
          claudePath: '/test/middle',
          actualPath: '/middle',
          sessions: 1,
          lastActivity: new Date('2024-01-15T10:00:00Z'),
          isActive: true,
          size: 1024
        }
      ];
      
      const sorted = sortProjectsByActivity(projects);
      
      expect(sorted[0].name).toBe('newest');
      expect(sorted[1].name).toBe('middle');
      expect(sorted[2].name).toBe('old');
    });
    
    it('should handle projects without lastActivity', () => {
      const projects: ClaudeProject[] = [
        {
          name: 'with-date',
          claudePath: '/test/with-date',
          actualPath: '/with-date',
          sessions: 1,
          lastActivity: new Date('2024-01-15T10:00:00Z'),
          isActive: true,
          size: 1024
        },
        {
          name: 'no-date',
          claudePath: '/test/no-date',
          actualPath: '/no-date',
          sessions: 1,
          lastActivity: null,
          isActive: false,
          size: 1024
        }
      ];
      
      const sorted = sortProjectsByActivity(projects);
      
      expect(sorted[0].name).toBe('with-date');
      expect(sorted[1].name).toBe('no-date');
    });
  });
  
  describe('filterActiveProjects()', () => {
    it('should filter projects active within specified days', () => {
      const now = new Date();
      const recent = new Date();
      recent.setDate(recent.getDate() - 5); // 5 days ago
      const old = new Date();
      old.setDate(old.getDate() - 40); // 40 days ago
      
      const projects: ClaudeProject[] = [
        {
          name: 'recent',
          claudePath: '/test/recent',
          actualPath: '/recent',
          sessions: 1,
          lastActivity: recent,
          isActive: true,
          size: 1024
        },
        {
          name: 'old',
          claudePath: '/test/old',
          actualPath: '/old',
          sessions: 1,
          lastActivity: old,
          isActive: false,
          size: 1024
        }
      ];
      
      const active = filterActiveProjects(projects, 30);
      
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('recent');
    });
    
    it('should use default 30 days if not specified', () => {
      const recent = new Date();
      recent.setDate(recent.getDate() - 20); // 20 days ago
      
      const projects: ClaudeProject[] = [
        {
          name: 'recent',
          claudePath: '/test/recent',
          actualPath: '/recent',
          sessions: 1,
          lastActivity: recent,
          isActive: true,
          size: 1024
        }
      ];
      
      const active = filterActiveProjects(projects);
      
      expect(active).toHaveLength(1);
    });
  });
});