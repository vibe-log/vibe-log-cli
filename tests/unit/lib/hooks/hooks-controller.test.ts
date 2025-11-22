import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildHookCommand, uninstallAllHooks } from '../../../../src/lib/hooks/hooks-controller';
import type { ClaudeSettings } from '../../../../src/lib/claude-settings-reader';

// Mock the readSettings function to test getHookStatusInfo
vi.mock('../../../../src/lib/ui/settings', () => ({
  readSettings: vi.fn()
}));

// Mock claude-settings-reader
vi.mock('../../../../src/lib/claude-settings-reader', () => ({
  readGlobalSettings: vi.fn(),
  writeGlobalSettings: vi.fn()
}));

// Mock claude-core for project discovery
vi.mock('../../../../src/lib/claude-core', () => ({
  discoverProjects: vi.fn()
}));

// Mock telemetry
vi.mock('../../../../src/lib/telemetry', () => ({
  sendTelemetryUpdate: vi.fn()
}));

describe('Hooks Controller', () => {
  describe('buildHookCommand', () => {
    it('should build command with --hook-version parameter, not --version', () => {
      const cliPath = 'node /path/to/vibe-log.js';
      
      const sessionStartCommand = buildHookCommand(cliPath, 'sessionstart');
      expect(sessionStartCommand).toContain('--hook-version=');
      expect(sessionStartCommand).not.toContain('--version=');
      expect(sessionStartCommand).toBe('node /path/to/vibe-log.js send --silent --background --hook-trigger=sessionstart --hook-version=1.0.0 --claude-project-dir="$CLAUDE_PROJECT_DIR"');
      
      const preCompactCommand = buildHookCommand(cliPath, 'precompact');
      expect(preCompactCommand).toContain('--hook-version=');
      expect(preCompactCommand).not.toContain(' --version=');
      expect(preCompactCommand).toBe('node /path/to/vibe-log.js send --silent --background --hook-trigger=precompact --hook-version=1.0.0 --claude-project-dir="$CLAUDE_PROJECT_DIR"');
    });

    describe('mode-aware command generation', () => {
      it('should include --all flag and exclude --claude-project-dir when mode is "all"', () => {
        const cliPath = 'npx vibe-log-cli';
        const command = buildHookCommand(cliPath, 'sessionstart', 'all');
        
        expect(command).toContain('--all');
        expect(command).not.toContain('--claude-project-dir');
        expect(command).toBe('npx vibe-log-cli send --silent --background --hook-trigger=sessionstart --hook-version=1.0.0 --all');
      });

      it('should include --claude-project-dir and exclude --all when mode is "selected"', () => {
        const cliPath = 'npx vibe-log-cli';
        const command = buildHookCommand(cliPath, 'precompact', 'selected');
        
        expect(command).not.toContain('--all');
        expect(command).toContain('--claude-project-dir="$CLAUDE_PROJECT_DIR"');
        expect(command).toBe('npx vibe-log-cli send --silent --background --hook-trigger=precompact --hook-version=1.0.0 --claude-project-dir="$CLAUDE_PROJECT_DIR"');
      });

      it('should maintain backward compatibility when mode is undefined', () => {
        const cliPath = 'npx vibe-log-cli';
        const command = buildHookCommand(cliPath, 'sessionstart');

        // Should default to current behavior (with --claude-project-dir)
        expect(command).not.toContain('--all');
        expect(command).toContain('--claude-project-dir="$CLAUDE_PROJECT_DIR"');
        expect(command).toBe('npx vibe-log-cli send --silent --background --hook-trigger=sessionstart --hook-version=1.0.0 --claude-project-dir="$CLAUDE_PROJECT_DIR"');
      });

      it('should handle both sessionstart and precompact triggers with mode="all"', () => {
        const cliPath = 'node /path/to/vibe-log.js';

        const sessionStartCommand = buildHookCommand(cliPath, 'sessionstart', 'all');
        expect(sessionStartCommand).toBe('node /path/to/vibe-log.js send --silent --background --hook-trigger=sessionstart --hook-version=1.0.0 --all');

        const preCompactCommand = buildHookCommand(cliPath, 'precompact', 'all');
        expect(preCompactCommand).toBe('node /path/to/vibe-log.js send --silent --background --hook-trigger=precompact --hook-version=1.0.0 --all');
      });
    });

    it('should include all required parameters in correct order', () => {
      const cliPath = 'npx vibe-log-cli';
      const command = buildHookCommand(cliPath, 'sessionstart');
      
      // Check all parameters are present
      expect(command).toContain('send');
      expect(command).toContain('--silent');
      expect(command).toContain('--background');
      expect(command).toContain('--hook-trigger=sessionstart');
      expect(command).toContain('--hook-version=');
      
      // Verify order is correct
      const expectedOrder = ['send', '--silent', '--background', '--hook-trigger=', '--hook-version='];
      let lastIndex = -1;
      for (const part of expectedOrder) {
        const currentIndex = command.indexOf(part);
        expect(currentIndex).toBeGreaterThan(lastIndex);
        lastIndex = currentIndex;
      }
    });
  });

  describe('version extraction regex', () => {
    it('should extract version from --hook-version parameter', () => {
      const commands = [
        'node /path/to/cli send --silent --background --hook-trigger=sessionstart --hook-version=1.0.0',
        'npx vibe-log-cli send --silent --background --hook-trigger=precompact --hook-version=2.3.4',
        'node bin/vibe-log.js send --silent --background --hook-trigger=sessionstart --hook-version=0.0.1'
      ];
      
      const regex = /--hook-version=([0-9.]+)/;
      
      expect(commands[0].match(regex)?.[1]).toBe('1.0.0');
      expect(commands[1].match(regex)?.[1]).toBe('2.3.4');
      expect(commands[2].match(regex)?.[1]).toBe('0.0.1');
    });

    it('should NOT extract version from old --version parameter', () => {
      const oldCommand = 'node /path/to/cli send --silent --hook-trigger=sessionstart --version=1.0.0';
      const regex = /--hook-version=([0-9.]+)/;
      
      const match = oldCommand.match(regex);
      expect(match).toBeNull();
    });

    it('should handle commands without version parameter', () => {
      const commandWithoutVersion = 'node /path/to/cli send --silent --hook-trigger=sessionstart';
      const regex = /--hook-version=([0-9.]+)/;
      
      const match = commandWithoutVersion.match(regex);
      expect(match).toBeNull();
    });

    it('should handle various version formats', () => {
      const regex = /--hook-version=([0-9.]+)/;
      
      const testCases = [
        { command: 'cli send --hook-version=1', expected: '1' },
        { command: 'cli send --hook-version=1.0', expected: '1.0' },
        { command: 'cli send --hook-version=1.0.0', expected: '1.0.0' },
        { command: 'cli send --hook-version=10.20.30', expected: '10.20.30' },
        { command: 'cli send --hook-version=0.0.0', expected: '0.0.0' }
      ];
      
      testCases.forEach(({ command, expected }) => {
        const match = command.match(regex);
        expect(match?.[1]).toBe(expected);
      });
    });
  });

  describe('command compatibility', () => {
    it('should not conflict with main CLI --version flag', () => {
      // The main CLI accepts --version
      const mainCliVersionCommand = 'node /path/to/vibe-log.js --version';
      
      // The send subcommand accepts --hook-version
      const sendHookVersionCommand = 'node /path/to/vibe-log.js send --hook-version=1.0.0';
      
      // These should be distinct and not interfere with each other
      expect(mainCliVersionCommand).toContain('--version');
      expect(mainCliVersionCommand).not.toContain('--hook-version');
      
      expect(sendHookVersionCommand).toContain('--hook-version');
      expect(sendHookVersionCommand).not.toContain(' --version');
    });

    it('should generate commands that work with both old and new hooks', () => {
      const cliPath = 'node /path/to/vibe-log.js';
      const newCommand = buildHookCommand(cliPath, 'sessionstart');

      // New command should use --hook-version
      expect(newCommand).toMatch(/--hook-version=[0-9.]+/);

      // Should not generate old format
      expect(newCommand).not.toMatch(/ --version=[0-9.]+/);
    });
  });

  describe('uninstallAllHooks', () => {
    it('should remove ONLY vibe-log hooks and preserve user\'s other hooks across all hook types', async () => {
      // Import mocked modules
      const { readGlobalSettings, writeGlobalSettings } = await import('../../../../src/lib/claude-settings-reader');
      const { discoverProjects } = await import('../../../../src/lib/claude-core');
      const { sendTelemetryUpdate } = await import('../../../../src/lib/telemetry');

      // Setup: Create settings with both vibe-log and user hooks across all three hook types
      const mockSettings: ClaudeSettings = {
        hooks: {
          SessionStart: [{
            matcher: 'startup|clear',
            hooks: [
              {
                type: 'command',
                command: 'afplay /System/Library/Sounds/Glass.aiff' // User's sound hook - SHOULD BE PRESERVED
              },
              {
                type: 'command',
                command: 'npx vibe-log-cli send --silent --background --hook-trigger=sessionstart' // vibe-log - SHOULD BE REMOVED
              }
            ]
          }],
          PreCompact: [{
            matcher: 'auto',
            hooks: [
              {
                type: 'command',
                command: 'echo "Running linter before compact"' // User's custom hook - SHOULD BE PRESERVED
              },
              {
                type: 'command',
                command: 'node /path/to/vibe-log send --hook-trigger=precompact' // vibe-log - SHOULD BE REMOVED
              }
            ]
          }],
          SessionEnd: [{
            matcher: 'clear|logout|prompt_input_exit|other',
            hooks: [
              {
                type: 'command',
                command: '/usr/local/bin/vibe-log send --hook-trigger=sessionend' // vibe-log - SHOULD BE REMOVED
              },
              {
                type: 'command',
                command: 'notify-send "Session ended"' // User's notification hook - SHOULD BE PRESERVED
              }
            ]
          }]
        }
      };

      // Mock the functions
      vi.mocked(readGlobalSettings).mockResolvedValue(mockSettings);
      vi.mocked(writeGlobalSettings).mockResolvedValue(undefined);
      vi.mocked(discoverProjects).mockResolvedValue([]); // No projects to process
      vi.mocked(sendTelemetryUpdate).mockResolvedValue(undefined);

      // Execute
      await uninstallAllHooks();

      // Verify writeGlobalSettings was called
      expect(writeGlobalSettings).toHaveBeenCalled();
      const writtenSettings = vi.mocked(writeGlobalSettings).mock.calls[0][0];

      // Assert: User's hooks should be preserved across all hook types
      // SessionStart should still exist with only the sound hook
      expect(writtenSettings.hooks?.SessionStart).toBeDefined();
      expect(writtenSettings.hooks?.SessionStart).toHaveLength(1);
      expect(writtenSettings.hooks?.SessionStart![0].hooks).toHaveLength(1);
      expect(writtenSettings.hooks?.SessionStart![0].hooks[0].command).toBe('afplay /System/Library/Sounds/Glass.aiff');

      // PreCompact should still exist with only the linter hook
      expect(writtenSettings.hooks?.PreCompact).toBeDefined();
      expect(writtenSettings.hooks?.PreCompact).toHaveLength(1);
      expect(writtenSettings.hooks?.PreCompact![0].hooks).toHaveLength(1);
      expect(writtenSettings.hooks?.PreCompact![0].hooks[0].command).toBe('echo "Running linter before compact"');

      // SessionEnd should still exist with only the notification hook
      expect(writtenSettings.hooks?.SessionEnd).toBeDefined();
      expect(writtenSettings.hooks?.SessionEnd).toHaveLength(1);
      expect(writtenSettings.hooks?.SessionEnd![0].hooks).toHaveLength(1);
      expect(writtenSettings.hooks?.SessionEnd![0].hooks[0].command).toBe('notify-send "Session ended"');

      // Verify vibe-log hooks were removed (no commands containing 'vibe-log')
      const allCommands = [
        ...(writtenSettings.hooks?.SessionStart?.[0]?.hooks || []),
        ...(writtenSettings.hooks?.PreCompact?.[0]?.hooks || []),
        ...(writtenSettings.hooks?.SessionEnd?.[0]?.hooks || [])
      ].map(h => h.command);

      expect(allCommands.every(cmd => !cmd.includes('vibe-log'))).toBe(true);
    });
  });
});