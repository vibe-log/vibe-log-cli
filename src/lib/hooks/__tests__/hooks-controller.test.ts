import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import {
  installSelectedHooks,
  installGlobalHooks,
  uninstallAllHooks,
  toggleHook,
  type HookSelection
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

  describe('toggleHook', () => {
    it('should enable hook without affecting other hooks', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: 'auto',
            hooks: [
              { type: 'command' as const, command: 'echo "other"' },
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send --disabled' }
            ]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(existingSettings);
      (claudeSettingsReader.writeGlobalSettings as any).mockResolvedValue(undefined);

      await toggleHook('precompact', true);

      const writeCall = (claudeSettingsReader.writeGlobalSettings as any).mock.calls[0][0];

      // Both hooks should still exist
      expect(writeCall.hooks.PreCompact[0].hooks).toHaveLength(2);

      // First hook unchanged
      expect(writeCall.hooks.PreCompact[0].hooks[0].command).toBe('echo "other"');

      // Second hook should not have --disabled flag
      expect(writeCall.hooks.PreCompact[0].hooks[1].command).not.toContain('--disabled');
    });

    it('should disable hook without affecting other hooks', async () => {
      const existingSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send' },
              { type: 'command' as const, command: 'echo "other"' }
            ]
          }]
        }
      };

      (claudeSettingsReader.readGlobalSettings as any).mockResolvedValue(existingSettings);
      (claudeSettingsReader.writeGlobalSettings as any).mockResolvedValue(undefined);

      await toggleHook('sessionstart', false);

      const writeCall = (claudeSettingsReader.writeGlobalSettings as any).mock.calls[0][0];

      // Both hooks should still exist
      expect(writeCall.hooks.SessionStart[0].hooks).toHaveLength(2);

      // First hook should have --disabled flag
      expect(writeCall.hooks.SessionStart[0].hooks[0].command).toContain('--disabled');

      // Second hook unchanged
      expect(writeCall.hooks.SessionStart[0].hooks[1].command).toBe('echo "other"');
    });
  });
});
