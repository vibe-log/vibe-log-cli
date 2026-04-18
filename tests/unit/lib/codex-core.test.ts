import { describe, expect, it, vi, beforeEach } from 'vitest';
import { discoverCodexProjects } from '../../../src/lib/codex-core';
import * as codexReader from '../../../src/lib/readers/codex';

vi.mock('../../../src/lib/readers/codex');
vi.mock('../../../src/utils/logger');

describe('discoverCodexProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups Codex projects by cwd with session count and last activity', async () => {
    vi.mocked(codexReader.readCodexSessions).mockResolvedValue([
      {
        id: 'session-1',
        tool: 'codex',
        source: 'codex',
        projectPath: '/Users/test/work/app',
        timestamp: new Date('2026-04-18T08:00:00.000Z'),
        duration: 300,
        messages: [{ role: 'user', content: 'one', timestamp: new Date('2026-04-18T08:00:00.000Z') }],
      },
      {
        id: 'session-2',
        tool: 'codex',
        source: 'codex',
        projectPath: '/Users/test/work/app',
        timestamp: new Date('2026-04-18T10:00:00.000Z'),
        duration: 300,
        messages: [{ role: 'user', content: 'two', timestamp: new Date('2026-04-18T10:00:00.000Z') }],
      },
      {
        id: 'session-3',
        tool: 'codex',
        source: 'codex',
        projectPath: '/Users/test/work/other',
        timestamp: new Date('2026-04-17T10:00:00.000Z'),
        duration: 300,
        messages: [{ role: 'user', content: 'three', timestamp: new Date('2026-04-17T10:00:00.000Z') }],
      },
    ]);

    const projects = await discoverCodexProjects();

    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({
      name: 'app',
      actualPath: '/Users/test/work/app',
      codexPath: '/Users/test/work/app',
      sessions: 2,
    });
    expect(projects[0].lastActivity?.toISOString()).toBe('2026-04-18T10:00:00.000Z');
    expect(projects[1]).toMatchObject({
      name: 'other',
      actualPath: '/Users/test/work/other',
      sessions: 1,
    });
  });
});
