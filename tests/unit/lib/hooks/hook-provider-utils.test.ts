import { describe, it, expect } from 'vitest';
import {
  appendHookConfiguration,
  buildProviderHookCommand,
  removeVibeLogHooks,
  isVibeLogCommand,
  HookSettingsLike,
} from '../../../../src/lib/hooks/hook-provider-utils';

describe('hook-provider-utils', () => {
  it('detects Vibe-Log commands', () => {
    expect(isVibeLogCommand('npx vibe-log-cli send --silent')).toBe(true);
    expect(isVibeLogCommand('npx @vibe-log/cli send --silent')).toBe(true);
    expect(isVibeLogCommand('/usr/local/bin/notify.sh')).toBe(false);
    expect(isVibeLogCommand(undefined)).toBe(false);
  });

  it('builds provider-specific commands with stable flag order', () => {
    expect(buildProviderHookCommand({
      cliPath: 'npx vibe-log-cli',
      hookTrigger: 'codex-stop',
      hookVersion: '1.0.0',
      source: 'codex',
      includeAllFlag: false,
    })).toBe('npx vibe-log-cli send --silent --background --hook-trigger=codex-stop --source=codex --hook-version=1.0.0');

    expect(buildProviderHookCommand({
      cliPath: 'npx vibe-log-cli',
      hookTrigger: 'sessionstart',
      hookVersion: '1.0.0',
      source: 'claude',
      mode: 'all',
    })).toBe('npx vibe-log-cli send --silent --background --hook-trigger=sessionstart --source=claude --hook-version=1.0.0 --all');
  });

  it('dedupes Vibe-Log commands by hook trigger while preserving third-party hooks', () => {
    const settings: HookSettingsLike = {
      hooks: {
        Stop: [{
          hooks: [{ type: 'command', command: '/usr/local/bin/notify.sh' }],
        }],
      },
    };

    appendHookConfiguration(settings, 'Stop', undefined, 'npx vibe-log-cli send --hook-trigger=codex-stop', 'codex-stop');
    appendHookConfiguration(settings, 'Stop', undefined, 'npx vibe-log-cli send --hook-trigger=codex-stop', 'codex-stop');

    expect(settings.hooks?.Stop?.[0].hooks).toEqual([
      { type: 'command', command: '/usr/local/bin/notify.sh' },
      { type: 'command', command: 'npx vibe-log-cli send --hook-trigger=codex-stop' },
    ]);
  });

  it('removes only Vibe-Log commands', () => {
    const settings: HookSettingsLike = {
      hooks: {
        SessionStart: [{
          hooks: [
            { type: 'command', command: '/usr/local/bin/notify.sh' },
            { type: 'command', command: 'npx vibe-log-cli send --hook-trigger=sessionstart' },
          ],
        }],
      },
    };

    const removed = removeVibeLogHooks(settings, 'SessionStart');

    expect(removed).toBe(1);
    expect(settings.hooks?.SessionStart?.[0].hooks).toEqual([
      { type: 'command', command: '/usr/local/bin/notify.sh' },
    ]);
  });
});
