import inquirer from 'inquirer';
import { colors } from './styles';
import { discoverProjects } from '../claude-core';
import { showSessionSelector, SelectedSessionInfo } from './session-selector';

export type ManualSyncOption = 
  | { type: 'selected'; sessions: SelectedSessionInfo[] }
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