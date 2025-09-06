import inquirer from 'inquirer';
import { colors } from './styles';
import { discoverProjects } from '../claude-core';
import { showSessionSelector, SelectedSessionInfo } from './session-selector';
import { readClaudeSessions } from '../readers/claude';
import { parseProjectName } from './project-display';
import { createSpinner } from '../ui';

export type ManualSyncOption = 
  | { type: 'selected'; sessions: SelectedSessionInfo[] }
  | { type: 'time-based'; days: number; sessions: SelectedSessionInfo[] }
  | { type: 'projects'; projects: string[] }
  | { type: 'all' }
  | { type: 'cancel' };

/**
 * Show the manual sync menu and return the user's choice
 */
export async function showManualSyncMenu(): Promise<ManualSyncOption> {
  console.log('');
  console.log(colors.primary('Manual sync to cloud'));
  console.log(colors.subdued('─'.repeat(20)));
  console.log('');
  
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
      // Use existing session selector
      const selectedSessions = await showSessionSelector();
      
      if (selectedSessions.length === 0) {
        console.log(colors.warning('\nNo sessions selected.'));
        return { type: 'cancel' };
      }
      
      // No need to re-read! The selector already gave us everything we need
      return { type: 'selected', sessions: selectedSessions };
    }
    
    case 'projects': {
      // Show project selector
      const projects = await discoverProjects();
      
      if (projects.length === 0) {
        console.log(colors.warning('\nNo Claude projects found.'));
        return { type: 'cancel' };
      }
      
      const { selected } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selected',
          message: 'Select projects to sync:',
          choices: projects.map(p => ({
            name: `${p.name} ${colors.subdued(`(${p.sessions} sessions${p.isActive ? '' : ', inactive'})`)}`,
            value: p.claudePath,
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
      
      return { type: 'projects', projects: selected };
    }
    
    case 'last7': {
      // Sync last 7 days
      const days = 7;
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const spinner = createSpinner(`Loading sessions from the last ${days} days...`).start();
      
      try {
        const sessions = await readClaudeSessions({ since: sinceDate });
        
        // Filter out sessions shorter than 4 minutes (240 seconds)
        const validSessions = sessions.filter(s => s.duration >= 240);
        
        if (validSessions.length === 0) {
          spinner.fail(colors.warning(`No sessions longer than 4 minutes found in the last ${days} days.`));
          return { type: 'cancel' };
        }
        
        spinner.succeed(colors.success(`Found ${validSessions.length} sessions from the last ${days} days`));
        
        // Convert to SelectedSessionInfo format
        const selectedSessions: SelectedSessionInfo[] = validSessions.map(session => ({
          projectPath: session.sourceFile?.claudeProjectPath || '',
          sessionFile: session.sourceFile?.sessionFile || '',
          displayName: parseProjectName(session.projectPath),
          duration: session.duration,
          timestamp: session.timestamp,
          messageCount: session.messages.length
        })).filter(s => s.projectPath && s.sessionFile);
        
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
        
        return { type: 'time-based', days, sessions: selectedSessions };
      } catch (error) {
        spinner.fail(colors.error('Failed to load sessions'));
        return { type: 'cancel' };
      }
    }
    
    case 'last14': {
      // Sync last 14 days
      const days = 14;
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const spinner = createSpinner(`Loading sessions from the last ${days} days...`).start();
      
      try {
        const sessions = await readClaudeSessions({ since: sinceDate });
        
        // Filter out sessions shorter than 4 minutes (240 seconds)
        const validSessions = sessions.filter(s => s.duration >= 240);
        
        if (validSessions.length === 0) {
          spinner.fail(colors.warning(`No sessions longer than 4 minutes found in the last ${days} days.`));
          return { type: 'cancel' };
        }
        
        spinner.succeed(colors.success(`Found ${validSessions.length} sessions from the last ${days} days`));
        
        // Convert to SelectedSessionInfo format
        const selectedSessions: SelectedSessionInfo[] = validSessions.map(session => ({
          projectPath: session.sourceFile?.claudeProjectPath || '',
          sessionFile: session.sourceFile?.sessionFile || '',
          displayName: parseProjectName(session.projectPath),
          duration: session.duration,
          timestamp: session.timestamp,
          messageCount: session.messages.length
        })).filter(s => s.projectPath && s.sessionFile);
        
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
        
        return { type: 'time-based', days, sessions: selectedSessions };
      } catch (error) {
        spinner.fail(colors.error('Failed to load sessions'));
        return { type: 'cancel' };
      }
    }
    
    case 'all': {
      // Confirm syncing all
      const projects = await discoverProjects();
      const totalSessions = projects.reduce((sum, p) => sum + p.sessions, 0);
      
      console.log('');
      console.log(colors.info(`This will sync ${totalSessions} sessions from ${projects.length} projects.`));
      
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
      
      return { type: 'all' };
    }
    
    default:
      return { type: 'cancel' };
  }
}