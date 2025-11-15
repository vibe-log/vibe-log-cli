import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  installVibeLogHooks,
  uninstallVibeLogHooks,
  getHookStatus,
  areHooksInstalled
} from '../hooks-manager';
import * as config from '../config';

// Mock dependencies
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    access: vi.fn()
  }
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home')
}));

vi.mock('../config', () => ({
  getCliPath: vi.fn(() => '/usr/local/bin/vibe-log')
}));

vi.mock('../hooks/hooks-controller', () => ({
  isVibeLogCommand: (cmd: string) => cmd.includes('vibe-log'),
  buildHookCommand: (cliPath: string, trigger: string) =>
    `${cliPath} send --silent --background --hook-trigger=${trigger} --hook-version=1.0.0`
}));

describe('hooks-manager - Hook Preservation Tests', () => {
  const mockSettingsPath = '/mock/home/.claude/settings.json';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('installVibeLogHooks', () => {
    it('should create new hooks when no existing hooks exist', async () => {
      const emptySettings = { hooks: {} };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(emptySettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.rename as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      await installVibeLogHooks(true);

      // Verify writeFile was called
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should have PreCompact hook
      expect(writtenSettings.hooks.PreCompact).toBeDefined();
      expect(writtenSettings.hooks.PreCompact).toHaveLength(1);
      expect(writtenSettings.hooks.PreCompact[0].hooks).toHaveLength(1);
      expect(writtenSettings.hooks.PreCompact[0].hooks[0].command).toContain('vibe-log');
    });

    it('should PRESERVE existing non-vibe-log hooks when installing', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [{
              type: 'command' as const,
              command: 'echo "existing hook"'
            }]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.rename as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      await installVibeLogHooks(true);

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should have BOTH hooks
      expect(writtenSettings.hooks.PreCompact).toBeDefined();
      expect(writtenSettings.hooks.PreCompact[0].hooks).toHaveLength(2);

      // Original hook preserved
      expect(writtenSettings.hooks.PreCompact[0].hooks[0].command).toBe('echo "existing hook"');

      // New vibe-log hook appended
      expect(writtenSettings.hooks.PreCompact[0].hooks[1].command).toContain('vibe-log');
    });

    it('should NOT create duplicates when vibe-log hook already exists', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [{
              type: 'command' as const,
              command: '/usr/local/bin/vibe-log send --silent --background --hook-trigger=precompact'
            }]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));

      await expect(installVibeLogHooks(false)).rejects.toThrow('Hooks already installed');
    });

    it('should handle multiple existing hooks correctly', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: 'echo "hook 1"' },
              { type: 'command' as const, command: 'echo "hook 2"' },
              { type: 'command' as const, command: 'echo "hook 3"' }
            ]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.rename as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      await installVibeLogHooks(true);

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should have ALL 4 hooks (3 existing + 1 new)
      expect(writtenSettings.hooks.PreCompact[0].hooks).toHaveLength(4);
      expect(writtenSettings.hooks.PreCompact[0].hooks[0].command).toBe('echo "hook 1"');
      expect(writtenSettings.hooks.PreCompact[0].hooks[1].command).toBe('echo "hook 2"');
      expect(writtenSettings.hooks.PreCompact[0].hooks[2].command).toBe('echo "hook 3"');
      expect(writtenSettings.hooks.PreCompact[0].hooks[3].command).toContain('vibe-log');
    });

    it('should handle empty PreCompact array', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: []
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.rename as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      await installVibeLogHooks(true);

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should create new hook config
      expect(writtenSettings.hooks.PreCompact).toHaveLength(1);
      expect(writtenSettings.hooks.PreCompact[0].hooks).toHaveLength(1);
      expect(writtenSettings.hooks.PreCompact[0].hooks[0].command).toContain('vibe-log');
    });
  });

  describe('uninstallVibeLogHooks', () => {
    it('should ONLY remove vibe-log hooks, preserving other hooks', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: 'echo "keep this"' },
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send' },
              { type: 'command' as const, command: 'echo "keep this too"' }
            ]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.rename as any).mockResolvedValue(undefined);

      await uninstallVibeLogHooks();

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should have 2 hooks left (vibe-log removed)
      expect(writtenSettings.hooks.PreCompact).toBeDefined();
      expect(writtenSettings.hooks.PreCompact[0].hooks).toHaveLength(2);
      expect(writtenSettings.hooks.PreCompact[0].hooks[0].command).toBe('echo "keep this"');
      expect(writtenSettings.hooks.PreCompact[0].hooks[1].command).toBe('echo "keep this too"');
    });

    it('should remove PreCompact entirely if only vibe-log hooks exist', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send' }
            ]
          }],
          SessionStart: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: 'echo "other hook"' }
            ]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.rename as any).mockResolvedValue(undefined);

      await uninstallVibeLogHooks();

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // PreCompact should be deleted, SessionStart preserved
      expect(writtenSettings.hooks.PreCompact).toBeUndefined();
      expect(writtenSettings.hooks.SessionStart).toBeDefined();
    });

    it('should handle multiple vibe-log hooks in same config', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: 'echo "keep this"' },
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=precompact' },
              { type: 'command' as const, command: '@vibe-log/cli send' },
              { type: 'command' as const, command: 'echo "keep this too"' }
            ]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.rename as any).mockResolvedValue(undefined);

      await uninstallVibeLogHooks();

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const writtenSettings = JSON.parse(writeCall[1]);

      // Should have 2 non-vibe-log hooks left
      expect(writtenSettings.hooks.PreCompact[0].hooks).toHaveLength(2);
      expect(writtenSettings.hooks.PreCompact[0].hooks[0].command).toBe('echo "keep this"');
      expect(writtenSettings.hooks.PreCompact[0].hooks[1].command).toBe('echo "keep this too"');
    });

    it('should handle empty hooks object', async () => {
      const existingSettings = {
        hooks: {}
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));

      await expect(uninstallVibeLogHooks()).rejects.toThrow('No vibe-log hooks found to uninstall');
    });
  });

  describe('getHookStatus', () => {
    it('should detect vibe-log hooks correctly', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send' }
            ]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));

      const status = await getHookStatus();

      expect(status.installed).toBe(true);
      expect(status.preCompactHook).toBe(true);
      expect(status.stopHook).toBe(false);
      expect(status.hookCommands.preCompact).toContain('vibe-log');
    });

    it('should not be confused by non-vibe-log hooks', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: 'echo "not-related-command"' }
            ]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));

      const status = await getHookStatus();

      // The status should still be false because the mock isVibeLogCommand checks for 'vibe-log'
      expect(status.installed).toBe(false);
      expect(status.preCompactHook).toBe(false);
    });

    it('should detect mixed hooks correctly', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: 'echo "other"' },
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send' },
              { type: 'command' as const, command: 'echo "another"' }
            ]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));

      const status = await getHookStatus();

      expect(status.installed).toBe(true);
      expect(status.preCompactHook).toBe(true);
    });
  });

  describe('areHooksInstalled', () => {
    it('should return true when vibe-log hooks are installed', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send' }
            ]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));

      const installed = await areHooksInstalled();

      expect(installed).toBe(true);
    });

    it('should return false when no vibe-log hooks exist', async () => {
      const existingSettings = {
        hooks: {}
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));

      const installed = await areHooksInstalled();

      expect(installed).toBe(false);
    });
  });
});
