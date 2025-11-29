import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectSetupState,
  checkClaudeCodeInstalled,
  checkProjectDirectory,
  type SetupState,
} from '../../../src/lib/detector';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock dependencies
vi.mock('../../../src/lib/config', () => ({
  getAllConfig: vi.fn(() => ({})),
  getToken: vi.fn(async () => null),
  getLastSyncSummary: vi.fn(() => null),
  getDashboardUrl: vi.fn(() => 'https://vibe-log.dev'),
}));

vi.mock('../../../src/lib/claude-settings-reader', () => ({
  getHookMode: vi.fn(async () => 'none'),
  getTrackedProjects: vi.fn(async () => []),
}));

vi.mock('../../../src/lib/status-line-manager', () => ({
  getStatusLineStatus: vi.fn(async () => 'not-installed'),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/lib/sub-agents/constants', () => ({
  VIBE_LOG_SUB_AGENTS: [
    'vibe-log-analysis.md',
    'vibe-log-daily-standup.md',
    'vibe-log-session-analyzer.md',
  ],
}));

// Get the mock functions for easy access
import {
  getAllConfig,
  getToken,
  getLastSyncSummary,
  getDashboardUrl,
} from '../../../src/lib/config';

import {
  getHookMode,
  getTrackedProjects,
} from '../../../src/lib/claude-settings-reader';

import { getStatusLineStatus } from '../../../src/lib/status-line-manager';

const mockGetAllConfig = getAllConfig as any;
const mockGetToken = getToken as any;
const mockGetLastSyncSummary = getLastSyncSummary as any;
const mockGetDashboardUrl = getDashboardUrl as any;
const mockGetHookMode = getHookMode as any;
const mockGetTrackedProjects = getTrackedProjects as any;
const mockGetStatusLineStatus = getStatusLineStatus as any;

describe('detector', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    vi.restoreAllMocks(); // Important: restore fs mocks

    // Set default return values
    mockGetAllConfig.mockReturnValue({});
    mockGetToken.mockResolvedValue(null);
    mockGetLastSyncSummary.mockReturnValue(null);
    mockGetDashboardUrl.mockReturnValue('https://vibe-log.dev');
    mockGetHookMode.mockResolvedValue('none');
    mockGetTrackedProjects.mockResolvedValue([]);
    mockGetStatusLineStatus.mockResolvedValue('not-installed');
  });

  describe('detectSetupState()', () => {
    describe('FIRST_TIME state', () => {
      it('should detect FIRST_TIME when nothing is installed', async () => {
        // Mock no config, no auth, no agents
        mockGetAllConfig.mockReturnValue({});
        mockGetToken.mockResolvedValue(null);

        // Explicitly mock fs to ensure no agents detected
        const mockAccess = vi.spyOn(fs, 'access');
        mockAccess.mockRejectedValue(new Error('Path does not exist'));

        const result = await detectSetupState();

        expect(result.state).toBe('FIRST_TIME');
        expect(result.hasConfig).toBe(false);
        expect(result.hasAuth).toBe(false);
        expect(result.hasAgents).toBe(false);
        expect(result.hasHooks).toBe(false);
      });
    });

    describe('LOCAL_ONLY state', () => {
      it('should detect LOCAL_ONLY when sub-agents installed but no cloud', async () => {
        // Mock sub-agents installed
        mockGetAllConfig.mockReturnValue({ someConfig: 'value' });
        mockGetToken.mockResolvedValue(null);

        // Mock fs to show agents directory exists
        const mockReaddir = vi.spyOn(fs, 'readdir');
        const mockAccess = vi.spyOn(fs, 'access');

        mockAccess.mockImplementation(async (path: any) => {
          const pathStr = path.toString();
          if (pathStr.includes('agents')) {
            return Promise.resolve();
          }
          throw new Error('Path does not exist');
        });

        mockReaddir.mockImplementation(async (path: any) => {
          const pathStr = path.toString();
          if (pathStr.includes('agents')) {
            return ['vibe-log-analysis.md', 'vibe-log-daily-standup.md'] as any;
          }
          return [] as any;
        });

        const result = await detectSetupState();

        expect(result.state).toBe('LOCAL_ONLY');
        expect(result.hasAuth).toBe(false);
        expect(result.hasAgents).toBe(true);
        expect(result.agentCount).toBe(2);
      });
    });

    describe('CLOUD_AUTO state', () => {
      it('should detect CLOUD_AUTO when cloud + hooks + agents installed', async () => {
        // Mock authenticated with config
        mockGetAllConfig.mockReturnValue({ someConfig: 'value' });
        mockGetToken.mockResolvedValue('test-token-123');
        mockGetHookMode.mockResolvedValue('all');

        // Mock agents installed
        const mockReaddir = vi.spyOn(fs, 'readdir');
        const mockAccess = vi.spyOn(fs, 'access');

        mockAccess.mockImplementation(async (path: any) => {
          const pathStr = path.toString();
          if (pathStr.includes('agents')) {
            return Promise.resolve();
          }
          throw new Error('Path does not exist');
        });

        mockReaddir.mockImplementation(async (path: any) => {
          const pathStr = path.toString();
          if (pathStr.includes('agents')) {
            return ['vibe-log-analysis.md', 'vibe-log-daily-standup.md'] as any;
          }
          return [] as any;
        });

        const result = await detectSetupState();

        expect(result.state).toBe('CLOUD_AUTO');
        expect(result.hasAuth).toBe(true);
        expect(result.hasHooks).toBe(true);
        expect(result.hasAgents).toBe(true);
        expect(result.trackingMode).toBe('all');
      });
    });

    describe('CLOUD_MANUAL state', () => {
      it('should detect CLOUD_MANUAL when cloud + agents but no hooks', async () => {
        mockGetAllConfig.mockReturnValue({ someConfig: 'value' });
        mockGetToken.mockResolvedValue('test-token-123');
        mockGetHookMode.mockResolvedValue('none');

        // Mock agents installed
        const mockReaddir = vi.spyOn(fs, 'readdir');
        const mockAccess = vi.spyOn(fs, 'access');

        mockAccess.mockImplementation(async (path: any) => {
          const pathStr = path.toString();
          if (pathStr.includes('agents')) {
            return Promise.resolve();
          }
          throw new Error('Path does not exist');
        });

        mockReaddir.mockImplementation(async (path: any) => {
          const pathStr = path.toString();
          if (pathStr.includes('agents')) {
            return ['vibe-log-analysis.md'] as any;
          }
          return [] as any;
        });

        const result = await detectSetupState();

        expect(result.state).toBe('CLOUD_MANUAL');
        expect(result.hasAuth).toBe(true);
        expect(result.hasHooks).toBe(false);
        expect(result.hasAgents).toBe(true);
      });
    });

    describe('CLOUD_ONLY state', () => {
      it('should detect CLOUD_ONLY when authenticated but no agents', async () => {
        mockGetAllConfig.mockReturnValue({ someConfig: 'value' });
        mockGetToken.mockResolvedValue('test-token-123');

        // Explicitly mock fs to ensure no agents detected
        const mockAccess = vi.spyOn(fs, 'access');
        mockAccess.mockRejectedValue(new Error('Path does not exist'));

        const result = await detectSetupState();

        expect(result.state).toBe('CLOUD_ONLY');
        expect(result.hasAuth).toBe(true);
        expect(result.hasAgents).toBe(false);
      });
    });

    describe('PUSHUP_ONLY state', () => {
      it('should detect PUSHUP_ONLY when only push-up challenge enabled', async () => {
        // Push-up challenge requires some config to not be FIRST_TIME
        mockGetAllConfig.mockReturnValue({ pushUpChallenge: { enabled: true } });
        mockGetToken.mockResolvedValue(null);
        mockGetPushUpChallengeConfig.mockReturnValue({ enabled: true });

        // Explicitly mock fs to ensure no agents detected
        const mockAccess = vi.spyOn(fs, 'access');
        mockAccess.mockRejectedValue(new Error('Path does not exist'));

        const result = await detectSetupState();

        expect(result.state).toBe('PUSHUP_ONLY');
        expect(result.hasAuth).toBe(false);
        expect(result.hasAgents).toBe(false);
        expect(result.hasPushUpChallenge).toBe(true);
      });
    });

    describe('PARTIAL_SETUP state', () => {
      it('should detect PARTIAL_SETUP for incomplete configurations', async () => {
        mockGetAllConfig.mockReturnValue({ someConfig: 'value' });
        mockGetToken.mockResolvedValue(null);
        mockGetHookMode.mockResolvedValue('all'); // Has hooks but no auth

        // Explicitly mock fs to ensure no agents detected
        const mockAccess = vi.spyOn(fs, 'access');
        mockAccess.mockRejectedValue(new Error('Path does not exist'));

        const result = await detectSetupState();

        expect(result.state).toBe('PARTIAL_SETUP');
      });
    });

    describe('Tracking mode detection', () => {
      it('should detect "all" tracking mode', async () => {
        mockGetHookMode.mockResolvedValue('all');
        mockGetAllConfig.mockReturnValue({ config: 'value' });

        const result = await detectSetupState();

        expect(result.trackingMode).toBe('all');
        expect(result.hasHooks).toBe(true);
      });

      it('should detect "selected" tracking mode and count tracked projects', async () => {
        mockGetHookMode.mockResolvedValue('selected');
        mockGetTrackedProjects.mockResolvedValue([
          'project-1',
          'project-2',
          'project-3',
        ]);
        mockGetAllConfig.mockReturnValue({ config: 'value' });

        const result = await detectSetupState();

        expect(result.trackingMode).toBe('selected');
        expect(result.trackedProjectCount).toBe(3);
        expect(result.trackedProjectNames).toEqual(['project-1', 'project-2', 'project-3']);
      });

      it('should not include project names if more than 10 projects', async () => {
        mockGetHookMode.mockResolvedValue('selected');
        const manyProjects = Array.from({ length: 15 }, (_, i) => `project-${i}`);
        mockGetTrackedProjects.mockResolvedValue(manyProjects);
        mockGetAllConfig.mockReturnValue({ config: 'value' });

        const result = await detectSetupState();

        expect(result.trackedProjectCount).toBe(15);
        expect(result.trackedProjectNames).toBeUndefined();
      });

      it('should detect "none" tracking mode', async () => {
        mockGetHookMode.mockResolvedValue('none');
        mockGetAllConfig.mockReturnValue({ config: 'value' });

        const result = await detectSetupState();

        expect(result.trackingMode).toBe('none');
        expect(result.hasHooks).toBe(false);
        expect(result.trackedProjectCount).toBe(0);
      });
    });

    describe('Status line detection', () => {
      it('should detect installed status line', async () => {
        mockGetStatusLineStatus.mockResolvedValue('installed');

        const result = await detectSetupState();

        expect(result.hasStatusLine).toBe(true);
        expect(result.statusLineStatus).toBe('installed');
      });

      it('should detect not-installed status line', async () => {
        mockGetStatusLineStatus.mockResolvedValue('not-installed');

        const result = await detectSetupState();

        expect(result.hasStatusLine).toBe(false);
        expect(result.statusLineStatus).toBe('not-installed');
      });
    });

    describe('Last sync information', () => {
      it('should include last sync date when available', async () => {
        const syncDate = new Date('2025-01-15');
        mockGetAllConfig.mockReturnValue({ lastSync: syncDate.toISOString() });

        const result = await detectSetupState();

        expect(result.lastSync).toBeInstanceOf(Date);
        expect(result.lastSync?.toISOString()).toBe(syncDate.toISOString());
      });

      it('should include last sync summary when available', async () => {
        mockGetLastSyncSummary.mockReturnValue({
          description: 'Last synced project-name',
          sessionCount: 5,
        });

        const result = await detectSetupState();

        expect(result.lastSyncProject).toBe('Last synced project-name');
      });
    });

    describe('Warnings and errors', () => {
      it('should add warning when not all sub-agents are installed', async () => {
        const mockReaddir = vi.spyOn(fs, 'readdir');
        const mockAccess = vi.spyOn(fs, 'access');

        mockAccess.mockImplementation(async (path: any) => {
          const pathStr = path.toString();
          if (pathStr.includes('agents')) {
            return Promise.resolve();
          }
          throw new Error('Path does not exist');
        });

        mockReaddir.mockImplementation(async (path: any) => {
          const pathStr = path.toString();
          if (pathStr.includes('agents')) {
            return ['vibe-log-analysis.md'] as any; // Only 1 of 3 agents
          }
          return [] as any;
        });

        const result = await detectSetupState();

        expect(result.agentCount).toBe(1);
        expect(result.totalAgents).toBe(3);
        expect(result.errors).toContain('Only 1/3 sub-agents installed');
      });

      it('should handle errors gracefully and set ERROR state', async () => {
        // Mock getAllConfig to throw an error
        mockGetAllConfig.mockImplementation(() => {
          throw new Error('Config error');
        });

        const result = await detectSetupState();

        expect(result.state).toBe('ERROR');
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('checkClaudeCodeInstalled()', () => {
    it('should return true when .claude directory exists', async () => {
      const mockAccess = vi.spyOn(fs, 'access');
      mockAccess.mockResolvedValue(undefined as any);

      const result = await checkClaudeCodeInstalled();

      expect(result).toBe(true);
      expect(mockAccess).toHaveBeenCalledWith(
        path.join(os.homedir(), '.claude')
      );
    });

    it('should return false when .claude directory does not exist', async () => {
      const mockAccess = vi.spyOn(fs, 'access');
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await checkClaudeCodeInstalled();

      expect(result).toBe(false);
    });
  });

  describe('checkProjectDirectory()', () => {
    it('should return current directory when in a git repository', async () => {
      const mockAccess = vi.spyOn(fs, 'access');
      mockAccess.mockResolvedValue(undefined as any);

      const result = await checkProjectDirectory();

      expect(result).toBe(process.cwd());
      expect(mockAccess).toHaveBeenCalledWith(
        path.join(process.cwd(), '.git')
      );
    });

    it('should return current directory when not in git repo but still valid', async () => {
      const mockAccess = vi.spyOn(fs, 'access');
      mockAccess.mockRejectedValue(new Error('Not a git repo'));

      const result = await checkProjectDirectory();

      expect(result).toBe(process.cwd());
    });

    it('should return null on error', async () => {
      // Mock process.cwd() to throw an error
      const originalCwd = process.cwd;
      Object.defineProperty(process, 'cwd', {
        value: () => { throw new Error('Permission denied'); },
        configurable: true,
      });

      const result = await checkProjectDirectory();

      expect(result).toBeNull();

      // Restore original process.cwd
      Object.defineProperty(process, 'cwd', {
        value: originalCwd,
        configurable: true,
      });
    });
  });
});
