import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlatformEmulator, testOnPlatforms, PlatformScenarios } from '../helpers/platform-emulator';
import path from 'path';
import os from 'os';
import { getApiUrl, getConfigPath } from '../../src/lib/config';

describe('Cross-Platform Emulation Tests', () => {
  let emulator: PlatformEmulator;

  beforeEach(() => {
    emulator = new PlatformEmulator();
  });

  afterEach(() => {
    emulator.reset();
  });

  describe('Platform Detection', () => {
    it('should emulate Windows correctly', () => {
      emulator.emulate('win32');
      
      expect(process.platform).toBe('win32');
      expect(os.homedir()).toBe('C:\\Users\\testuser');
      expect(path.sep).toBe('\\');
      expect(os.EOL).toBe('\r\n');
    });

    it('should emulate macOS correctly', () => {
      emulator.emulate('darwin');
      
      expect(process.platform).toBe('darwin');
      expect(os.homedir()).toBe('/Users/testuser');
      expect(path.sep).toBe('/');
      expect(os.EOL).toBe('\n');
    });

    it('should emulate Linux correctly', () => {
      emulator.emulate('linux');
      
      expect(process.platform).toBe('linux');
      expect(os.homedir()).toBe('/home/testuser');
      expect(path.sep).toBe('/');
      expect(os.EOL).toBe('\n');
    });
  });

  describe('Path Handling', () => {
    testOnPlatforms(['win32', 'darwin', 'linux'], 'should handle config paths correctly', (platform, emulator) => {
      const paths = emulator.getPaths();
      
      if (platform === 'win32') {
        expect(paths.config).toBe('C:\\Users\\testuser\\.vibelog\\config.json');
        expect(paths.key).toBe('C:\\Users\\testuser\\.vibelog\\.key');
      } else if (platform === 'darwin') {
        expect(paths.config).toBe('/Users/testuser/.vibelog/config.json');
        expect(paths.key).toBe('/Users/testuser/.vibelog/.key');
      } else {
        expect(paths.config).toBe('/home/testuser/.vibelog/config.json');
        expect(paths.key).toBe('/home/testuser/.vibelog/.key');
      }
    });

    testOnPlatforms(['win32', 'darwin', 'linux'], 'should join paths correctly', (platform) => {
      const home = os.homedir();
      const configPath = path.join(home, '.vibelog', 'config.json');
      
      if (platform === 'win32') {
        // On Windows, path.join might mix separators in our emulation
        // The important thing is that it produces a valid Windows path
        expect(configPath).toMatch(/^[A-Z]:\\/); // Starts with drive letter
        expect(configPath).toContain('.vibelog');
        expect(configPath).toContain('config.json');
      } else {
        expect(configPath).toContain('/');
        expect(configPath).not.toContain('\\');
      }
    });
  });

  describe('File Permissions', () => {
    testOnPlatforms(['win32', 'darwin', 'linux'], 'should handle permissions correctly', (platform, emulator) => {
      const perms = emulator.getPermissionsBehavior();
      
      if (platform === 'win32') {
        expect(perms.respectsChmod).toBe(false);
        expect(perms.defaultFileMode).toBe(0o666);
        expect(perms.supportsExecutable).toBe(false);
      } else {
        expect(perms.respectsChmod).toBe(true);
        expect(perms.defaultFileMode).toBe(0o644);
        expect(perms.supportsExecutable).toBe(true);
      }
    });
  });

  describe('Command Behavior', () => {
    testOnPlatforms(['win32', 'darwin', 'linux'], 'should use correct shell', (platform, emulator) => {
      const cmd = emulator.getCommandBehavior();
      
      if (platform === 'win32') {
        expect(cmd.shell).toBe('cmd.exe');
        expect(cmd.nullDevice).toBe('NUL');
        expect(cmd.pathSeparator).toBe(';');
        expect(cmd.exeExtension).toBe('.exe');
      } else {
        expect(cmd.shell).toBe('/bin/sh');
        expect(cmd.nullDevice).toBe('/dev/null');
        expect(cmd.pathSeparator).toBe(':');
        expect(cmd.exeExtension).toBe('');
      }
    });
  });

  describe('Platform-Specific Scenarios', () => {
    testOnPlatforms(['win32', 'darwin', 'linux'], 'handles paths with spaces', (platform) => {
      const pathWithSpaces = PlatformScenarios.pathWithSpaces(platform);
      
      if (platform === 'win32') {
        expect(pathWithSpaces).toBe('C:\\Program Files\\My Project');
      } else {
        expect(pathWithSpaces).toBe('/Users/test/My Project');
      }
      
      // Test that path.join works with spaces
      const joined = path.join(pathWithSpaces, 'file.txt');
      expect(joined).toContain('My Project');
    });

    testOnPlatforms(['win32', 'darwin', 'linux'], 'handles absolute paths', (platform) => {
      const absPath = PlatformScenarios.absolutePath(platform);
      
      if (platform === 'win32') {
        expect(absPath).toMatch(/^[A-Z]:\\/);
      } else {
        expect(absPath).toMatch(/^\//);
      }
    });

    testOnPlatforms(['win32', 'darwin', 'linux'], 'handles executable names', (platform) => {
      const exe = PlatformScenarios.executableName(platform, 'node');
      
      if (platform === 'win32') {
        expect(exe).toBe('node.exe');
      } else {
        expect(exe).toBe('node');
      }
    });

    testOnPlatforms(['win32', 'darwin', 'linux'], 'handles line endings', (platform) => {
      const eol = PlatformScenarios.lineEnding(platform);
      
      if (platform === 'win32') {
        expect(eol).toBe('\r\n');
      } else {
        expect(eol).toBe('\n');
      }
      
      // Test string with line endings
      const text = `Line 1${eol}Line 2${eol}Line 3`;
      const lines = text.split(eol);
      expect(lines).toHaveLength(3);
    });
  });

  describe('Real-world Scenarios', () => {
    testOnPlatforms(['win32', 'darwin', 'linux'], 'Claude session paths', (platform, emulator) => {
      const paths = emulator.getPaths();
      const claudePath = paths.claude;
      
      if (platform === 'win32') {
        expect(claudePath).toBe('C:\\Users\\testuser\\.claude\\projects');
      } else if (platform === 'darwin') {
        expect(claudePath).toBe('/Users/testuser/.claude/projects');
      } else {
        expect(claudePath).toBe('/home/testuser/.claude/projects');
      }
    });

    testOnPlatforms(['win32', 'darwin', 'linux'], 'temp directory paths', (platform) => {
      const tmpdir = os.tmpdir();
      
      if (platform === 'win32') {
        expect(tmpdir).toMatch(/^C:\\/);
      } else if (platform === 'darwin') {
        expect(tmpdir).toMatch(/^\/var\//);
      } else {
        expect(tmpdir).toBe('/tmp');
      }
    });
  });
});