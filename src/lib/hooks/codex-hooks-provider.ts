import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import { VibelogError } from '../../utils/errors';
import { getCliPath } from '../config';
import { discoverCodexProjects, CodexProject } from '../codex-core';
import { getCodexHomePath } from '../readers/codex';
import { sendTelemetryUpdate } from '../telemetry';
import {
  appendHookConfiguration,
  buildProviderHookCommand,
  getHookStatusCommand,
  HookConfigWithMatcher,
  HookSettingsLike,
  removeVibeLogHooks,
} from './hook-provider-utils';

export interface CodexHookSelection {
  sessionStartHook: boolean;
  stopHook: boolean;
}

export interface CodexHookStatusInfo {
  installed: boolean;
  enabled: boolean;
  version: string;
  command?: string;
  timeout?: number;
  lastModified?: Date;
}

export interface CodexHooksStatus {
  sessionStartHook: CodexHookStatusInfo;
  stopHook: CodexHookStatusInfo;
  hooksPath: string;
  configPath: string;
  cliPath: string;
  trackedProjects?: string[];
  unsupported?: boolean;
  unsupportedReason?: string;
}

export interface CodexProjectHookConfig {
  path: string;
  name: string;
  actualPath?: string;
  sessionStart: boolean;
  stop: boolean;
}

type CodexHookType = 'SessionStart' | 'Stop';
type CodexHookTrigger = 'codex-sessionstart' | 'codex-stop';

const CODEX_HOOKS_VERSION = '1.0.0';
const CODEX_HOOK_MATCHERS: Partial<Record<CodexHookType, string>> = {
  SessionStart: 'startup|resume',
};

function isWindows(): boolean {
  return process.platform === 'win32';
}

function assertCodexHooksSupported(): void {
  if (isWindows()) {
    throw new VibelogError(
      'Codex auto-sync hooks are experimental and are not supported on Windows yet. Manual Codex sync still works.',
      'UNSUPPORTED_PLATFORM'
    );
  }
}

export function getCodexHookPaths(projectPath?: string): { hooksPath: string; configPath: string } {
  const basePath = projectPath ? path.join(projectPath, '.codex') : getCodexHomePath();
  return {
    hooksPath: path.join(basePath, 'hooks.json'),
    configPath: path.join(basePath, 'config.toml'),
  };
}

export function buildCodexHookCommand(
  cliPath: string,
  hookTrigger: CodexHookTrigger
): string {
  return buildProviderHookCommand({
    cliPath,
    hookTrigger,
    hookVersion: CODEX_HOOKS_VERSION,
    source: 'codex',
    includeAllFlag: false,
  });
}

async function ensureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readHooksFile(hooksPath: string): Promise<HookSettingsLike> {
  try {
    const data = await fs.readFile(hooksPath, 'utf-8');
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function writeHooksFile(hooksPath: string, settings: HookSettingsLike): Promise<void> {
  await ensureDirectory(path.dirname(hooksPath));
  await fs.writeFile(hooksPath, JSON.stringify(settings, null, 2));
}

function triggerForHookType(hookType: CodexHookType): CodexHookTrigger {
  return hookType === 'SessionStart' ? 'codex-sessionstart' : 'codex-stop';
}

function appendCodexHook(
  settings: HookSettingsLike,
  hookType: CodexHookType,
  cliPath: string
): void {
  const trigger = triggerForHookType(hookType);
  const command = buildCodexHookCommand(cliPath, trigger);
  appendHookConfiguration(
    settings,
    hookType,
    CODEX_HOOK_MATCHERS[hookType],
    command,
    trigger
  );
}

async function installHooksToCodexFiles(
  hooksPath: string,
  configPath: string,
  selection: CodexHookSelection
): Promise<void> {
  assertCodexHooksSupported();
  await ensureCodexHooksFeatureEnabled(configPath);

  const settings = await readHooksFile(hooksPath);
  const cliPath = getCliPath();

  if (selection.sessionStartHook) {
    appendCodexHook(settings, 'SessionStart', cliPath);
  } else {
    removeVibeLogHooks(settings, 'SessionStart');
  }

  if (selection.stopHook) {
    appendCodexHook(settings, 'Stop', cliPath);
  } else {
    removeVibeLogHooks(settings, 'Stop');
  }

  await writeHooksFile(hooksPath, settings);
}

export async function ensureCodexHooksFeatureEnabled(configPath: string): Promise<void> {
  assertCodexHooksSupported();
  await ensureDirectory(path.dirname(configPath));

  let content = '';
  try {
    content = await fs.readFile(configPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const updated = enableCodexHooksInToml(content);
  await fs.writeFile(configPath, updated);
}

export function enableCodexHooksInToml(content: string): string {
  const normalized = content.trimEnd();
  const featuresHeader = normalized.match(/(^|\n)\[features\]\s*(?=\n|$)/);

  if (!featuresHeader) {
    const prefix = normalized ? `${normalized}\n\n` : '';
    return `${prefix}[features]\ncodex_hooks = true\n`;
  }

  const headerIndex = featuresHeader.index || 0;
  const headerEnd = headerIndex + featuresHeader[0].length;
  const nextSectionMatch = normalized.slice(headerEnd).match(/\n\[[^\]]+\]\s*(?=\n|$)/);
  const sectionEnd = nextSectionMatch ? headerEnd + (nextSectionMatch.index || 0) : normalized.length;
  const before = normalized.slice(0, headerEnd);
  const sectionBody = normalized.slice(headerEnd, sectionEnd);
  const after = normalized.slice(sectionEnd);

  if (/(\n|^)codex_hooks\s*=/.test(sectionBody)) {
    return `${before}${sectionBody.replace(/(^|\n)(\s*)codex_hooks\s*=\s*(true|false)/, '$1$2codex_hooks = true')}${after}\n`;
  }

  return `${before}\ncodex_hooks = true${sectionBody}${after}\n`;
}

function getCodexHookStatusInfo(
  hookConfig: HookConfigWithMatcher[] | undefined,
  hookTrigger: CodexHookTrigger
): CodexHookStatusInfo {
  const hook = getHookStatusCommand(hookConfig, hookTrigger);

  if (!hook) {
    return {
      installed: false,
      enabled: false,
      version: '0.0.0',
    };
  }

  const versionMatch = hook.command.match(/--hook-version=([0-9.]+)/);
  const version = versionMatch ? versionMatch[1] : CODEX_HOOKS_VERSION;

  return {
    installed: true,
    enabled: !hook.command.includes('--disabled'),
    version,
    command: hook.command,
    timeout: hook.timeout,
  };
}

async function hasCodexVibeLogHooks(projectPath: string): Promise<boolean> {
  const { hooksPath } = getCodexHookPaths(projectPath);
  const settings = await readHooksFile(hooksPath);
  const sessionStart = getHookStatusCommand(settings.hooks?.SessionStart, 'codex-sessionstart');
  const stop = getHookStatusCommand(settings.hooks?.Stop, 'codex-stop');
  return Boolean(sessionStart || stop);
}

export async function getCodexHooksStatus(): Promise<CodexHooksStatus> {
  const { hooksPath, configPath } = getCodexHookPaths();
  const cliPath = getCliPath();

  if (isWindows()) {
    return {
      sessionStartHook: { installed: false, enabled: false, version: '0.0.0' },
      stopHook: { installed: false, enabled: false, version: '0.0.0' },
      hooksPath,
      configPath,
      cliPath,
      unsupported: true,
      unsupportedReason: 'Codex auto-sync hooks are experimental and are not supported on Windows yet.',
    };
  }

  const settings = await readHooksFile(hooksPath);
  const sessionStartHook = getCodexHookStatusInfo(settings.hooks?.SessionStart, 'codex-sessionstart');
  const stopHook = getCodexHookStatusInfo(settings.hooks?.Stop, 'codex-stop');

  try {
    const stats = await fs.stat(hooksPath);
    sessionStartHook.lastModified = stats.mtime;
    stopHook.lastModified = stats.mtime;
  } catch (error) {
    logger.debug('Could not get Codex hooks file stats:', error);
  }

  const trackedProjects: string[] = [];
  const projects = await discoverCodexProjects();
  for (const project of projects) {
    try {
      if (await hasCodexVibeLogHooks(project.actualPath)) {
        trackedProjects.push(project.actualPath);
      }
    } catch (error) {
      logger.debug(`Could not inspect Codex hooks for ${project.name}:`, error);
    }
  }

  return {
    sessionStartHook,
    stopHook,
    hooksPath,
    configPath,
    cliPath,
    trackedProjects: trackedProjects.length > 0 ? trackedProjects : undefined,
  };
}

export async function getCodexHookMode(): Promise<'all' | 'selected' | 'none'> {
  const status = await getCodexHooksStatus();
  if (status.sessionStartHook.installed || status.stopHook.installed) {
    return 'all';
  }
  if (status.trackedProjects && status.trackedProjects.length > 0) {
    return 'selected';
  }
  return 'none';
}

export async function installSelectedCodexHooks(selection: CodexHookSelection): Promise<void> {
  const { hooksPath, configPath } = getCodexHookPaths();
  await installHooksToCodexFiles(hooksPath, configPath, selection);
  await sendTelemetryUpdate();
}

export async function installGlobalCodexHooks(): Promise<void> {
  await installSelectedCodexHooks({
    sessionStartHook: true,
    stopHook: true,
  });
  logger.info('Global Codex hooks installed');
}

export async function installCodexProjectHooks(projects: Array<Pick<CodexProject, 'name' | 'actualPath'>>): Promise<void> {
  const projectConfigs = projects.map((project) => ({
    name: project.name,
    path: project.actualPath,
    actualPath: project.actualPath,
    sessionStart: true,
    stop: true,
  }));

  await installSelectiveCodexProjectHooks(projectConfigs);
}

export async function installSelectiveCodexProjectHooks(projectConfigs: CodexProjectHookConfig[]): Promise<void> {
  assertCodexHooksSupported();
  let installedCount = 0;
  let failedCount = 0;

  for (const config of projectConfigs) {
    try {
      const projectPath = config.actualPath || config.path;
      if (!projectPath) {
        logger.warn(`No actual path found for Codex project ${config.name}, skipping`);
        failedCount++;
        continue;
      }

      const { hooksPath, configPath } = getCodexHookPaths(projectPath);
      await installHooksToCodexFiles(hooksPath, configPath, {
        sessionStartHook: config.sessionStart,
        stopHook: config.stop,
      });

      installedCount++;
      logger.info(`Codex hooks configured for ${config.name}`);
    } catch (error) {
      logger.error(`Failed to configure Codex hooks for ${config.name}:`, error);
      failedCount++;
    }
  }

  if (installedCount > 0) {
    await sendTelemetryUpdate();
    logger.info(`Successfully configured Codex hooks for ${installedCount} project(s)`);
  }
  if (failedCount > 0) {
    logger.warn(`Failed to configure Codex hooks for ${failedCount} project(s)`);
  }
}

export async function removeCodexProjectHooks(projects: Array<Pick<CodexProject, 'name' | 'actualPath'>>): Promise<void> {
  let removedCount = 0;
  let failedCount = 0;

  for (const project of projects) {
    try {
      const { hooksPath } = getCodexHookPaths(project.actualPath);
      const settings = await readHooksFile(hooksPath);
      const removed = removeVibeLogHooks(settings, 'SessionStart') + removeVibeLogHooks(settings, 'Stop');

      if (removed > 0) {
        await writeHooksFile(hooksPath, settings);
        removedCount += removed;
        logger.info(`Removed Codex hooks from ${project.name}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`Failed to remove Codex hooks from ${project.name}:`, error);
        failedCount++;
      }
    }
  }

  if (removedCount > 0) {
    await sendTelemetryUpdate();
    logger.info(`Successfully removed ${removedCount} Codex hook(s)`);
  }
  if (failedCount > 0) {
    logger.warn(`Failed to remove Codex hooks from ${failedCount} project(s)`);
  }
}

export async function uninstallAllCodexHooks(): Promise<{ removedCount: number }> {
  let removedCount = 0;

  const { hooksPath } = getCodexHookPaths();
  const globalSettings = await readHooksFile(hooksPath);
  const globalRemoved = removeVibeLogHooks(globalSettings, 'SessionStart') + removeVibeLogHooks(globalSettings, 'Stop');

  if (globalRemoved > 0) {
    await writeHooksFile(hooksPath, globalSettings);
    removedCount += globalRemoved;
  }

  const projects = await discoverCodexProjects();
  for (const project of projects) {
    try {
      const projectHooksPath = getCodexHookPaths(project.actualPath).hooksPath;
      const projectSettings = await readHooksFile(projectHooksPath);
      const projectRemoved = removeVibeLogHooks(projectSettings, 'SessionStart') + removeVibeLogHooks(projectSettings, 'Stop');

      if (projectRemoved > 0) {
        await writeHooksFile(projectHooksPath, projectSettings);
        removedCount += projectRemoved;
      }
    } catch (error) {
      logger.debug(`Could not process Codex project ${project.name}:`, error);
    }
  }

  if (removedCount === 0) {
    throw new Error('No Vibe-Log Codex hooks found to uninstall');
  }

  await sendTelemetryUpdate();
  return { removedCount };
}
