import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFiles = vi.hoisted(() => new Map<string, string>());
const mockDiscoverCodexProjects = vi.hoisted(() => vi.fn());
const mockFs = vi.hoisted(() => ({
  readFile: vi.fn(async (filePath: string) => {
    if (!mockFiles.has(filePath)) {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return mockFiles.get(filePath);
  }),
  writeFile: vi.fn(async (filePath: string, content: string) => {
    mockFiles.set(filePath, content);
  }),
  mkdir: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ mtime: new Date('2026-04-19T00:00:00.000Z') })),
}));

vi.mock('fs', () => ({
  promises: mockFs,
}));

vi.mock('../../../../src/lib/config', () => ({
  getCliPath: () => 'npx -y vibe-log-cli@latest',
}));

vi.mock('../../../../src/lib/readers/codex', () => ({
  getCodexHomePath: () => '/home/test/.codex',
}));

vi.mock('../../../../src/lib/codex-core', () => ({
  discoverCodexProjects: mockDiscoverCodexProjects,
}));

vi.mock('../../../../src/lib/telemetry', () => ({
  sendTelemetryUpdate: vi.fn(),
}));

vi.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  buildCodexHookCommand,
  enableCodexHooksInToml,
  getCodexHooksStatus,
  installSelectedCodexHooks,
  installSelectiveCodexProjectHooks,
  uninstallAllCodexHooks,
} from '../../../../src/lib/hooks/codex-hooks-provider';

describe('codex-hooks-provider', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFiles.clear();
    mockDiscoverCodexProjects.mockResolvedValue([]);
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('builds provider-specific Codex hook commands', () => {
    expect(buildCodexHookCommand('npx -y vibe-log-cli@latest', 'codex-sessionstart')).toBe(
      'npx -y vibe-log-cli@latest send --silent --background --hook-trigger=codex-sessionstart --source=codex --hook-version=1.0.0'
    );

    expect(buildCodexHookCommand('npx -y vibe-log-cli@latest', 'codex-stop')).toBe(
      'npx -y vibe-log-cli@latest send --silent --background --hook-trigger=codex-stop --source=codex --hook-version=1.0.0'
    );
  });

  it('enables features.codex_hooks without destroying existing TOML', () => {
    const input = [
      'model = "gpt-5.4-codex"',
      '',
      '[features]',
      'other_flag = true',
      'codex_hooks = false',
      '',
      '[tools]',
      'web_search = true',
    ].join('\n');

    expect(enableCodexHooksInToml(input)).toBe([
      'model = "gpt-5.4-codex"',
      '',
      '[features]',
      'other_flag = true',
      'codex_hooks = true',
      '',
      '[tools]',
      'web_search = true',
      '',
    ].join('\n'));
  });

  it('adds a features section when config.toml has none', () => {
    expect(enableCodexHooksInToml('model = "gpt-5.4-codex"\n')).toBe(
      'model = "gpt-5.4-codex"\n\n[features]\ncodex_hooks = true\n'
    );
  });

  it('installs global SessionStart and Stop hooks while preserving existing Codex hooks', async () => {
    mockFiles.set('/home/test/.codex/hooks.json', JSON.stringify({
      hooks: {
        SessionStart: [{
          hooks: [{ type: 'command', command: '/usr/local/bin/notify.sh' }],
        }],
      },
    }));

    await installSelectedCodexHooks({ sessionStartHook: true, stopHook: true });
    await installSelectedCodexHooks({ sessionStartHook: true, stopHook: true });

    const hooksFile = JSON.parse(mockFiles.get('/home/test/.codex/hooks.json') || '{}');
    expect(hooksFile.hooks.SessionStart[0].hooks).toEqual([
      { type: 'command', command: '/usr/local/bin/notify.sh' },
      {
        type: 'command',
        command: 'npx -y vibe-log-cli@latest send --silent --background --hook-trigger=codex-sessionstart --source=codex --hook-version=1.0.0',
      },
    ]);
    expect(hooksFile.hooks.Stop[0].hooks).toEqual([
      {
        type: 'command',
        command: 'npx -y vibe-log-cli@latest send --silent --background --hook-trigger=codex-stop --source=codex --hook-version=1.0.0',
      },
    ]);
    expect(mockFiles.get('/home/test/.codex/config.toml')).toContain('codex_hooks = true');
  });

  it('installs repo-local hooks for selected Codex cwd projects', async () => {
    await installSelectiveCodexProjectHooks([{
      name: 'vibe-log',
      path: '/work/vibe-log',
      actualPath: '/work/vibe-log',
      sessionStart: true,
      stop: true,
    }]);

    const hooksFile = JSON.parse(mockFiles.get('/work/vibe-log/.codex/hooks.json') || '{}');
    expect(hooksFile.hooks.SessionStart[0].hooks[0].command).toContain('--hook-trigger=codex-sessionstart --source=codex');
    expect(hooksFile.hooks.Stop[0].hooks[0].command).toContain('--hook-trigger=codex-stop --source=codex');
    expect(mockFiles.get('/work/vibe-log/.codex/config.toml')).toContain('codex_hooks = true');
  });

  it('uninstall removes only Vibe-Log Codex hooks', async () => {
    mockFiles.set('/home/test/.codex/hooks.json', JSON.stringify({
      hooks: {
        SessionStart: [{
          hooks: [
            { type: 'command', command: '/usr/local/bin/notify.sh' },
            { type: 'command', command: 'npx vibe-log-cli send --hook-trigger=codex-sessionstart' },
          ],
        }],
        Stop: [{
          hooks: [{ type: 'command', command: 'npx vibe-log-cli send --hook-trigger=codex-stop' }],
        }],
      },
    }));
    mockDiscoverCodexProjects.mockResolvedValue([{
      name: 'vibe-log',
      actualPath: '/work/vibe-log',
    }]);
    mockFiles.set('/work/vibe-log/.codex/hooks.json', JSON.stringify({
      hooks: {
        Stop: [{
          hooks: [
            { type: 'command', command: '/usr/local/bin/repo-hook.sh' },
            { type: 'command', command: 'npx vibe-log-cli send --hook-trigger=codex-stop' },
          ],
        }],
      },
    }));

    const result = await uninstallAllCodexHooks();

    expect(result.removedCount).toBe(3);
    const globalHooks = JSON.parse(mockFiles.get('/home/test/.codex/hooks.json') || '{}');
    expect(globalHooks.hooks.SessionStart[0].hooks).toEqual([
      { type: 'command', command: '/usr/local/bin/notify.sh' },
    ]);
    expect(globalHooks.hooks.Stop).toBeUndefined();

    const repoHooks = JSON.parse(mockFiles.get('/work/vibe-log/.codex/hooks.json') || '{}');
    expect(repoHooks.hooks.Stop[0].hooks).toEqual([
      { type: 'command', command: '/usr/local/bin/repo-hook.sh' },
    ]);
  });

  it('returns unsupported status on Windows', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });

    const status = await getCodexHooksStatus();

    expect(status.unsupported).toBe(true);
    await expect(installSelectedCodexHooks({ sessionStartHook: true, stopHook: true }))
      .rejects
      .toThrow(/not supported on Windows/);
  });
});
