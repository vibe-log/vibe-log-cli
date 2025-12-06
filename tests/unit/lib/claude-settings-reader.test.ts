import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
  }
}));
vi.mock('../../../src/lib/claude-core');
vi.mock('../../../src/utils/logger');

// Import fs after mocking
import { promises as fs } from 'fs';

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
    it('should return "all" when global settings have vibe-log hooks', async () => {
      // Mock global settings with vibe-log hooks
      mockFs.readFile.mockImplementation((path, encoding) => {
        if (path === '/home/user/.claude/settings.json') {
          const content = JSON.stringify({
            hooks: {
              SessionStart: [{
                matcher: 'startup|clear',
                hooks: [{
                  type: 'command',
                  command: 'npx vibe-log-cli send --silent --background --hook-trigger=sessionstart'
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

    it('should return "selected" when only project-local settings have vibe-log hooks', async () => {
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
                  command: 'npx vibe-log-cli send --silent --background --hook-trigger=sessionstart'
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

    it('should prioritize "all" mode over "selected" when both exist', async () => {
      // Mock both global and local hooks
      mockFs.readFile.mockImplementation((path, encoding) => {
        if (path === '/home/user/.claude/settings.json') {
          const content = JSON.stringify({
            hooks: {
              SessionStart: [{
                matcher: 'startup|clear',
                hooks: [{
                  type: 'command',
                  command: 'npx vibe-log-cli send --silent'
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
                  command: 'npx vibe-log-cli send --silent'
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
    it('should return list of projects with vibe-log hooks in local settings', async () => {
      mockFs.readFile.mockImplementation((path, encoding) => {
        if (path === '/home/projects/app1/.claude/settings.local.json') {
          const content = JSON.stringify({
            hooks: {
              SessionStart: [{
                hooks: [{
                  type: 'command',
                  command: 'npx vibe-log-cli send --silent'
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
                  command: 'npx vibe-log-cli send --silent'
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
              command: 'npx vibe-log-cli send --silent'
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

  describe('readGlobalSettings', () => {
    it('should read and parse global settings file', async () => {
      const mockSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup',
            hooks: [{ type: 'command' as const, command: 'echo test' }]
          }]
        }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const settings = await readGlobalSettings();

      expect(settings).toEqual(mockSettings);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        '/home/user/.claude/settings.json',
        'utf-8'
      );
    });

    it('should return null when settings file does not exist', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const settings = await readGlobalSettings();

      expect(settings).toBeNull();
    });

    it('should return null on JSON parse errors', async () => {
      mockFs.readFile.mockResolvedValue('invalid json {{{');

      const settings = await readGlobalSettings();

      expect(settings).toBeNull();
    });
  });

  describe('writeGlobalSettings', () => {
    it('should write settings to global location using atomic write', async () => {
      const settings = {
        hooks: {
          PreCompact: [{
            matcher: 'auto',
            hooks: [{ type: 'command' as const, command: 'test command' }]
          }]
        }
      };

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);

      await writeGlobalSettings(settings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/home/user/.claude/settings.json.tmp',
        JSON.stringify(settings, null, 2)
      );
      expect(mockFs.rename).toHaveBeenCalledWith(
        '/home/user/.claude/settings.json.tmp',
        '/home/user/.claude/settings.json'
      );
    });

    it('should propagate write errors', async () => {
      const settings = { hooks: {} };
      const error = new Error('Write failed');
      mockFs.writeFile.mockRejectedValue(error);

      await expect(writeGlobalSettings(settings)).rejects.toThrow('Write failed');
    });
  });

  describe('readProjectSettings', () => {
    it('should read project-specific shared settings', async () => {
      const mockSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup',
            hooks: [{ type: 'command' as const, command: 'npm test' }]
          }]
        }
      };

      mockClaudeCore.getProjectSettingsPath.mockReturnValue('/project/.claude/settings.json');
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const { readProjectSettings } = await import('../../../src/lib/claude-settings-reader');
      const settings = await readProjectSettings('/project');

      expect(settings).toEqual(mockSettings);
      expect(mockClaudeCore.getProjectSettingsPath).toHaveBeenCalledWith('/project');
    });

    it('should return null when project settings file does not exist', async () => {
      mockClaudeCore.getProjectSettingsPath.mockReturnValue('/project/.claude/settings.json');
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const { readProjectSettings } = await import('../../../src/lib/claude-settings-reader');
      const settings = await readProjectSettings('/project');

      expect(settings).toBeNull();
    });
  });

  describe('readProjectLocalSettings', () => {
    it('should read project-local settings', async () => {
      const mockSettings = {
        hooks: {
          PreCompact: [{
            matcher: 'auto',
            hooks: [{ type: 'command' as const, command: 'npx vibe-log-cli send' }]
          }]
        }
      };

      mockClaudeCore.getProjectLocalSettingsPath.mockReturnValue('/project/.claude/settings.local.json');
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const { readProjectLocalSettings } = await import('../../../src/lib/claude-settings-reader');
      const settings = await readProjectLocalSettings('/project');

      expect(settings).toEqual(mockSettings);
      expect(mockClaudeCore.getProjectLocalSettingsPath).toHaveBeenCalledWith('/project');
    });
  });

  describe('readEnterpriseManagedSettings', () => {
    it('should read enterprise managed settings when path exists', async () => {
      const mockSettings = {
        hooks: {
          SessionStart: [{
            hooks: [{ type: 'command' as const, command: 'enterprise-hook' }]
          }]
        }
      };

      mockClaudeCore.getEnterpriseManagedSettingsPath.mockReturnValue('/enterprise/settings.json');
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const { readEnterpriseManagedSettings } = await import('../../../src/lib/claude-settings-reader');
      const settings = await readEnterpriseManagedSettings();

      expect(settings).toEqual(mockSettings);
    });

    it('should return null when enterprise path is not configured', async () => {
      mockClaudeCore.getEnterpriseManagedSettingsPath.mockReturnValue(null);

      const { readEnterpriseManagedSettings } = await import('../../../src/lib/claude-settings-reader');
      const settings = await readEnterpriseManagedSettings();

      expect(settings).toBeNull();
    });
  });

  describe('getMergedSettingsForProject', () => {
    it('should merge settings with correct precedence (enterprise > local > project > global)', async () => {
      // Global settings (lowest precedence)
      const globalSettings = {
        hooks: {
          SessionStart: [{
            hooks: [{ type: 'command' as const, command: 'global-command' }]
          }]
        },
        someGlobalKey: 'global-value'
      };

      // Project shared settings
      const projectSettings = {
        hooks: {
          SessionStart: [{
            hooks: [{ type: 'command' as const, command: 'project-command' }]
          }]
        },
        someProjectKey: 'project-value'
      };

      // Project local settings
      const localSettings = {
        hooks: {
          PreCompact: [{
            hooks: [{ type: 'command' as const, command: 'local-command' }]
          }]
        },
        someLocalKey: 'local-value'
      };

      // Enterprise settings (highest precedence)
      const enterpriseSettings = {
        hooks: {
          SessionStart: [{
            hooks: [{ type: 'command' as const, command: 'enterprise-command' }]
          }]
        },
        someEnterpriseKey: 'enterprise-value'
      };

      mockClaudeCore.getGlobalSettingsPath.mockReturnValue('/global/settings.json');
      mockClaudeCore.getProjectSettingsPath.mockReturnValue('/project/settings.json');
      mockClaudeCore.getProjectLocalSettingsPath.mockReturnValue('/project/settings.local.json');
      mockClaudeCore.getEnterpriseManagedSettingsPath.mockReturnValue('/enterprise/settings.json');

      mockFs.readFile.mockImplementation((path: string) => {
        if (path === '/global/settings.json') {
          return Promise.resolve(JSON.stringify(globalSettings));
        }
        if (path === '/project/settings.json') {
          return Promise.resolve(JSON.stringify(projectSettings));
        }
        if (path === '/project/settings.local.json') {
          return Promise.resolve(JSON.stringify(localSettings));
        }
        if (path === '/enterprise/settings.json') {
          return Promise.resolve(JSON.stringify(enterpriseSettings));
        }
        const error: any = new Error('Not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      const { getMergedSettingsForProject } = await import('../../../src/lib/claude-settings-reader');
      const merged = await getMergedSettingsForProject('/project');

      // Enterprise hooks should override all others
      expect(merged.hooks?.SessionStart).toEqual(enterpriseSettings.hooks.SessionStart);
      // Local PreCompact should be present (only in local)
      expect(merged.hooks?.PreCompact).toEqual(localSettings.hooks.PreCompact);
      // All keys from all levels should be present
      expect(merged.someGlobalKey).toBe('global-value');
      expect(merged.someProjectKey).toBe('project-value');
      expect(merged.someLocalKey).toBe('local-value');
      expect(merged.someEnterpriseKey).toBe('enterprise-value');
    });

    it('should handle missing settings files gracefully', async () => {
      // Only global settings exist
      const globalSettings = {
        hooks: {
          SessionStart: [{
            hooks: [{ type: 'command' as const, command: 'global-only' }]
          }]
        }
      };

      mockClaudeCore.getGlobalSettingsPath.mockReturnValue('/global/settings.json');
      mockClaudeCore.getProjectSettingsPath.mockReturnValue('/project/settings.json');
      mockClaudeCore.getProjectLocalSettingsPath.mockReturnValue('/project/settings.local.json');
      mockClaudeCore.getEnterpriseManagedSettingsPath.mockReturnValue(null);

      mockFs.readFile.mockImplementation((path: string) => {
        if (path === '/global/settings.json') {
          return Promise.resolve(JSON.stringify(globalSettings));
        }
        const error: any = new Error('Not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      const { getMergedSettingsForProject } = await import('../../../src/lib/claude-settings-reader');
      const merged = await getMergedSettingsForProject('/project');

      // Should only have global settings
      expect(merged.hooks?.SessionStart).toEqual(globalSettings.hooks.SessionStart);
    });
  });

  describe('getProjectHookStatus', () => {
    it('should detect hooks at different levels', async () => {
      // Set up project with local hooks
      const localSettings = {
        hooks: {
          SessionStart: [{
            hooks: [{ type: 'command' as const, command: 'npx vibe-log-cli send --silent' }]
          }]
        }
      };

      mockClaudeCore.getGlobalSettingsPath.mockReturnValue('/global/settings.json');
      mockClaudeCore.getProjectSettingsPath.mockReturnValue('/project/settings.json');
      mockClaudeCore.getProjectLocalSettingsPath.mockReturnValue('/project/settings.local.json');
      mockClaudeCore.getEnterpriseManagedSettingsPath.mockReturnValue(null);

      mockFs.readFile.mockImplementation((path: string) => {
        if (path === '/project/settings.local.json') {
          return Promise.resolve(JSON.stringify(localSettings));
        }
        const error: any = new Error('Not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      // Mock getHookMode and getTrackedProjects
      mockClaudeCore.discoverProjects.mockResolvedValue([]);

      const { getProjectHookStatus } = await import('../../../src/lib/claude-settings-reader');
      const status = await getProjectHookStatus('/project');

      expect(status.hasLocalHooks).toBe(true);
      expect(status.hasProjectHooks).toBe(false);
      expect(status.hasEffectiveHooks).toBe(true);
    });

    it('should correctly identify when no hooks are installed', async () => {
      mockClaudeCore.getGlobalSettingsPath.mockReturnValue('/global/settings.json');
      mockClaudeCore.getProjectSettingsPath.mockReturnValue('/project/settings.json');
      mockClaudeCore.getProjectLocalSettingsPath.mockReturnValue('/project/settings.local.json');
      mockClaudeCore.getEnterpriseManagedSettingsPath.mockReturnValue(null);

      const error: any = new Error('Not found');
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      mockClaudeCore.discoverProjects.mockResolvedValue([]);

      const { getProjectHookStatus } = await import('../../../src/lib/claude-settings-reader');
      const status = await getProjectHookStatus('/project');

      expect(status.hasGlobalHooks).toBe(false);
      expect(status.hasLocalHooks).toBe(false);
      expect(status.hasProjectHooks).toBe(false);
      expect(status.hasEffectiveHooks).toBe(false);
    });
  });
});