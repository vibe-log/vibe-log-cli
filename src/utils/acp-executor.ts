import { execFileSync, spawn, type ChildProcessByStdio, type ChildProcessWithoutNullStreams } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Readable, Writable } from 'stream';
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  RequestError,
  ndJsonStream,
  type Client,
} from '@agentclientprotocol/sdk';
import type * as schema from '@agentclientprotocol/sdk/dist/schema/types.gen';
import { logger } from './logger';

export type LocalAgentProviderId = 'claude' | 'codex';

export interface LocalAgentProvider {
  id: LocalAgentProviderId | string;
  name: string;
  command: string;
  commandArgs?: string[];
  installMessage: string;
}

interface LocalTerminal {
  process: ChildProcessByStdio<null, Readable, Readable>;
  output: string;
  truncated: boolean;
  outputByteLimit: number;
  exitStatus?: schema.TerminalExitStatus;
  exitPromise: Promise<schema.TerminalExitStatus>;
  resolveExit: (status: schema.TerminalExitStatus) => void;
}

export interface AcpRunSession {
  providerId: string;
  providerName: string;
  acpSessionId: string;
  capabilities?: schema.AgentCapabilities;
  authMethods: schema.AuthMethod[];
  prompt: (text: string) => Promise<schema.PromptResponse>;
  close: () => Promise<void>;
  kill: () => void;
}

export interface AcpRunInput {
  cwd: string;
  allowedRoots?: string[];
  model?: string;
  allowFileWrite?: boolean;
  allowTerminal?: boolean;
  permissionPolicy?: 'allow-once' | 'deny';
  onSessionUpdate?: (params: schema.SessionNotification) => void | Promise<void>;
  onStderr?: (chunk: string) => void;
}

export interface AcpSessionModelOption {
  id: string;
  name: string;
  description?: string;
}

export interface AcpSessionModelMetadata {
  currentModelId?: string;
  options: AcpSessionModelOption[];
  source: 'configOptions' | 'models';
}

const LOCAL_AGENT_PROVIDERS: Record<LocalAgentProviderId, LocalAgentProvider> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude-code-acp',
    installMessage: 'Claude Code ACP adapter is not available',
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    command: 'codex-acp',
    installMessage: 'Codex ACP adapter is not available',
  },
};

function getRuntimeBinDirs(): string[] {
  const candidates = [
    path.join(process.cwd(), 'node_modules', '.bin'),
    path.resolve(__dirname, '..', 'node_modules', '.bin'),
    path.resolve(__dirname, '..', '..', 'node_modules', '.bin'),
    path.join(os.homedir(), '.local', 'bin'),
  ];

  return Array.from(new Set(candidates));
}

export function getAcpRuntimePath(): string {
  return [...getRuntimeBinDirs(), process.env.PATH || ''].filter(Boolean).join(path.delimiter);
}

function getProviderEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: getAcpRuntimePath(),
  };
}

export function getLocalAgentProvider(providerId: LocalAgentProviderId): LocalAgentProvider {
  return LOCAL_AGENT_PROVIDERS[providerId];
}

export function getConfiguredLocalAgentProvider(): LocalAgentProviderId {
  const raw = (process.env.VIBELOG_LOCAL_AGENT_PROVIDER || process.env.VIBELOG_AGENT_PROVIDER || '').toLowerCase();
  return raw === 'codex' ? 'codex' : 'claude';
}

export function getLocalAgentProviderDisplayName(providerId: LocalAgentProviderId = getConfiguredLocalAgentProvider()): string {
  return getLocalAgentProvider(providerId).name;
}

function resolveExecutableFromPath(command: string): string | null {
  try {
    const lookup = process.platform === 'win32' ? 'where' : 'which';
    const output = execFileSync(lookup, [command], {
      env: getProviderEnv(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output.split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

export function resolveLocalAgentCommand(providerId: LocalAgentProviderId): string | null {
  const provider = getLocalAgentProvider(providerId);
  return resolveProviderCommand(provider);
}

function resolveProviderCommand(provider: LocalAgentProvider): string | null {
  return resolveExecutableFromPath(provider.command);
}

export async function checkLocalAgentInstalled(
  providerId: LocalAgentProviderId = getConfiguredLocalAgentProvider()
): Promise<{ installed: boolean; version?: string; path?: string; provider: LocalAgentProviderId; name: string }> {
  const provider = getLocalAgentProvider(providerId);
  const commandPath = resolveLocalAgentCommand(providerId);
  if (!commandPath) {
    return { installed: false, provider: providerId, name: provider.name };
  }

  return {
    installed: true,
    version: 'ACP adapter',
    path: commandPath,
    provider: providerId,
    name: provider.name,
  };
}

export function normalizeAllowedRoots(cwd: string, allowedRoots?: string[]): string[] {
  const candidates = [cwd, ...(allowedRoots || [])]
    .map((root) => path.resolve(root))
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);

  const roots: string[] = [];
  for (const candidate of candidates) {
    if (roots.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`))) {
      continue;
    }
    roots.push(candidate);
  }
  return roots;
}

export function assertAllowedPath(filePath: string, allowedRoots: string[]): void {
  const resolved = path.resolve(filePath);
  if (!path.isAbsolute(resolved)) {
    throw new Error(`ACP filesystem path must be absolute: ${filePath}`);
  }

  if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error(`ACP path is outside the allowed workspace: ${resolved}`);
  }
}

function createTerminalId(sessionId: string): string {
  return `term-${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function trimOutputToByteLimit(value: string, limit: number): { output: string; truncated: boolean } {
  if (limit <= 0) {
    return { output: '', truncated: value.length > 0 };
  }

  let output = value;
  let truncated = false;
  while (Buffer.byteLength(output, 'utf8') > limit && output.length > 0) {
    output = output.slice(Math.ceil(output.length / 10));
    truncated = true;
  }

  return { output, truncated };
}

function normalizeTerminalExitStatus(code: number | null, signal: NodeJS.Signals | null): schema.TerminalExitStatus {
  return {
    exitCode: typeof code === 'number' ? code : null,
    signal: signal || null,
  };
}

function buildClientHandlers(input: {
  allowedRoots: string[];
  allowFileWrite: boolean;
  allowTerminal: boolean;
  permissionPolicy: 'allow-once' | 'deny';
  onSessionUpdate?: (params: schema.SessionNotification) => void | Promise<void>;
}): { client: Client; terminals: Map<string, LocalTerminal> } {
  const terminals = new Map<string, LocalTerminal>();

  const client: Client = {
    async requestPermission(params): Promise<schema.RequestPermissionResponse> {
      if (input.permissionPolicy === 'deny') {
        return { outcome: { outcome: 'cancelled' } };
      }

      const preferred =
        params.options.find((option) => option.kind === 'allow_once') ||
        params.options.find((option) => option.kind === 'allow_always');

      if (!preferred) {
        return { outcome: { outcome: 'cancelled' } };
      }

      return {
        outcome: {
          outcome: 'selected',
          optionId: preferred.optionId,
        },
      };
    },

    async sessionUpdate(params): Promise<void> {
      await input.onSessionUpdate?.(params);
    },

    async readTextFile(params): Promise<schema.ReadTextFileResponse> {
      assertAllowedPath(params.path, input.allowedRoots);
      const raw = await fs.readFile(params.path, 'utf8');
      if (!params.line && !params.limit) {
        return { content: raw };
      }

      const lines = raw.split('\n');
      const startIndex = Math.max((params.line || 1) - 1, 0);
      const endIndex = typeof params.limit === 'number' && params.limit > 0
        ? startIndex + params.limit
        : lines.length;

      return { content: lines.slice(startIndex, endIndex).join('\n') };
    },

    async writeTextFile(params): Promise<schema.WriteTextFileResponse> {
      if (!input.allowFileWrite) {
        throw new Error('ACP file writes are disabled for this run');
      }
      assertAllowedPath(params.path, input.allowedRoots);
      await fs.mkdir(path.dirname(params.path), { recursive: true });
      await fs.writeFile(params.path, params.content, 'utf8');
      return {};
    },

    async createTerminal(params): Promise<schema.CreateTerminalResponse> {
      if (!input.allowTerminal) {
        throw new Error('ACP terminal execution is disabled for this run');
      }

      const terminalId = createTerminalId(params.sessionId);
      const cwd = params.cwd && path.isAbsolute(params.cwd) ? params.cwd : input.allowedRoots[0];
      if (cwd) {
        assertAllowedPath(cwd, input.allowedRoots);
      }

      const env = {
        ...getProviderEnv(),
        ...(params.env || []).reduce<Record<string, string>>((acc, entry) => {
          acc[entry.name] = entry.value;
          return acc;
        }, {}),
      };

      let resolveExit: (status: schema.TerminalExitStatus) => void = () => {};
      const exitPromise = new Promise<schema.TerminalExitStatus>((resolve) => {
        resolveExit = resolve;
      });

      const proc = spawn(params.command, params.args || [], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const terminal: LocalTerminal = {
        process: proc,
        output: '',
        truncated: false,
        outputByteLimit: params.outputByteLimit || 256_000,
        exitPromise,
        resolveExit,
      };

      const append = (chunk: Buffer) => {
        const trimmed = trimOutputToByteLimit(`${terminal.output}${chunk.toString()}`, terminal.outputByteLimit);
        terminal.output = trimmed.output;
        terminal.truncated = terminal.truncated || trimmed.truncated;
      };

      proc.stdout.on('data', append);
      proc.stderr.on('data', append);
      proc.on('close', (code, signal) => {
        const status = normalizeTerminalExitStatus(code, signal);
        terminal.exitStatus = status;
        terminal.resolveExit(status);
      });
      proc.on('error', (error) => {
        append(Buffer.from(`\n${error.message}\n`));
        const status = normalizeTerminalExitStatus(1, null);
        terminal.exitStatus = status;
        terminal.resolveExit(status);
      });

      terminals.set(terminalId, terminal);
      return { terminalId };
    },

    async terminalOutput(params): Promise<schema.TerminalOutputResponse> {
      const terminal = terminals.get(params.terminalId);
      if (!terminal) {
        throw RequestError.resourceNotFound(params.terminalId);
      }

      return {
        output: terminal.output,
        truncated: terminal.truncated,
        exitStatus: terminal.exitStatus,
      };
    },

    async waitForTerminalExit(params): Promise<schema.WaitForTerminalExitResponse> {
      const terminal = terminals.get(params.terminalId);
      if (!terminal) {
        throw RequestError.resourceNotFound(params.terminalId);
      }

      const status = terminal.exitStatus || await terminal.exitPromise;
      return {
        exitCode: status.exitCode,
        signal: status.signal,
      };
    },

    async releaseTerminal(params): Promise<schema.ReleaseTerminalResponse> {
      const terminal = terminals.get(params.terminalId);
      if (!terminal) {
        return {};
      }

      if (!terminal.exitStatus) {
        try {
          terminal.process.kill();
        } catch {
          // Ignore cleanup errors.
        }
      }
      terminals.delete(params.terminalId);
      return {};
    },

    async killTerminal(params): Promise<schema.KillTerminalResponse> {
      const terminal = terminals.get(params.terminalId);
      if (!terminal) {
        return {};
      }
      if (!terminal.exitStatus) {
        try {
          terminal.process.kill();
        } catch {
          // Ignore cleanup errors.
        }
      }
      return {};
    },
  };

  return { client, terminals };
}

function getAcpModelConfigOption(
  configOptions?: Array<schema.SessionConfigOption> | null
): schema.SessionConfigOption | undefined {
  return configOptions?.find((option) => {
    if (option.type !== 'select') return false;
    return option.category === 'model' || option.id === 'model';
  });
}

function flattenSelectOptions(
  options: schema.SessionConfigSelectOptions
): schema.SessionConfigSelectOption[] {
  return options.flatMap((option) => ('value' in option ? [option] : option.options));
}

export function normalizeAcpSessionModelMetadata(input: {
  configOptions?: Array<schema.SessionConfigOption> | null;
  models?: schema.SessionModelState | null;
}): AcpSessionModelMetadata | null {
  const modelConfig = getAcpModelConfigOption(input.configOptions);
  if (modelConfig?.type === 'select' && modelConfig.options.length > 0) {
    const options = flattenSelectOptions(modelConfig.options);
    return {
      currentModelId: typeof modelConfig.currentValue === 'string' ? modelConfig.currentValue : undefined,
      options: options.map((option) => ({
        id: option.value,
        name: option.name,
        description: option.description || undefined,
      })),
      source: 'configOptions',
    };
  }

  if (input.models?.availableModels?.length) {
    return {
      currentModelId: input.models.currentModelId,
      options: input.models.availableModels.map((model) => ({
        id: model.modelId,
        name: model.name,
        description: model.description || undefined,
      })),
      source: 'models',
    };
  }

  return null;
}

async function applyRequestedModel(input: {
  connection: ClientSideConnection;
  sessionId: string;
  requestedModel?: string;
  configOptions?: Array<schema.SessionConfigOption> | null;
  models?: schema.SessionModelState | null;
}): Promise<void> {
  const requestedModel = input.requestedModel?.trim();
  if (!requestedModel) return;

  const normalized = normalizeAcpSessionModelMetadata({
    configOptions: input.configOptions,
    models: input.models,
  });
  if (!normalized || !normalized.options.some((option) => option.id === requestedModel)) {
    return;
  }

  if (normalized.source === 'configOptions') {
    const modelConfig = getAcpModelConfigOption(input.configOptions);
    if (!modelConfig) return;
    await input.connection.setSessionConfigOption({
      sessionId: input.sessionId,
      configId: modelConfig.id,
      value: requestedModel,
    });
    return;
  }

  await input.connection.unstable_setSessionModel({
    sessionId: input.sessionId,
    modelId: requestedModel,
  });
}

function errorMentionsAuthentication(value: unknown): boolean {
  if (typeof value === 'string') {
    return /auth|login/i.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => errorMentionsAuthentication(entry));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => errorMentionsAuthentication(entry));
  }
  return false;
}

function isAcpAuthenticationError(error: unknown): boolean {
  if (!(error instanceof RequestError)) {
    return false;
  }
  if (error.code === -32000) {
    return true;
  }
  return error.code === -32603 && errorMentionsAuthentication(error.data);
}

async function spawnAcpConnection(
  provider: LocalAgentProvider,
  input: AcpRunInput
): Promise<{
  process: ChildProcessWithoutNullStreams;
  connection: ClientSideConnection;
  init: schema.InitializeResponse;
  cleanup: () => Promise<void>;
}> {
  const commandPath = resolveProviderCommand(provider);
  if (!commandPath) {
    throw new Error(provider.installMessage);
  }

  const proc = spawn(commandPath, provider.commandArgs || [], {
    cwd: input.cwd,
    env: getProviderEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;

  let settled = false;
  let stderr = '';
  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stderr += text;
    input.onStderr?.(text);
    logger.debug(`${provider.name} ACP stderr: ${text}`);
  });

  const { client, terminals } = buildClientHandlers({
    allowedRoots: normalizeAllowedRoots(input.cwd, input.allowedRoots),
    allowFileWrite: input.allowFileWrite !== false,
    allowTerminal: input.allowTerminal === true,
    permissionPolicy: input.permissionPolicy || 'allow-once',
    onSessionUpdate: input.onSessionUpdate,
  });
  const stream = ndJsonStream(
    Writable.toWeb(proc.stdin),
    Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>,
  );
  const connection = new ClientSideConnection(() => client, stream);

  try {
    const init = await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: {
        name: 'vibe-log-cli',
        title: 'Vibe Log CLI',
        version: '0.8.8',
      },
      clientCapabilities: {
        auth: { terminal: true },
        fs: {
          readTextFile: true,
          writeTextFile: input.allowFileWrite !== false,
        },
        terminal: input.allowTerminal === true,
      },
    });

    const cleanup = async () => {
      if (settled) return;
      settled = true;
      for (const terminal of terminals.values()) {
        if (!terminal.exitStatus) {
          try {
            terminal.process.kill();
          } catch {
            // Ignore cleanup errors.
          }
        }
      }
      try {
        proc.kill();
      } catch {
        // Ignore cleanup errors.
      }
    };

    proc.on('exit', () => {
      settled = true;
    });

    return { process: proc, connection, init, cleanup };
  } catch (error) {
    try {
      proc.kill();
    } catch {
      // Ignore cleanup errors.
    }
    const message = error instanceof Error ? error.message : 'ACP initialize failed';
    throw new Error(stderr.trim() ? `${message}\n${stderr.trim()}` : message);
  }
}

export async function startAcpSession(
  providerId: LocalAgentProviderId,
  input: AcpRunInput
): Promise<AcpRunSession> {
  const provider = getLocalAgentProvider(providerId);
  return startAcpSessionWithProvider(provider, input);
}

export async function startAcpSessionWithProvider(
  provider: LocalAgentProvider,
  input: AcpRunInput
): Promise<AcpRunSession> {
  const runtime = await spawnAcpConnection(provider, input);

  try {
    const session = await runtime.connection.newSession({
      cwd: path.resolve(input.cwd),
      additionalDirectories: normalizeAllowedRoots(input.cwd, input.allowedRoots).filter((root) => root !== path.resolve(input.cwd)),
      mcpServers: [],
    });

    await applyRequestedModel({
      connection: runtime.connection,
      sessionId: session.sessionId,
      requestedModel: input.model,
      configOptions: session.configOptions,
      models: session.models,
    });

    return {
      providerId: provider.id,
      providerName: provider.name,
      acpSessionId: session.sessionId,
      capabilities: runtime.init.agentCapabilities,
      authMethods: runtime.init.authMethods || [],
      async prompt(text: string) {
        return runtime.connection.prompt({
          sessionId: session.sessionId,
          prompt: [{
            type: 'text',
            text,
          }],
        });
      },
      async close() {
        await runtime.cleanup();
      },
      kill() {
        try {
          runtime.process.kill();
        } catch {
          // Ignore cleanup errors.
        }
      },
    };
  } catch (error) {
    await runtime.cleanup();
    const message = isAcpAuthenticationError(error)
      ? `${provider.name} ACP requires authentication before Vibe Log can create a session`
      : error instanceof Error
        ? error.message
        : 'Failed to create ACP session';
    throw new Error(message);
  }
}

function renderToolContent(content: schema.ToolCallContent): string {
  if (content.type === 'diff') {
    return `\n[diff] ${content.path}\n`;
  }
  if (content.type === 'terminal') {
    return `\n[terminal] ${content.terminalId}\n`;
  }
  if (content.content.type === 'text') {
    return content.content.text;
  }
  return '';
}

export function formatAcpSessionUpdate(params: schema.SessionNotification): string {
  const update = params.update;

  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
    case 'agent_thought_chunk':
    case 'user_message_chunk':
      return update.content.type === 'text' ? update.content.text : '';
    case 'tool_call':
      return [
        `\n[tool] ${update.title}${update.status ? ` (${update.status})` : ''}\n`,
        ...(update.content || []).map(renderToolContent),
      ].join('');
    case 'tool_call_update':
      return [
        `\n[tool] ${update.title || update.toolCallId}${update.status ? ` (${update.status})` : ''}\n`,
        ...(update.content || []).map(renderToolContent),
      ].join('');
    case 'plan':
      return `\n[plan]\n${update.entries.map((entry) => `- [${entry.status}] ${entry.content}`).join('\n')}\n`;
    case 'current_mode_update':
      return `\n[mode] ${update.currentModeId}\n`;
    case 'session_info_update':
      return update.title ? `\n[session] ${update.title}\n` : '';
    default:
      return '';
  }
}
