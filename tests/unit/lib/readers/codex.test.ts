import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { parseCodexSessionFile, readCodexSessions } from '../../../../src/lib/readers/codex';

const tempDirs: string[] = [];

async function createCodexHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibelog-codex-'));
  tempDirs.push(dir);
  return dir;
}

async function writeJsonl(filePath: string, entries: Array<object | string>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    entries.map(entry => typeof entry === 'string' ? entry : JSON.stringify(entry)).join('\n'),
    'utf8'
  );
}

function codexSessionEntries(overrides: {
  id?: string;
  cwd?: string;
  timestamp?: string;
  model?: string;
} = {}): object[] {
  const id = overrides.id || 'codex-session-1';
  const cwd = overrides.cwd || '/Users/test/project';
  const timestamp = overrides.timestamp || '2026-04-18T08:00:00.000Z';
  const model = overrides.model || 'gpt-5.4-codex';

  return [
    {
      type: 'session_meta',
      payload: {
        id,
        cwd,
        timestamp,
      },
    },
    {
      type: 'turn_context',
      payload: {
        cwd,
        model,
        timestamp: '2026-04-18T08:00:05.000Z',
      },
    },
    {
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: 'Please add a test',
        timestamp: '2026-04-18T08:00:10.000Z',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'apply_patch',
        arguments: '*** Begin Patch\n*** Add File: src/example.ts\n+export const value = 1;\n*** End Patch',
        timestamp: '2026-04-18T08:01:00.000Z',
      },
    },
    {
      type: 'event_msg',
      payload: {
        type: 'agent_message',
        message: 'Added the test',
        timestamp: '2026-04-18T08:06:10.000Z',
      },
    },
  ];
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe('Codex reader', () => {
  it('parses session_meta, turn_context, messages, model, cwd, and Codex dedupe id', async () => {
    const codexHome = await createCodexHome();
    const sessionFile = path.join(codexHome, 'sessions', '2026', '04', '18', 'session-1.jsonl');
    await writeJsonl(sessionFile, [
      'not-json',
      ...codexSessionEntries(),
    ]);

    const session = await parseCodexSessionFile(sessionFile);

    expect(session).not.toBeNull();
    expect(session?.id).toBe('codex-session-1');
    expect(session?.projectPath).toBe('/Users/test/project');
    expect(session?.claudeSessionId).toBe('codex:codex-session-1');
    expect(session?.tool).toBe('codex');
    expect(session?.source).toBe('codex');
    expect(session?.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Please add a test' }),
      expect.objectContaining({ role: 'assistant', content: 'Added the test' }),
    ]);
    expect(session?.duration).toBe(360);
    expect(session?.metadata?.files_edited).toBe(1);
    expect(session?.metadata?.languages).toEqual(['TypeScript']);
    expect(session?.modelInfo?.primaryModel).toBe('gpt-5.4-codex');
    expect(session?.sourceFile?.source).toBe('codex');
    expect(session?.sourceFile?.fullPath).toBe(sessionFile);
  });

  it('reads current and archived Codex sessions', async () => {
    const codexHome = await createCodexHome();
    await writeJsonl(
      path.join(codexHome, 'sessions', '2026', '04', '18', 'current.jsonl'),
      codexSessionEntries({ id: 'current-session', cwd: '/Users/test/current' })
    );
    await writeJsonl(
      path.join(codexHome, 'archived_sessions', 'archived.jsonl'),
      codexSessionEntries({ id: 'archived-session', cwd: '/Users/test/archive' })
    );

    const sessions = await readCodexSessions({ codexHome });

    expect(sessions.map(session => session.id)).toEqual(['current-session', 'archived-session']);
  });

  it('skips invalid sessions without enough metadata or messages', async () => {
    const codexHome = await createCodexHome();
    await writeJsonl(
      path.join(codexHome, 'sessions', '2026', '04', '18', 'valid.jsonl'),
      codexSessionEntries({ id: 'valid-session' })
    );
    await writeJsonl(
      path.join(codexHome, 'sessions', '2026', '04', '18', 'missing-cwd.jsonl'),
      [
        { type: 'session_meta', payload: { id: 'missing-cwd', timestamp: '2026-04-18T08:00:00.000Z' } },
        { type: 'event_msg', payload: { type: 'user_message', message: 'hello', timestamp: '2026-04-18T08:00:10.000Z' } },
      ]
    );
    await writeJsonl(
      path.join(codexHome, 'sessions', '2026', '04', '18', 'missing-messages.jsonl'),
      [
        { type: 'session_meta', payload: { id: 'missing-messages', cwd: '/Users/test/project', timestamp: '2026-04-18T08:00:00.000Z' } },
      ]
    );

    const sessions = await readCodexSessions({ codexHome });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('valid-session');
  });

  it('applies since, projectPath, and limit filters', async () => {
    const codexHome = await createCodexHome();
    await writeJsonl(
      path.join(codexHome, 'sessions', '2026', '04', '18', 'old.jsonl'),
      codexSessionEntries({
        id: 'old-session',
        cwd: '/Users/test/project',
        timestamp: '2026-04-10T08:00:00.000Z',
      })
    );
    await writeJsonl(
      path.join(codexHome, 'sessions', '2026', '04', '18', 'matching.jsonl'),
      codexSessionEntries({
        id: 'matching-session',
        cwd: '/Users/test/project/subdir',
        timestamp: '2026-04-18T08:00:00.000Z',
      })
    );
    await writeJsonl(
      path.join(codexHome, 'sessions', '2026', '04', '18', 'other.jsonl'),
      codexSessionEntries({
        id: 'other-session',
        cwd: '/Users/test/other',
        timestamp: '2026-04-18T09:00:00.000Z',
      })
    );

    const sessions = await readCodexSessions({
      codexHome,
      since: new Date('2026-04-17T00:00:00.000Z'),
      projectPath: '/Users/test/project',
      limit: 1,
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('matching-session');
  });
});
