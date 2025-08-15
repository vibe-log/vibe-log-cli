import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildHookCommand } from '../../../../src/lib/hooks/hooks-controller';

// Mock the readSettings function to test getHookStatusInfo
vi.mock('../../../../src/lib/ui/settings', () => ({
  readSettings: vi.fn()
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

    it('should include all required parameters in correct order', () => {
      const cliPath = 'npx vibe-log';
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
        'npx vibe-log send --silent --background --hook-trigger=precompact --hook-version=2.3.4',
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
});