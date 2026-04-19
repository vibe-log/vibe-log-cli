import { logger } from '../../utils/logger';

export type HookMode = 'all' | 'selected';
export type HookCommandSource = 'claude' | 'cursor' | 'codex';

export interface HookConfig {
  type: 'command';
  command: string;
  timeout?: number;
}

export interface HookConfigWithMatcher {
  matcher?: string;
  hooks: HookConfig[];
}

export interface HookSettingsLike {
  hooks?: Record<string, HookConfigWithMatcher[] | undefined>;
  [key: string]: any;
}

export interface HookCommandOptions {
  cliPath: string;
  hookTrigger: string;
  hookVersion: string;
  source?: HookCommandSource;
  mode?: HookMode;
  selectedProjectFlag?: string;
  includeAllFlag?: boolean;
}

/**
 * Check if a command is a Vibe-Log hook command.
 * Matches both historical package names and scoped package names.
 */
export function isVibeLogCommand(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes('vibe-log') || command.includes('@vibe-log');
}

export function buildProviderHookCommand(options: HookCommandOptions): string {
  const sourceFlag = options.source ? ` --source=${options.source}` : '';
  const baseCommand = `${options.cliPath} send --silent --background --hook-trigger=${options.hookTrigger}${sourceFlag} --hook-version=${options.hookVersion}`;

  if (options.mode === 'all' && options.includeAllFlag !== false) {
    return `${baseCommand} --all`;
  }

  if (options.mode === 'selected' || options.selectedProjectFlag) {
    return options.selectedProjectFlag ? `${baseCommand} ${options.selectedProjectFlag}` : baseCommand;
  }

  return baseCommand;
}

export function getHookStatusCommand(
  hookConfig: HookConfigWithMatcher[] | undefined,
  hookTrigger?: string
): HookConfig | undefined {
  if (!hookConfig || hookConfig.length === 0) {
    return undefined;
  }

  for (const config of hookConfig) {
    for (const hook of config.hooks || []) {
      if (!isVibeLogCommand(hook.command)) {
        continue;
      }

      if (!hookTrigger || hook.command.includes(`--hook-trigger=${hookTrigger}`)) {
        return hook;
      }
    }
  }

  return undefined;
}

export function appendHookConfiguration(
  settings: HookSettingsLike,
  hookType: string,
  matcher: string | undefined,
  command: string,
  hookTrigger: string
): void {
  if (!settings.hooks) {
    settings.hooks = {};
  }

  if (!settings.hooks[hookType]) {
    settings.hooks[hookType] = [];
  }

  const existingHooks = settings.hooks[hookType];
  if (!existingHooks) {
    return;
  }

  for (const config of existingHooks) {
    for (const hook of config.hooks || []) {
      if (isVibeLogCommand(hook.command) && hook.command.includes(`--hook-trigger=${hookTrigger}`)) {
        logger.debug(`${hookType} vibe-log hook already exists, skipping`);
        return;
      }
    }
  }

  if (existingHooks.length > 0 && existingHooks[0].hooks) {
    existingHooks[0].hooks.push({
      type: 'command',
      command,
    });
    return;
  }

  existingHooks.push({
    ...(matcher ? { matcher } : {}),
    hooks: [{
      type: 'command',
      command,
    }],
  });
}

export function removeVibeLogHooks(settings: HookSettingsLike, hookType: string): number {
  if (!settings.hooks || !settings.hooks[hookType]) {
    return 0;
  }

  const existingHooks = settings.hooks[hookType];
  if (!existingHooks) {
    return 0;
  }

  const totalBefore = existingHooks.reduce((sum, config) => sum + (config.hooks?.length || 0), 0);
  const filteredConfigs = existingHooks
    .map((config) => ({
      ...config,
      hooks: (config.hooks || []).filter((hook) => !isVibeLogCommand(hook.command)),
    }))
    .filter((config) => config.hooks.length > 0);

  const totalAfter = filteredConfigs.reduce((sum, config) => sum + config.hooks.length, 0);

  if (filteredConfigs.length > 0) {
    settings.hooks[hookType] = filteredConfigs;
  } else {
    delete settings.hooks[hookType];
  }

  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return totalBefore - totalAfter;
}

export function hasVibeLogHook(hookConfigs: HookConfigWithMatcher[] | undefined): boolean {
  return Boolean(getHookStatusCommand(hookConfigs));
}
