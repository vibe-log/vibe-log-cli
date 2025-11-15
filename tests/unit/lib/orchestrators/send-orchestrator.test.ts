import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SendOrchestrator } from '../../../../src/lib/orchestrators/send-orchestrator';
import * as authModule from '../../../../src/lib/auth/token';
import * as claudeModule from '../../../../src/lib/readers/claude';
import * as configModule from '../../../../src/lib/config';
import * as apiClientModule from '../../../../src/lib/api-client';
import * as claudeCoreModule from '../../../../src/lib/claude-core';
import * as fs from 'fs/promises';
import path from 'path';

// Mock all dependencies
vi.mock('../../../../src/lib/auth/token');
vi.mock('../../../../src/lib/readers/claude');
vi.mock('../../../../src/lib/config');
vi.mock('../../../../src/lib/api-client');
vi.mock('../../../../src/lib/claude-core');
vi.mock('../../../../src/utils/logger');
vi.mock('fs/promises');

describe('SendOrchestrator', () => {
  const mockGetToken = vi.mocked(authModule.getToken);
  const mockRequireAuth = vi.mocked(authModule.requireAuth);
  const mockReadClaudeSessions = vi.mocked(claudeModule.readClaudeSessions);
  const mockGetProjectSyncData = vi.mocked(configModule.getProjectSyncData);
  const mockUpdateProjectSyncBoundaries = vi.mocked(configModule.updateProjectSyncBoundaries);
  const mockSetLastSyncSummary = vi.mocked(configModule.setLastSyncSummary);
  const mockApiClient = vi.mocked(apiClientModule.apiClient);
  const mockAnalyzeProject = vi.mocked(claudeCoreModule.analyzeProject);
  const mockFs = vi.mocked(fs);

  let orchestrator: SendOrchestrator;
  const originalCwd = process.cwd();

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new SendOrchestrator();
    
    // Default mocks
    mockGetToken.mockResolvedValue('test-token');
    mockRequireAuth.mockResolvedValue();
    mockApiClient.uploadSessions = vi.fn().mockResolvedValue({
      success: true,
      sessionsProcessed: 1
    });
    
    // Mock process.cwd
    Object.defineProperty(process, 'cwd', {
      value: () => '/home/user/projects/my-app',
      configurable: true
    });
  });

  afterEach(() => {
    // Restore original cwd
    Object.defineProperty(process, 'cwd', {
      value: () => originalCwd,
      configurable: true
    });
  });

  describe('loadSessions with --all flag and claudeProjectDir', () => {
    const mockSessions = [
      {
        id: 'session1',
        tool: 'claude_code' as const,
        projectPath: '/home/user/projects/app1',
        timestamp: new Date(),
        duration: 300,
        messages: [
          { role: 'user' as const, content: 'Hello from app1', timestamp: new Date() }
        ],
        metadata: { files_edited: 1, languages: ['typescript'] }
      },
      {
        id: 'session2',
        tool: 'claude_code' as const,
        projectPath: '/home/user/projects/app2',
        timestamp: new Date(),
        duration: 400,
        messages: [
          { role: 'user' as const, content: 'Hello from app2', timestamp: new Date() }
        ],
        metadata: { files_edited: 2, languages: ['javascript'] }
      },
      {
        id: 'session3',
        tool: 'claude_code' as const,
        projectPath: '/home/user/projects/my-app',
        timestamp: new Date(),
        duration: 500,
        messages: [
          { role: 'user' as const, content: 'Hello from my-app', timestamp: new Date() }
        ],
        metadata: { files_edited: 3, languages: ['typescript'] }
      }
    ];

    it('should load all sessions when --all flag is set regardless of claudeProjectDir', async () => {
      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      
      const sessions = await orchestrator.loadSessions({
        all: true,
        claudeProjectDir: '/home/user/.claude/projects/-home-user-projects-my-app'
      });
      
      // Should get all sessions, not filtered by claudeProjectDir
      expect(sessions).toHaveLength(3);
      expect(sessions).toEqual(mockSessions);
      
      // Should not have called analyzeProject since --all overrides
      expect(mockAnalyzeProject).not.toHaveBeenCalled();
      
      // Should have called readClaudeSessions without projectPath filter
      expect(mockReadClaudeSessions).toHaveBeenCalledWith({
        since: undefined
      });
    });

    it('should load only project sessions when claudeProjectDir is set without --all', async () => {
      const projectSessions = [mockSessions[2]]; // Only my-app session
      
      mockAnalyzeProject.mockResolvedValue({
        name: 'my-app',
        claudePath: '/home/user/.claude/projects/-home-user-projects-my-app',
        actualPath: '/home/user/projects/my-app',
        lastModified: new Date()
      });
      
      mockReadClaudeSessions.mockResolvedValue(projectSessions);
      
      const sessions = await orchestrator.loadSessions({
        claudeProjectDir: '/home/user/.claude/projects/-home-user-projects-my-app'
      });
      
      // Should only get the my-app session
      expect(sessions).toHaveLength(1);
      expect(sessions[0].projectPath).toBe('/home/user/projects/my-app');
      
      // Should have analyzed the project
      expect(mockAnalyzeProject).toHaveBeenCalledWith(
        '/home/user/.claude/projects/-home-user-projects-my-app',
        '-home-user-projects-my-app'
      );
      
      // Should have called readClaudeSessions with project filter
      expect(mockReadClaudeSessions).toHaveBeenCalledWith({
        since: undefined,
        projectPath: '/home/user/projects/my-app'
      });
    });

    it('should handle empty claudeProjectDir with --all flag gracefully', async () => {
      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      
      const sessions = await orchestrator.loadSessions({
        all: true,
        claudeProjectDir: '' // Empty string
      });
      
      // Should still load all sessions
      expect(sessions).toHaveLength(3);
      expect(sessions).toEqual(mockSessions);
      
      // Should not try to analyze empty project dir
      expect(mockAnalyzeProject).not.toHaveBeenCalled();
    });

    it('should handle undefined claudeProjectDir with --all flag', async () => {
      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      
      const sessions = await orchestrator.loadSessions({
        all: true,
        claudeProjectDir: undefined
      });
      
      // Should load all sessions
      expect(sessions).toHaveLength(3);
      expect(sessions).toEqual(mockSessions);
    });

    it('should filter to current directory when neither --all nor claudeProjectDir is provided', async () => {
      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      
      const sessions = await orchestrator.loadSessions({});
      
      // Should only get sessions from current directory (my-app)
      expect(sessions).toHaveLength(1);
      expect(sessions[0].projectPath).toBe('/home/user/projects/my-app');
      
      // Should have called readClaudeSessions without filters
      expect(mockReadClaudeSessions).toHaveBeenCalledWith({
        since: undefined
      });
    });

    it('should handle hook trigger with claudeProjectDir and apply since date', async () => {
      const recentDate = new Date('2024-01-15');
      mockGetProjectSyncData.mockReturnValue({
        newestSyncedTimestamp: recentDate.toISOString(),
        oldestSyncedTimestamp: new Date('2024-01-01').toISOString(),
        lastUpdated: Date.now(),
        projectName: 'my-app',
        sessionCount: 5
      });
      
      mockAnalyzeProject.mockResolvedValue({
        name: 'my-app',
        claudePath: '/home/user/.claude/projects/-home-user-projects-my-app',
        actualPath: '/home/user/projects/my-app',
        lastModified: new Date()
      });
      
      mockReadClaudeSessions.mockResolvedValue([mockSessions[2]]);
      
      const sessions = await orchestrator.loadSessions({
        hookTrigger: 'sessionstart',
        claudeProjectDir: '/home/user/.claude/projects/-home-user-projects-my-app'
      });
      
      // Should have used the sync data to determine since date
      expect(mockGetProjectSyncData).toHaveBeenCalledWith('-home-user-projects-my-app');
      
      // Should have called readClaudeSessions with since date
      expect(mockReadClaudeSessions).toHaveBeenCalledWith({
        since: recentDate,
        projectPath: '/home/user/projects/my-app'
      });
    });

    it('should prioritize --all flag over claudeProjectDir in hook mode', async () => {
      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      
      const sessions = await orchestrator.loadSessions({
        all: true,
        hookTrigger: 'precompact',
        claudeProjectDir: '/home/user/.claude/projects/-home-user-projects-my-app'
      });
      
      // Should load all sessions despite claudeProjectDir being set
      expect(sessions).toHaveLength(3);
      
      // Should not analyze project when --all is set
      expect(mockAnalyzeProject).not.toHaveBeenCalled();
      
      // Should not filter by project
      expect(mockReadClaudeSessions).toHaveBeenCalledWith({
        since: undefined
      });
    });
  });

  describe('updateSyncState', () => {
    const mockSessions = [
      {
        id: 'session1',
        tool: 'claude_code' as const,
        projectPath: '/home/user/projects/my-app',
        timestamp: new Date('2024-01-10'),
        duration: 300,
        messages: [],
        metadata: {}
      },
      {
        id: 'session2',
        tool: 'claude_code' as const,
        projectPath: '/home/user/projects/my-app',
        timestamp: new Date('2024-01-15'),
        duration: 400,
        messages: [],
        metadata: {}
      }
    ];

    it('should update sync state correctly when --all flag is used', async () => {
      await orchestrator.updateSyncState(mockSessions, { all: true });
      
      expect(mockSetLastSyncSummary).toHaveBeenCalledWith('all projects');
      expect(mockUpdateProjectSyncBoundaries).not.toHaveBeenCalled();
    });

    it('should update project-specific sync state when claudeProjectDir is provided', async () => {
      await orchestrator.updateSyncState(mockSessions, {
        claudeProjectDir: '/home/user/.claude/projects/-home-user-projects-my-app'
      });
      
      expect(mockUpdateProjectSyncBoundaries).toHaveBeenCalledWith(
        '-home-user-projects-my-app',
        '2024-01-10T00:00:00.000Z',
        '2024-01-15T00:00:00.000Z',
        'my-app',
        2
      );
      
      expect(mockSetLastSyncSummary).toHaveBeenCalledWith('my-app');
    });

    it('should handle empty sessions array gracefully', async () => {
      await orchestrator.updateSyncState([], { all: true });
      
      // Should not update anything
      expect(mockSetLastSyncSummary).not.toHaveBeenCalled();
      expect(mockUpdateProjectSyncBoundaries).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeSessions - session filtering', () => {
    it('should filter out sessions shorter than 4 minutes', async () => {
      const sessions = [
        {
          id: 'session1',
          tool: 'claude_code' as const,
          projectPath: '/home/user/projects/my-app',
          timestamp: new Date(),
          duration: 120, // 2 minutes - too short
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: {}
        },
        {
          id: 'session2',
          tool: 'claude_code' as const,
          projectPath: '/home/user/projects/my-app',
          timestamp: new Date(),
          duration: 300, // 5 minutes - valid
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: {}
        }
      ];

      const result = await orchestrator.sanitizeSessions(sessions);

      // Should only include the longer session
      expect(result).toHaveLength(1);
      expect(result[0].duration).toBe(300);
    });

    it('should throw error when all sessions are too short (non-initial sync)', async () => {
      const shortSessions = [
        {
          id: 'session1',
          tool: 'claude_code' as const,
          projectPath: '/home/user/projects/my-app',
          timestamp: new Date(),
          duration: 180, // 3 minutes - too short
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: {}
        }
      ];

      await expect(orchestrator.sanitizeSessions(shortSessions))
        .rejects
        .toThrow(/All 1 session.*shorter than 4 minutes/);
    });

    it('should NOT throw error when all sessions are too short during initial sync', async () => {
      const shortSessions = [
        {
          id: 'session1',
          tool: 'claude_code' as const,
          projectPath: '/home/user/projects/my-app',
          timestamp: new Date(),
          duration: 180, // 3 minutes - too short
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: {}
        }
      ];

      const result = await orchestrator.sanitizeSessions(shortSessions, { isInitialSync: true });

      // Should return empty array without throwing
      expect(result).toHaveLength(0);
    });
  });

  describe('uploadSessions - error handling', () => {
    it('should log errors in silent mode', async () => {
      const apiSessions = [{
        tool: 'claude_code' as const,
        timestamp: new Date().toISOString(),
        duration: 300,
        data: {
          projectName: 'my-app',
          messageSummary: '[]',
          messageCount: 1,
          metadata: {}
        }
      }];

      const uploadError = new Error('Network failure');
      mockApiClient.uploadSessions = vi.fn().mockRejectedValue(uploadError);

      await expect(
        orchestrator.uploadSessions(apiSessions, { silent: true })
      ).rejects.toThrow('Network failure');

      // Error should have been logged
      expect(mockApiClient.uploadSessions).toHaveBeenCalledWith(apiSessions, undefined);
    });

    it('should propagate upload errors in non-silent mode', async () => {
      const apiSessions = [{
        tool: 'claude_code' as const,
        timestamp: new Date().toISOString(),
        duration: 300,
        data: {
          projectName: 'my-app',
          messageSummary: '[]',
          messageCount: 1,
          metadata: {}
        }
      }];

      const uploadError = new Error('API Error');
      mockApiClient.uploadSessions = vi.fn().mockRejectedValue(uploadError);

      await expect(
        orchestrator.uploadSessions(apiSessions, {})
      ).rejects.toThrow('API Error');
    });

    it('should handle successful upload with progress callback', async () => {
      const apiSessions = [{
        tool: 'claude_code' as const,
        timestamp: new Date().toISOString(),
        duration: 300,
        data: {
          projectName: 'my-app',
          messageSummary: '[]',
          messageCount: 1,
          metadata: {}
        }
      }];

      const progressCallback = vi.fn();
      mockApiClient.uploadSessions = vi.fn().mockResolvedValue({
        success: true,
        sessionsProcessed: 1
      });

      const result = await orchestrator.uploadSessions(apiSessions, {}, progressCallback);

      expect(result.success).toBe(true);
      expect(mockApiClient.uploadSessions).toHaveBeenCalledWith(apiSessions, progressCallback);
    });
  });

  describe('execute - full workflow', () => {
    beforeEach(() => {
      // Mock syncPushUpStats to avoid errors
      vi.mock('../../../../src/lib/push-up-sync', () => ({
        syncPushUpStats: vi.fn().mockResolvedValue(undefined)
      }));
    });

    it('should handle no sessions found (silent mode)', async () => {
      mockReadClaudeSessions.mockResolvedValue([]);

      // Should not throw
      await orchestrator.execute({ silent: true });

      // Should have checked auth
      expect(mockGetToken).toHaveBeenCalled();

      // Should not have uploaded
      expect(mockApiClient.uploadSessions).not.toHaveBeenCalled();
    });

    it('should handle no sessions found (non-silent mode)', async () => {
      mockReadClaudeSessions.mockResolvedValue([]);

      await orchestrator.execute({});

      // Should have checked auth
      expect(mockRequireAuth).toHaveBeenCalled();

      // Should not have uploaded
      expect(mockApiClient.uploadSessions).not.toHaveBeenCalled();
    });

    it('should handle dry run mode (silent)', async () => {
      const mockSessions = [{
        id: 'session1',
        tool: 'claude_code' as const,
        projectPath: '/home/user/projects/my-app',
        timestamp: new Date(),
        duration: 300,
        messages: [
          { role: 'user' as const, content: 'Test', timestamp: new Date() }
        ],
        metadata: {}
      }];

      mockReadClaudeSessions.mockResolvedValue(mockSessions);

      await orchestrator.execute({ dry: true, silent: true });

      // Should not upload in dry run
      expect(mockApiClient.uploadSessions).not.toHaveBeenCalled();
    });

    it('should handle dry run mode (non-silent)', async () => {
      const mockSessions = [{
        id: 'session1',
        tool: 'claude_code' as const,
        projectPath: '/home/user/projects/my-app',
        timestamp: new Date(),
        duration: 300,
        messages: [
          { role: 'user' as const, content: 'Test', timestamp: new Date() }
        ],
        metadata: {}
      }];

      mockReadClaudeSessions.mockResolvedValue(mockSessions);

      await orchestrator.execute({ dry: true });

      // Should not upload in dry run
      expect(mockApiClient.uploadSessions).not.toHaveBeenCalled();
    });

    it('should log results in silent mode with points', async () => {
      const mockSessions = [{
        id: 'session1',
        tool: 'claude_code' as const,
        projectPath: '/home/user/projects/my-app',
        timestamp: new Date(),
        duration: 300,
        messages: [
          { role: 'user' as const, content: 'Test', timestamp: new Date() }
        ],
        metadata: {}
      }];

      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      mockApiClient.uploadSessions = vi.fn().mockResolvedValue({
        success: true,
        sessionsProcessed: 1,
        pointsEarned: {
          total: 15,
          streak: 10,
          volume: 5
        }
      });

      await orchestrator.execute({ silent: true });

      expect(mockApiClient.uploadSessions).toHaveBeenCalled();
      expect(mockSetLastSyncSummary).toHaveBeenCalled();
    });

    it('should log results in silent mode without points', async () => {
      const mockSessions = [{
        id: 'session1',
        tool: 'claude_code' as const,
        projectPath: '/home/user/projects/my-app',
        timestamp: new Date(),
        duration: 300,
        messages: [
          { role: 'user' as const, content: 'Test', timestamp: new Date() }
        ],
        metadata: {}
      }];

      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      mockApiClient.uploadSessions = vi.fn().mockResolvedValue({
        success: true,
        sessionsProcessed: 1
      });

      await orchestrator.execute({ silent: true });

      expect(mockApiClient.uploadSessions).toHaveBeenCalled();
      expect(mockSetLastSyncSummary).toHaveBeenCalled();
    });

    it('should throw error in silent mode when not authenticated', async () => {
      mockGetToken.mockResolvedValue(null);

      await expect(orchestrator.execute({ silent: true }))
        .rejects
        .toThrow('Not authenticated');
    });
  });

  describe('authenticate', () => {
    it('should use requireAuth in non-silent mode', async () => {
      await orchestrator.authenticate({});

      expect(mockRequireAuth).toHaveBeenCalled();
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('should check token in silent mode', async () => {
      mockGetToken.mockResolvedValue('valid-token');

      await orchestrator.authenticate({ silent: true });

      expect(mockGetToken).toHaveBeenCalled();
      expect(mockRequireAuth).not.toHaveBeenCalled();
    });

    it('should throw error in silent mode when no token', async () => {
      mockGetToken.mockResolvedValue(null);

      await expect(orchestrator.authenticate({ silent: true }))
        .rejects
        .toThrow('Not authenticated');
    });
  });

  describe('uploadSessions - debug mode', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.VIBELOG_DEBUG;
    });

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.VIBELOG_DEBUG = originalEnv;
      } else {
        delete process.env.VIBELOG_DEBUG;
      }
    });

    it('should log debug info when VIBELOG_DEBUG=true', async () => {
      process.env.VIBELOG_DEBUG = 'true';

      const apiSessions = [{
        tool: 'claude_code' as const,
        timestamp: new Date().toISOString(),
        duration: 300,
        data: {
          projectName: 'my-app',
          messageSummary: '[]',
          messageCount: 1,
          metadata: {}
        }
      }];

      mockApiClient.uploadSessions = vi.fn().mockResolvedValue({
        success: true,
        sessionsProcessed: 1
      });

      const consoleSpy = vi.spyOn(console, 'log');

      await orchestrator.uploadSessions(apiSessions, {});

      // Should have logged debug info
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        expect.anything(),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });

    it('should log debug error when upload fails in debug mode', async () => {
      process.env.VIBELOG_DEBUG = 'true';

      const apiSessions = [{
        tool: 'claude_code' as const,
        timestamp: new Date().toISOString(),
        duration: 300,
        data: {
          projectName: 'my-app',
          messageSummary: '[]',
          messageCount: 1,
          metadata: {}
        }
      }];

      const uploadError = new Error('Debug test error');
      mockApiClient.uploadSessions = vi.fn().mockRejectedValue(uploadError);

      const consoleSpy = vi.spyOn(console, 'log');

      await expect(
        orchestrator.uploadSessions(apiSessions, {})
      ).rejects.toThrow('Debug test error');

      // Should have logged debug error
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });
  });

  describe('execute - debug logging in results', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.VIBELOG_DEBUG;
    });

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.VIBELOG_DEBUG = originalEnv;
      } else {
        delete process.env.VIBELOG_DEBUG;
      }
    });

    it('should log results with debug info in non-silent mode', async () => {
      const mockSessions = [{
        id: 'session1',
        tool: 'claude_code' as const,
        projectPath: '/home/user/projects/my-app',
        timestamp: new Date(),
        duration: 300,
        messages: [
          { role: 'user' as const, content: 'Test', timestamp: new Date() }
        ],
        metadata: {}
      }];

      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      mockApiClient.uploadSessions = vi.fn().mockResolvedValue({
        success: true,
        sessionsProcessed: 1
      });

      await orchestrator.execute({});

      expect(mockApiClient.uploadSessions).toHaveBeenCalled();
    });
  });

  describe('sanitizeSessions - multiple filtered sessions', () => {
    it('should filter multiple short sessions and keep valid ones', async () => {
      const sessions = [
        {
          id: 'session1',
          tool: 'claude_code' as const,
          projectPath: '/home/user/projects/my-app',
          timestamp: new Date(),
          duration: 120, // Too short
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: {}
        },
        {
          id: 'session2',
          tool: 'claude_code' as const,
          projectPath: '/home/user/projects/my-app',
          timestamp: new Date(),
          duration: 180, // Too short
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: {}
        },
        {
          id: 'session3',
          tool: 'claude_code' as const,
          projectPath: '/home/user/projects/my-app',
          timestamp: new Date(),
          duration: 300, // Valid
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: {}
        }
      ];

      const result = await orchestrator.sanitizeSessions(sessions);

      // Should only include the valid session
      expect(result).toHaveLength(1);
      expect(result[0].duration).toBe(300);
    });

    it('should throw error with correct count when multiple sessions filtered', async () => {
      const shortSessions = [
        {
          id: 'session1',
          tool: 'claude_code' as const,
          projectPath: '/home/user/projects/my-app',
          timestamp: new Date(),
          duration: 180,
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: {}
        },
        {
          id: 'session2',
          tool: 'claude_code' as const,
          projectPath: '/home/user/projects/my-app',
          timestamp: new Date(),
          duration: 200,
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: {}
        }
      ];

      await expect(orchestrator.sanitizeSessions(shortSessions))
        .rejects
        .toThrow(/All 2 session.*shorter than 4 minutes/);
    });
  });
});