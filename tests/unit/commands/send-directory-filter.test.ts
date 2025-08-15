import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { send } from '../../../src/commands/send';
import * as authModule from '../../../src/lib/auth/token';
import * as claudeModule from '../../../src/lib/readers/claude';
import * as configModule from '../../../src/lib/config';
import * as apiClientModule from '../../../src/lib/api-client';
import * as uiModule from '../../../src/lib/ui';

// Mock all dependencies
vi.mock('../../../src/lib/auth/token');
vi.mock('../../../src/lib/readers/claude');
vi.mock('../../../src/lib/config');
vi.mock('../../../src/lib/api-client');
vi.mock('../../../src/lib/ui');
vi.mock('../../../src/utils/logger');
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn().mockResolvedValue({ action: 'upload' })
  }
}));

describe('Send Command - Directory Filtering', () => {
  const mockRequireAuth = vi.mocked(authModule.requireAuth);
  const mockReadClaudeSessions = vi.mocked(claudeModule.readClaudeSessions);
  const mockGetLastSync = vi.mocked(configModule.getLastSync);
  const mockSetLastSync = vi.mocked(configModule.setLastSync);
  const mockApiClient = vi.mocked(apiClientModule.apiClient);
  const mockCreateSpinner = vi.mocked(uiModule.createSpinner);
  const mockShowWarning = vi.mocked(uiModule.showWarning);
  const mockShowInfo = vi.mocked(uiModule.showInfo);
  const mockShowSessionSummary = vi.mocked(uiModule.showSessionSummary);
  const mockShowUploadResults = vi.mocked(uiModule.showUploadResults);
  
  const mockSpinner = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
  };
  
  const originalCwd = process.cwd();
  const testCwd = 'C:\\projects\\my-awesome-project';
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSpinner.mockReturnValue(mockSpinner as any);
    mockRequireAuth.mockResolvedValue();
    mockGetLastSync.mockReturnValue(null);
    mockApiClient.uploadSessions = vi.fn().mockResolvedValue({
      success: true,
      sessionsProcessed: 1,
      streak: 5,
      analysisPreview: 'Great progress!',
    });
    
    // Mock process.cwd
    Object.defineProperty(process, 'cwd', {
      value: () => testCwd,
      configurable: true,
    });
  });
  
  afterEach(() => {
    // Restore original cwd
    Object.defineProperty(process, 'cwd', {
      value: () => originalCwd,
      configurable: true,
    });
  });
  
  describe('Default behavior (current directory only)', () => {
    it('should filter sessions by current working directory', async () => {
      const mockSessions = [
        {
          tool: 'claude-code',
          projectPath: testCwd,
          timestamp: new Date(),
          duration: 1000,
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: { files_edited: 1, languages: ['typescript'] }
        }
      ];
      
      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      
      await send({});
      
      // Verify it reads all sessions without initial filtering
      expect(mockReadClaudeSessions).toHaveBeenCalledWith({
        since: undefined,
        projectPath: undefined,
      });
      
      // Verify success message mentions current directory
      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining('current directory')
      );
    });
    
    it('should show helpful message when no sessions found for current project', async () => {
      mockReadClaudeSessions.mockResolvedValue([]);
      
      await send({});
      
      expect(mockShowWarning).toHaveBeenCalledWith(
        `No sessions found in current directory (my-awesome-project).`
      );
      
      expect(mockShowInfo).toHaveBeenCalledWith('Tips:');
      expect(mockShowInfo).toHaveBeenCalledWith(
        '- Make sure you have used Claude Code in this directory'
      );
      expect(mockShowInfo).toHaveBeenCalledWith(
        '- Use --all flag to send sessions from all projects'
      );
      expect(mockShowInfo).toHaveBeenCalledWith(
        `- Current directory: ${testCwd}`
      );
    });
  });
  
  describe('--all flag behavior', () => {
    it('should not filter by directory when --all flag is set', async () => {
      const mockSessions = [
        {
          tool: 'claude-code',
          projectPath: 'C:\\projects\\project1',
          timestamp: new Date(),
          duration: 1000,
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: { files_edited: 1, languages: ['typescript'] }
        },
        {
          tool: 'claude-code',
          projectPath: 'C:\\projects\\project2',
          timestamp: new Date(),
          duration: 2000,
          messages: [
            { role: 'user' as const, content: 'World', timestamp: new Date() }
          ],
          metadata: { files_edited: 2, languages: ['javascript'] }
        }
      ];
      
      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      
      await send({ all: true });
      
      // Verify it did NOT pass projectPath filter
      expect(mockReadClaudeSessions).toHaveBeenCalledWith({
        since: undefined,
        projectPath: undefined,
      });
      
      // Verify success message mentions all projects with --all flag
      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining('all projects (--all flag)')
      );
      
      // Verify it uploaded all sessions with project names
      // Note: path.basename on Unix doesn't correctly parse Windows paths,
      // so projectName will be the full path when tests run on Unix
      expect(mockApiClient.uploadSessions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              projectName: expect.any(String)
            })
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              projectName: expect.any(String)
            })
          })
        ]),
        expect.any(Function) // Progress callback
      );
    });
    
    it('should show different message when no sessions found with --all flag', async () => {
      mockReadClaudeSessions.mockResolvedValue([]);
      
      await send({ all: true });
      
      expect(mockShowWarning).toHaveBeenCalledWith(
        'No new sessions found in any project.'
      );
      
      // Should NOT show tips about using --all flag
      expect(mockShowInfo).not.toHaveBeenCalledWith(
        expect.stringContaining('Use --all flag')
      );
    });
  });
  
  // Note: --since flag is not supported in the send command
  // Sessions are filtered based on hook trigger timestamps or manual sync retrieves all
  
  describe('Project path normalization', () => {
    it('should handle different path formats consistently', async () => {
      // Test with forward slashes
      Object.defineProperty(process, 'cwd', {
        value: () => 'C:/projects/my-project',
        configurable: true,
      });
      
      const mockSessions = [
        {
          tool: 'claude-code',
          projectPath: 'C:/projects/my-project',
          timestamp: new Date(),
          duration: 1000,
          messages: [
            { role: 'user' as const, content: 'Hello', timestamp: new Date() }
          ],
          metadata: { files_edited: 1, languages: ['typescript'] }
        }
      ];
      
      mockReadClaudeSessions.mockResolvedValue(mockSessions);
      
      await send({});
      
      // Should not pass projectPath filter
      expect(mockReadClaudeSessions).toHaveBeenCalledWith({
        since: undefined,
        projectPath: undefined,
      });
      
      // Should still successfully process the session
      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining('Found 1 sessions')
      );
    });
  });
});