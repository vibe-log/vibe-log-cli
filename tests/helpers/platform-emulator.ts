import { vi } from 'vitest';
import path from 'path';
import os from 'os';

/**
 * Platform emulator for testing cross-platform behavior on Windows
 */

export type Platform = 'win32' | 'darwin' | 'linux';

interface PlatformConfig {
  platform: Platform;
  homedir: string;
  tmpdir: string;
  pathSep: string;
  eol: string;
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
}

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  win32: {
    platform: 'win32',
    homedir: 'C:\\Users\\testuser',
    tmpdir: 'C:\\Windows\\Temp',
    pathSep: '\\',
    eol: '\r\n',
    isWindows: true,
    isMacOS: false,
    isLinux: false,
  },
  darwin: {
    platform: 'darwin',
    homedir: '/Users/testuser',
    tmpdir: '/var/folders/xx/xxxxxxxxx/T',
    pathSep: '/',
    eol: '\n',
    isWindows: false,
    isMacOS: true,
    isLinux: false,
  },
  linux: {
    platform: 'linux',
    homedir: '/home/testuser',
    tmpdir: '/tmp',
    pathSep: '/',
    eol: '\n',
    isWindows: false,
    isMacOS: false,
    isLinux: true,
  },
};

export class PlatformEmulator {
  private originalPlatform: NodeJS.Platform;
  private originalHomedir: () => string;
  private originalTmpdir: () => string;
  private currentConfig: PlatformConfig;
  private mocks: any[] = [];

  constructor() {
    // Store original values
    this.originalPlatform = process.platform;
    this.originalHomedir = os.homedir;
    this.originalTmpdir = os.tmpdir;
    this.currentConfig = PLATFORM_CONFIGS.win32;
  }

  /**
   * Emulate a specific platform
   */
  emulate(platform: Platform): void {
    this.currentConfig = PLATFORM_CONFIGS[platform];

    // Mock process.platform
    Object.defineProperty(process, 'platform', {
      value: platform,
      configurable: true,
      writable: true,
    });

    // Mock os module functions
    vi.spyOn(os, 'homedir').mockReturnValue(this.currentConfig.homedir);
    vi.spyOn(os, 'tmpdir').mockReturnValue(this.currentConfig.tmpdir);
    vi.spyOn(os, 'platform').mockReturnValue(this.currentConfig.platform);
    vi.spyOn(os, 'EOL', 'get').mockReturnValue(this.currentConfig.eol);

    // Mock path separator
    if (platform === 'win32') {
      vi.spyOn(path, 'sep', 'get').mockReturnValue('\\');
      vi.spyOn(path, 'delimiter', 'get').mockReturnValue(';');
    } else {
      vi.spyOn(path, 'sep', 'get').mockReturnValue('/');
      vi.spyOn(path, 'delimiter', 'get').mockReturnValue(':');
    }

    // Override path.join to use platform-specific separator
    const originalJoin = path.join;
    vi.spyOn(path, 'join').mockImplementation((...args: string[]) => {
      // Use platform-specific separator when joining
      if (platform === 'win32') {
        // For Windows, join with backslashes
        return args.filter(Boolean).join('\\').replace(/\\/g, '\\');
      } else {
        // For Unix-like systems, join with forward slashes
        return args.filter(Boolean).join('/');
      }
    });
  }

  /**
   * Get platform-specific paths
   */
  getPaths() {
    const home = this.currentConfig.homedir;
    const sep = this.currentConfig.pathSep;
    
    return {
      home,
      vibelog: `${home}${sep}.vibelog`,
      config: `${home}${sep}.vibelog${sep}config.json`,
      key: `${home}${sep}.vibelog${sep}.key`,
      claude: `${home}${sep}.claude${sep}projects`,
      temp: this.currentConfig.tmpdir,
    };
  }

  /**
   * Get platform-specific file permissions behavior
   */
  getPermissionsBehavior() {
    return {
      // Windows ignores chmod, Unix respects it
      respectsChmod: this.currentConfig.platform !== 'win32',
      // Default file permissions
      defaultFileMode: this.currentConfig.platform === 'win32' ? 0o666 : 0o644,
      // Can set executable bit
      supportsExecutable: this.currentConfig.platform !== 'win32',
    };
  }

  /**
   * Get platform-specific command behavior
   */
  getCommandBehavior() {
    return {
      // Shell command syntax
      shell: this.currentConfig.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      // Echo command
      echo: this.currentConfig.platform === 'win32' ? 'echo' : 'echo',
      // Null device
      nullDevice: this.currentConfig.platform === 'win32' ? 'NUL' : '/dev/null',
      // Path separator in PATH env
      pathSeparator: this.currentConfig.platform === 'win32' ? ';' : ':',
      // Executable extension
      exeExtension: this.currentConfig.platform === 'win32' ? '.exe' : '',
    };
  }

  /**
   * Reset to original platform
   */
  reset(): void {
    // Restore process.platform
    Object.defineProperty(process, 'platform', {
      value: this.originalPlatform,
      configurable: true,
      writable: true,
    });

    // Restore all mocks
    vi.restoreAllMocks();
  }
}

/**
 * Test helper to run tests on multiple platforms
 */
export function testOnPlatforms(
  platforms: Platform[],
  testName: string,
  testFn: (platform: Platform, emulator: PlatformEmulator) => void | Promise<void>
) {
  platforms.forEach((platform) => {
    it(`${testName} (${platform})`, async () => {
      const emulator = new PlatformEmulator();
      try {
        emulator.emulate(platform);
        await testFn(platform, emulator);
      } finally {
        emulator.reset();
      }
    });
  });
}

/**
 * Mock file system operations for different platforms
 */
export function mockFileSystemForPlatform(platform: Platform) {
  const config = PLATFORM_CONFIGS[platform];
  const sep = config.pathSep;

  return {
    mockFile(filePath: string, content: string) {
      // Convert path to platform format
      const platformPath = platform === 'win32' 
        ? filePath.replace(/\//g, '\\')
        : filePath.replace(/\\/g, '/');
      
      return {
        path: platformPath,
        content,
        stats: {
          mode: platform === 'win32' ? 0o666 : 0o644,
          isFile: () => true,
          isDirectory: () => false,
        },
      };
    },

    mockDirectory(dirPath: string, files: Record<string, string> = {}) {
      const platformPath = platform === 'win32'
        ? dirPath.replace(/\//g, '\\')
        : dirPath.replace(/\\/g, '/');

      const platformFiles: Record<string, any> = {};
      
      Object.entries(files).forEach(([name, content]) => {
        const fullPath = `${platformPath}${sep}${name}`;
        platformFiles[fullPath] = {
          content,
          stats: {
            mode: platform === 'win32' ? 0o666 : 0o644,
            isFile: () => true,
            isDirectory: () => false,
          },
        };
      });

      return {
        path: platformPath,
        files: platformFiles,
        stats: {
          mode: platform === 'win32' ? 0o777 : 0o755,
          isFile: () => false,
          isDirectory: () => true,
        },
      };
    },
  };
}

/**
 * Create platform-specific test scenarios
 */
export const PlatformScenarios = {
  pathWithSpaces: (platform: Platform) => {
    const sep = PLATFORM_CONFIGS[platform].pathSep;
    return platform === 'win32'
      ? `C:${sep}Program Files${sep}My Project`
      : `${sep}Users${sep}test${sep}My Project`;
  },

  absolutePath: (platform: Platform) => {
    return platform === 'win32'
      ? 'C:\\Projects\\vibelog'
      : '/home/user/projects/vibelog';
  },

  relativePath: (platform: Platform) => {
    const sep = PLATFORM_CONFIGS[platform].pathSep;
    return `..${sep}..${sep}project`;
  },

  homeExpansion: (platform: Platform) => {
    return platform === 'win32'
      ? '%USERPROFILE%\\.vibelog'
      : '~/.vibelog';
  },

  executableName: (platform: Platform, name: string) => {
    return platform === 'win32' ? `${name}.exe` : name;
  },

  lineEnding: (platform: Platform) => {
    return PLATFORM_CONFIGS[platform].eol;
  },
};