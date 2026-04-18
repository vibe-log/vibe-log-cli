import inquirer from 'inquirer';
import { colors } from './styles';
import { discoverProjects } from '../claude-core';
import { discoverCodexProjects } from '../codex-core';
import { showSessionSelector, SelectedSessionInfo } from './session-selector';
import { readClaudeSessions } from '../readers/claude';
import { readCodexSessions } from '../readers/codex';
import { SessionData, SessionSource, SyncSource } from '../readers/types';
import { parseProjectName } from './project-display';
import { createSpinner } from '../ui';
import { VibelogError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export type ManualSyncOption =
  | { type: 'selected'; source: SyncSource; sessions: SelectedSessionInfo[] }
  | { type: 'time-based'; source: SyncSource; days: number; sessions: SelectedSessionInfo[] }
  | { type: 'projects'; source: SyncSource; projectPaths: string[] }
  | { type: 'all'; source: SyncSource }
  | { type: 'cancel' };

interface ProjectChoice {
  name: string;
  actualPath: string;
  sessions: number;
  isActive: boolean;
  sources: SessionSource[];
}

/**
 * Show the manual sync menu and return the user's choice
 */
export async function showManualSyncMenu(): Promise<ManualSyncOption> {
  console.log('');
  console.log(colors.primary('Manual sync to cloud'));
  console.log(colors.subdued('─'.repeat(20)));
  console.log('');

  const source = await promptForSource();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to sync?',
      choices: [
        { name: `🎯 Select specific sessions`, value: 'select' },
        { name: `📅 Last 7 days`, value: 'last7' },
        { name: `📅 Last 14 days`, value: 'last14' },
        { name: `📁 Select projects to sync`, value: 'projects' },
        { name: `🌍 Sync all projects`, value: 'all' },
        { name: `↩️ Back`, value: 'cancel' }
      ]
    }
  ]);

  switch (action) {
    case 'select': {
      const selectedSessions = await showSessionSelector(source);

      if (selectedSessions.length === 0) {
        console.log(colors.warning('\nNo sessions selected.'));
        return { type: 'cancel' };
      }

      return { type: 'selected', source, sessions: selectedSessions };
    }

    case 'projects': {
      const projects = await discoverProjectsForSource(source);

      if (projects.length === 0) {
        console.log(colors.warning(`\nNo ${getSourceLabel(source)} projects found.`));
        return { type: 'cancel' };
      }

      const { selected } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selected',
          message: 'Select projects to sync:',
          choices: projects.map(p => ({
            name: formatProjectChoice(p, source),
            value: p.actualPath,
            checked: false
          })),
          validate: (input) => {
            if (input.length === 0) {
              return 'Please select at least one project';
            }
            return true;
          }
        }
      ]);

      return { type: 'projects', source, projectPaths: selected };
    }

    case 'last7':
      return loadTimeBasedSessions(source, 7);

    case 'last14':
      return loadTimeBasedSessions(source, 14);

    case 'all': {
      const projects = await discoverProjectsForSource(source);
      const totalSessions = projects.reduce((sum, p) => sum + p.sessions, 0);

      console.log('');
      console.log(colors.info(`This will sync ${totalSessions} sessions from ${projects.length} ${getSourceLabel(source)} project${projects.length === 1 ? '' : 's'}.`));

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Continue with syncing all projects?',
          default: true
        }
      ]);

      if (!confirm) {
        return { type: 'cancel' };
      }

      return { type: 'all', source };
    }

    default:
      return { type: 'cancel' };
  }
}

async function promptForSource(): Promise<SyncSource> {
  const { source } = await inquirer.prompt([
    {
      type: 'list',
      name: 'source',
      message: 'Which sessions should vibe-log read?',
      choices: [
        { name: 'Claude Code', value: 'claude' },
        { name: 'Codex', value: 'codex' },
        { name: 'All supported sources', value: 'all' },
      ],
      default: 'claude',
    }
  ]);

  return source;
}

async function loadTimeBasedSessions(source: SyncSource, days: number): Promise<ManualSyncOption> {
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const spinner = createSpinner(`Loading ${getSourceLabel(source)} sessions from the last ${days} days...`).start();

  try {
    const sessions = await readSessionsForSource(source, sinceDate);

    // Filter out sessions shorter than 4 minutes (240 seconds)
    const validSessions = sessions.filter(s => s.duration >= 240);

    if (validSessions.length === 0) {
      spinner.fail(colors.warning(`No ${getSourceLabel(source)} sessions longer than 4 minutes found in the last ${days} days.`));
      return { type: 'cancel' };
    }

    spinner.succeed(colors.success(`Found ${validSessions.length} ${getSourceLabel(source)} sessions from the last ${days} days`));

    const selectedSessions = sessionsToSelectedInfo(validSessions);

    console.log('');
    console.log(colors.info(`This will sync ${selectedSessions.length} sessions from the last ${days} days.`));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Continue with syncing ${selectedSessions.length} sessions?`,
        default: true
      }
    ]);

    if (!confirm) {
      return { type: 'cancel' };
    }

    return { type: 'time-based', source, days, sessions: selectedSessions };
  } catch (error) {
    spinner.fail(colors.error('Failed to load sessions'));
    logger.debug('Failed to load manual sync sessions:', error);
    return { type: 'cancel' };
  }
}

async function readSessionsForSource(source: SyncSource, since: Date): Promise<SessionData[]> {
  if (source === 'claude') {
    return readClaudeSessions({ since });
  }

  if (source === 'codex') {
    return readCodexSessions({ since });
  }

  const sessions: SessionData[] = [];

  try {
    sessions.push(...await readClaudeSessions({ since }));
  } catch (error) {
    if (!(error instanceof VibelogError) || error.code !== 'CLAUDE_NOT_FOUND') {
      throw error;
    }
    logger.debug('Claude sessions not found while reading all sources');
  }

  try {
    sessions.push(...await readCodexSessions({ since }));
  } catch (error) {
    if (!(error instanceof VibelogError) || error.code !== 'CODEX_NOT_FOUND') {
      throw error;
    }
    logger.debug('Codex sessions not found while reading all sources');
  }

  return sessions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

async function discoverProjectsForSource(source: SyncSource): Promise<ProjectChoice[]> {
  const projects: ProjectChoice[] = [];

  if (source === 'claude' || source === 'all') {
    const claudeProjects = await discoverProjects();
    projects.push(...claudeProjects.map(project => ({
      name: project.name,
      actualPath: project.actualPath,
      sessions: project.sessions,
      isActive: project.isActive,
      sources: ['claude'] as SessionSource[],
    })));
  }

  if (source === 'codex' || source === 'all') {
    const codexProjects = await discoverCodexProjects();
    projects.push(...codexProjects.map(project => ({
      name: project.name,
      actualPath: project.actualPath,
      sessions: project.sessions,
      isActive: project.isActive,
      sources: ['codex'] as SessionSource[],
    })));
  }

  const grouped = new Map<string, ProjectChoice>();
  for (const project of projects) {
    const existing = grouped.get(project.actualPath);
    if (!existing) {
      grouped.set(project.actualPath, project);
      continue;
    }

    existing.sessions += project.sessions;
    existing.isActive = existing.isActive || project.isActive;
    existing.sources = Array.from(new Set([...existing.sources, ...project.sources]));
  }

  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function sessionsToSelectedInfo(sessions: SessionData[]): SelectedSessionInfo[] {
  return sessions.map(session => ({
    projectPath: session.sourceFile?.claudeProjectPath || '',
    sessionFile: session.sourceFile?.sessionFile || '',
    displayName: parseProjectName(session.projectPath),
    duration: session.duration,
    timestamp: session.timestamp,
    messageCount: session.messages.length,
    source: session.source || session.sourceFile?.source || 'claude',
    fullPath: session.sourceFile?.fullPath,
  })).filter(s => s.projectPath && s.sessionFile);
}

function formatProjectChoice(project: ProjectChoice, selectedSource: SyncSource): string {
  const sourceLabel = selectedSource === 'all'
    ? `${project.sources.map(source => source === 'codex' ? 'Codex' : 'Claude Code').join(' + ')} • `
    : '';

  return `${sourceLabel}${project.name} ${colors.subdued(`(${project.sessions} sessions${project.isActive ? '' : ', inactive'})`)}`;
}

function getSourceLabel(source: SyncSource): string {
  switch (source) {
    case 'codex':
      return 'Codex';
    case 'all':
      return 'supported';
    case 'claude':
    default:
      return 'Claude Code';
  }
}
