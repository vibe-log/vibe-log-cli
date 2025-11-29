import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeSettingsManager } from '../../../src/lib/claude-settings-manager';
import * as settingsReader from '../../../src/lib/claude-settings-reader';
import * as config from '../../../src/lib/config';

// Mock dependencies
vi.mock('../../../src/lib/claude-settings-reader');
vi.mock('../../../src/lib/config');
vi.mock('../../../src/utils/logger');

describe('ClaudeSettingsManager', () => {
  let manager: ClaudeSettingsManager;
  const mockSettingsReader = vi.mocked(settingsReader);
  const mockConfig = vi.mocked(config);

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ClaudeSettingsManager();

    // Default mocks
    mockConfig.getCliPath.mockReturnValue('npx vibe-log-cli');
    mockSettingsReader.readGlobalSettings.mockResolvedValue(null);
    mockSettingsReader.writeGlobalSettings.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('installStatusLineFeature', () => {
    it('should install both UserPromptSubmit hook and statusLine display', async () => {
      const mockSettings = { hooks: {} };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.installStatusLineFeature();

      expect(mockSettingsReader.writeGlobalSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          hooks: {
            UserPromptSubmit: expect.arrayContaining([
              expect.objectContaining({
                hooks: expect.arrayContaining([
                  expect.objectContaining({
                    type: 'command',
                    command: 'npx vibe-log-cli analyze-prompt --silent --stdin'
                  })
                ])
              })
            ])
          },
          statusLine: {
            type: 'command',
            command: 'npx vibe-log-cli statusline',
            padding: 0
          }
        })
      );
    });

    it('should use custom CLI path when provided', async () => {
      const mockSettings = { hooks: {} };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.installStatusLineFeature({ cliPath: '/custom/path/vibe-log' });

      expect(mockSettingsReader.writeGlobalSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          hooks: {
            UserPromptSubmit: expect.arrayContaining([
              expect.objectContaining({
                hooks: expect.arrayContaining([
                  expect.objectContaining({
                    command: '/custom/path/vibe-log analyze-prompt --silent --stdin'
                  })
                ])
              })
            ])
          },
          statusLine: expect.objectContaining({
            command: '/custom/path/vibe-log statusline'
          })
        })
      );
    });

    it('should backup existing non-vibe-log status line', async () => {
      const mockSettings = {
        hooks: {},
        statusLine: {
          type: 'command' as const,
          command: 'echo "custom status"',
          padding: 1
        }
      };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.installStatusLineFeature();

      expect(mockConfig.saveStatusLineBackup).toHaveBeenCalledWith({
        originalCommand: 'echo "custom status"',
        originalType: 'command',
        originalPadding: 1,
        backupReason: 'Replaced by vibe-log status line'
      });
    });

    it('should append to existing UserPromptSubmit hooks', async () => {
      const mockSettings = {
        hooks: {
          UserPromptSubmit: [{
            hooks: [
              { type: 'command' as const, command: 'existing-hook' }
            ]
          }]
        }
      };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.installStatusLineFeature();

      const savedSettings = mockSettingsReader.writeGlobalSettings.mock.calls[0][0];
      expect(savedSettings.hooks?.UserPromptSubmit?.[0]?.hooks).toHaveLength(2);
      expect(savedSettings.hooks?.UserPromptSubmit?.[0]?.hooks).toEqual([
        { type: 'command', command: 'existing-hook' },
        { type: 'command', command: 'npx vibe-log-cli analyze-prompt --silent --stdin' }
      ]);
    });
  });

  describe('removeStatusLineFeature', () => {
    it('should remove both UserPromptSubmit hook and statusLine display', async () => {
      const mockSettings = {
        hooks: {
          UserPromptSubmit: [{
            hooks: [
              { type: 'command' as const, command: 'npx vibe-log-cli analyze-prompt --silent --stdin' }
            ]
          }]
        },
        statusLine: {
          type: 'command' as const,
          command: 'npx vibe-log-cli statusline',
          padding: 0
        }
      };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.removeStatusLineFeature();

      const savedSettings = mockSettingsReader.writeGlobalSettings.mock.calls[0][0];
      // Hooks are deleted, not set to empty array
      expect(savedSettings.hooks?.UserPromptSubmit).toBeUndefined();
      expect(savedSettings.statusLine).toBeUndefined();
    });

    it('should restore backup when requested', async () => {
      const mockSettings = {
        hooks: {
          UserPromptSubmit: [{
            hooks: [
              { type: 'command' as const, command: 'npx vibe-log-cli analyze-prompt --silent --stdin' }
            ]
          }]
        },
        statusLine: {
          type: 'command' as const,
          command: 'npx vibe-log-cli statusline',
          padding: 0
        }
      };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      const backup = {
        originalCommand: 'echo "custom"',
        originalType: 'command' as const,
        originalPadding: 1,
        backupReason: 'test'
      };
      mockConfig.getStatusLineBackup.mockReturnValue(backup);

      await manager.removeStatusLineFeature(true);

      const savedSettings = mockSettingsReader.writeGlobalSettings.mock.calls[0][0];
      expect(savedSettings.statusLine).toEqual({
        type: 'command',
        command: 'echo "custom"',
        padding: 1
      });
      expect(mockConfig.clearStatusLineBackup).toHaveBeenCalled();
    });

    it('should preserve non-vibe-log UserPromptSubmit hooks', async () => {
      const mockSettings = {
        hooks: {
          UserPromptSubmit: [{
            hooks: [
              { type: 'command' as const, command: 'existing-hook' },
              { type: 'command' as const, command: 'npx vibe-log-cli analyze-prompt --silent --stdin' }
            ]
          }]
        },
        statusLine: {
          type: 'command' as const,
          command: 'npx vibe-log-cli statusline',
          padding: 0
        }
      };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.removeStatusLineFeature();

      const savedSettings = mockSettingsReader.writeGlobalSettings.mock.calls[0][0];
      expect(savedSettings.hooks?.UserPromptSubmit?.[0]?.hooks).toEqual([
        { type: 'command', command: 'existing-hook' }
      ]);
    });
  });

  describe('getFeatureStatus', () => {
    it('should detect installed status line feature', async () => {
      const mockSettings = {
        hooks: {
          UserPromptSubmit: [{
            hooks: [
              { type: 'command' as const, command: 'npx vibe-log-cli analyze-prompt --silent --stdin' }
            ]
          }]
        },
        statusLine: {
          type: 'command' as const,
          command: 'npx vibe-log-cli statusline',
          padding: 0
        }
      };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      const status = await manager.getFeatureStatus();

      expect(status.statusLine.hookInstalled).toBe(true);
      expect(status.statusLine.displayInstalled).toBe(true);
      expect(status.statusLine.isComplete).toBe(true);
      expect(status.statusLine.installed).toBe(true);
    });

    it('should detect partially installed status line (hook only)', async () => {
      const mockSettings = {
        hooks: {
          UserPromptSubmit: [{
            hooks: [
              { type: 'command' as const, command: 'npx vibe-log-cli analyze-prompt --silent --stdin' }
            ]
          }]
        }
      };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      const status = await manager.getFeatureStatus();

      expect(status.statusLine.hookInstalled).toBe(true);
      expect(status.statusLine.displayInstalled).toBe(false);
      expect(status.statusLine.isComplete).toBe(false);
      // If not complete, overall installed is false
      expect(status.statusLine.installed).toBe(false);
    });

    it('should detect no installed features', async () => {
      mockSettingsReader.readGlobalSettings.mockResolvedValue(null);

      const status = await manager.getFeatureStatus();

      expect(status.statusLine.hookInstalled).toBe(false);
      expect(status.statusLine.displayInstalled).toBe(false);
      expect(status.statusLine.isComplete).toBe(false);
      expect(status.statusLine.installed).toBe(false);
    });
  });

  describe('removeAllVibeLogSettings', () => {
    it('should remove all vibe-log hooks and settings', async () => {
      const mockSettings = {
        hooks: {
          UserPromptSubmit: [{
            hooks: [
              { type: 'command' as const, command: 'npx vibe-log-cli analyze-prompt --silent --stdin' }
            ]
          }],
          SessionStart: [{
            hooks: [
              { type: 'command' as const, command: 'npx vibe-log-cli send --silent --background --hook-trigger=sessionstart' }
            ]
          }],
          PreCompact: [{
            hooks: [
              { type: 'command' as const, command: 'npx vibe-log-cli send --silent --background --hook-trigger=precompact' }
            ]
          }]
        },
        statusLine: {
          type: 'command' as const,
          command: 'npx vibe-log-cli statusline',
          padding: 0
        }
      };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.removeAllVibeLogSettings();

      const savedSettings = mockSettingsReader.writeGlobalSettings.mock.calls[0][0];
      // Hooks are deleted, not set to empty array
      expect(savedSettings.hooks?.UserPromptSubmit).toBeUndefined();
      expect(savedSettings.hooks?.SessionStart).toBeUndefined();
      expect(savedSettings.hooks?.PreCompact).toBeUndefined();
      expect(savedSettings.statusLine).toBeUndefined();
    });

    it('should handle empty settings gracefully', async () => {
      mockSettingsReader.readGlobalSettings.mockResolvedValue(null);

      await expect(manager.removeAllVibeLogSettings()).resolves.not.toThrow();
    });
  });

  describe('updateCliPath', () => {
    it('should update CLI path in all vibe-log commands', async () => {
      const mockSettings = {
        hooks: {
          UserPromptSubmit: [{
            hooks: [
              { type: 'command' as const, command: 'npx vibe-log-cli analyze-prompt --silent --stdin' }
            ]
          }],
          SessionStart: [{
            hooks: [
              { type: 'command' as const, command: 'npx vibe-log-cli send --silent --background --hook-trigger=sessionstart' }
            ]
          }]
        },
        statusLine: {
          type: 'command' as const,
          command: 'npx vibe-log-cli statusline',
          padding: 0
        }
      };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.updateCliPath('/new/path/vibe-log');

      const savedSettings = mockSettingsReader.writeGlobalSettings.mock.calls[0][0];
      expect(savedSettings.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command).toBe(
        '/new/path/vibe-log analyze-prompt --silent --stdin'
      );
      // SessionStart command includes additional flags like --hook-version and --claude-project-dir
      expect(savedSettings.hooks?.SessionStart?.[0]?.hooks?.[0]?.command).toContain(
        '/new/path/vibe-log send --silent --background --hook-trigger=sessionstart'
      );
      expect(savedSettings.statusLine?.command).toBe('/new/path/vibe-log statusline');
    });
  });

  describe('installAutoSyncHooks', () => {
    it('should install SessionStart hook globally', async () => {
      // Initialize hooks arrays as the code expects them to exist
      const mockSettings = { hooks: { SessionStart: [], PreCompact: [] } };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.installAutoSyncHooks({
        installSessionStart: true,
        mode: 'all'
      });

      const savedSettings = mockSettingsReader.writeGlobalSettings.mock.calls[0][0];
      expect(savedSettings.hooks?.SessionStart).toBeDefined();
      expect(savedSettings.hooks?.SessionStart?.[0]?.hooks?.[0]?.command).toContain(
        'npx vibe-log-cli send --silent --background --hook-trigger=sessionstart'
      );
    });

    it('should install PreCompact hook globally', async () => {
      const mockSettings = { hooks: { SessionStart: [], PreCompact: [] } };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.installAutoSyncHooks({
        installPreCompact: true,
        mode: 'all'
      });

      const savedSettings = mockSettingsReader.writeGlobalSettings.mock.calls[0][0];
      expect(savedSettings.hooks?.PreCompact).toBeDefined();
      expect(savedSettings.hooks?.PreCompact?.[0]?.hooks?.[0]?.command).toContain(
        'npx vibe-log-cli send --silent --background --hook-trigger=precompact'
      );
    });

    it('should install both SessionStart and PreCompact hooks', async () => {
      const mockSettings = { hooks: { SessionStart: [], PreCompact: [] } };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.installAutoSyncHooks({
        installSessionStart: true,
        installPreCompact: true,
        mode: 'all'
      });

      const savedSettings = mockSettingsReader.writeGlobalSettings.mock.calls[0][0];
      expect(savedSettings.hooks?.SessionStart).toBeDefined();
      expect(savedSettings.hooks?.PreCompact).toBeDefined();
    });

    it('should use custom CLI path when provided', async () => {
      const mockSettings = { hooks: { SessionStart: [], PreCompact: [] } };
      mockSettingsReader.readGlobalSettings.mockResolvedValue(mockSettings);

      await manager.installAutoSyncHooks({
        installSessionStart: true,
        mode: 'all',
        cliPath: '/custom/vibe-log'
      });

      const savedSettings = mockSettingsReader.writeGlobalSettings.mock.calls[0][0];
      expect(savedSettings.hooks?.SessionStart?.[0]?.hooks?.[0]?.command).toContain(
        '/custom/vibe-log send'
      );
    });
  });

});
