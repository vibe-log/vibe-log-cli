import { logger } from './logger';
import {
  checkLocalAgentInstalled,
  formatAcpSessionUpdate,
  getConfiguredLocalAgentProvider,
  getLocalAgentProviderDisplayName,
  startAcpSession,
  type LocalAgentProviderId,
} from './acp-executor';

/**
 * Stream event shape used by the existing report and standup UI.
 *
 * The executor now emits this compatibility shape from ACP session updates only.
 */
export type ClaudeStreamEvent = {
  type: string;
  subtype?: string;
  message?: any;
  delta?: any;
  content?: any;
  result?: any;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  session_id?: string;
  is_error?: boolean;
};

/**
 * Options for local ACP execution.
 *
 * Kept under the existing name so callers do not need to change at the same
 * time as the transport migration.
 */
export interface ClaudeExecutorOptions {
  systemPrompt?: string;
  cwd?: string;
  provider?: LocalAgentProviderId;
  model?: string;
  timeout?: number;
  allowFileWrite?: boolean;
  allowTerminal?: boolean;
  onStreamEvent?: (event: ClaudeStreamEvent) => void;
  onStart?: () => void;
  onError?: (error: Error) => void;
  onComplete?: (code: number) => void;
}

/**
 * Backwards-compatible availability check for Claude Code ACP.
 */
export async function checkClaudeInstalled(): Promise<{ installed: boolean; version?: string; path?: string }> {
  const acpCheck = await checkLocalAgentInstalled('claude');
  if (!acpCheck.installed) {
    logger.debug('Claude Code ACP adapter not found');
    return { installed: false };
  }

  return {
    installed: true,
    version: acpCheck.version,
    path: acpCheck.path,
  };
}

/**
 * Execute the configured local provider through ACP and emit compatibility
 * stream events for existing report/standup consumers.
 */
export async function executeClaude(
  prompt: string,
  options: ClaudeExecutorOptions = {}
): Promise<void> {
  const {
    systemPrompt,
    cwd = process.cwd(),
    provider = getConfiguredLocalAgentProvider(),
    model,
    timeout,
    allowFileWrite = true,
    allowTerminal = false,
    onStreamEvent,
    onStart,
    onError,
    onComplete,
  } = options;

  const providerName = getLocalAgentProviderDisplayName(provider);
  const startedAt = Date.now();
  let assistantOutput = '';
  let totalCostUsd = 0;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let timeoutError: Error | null = null;
  let session: Awaited<ReturnType<typeof startAcpSession>> | null = null;

  logger.debug(`${providerName} ACP executor starting - prompt length: ${prompt.length} characters`);

  try {
    onStart?.();

    session = await startAcpSession(provider, {
      cwd,
      allowedRoots: [cwd],
      model,
      allowFileWrite,
      allowTerminal,
      permissionPolicy: 'allow-once',
      onStderr: (chunk) => {
        logger.debug(`${providerName} ACP stderr: ${chunk}`);
      },
      onSessionUpdate: (params) => {
        const formatted = formatAcpSessionUpdate(params);
        if (formatted && process.env.VIBELOG_DEBUG) {
          logger.debug(`${providerName} ACP update: ${formatted.slice(0, 500)}`);
        }

        const update = params.update;
        if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
          assistantOutput += update.content.text;
          return;
        }

        if (update.sessionUpdate === 'usage_update' && update.cost?.currency === 'USD') {
          totalCostUsd = update.cost.amount;
          return;
        }

        if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
          onStreamEvent?.({
            type: 'assistant',
            message: {
              content: [{
                type: 'tool_use',
                name: update.title || ('toolCallId' in update ? update.toolCallId : 'ACP tool'),
                input: {
                  acpStatus: update.status,
                  toolCallId: 'toolCallId' in update ? update.toolCallId : undefined,
                },
              }],
            },
            session_id: params.sessionId,
          });
        }
      },
    });

    onStreamEvent?.({
      type: 'system',
      subtype: 'init',
      session_id: session.acpSessionId,
    });

    if (timeout) {
      timeoutHandle = setTimeout(() => {
        timeoutError = new Error(`${providerName} ACP execution timed out after ${timeout}ms`);
        logger.debug(timeoutError.message);
        session?.kill();
      }, timeout);
    }

    const acpPrompt = systemPrompt
      ? `System instructions:\n${systemPrompt}\n\nUser request:\n${prompt}`
      : prompt;

    const response = await session.prompt(acpPrompt);
    const durationMs = Date.now() - startedAt;

    if (assistantOutput) {
      onStreamEvent?.({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: assistantOutput,
          }],
        },
        session_id: session.acpSessionId,
      });
    }

    const isSuccess = response.stopReason === 'end_turn';
    onStreamEvent?.({
      type: 'result',
      subtype: isSuccess ? 'success' : 'error_during_execution',
      result: assistantOutput.trim(),
      duration_ms: durationMs,
      duration_api_ms: durationMs,
      num_turns: 1,
      total_cost_usd: totalCostUsd,
      session_id: session.acpSessionId,
      is_error: !isSuccess,
    });

    const code = isSuccess ? 0 : 1;
    onComplete?.(code);

    if (!isSuccess) {
      throw new Error(`${providerName} ACP stopped with reason: ${response.stopReason}`);
    }
  } catch (error) {
    const normalizedError = timeoutError || (error instanceof Error ? error : new Error(String(error)));
    logger.error(`${providerName} ACP executor failed: ${normalizedError.message}`);
    onError?.(normalizedError);
    throw normalizedError;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (session) {
      await session.close();
    }
  }
}

/**
 * Show instructions for installing the local ACP adapter.
 */
export function showClaudeInstallInstructions(): void {
  console.log();
  console.log('⚠️  Claude Code ACP adapter is not available');
  console.log();
  console.log('To use this feature, install the package dependencies and authenticate Claude Code.');
  console.log('Codex execution uses the Codex ACP adapter instead.');
  console.log();
}
