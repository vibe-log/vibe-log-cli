import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  getHookMode,
  getTrackedProjects,
  hasVibeLogHooks,
  readGlobalSettings,
  writeGlobalSettings
} from '../../../src/lib/claude-settings-reader';
import * as claudeCore from '../../../src/lib/claude-core';
import * as settingsReader from '../../../src/lib/claude-settings-reader';

// Mock fs and claude-core modules
vi.mock('fs/promises');
vi.mock('../../../src/lib/claude-core');
vi.mock('../../../src/utils/logger');

describe('Claude Settings Reader', () => {
  const mockFs = vi.mocked(fs);
  const mockClaudeCore = vi.mocked(claudeCore);

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock getGlobalSettingsPath
    vi.spyOn(claudeCore, 'getGlobalSettingsPath').mockReturnValue('/home/user/.claude/settings.json');
    vi.spyOn(claudeCore, 'getProjectLocalSettingsPath').mockImplementation(
      (path) => `${path}/.claude/settings.local.json`
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getHookMode', () => {
    it.skip('should return "all" when global settings have vibe-log hooks', async () => {
      // Mock global settings with vibe-log hooks
      mockFs.readFile.mockImplementation((path, encoding) => {
        if (path === '/home/user/.claude/settings.json') {
          const content = JSON.stringify({
            hooks: {
              SessionStart: [{
                matcher: 'startup|clear',
                hooks: [{
                  type: 'command',
                  command: 'npx vibe-log send --silent --background --hook-trigger=sessionstart'
                }]
              }]
            }
          });
          // Return string if encoding is specified, otherwise Buffer
          return Promise.resolve(encoding ? content : Buffer.from(content)) as any;
        }
        const error: any = new Error('File not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      mockClaudeCore.discoverProjects.mockResolvedValue([]);

      const mode = await getHookMode();
      expect(mode).toBe('all');
    });

    it.skip('should return "selected" when only project-local settings have vibe-log hooks', async () => {
      // Mock no global hooks
      mockFs.readFile.mockImplementation((path, encoding) => {
        if (path === '/home/user/.claude/settings.json') {
          const content = JSON.stringify({ hooks: {} });
          return Promise.resolve(encoding ? content : Buffer.from(content)) as any;
        }
        if (path === '/home/projects/my-app/.claude/settings.local.json') {
          const content = JSON.stringify({
            hooks: {
              SessionStart: [{
                matcher: 'startup|clear',
                hooks: [{
                  type: 'command',
                  command: 'npx vibe-log send --silent --background --hook-trigger=sessionstart'
                }]
              }]
            }
          });
          return Promise.resolve(encoding ? content : Buffer.from(content)) as any;
        }
        const error: any = new Error('File not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      mockClaudeCore.discoverProjects.mockResolvedValue([
        {
          name: 'my-app',
          claudePath: '/home/user/.claude/projects/-home-projects-my-app',
          actualPath: '/home/projects/my-app',
          sessions: 0,
          lastActivity: new Date(),
          isActive: true,
          size: 1000
        }
      ]);

      const mode = await getHookMode();
      expect(mode).toBe('selected');
    });

    it('should return "none" when no vibe-log hooks exist', async () => {
      // Mock no hooks anywhere
      mockFs.readFile.mockImplementation(() => {
        const error: any = new Error('File not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      mockClaudeCore.discoverProjects.mockResolvedValue([
        {
          name: 'my-app',
          claudePath: '/home/user/.claude/projects/-home-projects-my-app',
          actualPath: '/home/projects/my-app',
          sessions: 0,
          lastActivity: new Date(),
          isActive: true,
          size: 1000
        }
      ]);

      const mode = await getHookMode();
      expect(mode).toBe('none');
    });

    it.skip('should prioritize "all" mode over "selected" when both exist', async () => {
      // Mock both global and local hooks
      mockFs.readFile.mockImplementation((path, encoding) => {
        if (path === '/home/user/.claude/settings.json') {
          const content = JSON.stringify({
            hooks: {
              SessionStart: [{
                matcher: 'startup|clear',
                hooks: [{
                  type: 'command',
                  command: 'npx vibe-log send --silent'
                }]
              }]
            }
          });
          return Promise.resolve(encoding ? content : Buffer.from(content)) as any;
        }
        if (path === '/home/projects/my-app/.claude/settings.local.json') {
          const content = JSON.stringify({
            hooks: {
              PreCompact: [{
                matcher: 'auto',
                hooks: [{
                  type: 'command',
                  command: 'npx vibe-log send --silent'
                }]
              }]
            }
          });
          return Promise.resolve(encoding ? content : Buffer.from(content)) as any;
        }
        const error: any = new Error('File not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      mockClaudeCore.discoverProjects.mockResolvedValue([
        {
          name: 'my-app',
          claudePath: '/home/user/.claude/projects/-home-projects-my-app',
          actualPath: '/home/projects/my-app',
          sessions: 0,
          lastActivity: new Date(),
          isActive: true,
          size: 1000
        }
      ]);

      const mode = await getHookMode();
      expect(mode).toBe('all');
    });
  });

  describe('getTrackedProjects', () => {
    it.skip('should return list of projects with vibe-log hooks in local settings', async () => {
      mockFs.readFile.mockImplementation((path, encoding) => {
        if (path === '/home/projects/app1/.claude/settings.local.json') {
          const content = JSON.stringify({
            hooks: {
              SessionStart: [{
                hooks: [{
                  type: 'command',
                  command: 'npx vibe-log send --silent'
                }]
              }]
            }
          });
          return Promise.resolve(encoding ? content : Buffer.from(content)) as any;
        }
        if (path === '/home/projects/app2/.claude/settings.local.json') {
          const content = JSON.stringify({
            hooks: {
              PreCompact: [{
                hooks: [{
                  type: 'command',
                  command: 'npx vibe-log send --silent'
                }]
              }]
            }
          });
          return Promise.resolve(encoding ? content : Buffer.from(content)) as any;
        }
        if (path === '/home/projects/app3/.claude/settings.local.json') {
          // Project without vibe-log hooks
          const content = JSON.stringify({
            hooks: {
              SessionStart: [{
                hooks: [{
                  type: 'command',
                  command: 'echo "some other command"'
                }]
              }]
            }
          });
          return Promise.resolve(encoding ? content : Buffer.from(content)) as any;
        }
        const error: any = new Error('File not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      mockClaudeCore.discoverProjects.mockResolvedValue([
        {
          name: 'app1',
          claudePath: '/home/user/.claude/projects/-home-projects-app1',
          actualPath: '/home/projects/app1',
          sessions: 0,
          lastActivity: new Date(),
          isActive: true,
          size: 1000
        },
        {
          name: 'app2',
          claudePath: '/home/user/.claude/projects/-home-projects-app2',
          actualPath: '/home/projects/app2',
          sessions: 0,
          lastActivity: new Date(),
          isActive: true,
          size: 1000
        },
        {
          name: 'app3',
          claudePath: '/home/user/.claude/projects/-home-projects-app3',
          actualPath: '/home/projects/app3',
          sessions: 0,
          lastActivity: new Date(),
          isActive: true,
          size: 1000
        }
      ]);

      const trackedProjects = await getTrackedProjects();
      expect(trackedProjects).toEqual([
        '-home-projects-app1',
        '-home-projects-app2'
      ]);
      expect(trackedProjects).not.toContain('-home-projects-app3');
    });

    it('should return empty array when no projects have vibe-log hooks', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      
      mockClaudeCore.discoverProjects.mockResolvedValue([
        {
          name: 'app1',
          claudePath: '/home/user/.claude/projects/-home-projects-app1',
          actualPath: '/home/projects/app1',
          sessions: 0,
          lastActivity: new Date(),
          isActive: true,
          size: 1000
        }
      ]);

      const trackedProjects = await getTrackedProjects();
      expect(trackedProjects).toEqual([]);
    });
  });

  describe('hasVibeLogHooks', () => {
    it('should return true when settings contain vibe-log commands', () => {
      const settings = {
        hooks: {
          SessionStart: [{
            hooks: [{
              type: 'command' as const,
              command: 'npx vibe-log send --silent'
            }]
          }]
        }
      };

      expect(hasVibeLogHooks(settings)).toBe(true);
    });

    it('should return true for @vibe-log variant', () => {
      const settings = {
        hooks: {
          PreCompact: [{
            hooks: [{
              type: 'command' as const,
              command: 'npx @vibe-log send --silent'
            }]
          }]
        }
      };

      expect(hasVibeLogHooks(settings)).toBe(true);
    });

    it('should return false when hooks contain non-vibe-log commands', () => {
      const settings = {
        hooks: {
          SessionStart: [{
            hooks: [{
              type: 'command' as const,
              command: 'echo "hello world"'
            }]
          }]
        }
      };

      expect(hasVibeLogHooks(settings)).toBe(false);
    });

    it('should return false when settings have no hooks', () => {
      const settings = {};
      expect(hasVibeLogHooks(settings)).toBe(false);
    });

    it('should return false for null settings', () => {
      expect(hasVibeLogHooks(null)).toBe(false);
    });
  });
});