import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import {
  installSelectedHooks,
  installGlobalHooks,
  uninstallAllHooks,
  installProjectHooks,
  removeProjectHooks,
  updateHookConfig,
  checkForHookUpdates,
  installSelectiveProjectHooks,
  type HookSelection,
  type ProjectHookConfig
} from '../hooks-controller';

// Mock dependencies
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn()
  }
}));

vi.mock('../../config', () => ({
  getCliPath: vi.fn(() => '/usr/local/bin/vibe-log')
}));

vi.mock('../../claude-core', () => ({
  getGlobalSettingsPath: vi.fn(() => '/mock/home/.claude/settings.json'),
  getProjectLocalSettingsPath: vi.fn((path: string) => `${path}/.claude/settings.local.json`),
  discoverProjects: vi.fn(() => Promise.resolve([]))
}));

vi.mock('../../claude-settings-reader', () => ({
  readGlobalSettings: vi.fn(),
  writeGlobalSettings: vi.fn(),
  getHookMode: vi.fn(() => Promise.resolve('all' as const)),
  getTrackedProjects: vi.fn(() => Promise.resolve([]))
}));

vi.mock('../../telemetry', () => ({
  sendTelemetryUpdate: vi.fn(() => Promise.resolve())
}));

// Import mocked modules
const claudeSettingsReader = await import('../../claude-settings-reader');

describe('hooks-controller - Hook Preservation Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('installSelectedHooks', () => {
    it('should create new hooks when no existing hooks exist', async () => {
      const emptySettings = { hooks: {} };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(null);
      (fs.readFile as any).mockResolvedValue(JSON.stringify(emptySettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const selection: HookSelection = {
        sessionStartHook: true,
        preCompactHook: true,
        sessionEndHook: false
      };

      await installSelectedHooks(selection);

      // Verify writeFile was called
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should have SessionStart and PreCompact hooks
      expect(writtenSettings.hooks.SessionStart).toBeDefined();
      expect(writtenSettings.hooks.PreCompact).toBeDefined();
      expect(writtenSettings.hooks.SessionEnd).toBeUndefined();
    });

    it('should PRESERVE existing non-vibe-log hooks when installing', async () => {
      const existingSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{
              type: 'command' as const,
              command: 'echo "existing session start hook"'
            }]
          }],
          PreCompact: [{
            matcher: 'auto',
            hooks: [{
              type: 'command' as const,
              command: 'echo "existing precompact hook"'
            }]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(null);
      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const selection: HookSelection = {
        sessionStartHook: true,
        preCompactHook: true,
        sessionEndHook: false
      };

      await installSelectedHooks(selection);

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // SessionStart should have BOTH hooks
      expect(writtenSettings.hooks.SessionStart[0].hooks).toHaveLength(2);
      expect(writtenSettings.hooks.SessionStart[0].hooks[0].command).toBe('echo "existing session start hook"');
      expect(writtenSettings.hooks.SessionStart[0].hooks[1].command).toContain('vibe-log');

      // PreCompact should have BOTH hooks
      expect(writtenSettings.hooks.PreCompact[0].hooks).toHaveLength(2);
      expect(writtenSettings.hooks.PreCompact[0].hooks[0].command).toBe('echo "existing precompact hook"');
      expect(writtenSettings.hooks.PreCompact[0].hooks[1].command).toContain('vibe-log');
    });

    it('should NOT create duplicates when vibe-log hooks already exist', async () => {
      const existingSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [
              { type: 'command' as const, command: 'echo "other"' },
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=sessionstart' }
            ]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(null);
      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const selection: HookSelection = {
        sessionStartHook: true,
        preCompactHook: false,
        sessionEndHook: false
      };

      await installSelectedHooks(selection);

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should still have only 2 hooks (no duplicate)
      expect(writtenSettings.hooks.SessionStart[0].hooks).toHaveLength(2);
    });

    it('should handle mixed installation - some enabled, some disabled', async () => {
      const existingSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{
              type: 'command' as const,
              command: 'echo "keep this"'
            }]
          }],
          PreCompact: [{
            matcher: 'auto',
            hooks: [
              { type: 'command' as const, command: 'echo "keep this"' },
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=precompact' }
            ]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(null);
      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const selection: HookSelection = {
        sessionStartHook: true,  // Enable this
        preCompactHook: false,   // Disable this (should remove vibe-log only)
        sessionEndHook: false
      };

      await installSelectedHooks(selection);

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // SessionStart should have both hooks
      expect(writtenSettings.hooks.SessionStart[0].hooks).toHaveLength(2);

      // PreCompact should have only the non-vibe-log hook
      expect(writtenSettings.hooks.PreCompact[0].hooks).toHaveLength(1);
      expect(writtenSettings.hooks.PreCompact[0].hooks[0].command).toBe('echo "keep this"');
    });

    it('should handle multiple existing hooks correctly', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: 'auto',
            hooks: [
              { type: 'command' as const, command: 'echo "hook 1"' },
              { type: 'command' as const, command: 'echo "hook 2"' },
              { type: 'command' as const, command: 'echo "hook 3"' }
            ]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(null);
      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const selection: HookSelection = {
        sessionStartHook: false,
        preCompactHook: true,
        sessionEndHook: false
      };

      await installSelectedHooks(selection);

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should have ALL 4 hooks (3 existing + 1 new vibe-log)
      expect(writtenSettings.hooks.PreCompact[0].hooks).toHaveLength(4);
      expect(writtenSettings.hooks.PreCompact[0].hooks[0].command).toBe('echo "hook 1"');
      expect(writtenSettings.hooks.PreCompact[0].hooks[1].command).toBe('echo "hook 2"');
      expect(writtenSettings.hooks.PreCompact[0].hooks[2].command).toBe('echo "hook 3"');
      expect(writtenSettings.hooks.PreCompact[0].hooks[3].command).toContain('vibe-log');
    });
  });

  describe('installGlobalHooks', () => {
    it('should install all three hooks globally', async () => {
      const emptySettings = { hooks: {} };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(null);
      (fs.readFile as any).mockResolvedValue(JSON.stringify(emptySettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      await installGlobalHooks();

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should have all three hooks
      expect(writtenSettings.hooks.SessionStart).toBeDefined();
      expect(writtenSettings.hooks.PreCompact).toBeDefined();
      expect(writtenSettings.hooks.SessionEnd).toBeDefined();
    });

    it('should preserve existing hooks when installing globally', async () => {
      const existingSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{
              type: 'command' as const,
              command: 'echo "existing"'
            }]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(null);
      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      await installGlobalHooks();

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // SessionStart should have both hooks
      expect(writtenSettings.hooks.SessionStart[0].hooks).toHaveLength(2);
      expect(writtenSettings.hooks.SessionStart[0].hooks[0].command).toBe('echo "existing"');
      expect(writtenSettings.hooks.SessionStart[0].hooks[1].command).toContain('vibe-log');
    });
  });

  describe('uninstallAllHooks', () => {
    it('should ONLY remove vibe-log hooks, preserving other hooks', async () => {
      const existingSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [
              { type: 'command' as const, command: 'echo "keep this"' },
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=sessionstart' }
            ]
          }],
          PreCompact: [{
            matcher: 'auto',
            hooks: [
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=precompact' },
              { type: 'command' as const, command: 'echo "keep this too"' }
            ]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(existingSettings);
      (claudeSettingsReader.writeGlobalSettings as any).mockResolvedValue(undefined);

      const result = await uninstallAllHooks();

      expect(result.removedCount).toBeGreaterThan(0);

      // Verify writeGlobalSettings was called
      expect(claudeSettingsReader.writeGlobalSettings).toHaveBeenCalled();
      const writeCall = (claudeSettingsReader.writeGlobalSettings as any).mock.calls[0][0];

      // SessionStart should have only the non-vibe-log hook
      expect(writeCall.hooks.SessionStart[0].hooks).toHaveLength(1);
      expect(writeCall.hooks.SessionStart[0].hooks[0].command).toBe('echo "keep this"');

      // PreCompact should have only the non-vibe-log hook
      expect(writeCall.hooks.PreCompact[0].hooks).toHaveLength(1);
      expect(writeCall.hooks.PreCompact[0].hooks[0].command).toBe('echo "keep this too"');
    });

    it('should remove hook type entirely if only vibe-log hooks exist', async () => {
      const existingSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=sessionstart' }
            ]
          }],
          PreCompact: [{
            matcher: 'auto',
            hooks: [
              { type: 'command' as const, command: 'echo "keep this"' }
            ]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(existingSettings);
      (claudeSettingsReader.writeGlobalSettings as any).mockResolvedValue(undefined);

      await uninstallAllHooks();

      const writeCall = (claudeSettingsReader.writeGlobalSettings as any).mock.calls[0][0];

      // SessionStart should be removed entirely
      expect(writeCall.hooks.SessionStart).toBeUndefined();

      // PreCompact should still exist with non-vibe-log hook
      expect(writeCall.hooks.PreCompact).toBeDefined();
      expect(writeCall.hooks.PreCompact[0].hooks[0].command).toBe('echo "keep this"');
    });

    it('should handle multiple vibe-log hooks in same config', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: 'auto',
            hooks: [
              { type: 'command' as const, command: 'echo "keep"' },
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=precompact' },
              { type: 'command' as const, command: '@vibe-log/cli send' },
              { type: 'command' as const, command: 'echo "keep too"' }
            ]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(existingSettings);
      (claudeSettingsReader.writeGlobalSettings as any).mockResolvedValue(undefined);

      await uninstallAllHooks();

      const writeCall = (claudeSettingsReader.writeGlobalSettings as any).mock.calls[0][0];

      // Should have 2 non-vibe-log hooks left
      expect(writeCall.hooks.PreCompact[0].hooks).toHaveLength(2);
      expect(writeCall.hooks.PreCompact[0].hooks[0].command).toBe('echo "keep"');
      expect(writeCall.hooks.PreCompact[0].hooks[1].command).toBe('echo "keep too"');
    });

    it('should throw error if no vibe-log hooks found', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: 'auto',
            hooks: [
              { type: 'command' as const, command: 'echo "other hook"' }
            ]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(existingSettings);

      await expect(uninstallAllHooks()).rejects.toThrow('No vibe-log hooks found');
    });
  });

  describe('installProjectHooks', () => {
    it('should install all 3 hooks to a single project', async () => {
      const emptySettings = { hooks: {} };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(emptySettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const projects = [
        { path: '/mock/.claude/projects/test-project', name: 'test-project', actualPath: '/mock/test-project' }
      ];

      await installProjectHooks(projects);

      // Verify writeFile was called
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should have all three hooks
      expect(writtenSettings.hooks.SessionStart).toBeDefined();
      expect(writtenSettings.hooks.PreCompact).toBeDefined();
      expect(writtenSettings.hooks.SessionEnd).toBeDefined();

      // Verify hooks contain mode='selected' in command
      expect(writtenSettings.hooks.SessionStart[0].hooks[0].command).toContain('--claude-project-dir');
      expect(writtenSettings.hooks.PreCompact[0].hooks[0].command).toContain('--claude-project-dir');
      expect(writtenSettings.hooks.SessionEnd[0].hooks[0].command).toContain('--claude-project-dir');
    });

    it('should install hooks to multiple projects', async () => {
      const emptySettings = { hooks: {} };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(emptySettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const projects = [
        { path: '/mock/.claude/projects/project1', name: 'project1', actualPath: '/mock/project1' },
        { path: '/mock/.claude/projects/project2', name: 'project2', actualPath: '/mock/project2' },
        { path: '/mock/.claude/projects/project3', name: 'project3', actualPath: '/mock/project3' }
      ];

      await installProjectHooks(projects);

      // Should have written to all 3 project settings files
      expect(fs.writeFile).toHaveBeenCalledTimes(3);
    });

    it('should skip projects without actualPath', async () => {
      const emptySettings = { hooks: {} };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(emptySettings));
      (fs.writeFile as any).mockResolvedValue(undefined);

      const projects = [
        { path: '/mock/.claude/projects/project1', name: 'project1', actualPath: '/mock/project1' },
        { path: '/mock/.claude/projects/project2', name: 'project2' },  // No actualPath
        { path: '/mock/.claude/projects/project3', name: 'project3', actualPath: '/mock/project3' }
      ];

      await installProjectHooks(projects);

      // Should have written to only 2 projects (skipped the one without actualPath)
      expect(fs.writeFile).toHaveBeenCalledTimes(2);
    });

    it('should handle filesystem errors gracefully', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('EACCES: permission denied'));
      (fs.writeFile as any).mockResolvedValue(undefined);

      const projects = [
        { path: '/mock/.claude/projects/project1', name: 'project1', actualPath: '/mock/project1' }
      ];

      // Should not throw - errors are logged but function completes
      await expect(installProjectHooks(projects)).resolves.not.toThrow();
    });

    it('should call sendTelemetryUpdate after successful installation', async () => {
      const emptySettings = { hooks: {} };
      const telemetry = await import('../../telemetry');

      (fs.readFile as any).mockResolvedValue(JSON.stringify(emptySettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const projects = [
        { path: '/mock/.claude/projects/project1', name: 'project1', actualPath: '/mock/project1' }
      ];

      await installProjectHooks(projects);

      // Verify telemetry was called
      expect(telemetry.sendTelemetryUpdate).toHaveBeenCalled();
    });
  });

  describe('removeProjectHooks', () => {
    it('should remove vibe-log hooks from a single project', async () => {
      const settingsWithHooks = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{ type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=sessionstart' }]
          }],
          PreCompact: [{
            matcher: 'auto',
            hooks: [{ type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=precompact' }]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(settingsWithHooks));
      (fs.writeFile as any).mockResolvedValue(undefined);

      const projects = [
        { path: '/mock/.claude/projects/project1', name: 'project1', actualPath: '/mock/project1' }
      ];

      await removeProjectHooks(projects);

      // Verify writeFile was called to update the settings
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // All vibe-log hooks should be removed
      expect(writtenSettings.hooks).toBeUndefined();
    });

    it('should remove hooks from multiple projects', async () => {
      const settingsWithHooks = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{ type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=sessionstart' }]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(settingsWithHooks));
      (fs.writeFile as any).mockResolvedValue(undefined);

      const projects = [
        { path: '/mock/.claude/projects/project1', name: 'project1', actualPath: '/mock/project1' },
        { path: '/mock/.claude/projects/project2', name: 'project2', actualPath: '/mock/project2' },
        { path: '/mock/.claude/projects/project3', name: 'project3', actualPath: '/mock/project3' }
      ];

      await removeProjectHooks(projects);

      // Should have written to all 3 project settings files
      expect(fs.writeFile).toHaveBeenCalledTimes(3);
    });

    it('should skip projects without actualPath', async () => {
      const settingsWithHooks = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{ type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=sessionstart' }]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(settingsWithHooks));
      (fs.writeFile as any).mockResolvedValue(undefined);

      const projects = [
        { path: '/mock/.claude/projects/project1', name: 'project1', actualPath: '/mock/project1' },
        { path: '/mock/.claude/projects/project2', name: 'project2' },  // No actualPath
        { path: '/mock/.claude/projects/project3', name: 'project3', actualPath: '/mock/project3' }
      ];

      await removeProjectHooks(projects);

      // Should have written to only 2 projects (skipped the one without actualPath)
      expect(fs.writeFile).toHaveBeenCalledTimes(2);
    });

    it('should handle ENOENT gracefully (no local settings file)', async () => {
      const enoentError: any = new Error('ENOENT: no such file or directory');
      enoentError.code = 'ENOENT';

      (fs.readFile as any).mockRejectedValue(enoentError);

      const projects = [
        { path: '/mock/.claude/projects/project1', name: 'project1', actualPath: '/mock/project1' }
      ];

      // Should not throw - ENOENT is handled gracefully
      await expect(removeProjectHooks(projects)).resolves.not.toThrow();

      // Should not attempt to write
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should handle other filesystem errors', async () => {
      const permissionError = new Error('EACCES: permission denied');

      (fs.readFile as any).mockRejectedValue(permissionError);

      const projects = [
        { path: '/mock/.claude/projects/project1', name: 'project1', actualPath: '/mock/project1' }
      ];

      // Should not throw - errors are logged but function completes
      await expect(removeProjectHooks(projects)).resolves.not.toThrow();
    });

    it('should delete empty hooks object after removing all hooks', async () => {
      const settingsWithOnlyVibeLogHooks = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{ type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=sessionstart' }]
          }],
          PreCompact: [{
            matcher: 'auto',
            hooks: [{ type: 'command' as const, command: '@vibe-log/cli send --hook-trigger=precompact' }]
          }],
          SessionEnd: [{
            matcher: 'clear|logout',
            hooks: [{ type: 'command' as const, command: 'vibe-log send --hook-trigger=sessionend' }]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(settingsWithOnlyVibeLogHooks));
      (fs.writeFile as any).mockResolvedValue(undefined);

      const projects = [
        { path: '/mock/.claude/projects/project1', name: 'project1', actualPath: '/mock/project1' }
      ];

      await removeProjectHooks(projects);

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Empty hooks object should be deleted
      expect(writtenSettings.hooks).toBeUndefined();
    });
  });

  describe('updateHookConfig', () => {
    it('should update timeout for sessionstart hook', async () => {
      const existingSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{
              type: 'command' as const,
              command: '/usr/local/bin/vibe-log send --hook-trigger=sessionstart',
              timeout: 30000
            }]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(existingSettings);
      (claudeSettingsReader.writeGlobalSettings as any).mockResolvedValue(undefined);

      await updateHookConfig('sessionstart', { timeout: 60000 });

      // Verify writeGlobalSettings was called with updated timeout
      expect(claudeSettingsReader.writeGlobalSettings).toHaveBeenCalled();
      const writeCall = (claudeSettingsReader.writeGlobalSettings as any).mock.calls[0][0];

      expect(writeCall.hooks.SessionStart[0].hooks[0].timeout).toBe(60000);
    });

    it('should update timeout for precompact hook', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: 'auto',
            hooks: [{
              type: 'command' as const,
              command: '/usr/local/bin/vibe-log send --hook-trigger=precompact',
              timeout: 30000
            }]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(existingSettings);
      (claudeSettingsReader.writeGlobalSettings as any).mockResolvedValue(undefined);

      await updateHookConfig('precompact', { timeout: 45000 });

      const writeCall = (claudeSettingsReader.writeGlobalSettings as any).mock.calls[0][0];
      expect(writeCall.hooks.PreCompact[0].hooks[0].timeout).toBe(45000);
    });

    it('should update timeout for sessionend hook', async () => {
      const existingSettings = {
        hooks: {
          SessionEnd: [{
            matcher: 'clear|logout',
            hooks: [{
              type: 'command' as const,
              command: '/usr/local/bin/vibe-log send --hook-trigger=sessionend',
              timeout: 30000
            }]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(existingSettings);
      (claudeSettingsReader.writeGlobalSettings as any).mockResolvedValue(undefined);

      await updateHookConfig('sessionend', { timeout: 50000 });

      const writeCall = (claudeSettingsReader.writeGlobalSettings as any).mock.calls[0][0];
      expect(writeCall.hooks.SessionEnd[0].hooks[0].timeout).toBe(50000);
    });

    it('should throw error when no hooks are installed', async () => {
      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(null);

      await expect(updateHookConfig('sessionstart', { timeout: 60000 }))
        .rejects.toThrow('No hooks installed');
    });

    it('should throw error when specific hook type is not installed', async () => {
      const settingsWithoutSessionStart = {
        hooks: {
          PreCompact: [{
            matcher: 'auto',
            hooks: [{
              type: 'command' as const,
              command: '/usr/local/bin/vibe-log send --hook-trigger=precompact'
            }]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(settingsWithoutSessionStart);

      await expect(updateHookConfig('sessionstart', { timeout: 60000 }))
        .rejects.toThrow('SessionStart hook not installed');
    });
  });

  describe('checkForHookUpdates', () => {
    it('should return needsUpdate=false when all hooks are current', async () => {
      const _currentStatus = {
        sessionStartHook: { installed: true, enabled: true, version: '1.0.0' },
        preCompactHook: { installed: true, enabled: true, version: '1.0.0' },
        sessionEndHook: { installed: true, enabled: true, version: '1.0.0' },
        settingsPath: '/mock/settings.json',
        cliPath: '/usr/local/bin/vibe-log'
      };

      // Mock getHooksStatus by mocking the underlying readSettings
      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue({
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{ type: 'command' as const, command: 'vibe-log send --hook-version=1.0.0' }]
          }],
          PreCompact: [{
            matcher: 'auto',
            hooks: [{ type: 'command' as const, command: 'vibe-log send --hook-version=1.0.0' }]
          }],
          SessionEnd: [{
            matcher: 'clear|logout',
            hooks: [{ type: 'command' as const, command: 'vibe-log send --hook-version=1.0.0' }]
          }]
        }
      });

      const result = await checkForHookUpdates();

      expect(result.needsUpdate).toBe(false);
      expect(result.currentVersion).toBe('1.0.0');
      expect(result.latestVersion).toBe('1.0.0');
    });

    it('should return needsUpdate=true when all hooks are outdated', async () => {
      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue({
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{ type: 'command' as const, command: 'vibe-log send --hook-version=0.5.0' }]
          }],
          PreCompact: [{
            matcher: 'auto',
            hooks: [{ type: 'command' as const, command: 'vibe-log send --hook-version=0.5.0' }]
          }],
          SessionEnd: [{
            matcher: 'clear|logout',
            hooks: [{ type: 'command' as const, command: 'vibe-log send --hook-version=0.5.0' }]
          }]
        }
      });

      const result = await checkForHookUpdates();

      expect(result.needsUpdate).toBe(true);
      expect(result.currentVersion).toBe('0.5.0');
      expect(result.latestVersion).toBe('1.0.0');
    });

    it('should return needsUpdate=true when hooks have mixed versions', async () => {
      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue({
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [{ type: 'command' as const, command: 'vibe-log send --hook-version=0.8.0' }]
          }],
          PreCompact: [{
            matcher: 'auto',
            hooks: [{ type: 'command' as const, command: 'vibe-log send --hook-version=0.6.0' }]
          }],
          SessionEnd: [{
            matcher: 'clear|logout',
            hooks: [{ type: 'command' as const, command: 'vibe-log send --hook-version=0.9.0' }]
          }]
        }
      });

      const result = await checkForHookUpdates();

      // Should use the highest version (0.9.0)
      expect(result.needsUpdate).toBe(true);
      expect(result.currentVersion).toBe('0.9.0');
      expect(result.latestVersion).toBe('1.0.0');
    });

    it('should handle case when no hooks are installed', async () => {
      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(null);

      const result = await checkForHookUpdates();

      expect(result.needsUpdate).toBe(true);
      expect(result.currentVersion).toBe('0.0.0');
      expect(result.latestVersion).toBe('1.0.0');
    });
  });

  describe('installSelectiveProjectHooks', () => {
    it('should install different hooks for different projects', async () => {
      const emptySettings = { hooks: {} };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(emptySettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const projectConfigs: ProjectHookConfig[] = [
        {
          path: '/mock/.claude/projects/project1',
          name: 'project1',
          sessionStart: true,
          preCompact: false,
          sessionEnd: false
        } as any,
        {
          path: '/mock/.claude/projects/project2',
          name: 'project2',
          sessionStart: false,
          preCompact: true,
          sessionEnd: false
        } as any
      ];

      // Add actualPath to make it work
      (projectConfigs[0] as any).actualPath = '/mock/project1';
      (projectConfigs[1] as any).actualPath = '/mock/project2';

      await installSelectiveProjectHooks(projectConfigs);

      // Verify both projects were written to
      expect(fs.writeFile).toHaveBeenCalledTimes(2);

      // Check first project has only SessionStart
      const firstWrite = (fs.writeFile as any).mock.calls[0];
      const firstSettings = JSON.parse(firstWrite[1]);
      expect(firstSettings.hooks.SessionStart).toBeDefined();
      expect(firstSettings.hooks.PreCompact).toBeUndefined();
      expect(firstSettings.hooks.SessionEnd).toBeUndefined();

      // Check second project has only PreCompact
      const secondWrite = (fs.writeFile as any).mock.calls[1];
      const secondSettings = JSON.parse(secondWrite[1]);
      expect(secondSettings.hooks.SessionStart).toBeUndefined();
      expect(secondSettings.hooks.PreCompact).toBeDefined();
      expect(secondSettings.hooks.SessionEnd).toBeUndefined();
    });

    it('should install all hooks when all are enabled', async () => {
      const emptySettings = { hooks: {} };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(emptySettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const projectConfigs: ProjectHookConfig[] = [
        {
          path: '/mock/.claude/projects/project1',
          name: 'project1',
          sessionStart: true,
          preCompact: true,
          sessionEnd: true
        } as any
      ];

      (projectConfigs[0] as any).actualPath = '/mock/project1';

      await installSelectiveProjectHooks(projectConfigs);

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // All three hooks should be installed
      expect(writtenSettings.hooks.SessionStart).toBeDefined();
      expect(writtenSettings.hooks.PreCompact).toBeDefined();
      expect(writtenSettings.hooks.SessionEnd).toBeDefined();
    });

    it('should remove all hooks when all are disabled', async () => {
      const emptySettings = { hooks: {} };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(emptySettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const projectConfigs: ProjectHookConfig[] = [
        {
          path: '/mock/.claude/projects/project1',
          name: 'project1',
          sessionStart: false,
          preCompact: false,
          sessionEnd: false
        } as any
      ];

      (projectConfigs[0] as any).actualPath = '/mock/project1';

      await installSelectiveProjectHooks(projectConfigs);

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // No hooks should be installed
      expect(writtenSettings.hooks?.SessionStart).toBeUndefined();
      expect(writtenSettings.hooks?.PreCompact).toBeUndefined();
      expect(writtenSettings.hooks?.SessionEnd).toBeUndefined();
    });

    it('should handle empty project array', async () => {
      const projectConfigs: ProjectHookConfig[] = [];

      await installSelectiveProjectHooks(projectConfigs);

      // Should not write anything
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
