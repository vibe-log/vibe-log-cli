import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type * as schema from '@agentclientprotocol/sdk/dist/schema/types.gen';
import {
  assertAllowedPath,
  normalizeAcpSessionModelMetadata,
  normalizeAllowedRoots,
  startAcpSessionWithProvider,
  type LocalAgentProvider,
} from '../acp-executor';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibe-log-acp-'));
  tempDirs.push(dir);
  return dir;
}

function fixturePath(name: string): string {
  return path.join(process.cwd(), 'tests', 'fixtures', name);
}

function fixtureProvider(name: string, fixture: string): LocalAgentProvider {
  return {
    id: name,
    name,
    command: process.execPath,
    commandArgs: [fixturePath(fixture)],
    installMessage: `${name} fixture missing`,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('ACP executor', () => {
  it('normalizes allowed roots and removes nested duplicates', () => {
    const root = path.resolve('/tmp/project');
    const child = path.join(root, 'child');

    expect(normalizeAllowedRoots(root, [child, root])).toEqual([root]);
  });

  it('rejects filesystem paths outside allowed roots', () => {
    const root = path.resolve('/tmp/project');

    expect(() => assertAllowedPath(path.join(root, 'file.txt'), [root])).not.toThrow();
    expect(() => assertAllowedPath('/tmp/other/file.txt', [root])).toThrow(/outside the allowed workspace/);
  });

  it('normalizes ACP model metadata from stable config options first', () => {
    const configOptions = [{
      id: 'model',
      name: 'Model',
      type: 'select',
      category: 'model',
      currentValue: 'sonnet',
      options: [{
        value: 'sonnet',
        name: 'Sonnet',
        description: 'Default model',
      }],
    }] satisfies schema.SessionConfigOption[];

    const normalized = normalizeAcpSessionModelMetadata({
      configOptions,
      models: {
        currentModelId: 'ignored',
        availableModels: [{
          modelId: 'ignored',
          name: 'Ignored',
        }],
      },
    });

    expect(normalized).toEqual({
      currentModelId: 'sonnet',
      options: [{
        id: 'sonnet',
        name: 'Sonnet',
        description: 'Default model',
      }],
      source: 'configOptions',
    });
  });

  it('starts an ACP session and receives streamed agent text', async () => {
    const cwd = await makeTempDir();
    const chunks: string[] = [];
    const session = await startAcpSessionWithProvider(fixtureProvider('echo-agent', 'acp-echo-agent.mjs'), {
      cwd,
      onSessionUpdate(params) {
        if (params.update.sessionUpdate === 'agent_message_chunk' && params.update.content.type === 'text') {
          chunks.push(params.update.content.text);
        }
      },
    });

    try {
      const response = await session.prompt('hello');
      expect(response.stopReason).toBe('end_turn');
      expect(chunks.join('')).toBe('Echo: hello');
    } finally {
      await session.close();
    }
  });

  it('allows ACP writes inside the workspace and blocks writes outside it', async () => {
    const cwd = await makeTempDir();
    const insidePath = path.join(cwd, 'inside.txt');
    const outsidePath = path.join(os.tmpdir(), `vibe-log-acp-outside-${Date.now()}.txt`);
    const session = await startAcpSessionWithProvider(fixtureProvider('fs-agent', 'acp-fs-agent.mjs'), {
      cwd,
    });

    try {
      await session.prompt(`WRITE ${insidePath}\ninside`);
      await expect(fs.readFile(insidePath, 'utf8')).resolves.toBe('inside');

      await expect(session.prompt(`WRITE ${outsidePath}\noutside`)).rejects.toThrow();
      await expect(fs.access(outsidePath)).rejects.toThrow();
    } finally {
      await fs.rm(outsidePath, { force: true });
      await session.close();
    }
  });
});
