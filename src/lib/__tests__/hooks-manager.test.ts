import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import {
  uninstallVibeLogHooks,
  getHookStatus,
  areHooksInstalled,
  validateHookCommands,
  readClaudeSettings
} from '../hooks-manager';

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
  isVibeLogCommand: (cmd: string) => cmd.includes('vibe-log')
}));

describe('hooks-manager - Hook Preservation Tests', () => {
  const mockSettingsPath = '/mock/home/.claude/settings.json';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  describe('validateHookCommands', () => {
    it('should return valid when hooks are installed and CLI path exists', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: '/usr/local/bin/vibe-log send --hook-trigger=precompact' }
            ]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.access as any).mockResolvedValue(undefined); // File exists

      const result = await validateHookCommands();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error when no hooks are installed', async () => {
      const existingSettings = {
        hooks: {}
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));

      const result = await validateHookCommands();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No hooks installed');
    });

    it('should return error when CLI command not found', async () => {
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
      (fs.access as any).mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await validateHookCommands();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('CLI command not found: /usr/local/bin/vibe-log');
    });

    it('should return error when hook uses different CLI path', async () => {
      const existingSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [
              { type: 'command' as const, command: '/different/path/vibe-log send' }
            ]
          }]
        }
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(existingSettings));
      (fs.access as any).mockResolvedValue(undefined);

      const result = await validateHookCommands();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('PreCompact hook uses different CLI path: /different/path/vibe-log send');
    });
  });

  describe('readClaudeSettings', () => {
    it('should read settings and return in expected format', async () => {
      const mockSettings = {
        hooks: {
          PreCompact: [{
            matcher: '',
            hooks: [{ type: 'command' as const, command: 'test' }]
          }]
        },
        otherSetting: 'value'
      };

      (fs.readFile as any).mockResolvedValue(JSON.stringify(mockSettings));

      const result = await readClaudeSettings();

      expect(result.global).toEqual(mockSettings);
      expect(result.local).toBeNull();
      expect(result.merged).toEqual(mockSettings);
    });

    it('should return empty merged object when settings file does not exist', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await readClaudeSettings();

      expect(result.global).toBeNull();
      expect(result.local).toBeNull();
      expect(result.merged).toEqual({});
    });

    it('should handle invalid JSON gracefully', async () => {
      (fs.readFile as any).mockResolvedValue('invalid json {');

      const result = await readClaudeSettings();

      expect(result.global).toBeNull();
      expect(result.local).toBeNull();
      expect(result.merged).toEqual({});
    });
  });
});
