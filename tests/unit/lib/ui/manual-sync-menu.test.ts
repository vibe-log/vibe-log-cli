import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import inquirer from 'inquirer';
import { showManualSyncMenu } from '../../../../src/lib/ui/manual-sync-menu';
import * as sessionSelector from '../../../../src/lib/ui/session-selector';
import * as codexCore from '../../../../src/lib/codex-core';
import * as claudeCore from '../../../../src/lib/claude-core';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock('../../../../src/lib/ui/session-selector');
vi.mock('../../../../src/lib/codex-core');
vi.mock('../../../../src/lib/claude-core');
vi.mock('../../../../src/utils/logger');

describe('manual sync menu source UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes selected-session sync to Codex when the user chooses Codex', async () => {
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ source: 'codex' })
      .mockResolvedValueOnce({ action: 'select' });

    vi.mocked(sessionSelector.showSessionSelector).mockResolvedValue([
      {
        projectPath: '/Users/test/.codex/sessions/2026/04/18',
        sessionFile: 'session.jsonl',
        displayName: 'app',
        duration: 300,
        timestamp: new Date('2026-04-18T08:00:00.000Z'),
        messageCount: 2,
        source: 'codex',
        fullPath: '/Users/test/.codex/sessions/2026/04/18/session.jsonl',
      }
    ]);

    const result = await showManualSyncMenu();

    expect(sessionSelector.showSessionSelector).toHaveBeenCalledWith('codex');
    expect(result).toMatchObject({
      type: 'selected',
      source: 'codex',
      sessions: [
        expect.objectContaining({
          sessionFile: 'session.jsonl',
          source: 'codex',
        })
      ],
    });
  });

  it('returns Codex cwd project paths from the project selector', async () => {
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ source: 'codex' })
      .mockResolvedValueOnce({ action: 'projects' })
      .mockResolvedValueOnce({ selected: ['/Users/test/work/app'] });

    vi.mocked(codexCore.discoverCodexProjects).mockResolvedValue([
      {
        name: 'app',
        actualPath: '/Users/test/work/app',
        codexPath: '/Users/test/work/app',
        sessions: 3,
        lastActivity: new Date('2026-04-18T08:00:00.000Z'),
        isActive: true,
        size: 0,
      }
    ]);
    vi.mocked(claudeCore.discoverProjects).mockResolvedValue([]);

    const result = await showManualSyncMenu();

    expect(codexCore.discoverCodexProjects).toHaveBeenCalled();
    expect(result).toEqual({
      type: 'projects',
      source: 'codex',
      projectPaths: ['/Users/test/work/app'],
    });
  });
});
