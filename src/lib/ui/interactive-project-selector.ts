import inquirer from 'inquirer';
import { SelectableProject, createProjectSelector, SelectorOptions } from './project-selector';
import { colors } from './styles';
import readline from 'readline';

// Type declaration for checkbox-plus prompt (optional external package)
// This extends inquirer v12's QuestionMap for the dynamic prompt registration
declare module 'inquirer' {
  interface QuestionMap {
    'checkbox-plus': {
      type: 'checkbox-plus';
      name: string;
      message: string;
      searchable?: boolean;
      highlight?: boolean;
      pageSize?: number;
      source?: (answersSoFar: any, input: string) => Promise<Array<{
        name: string;
        value: string;
        checked?: boolean;
        short?: string;
      }>>;
      choices?: Array<{
        name: string;
        value: string;
        checked?: boolean;
        short?: string;
      }>;
    };
  }
}

interface InteractiveSelectorOptions extends SelectorOptions {
  projects: SelectableProject[];
  initialSelected?: string[];
}

/**
 * Interactive project selector with custom keyboard handling
 * Uses readline for reliable cross-platform input capture
 */
export async function interactiveProjectSelector(
  options: InteractiveSelectorOptions
): Promise<SelectableProject[]> {
  const { projects, initialSelected = [], ...selectorOptions } = options;
  
  if (projects.length === 0) {
    return [];
  }
  
  // Initialize selection state
  let selectedProjects = projects.map(p => ({
    ...p,
    selected: initialSelected.includes(p.id) || p.selected
  }));
  
  let cursorIndex = 0;
  let searchTerm = '';
  
  return new Promise((resolve) => {
    // Set up readline interface for raw keyboard input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Enable raw mode for single keypress detection
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    
    // Helper function to render the UI
    const render = () => {
      // Clear screen and move cursor to top
      process.stdout.write('\x1b[2J\x1b[H');
      
      // Filter projects based on search
      const filteredProjects = searchTerm
        ? selectedProjects.filter(p => 
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.path.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : selectedProjects;
      
      // Adjust cursor if it's out of bounds
      if (cursorIndex >= filteredProjects.length) {
        cursorIndex = Math.max(0, filteredProjects.length - 1);
      }
      
      // Display the selector UI
      console.log(createProjectSelector(
        filteredProjects.length > 0 ? filteredProjects : selectedProjects,
        cursorIndex,
        searchTerm,
        selectorOptions
      ));
      
      // Display help text at bottom
      console.log(colors.hint('\n[↑↓/jk] Navigate  [Space] Toggle  [a] All  [n] None  [/] Search  [Enter] Confirm  [q/Esc] Cancel'));
    };
    
    // Initial render
    render();
    
    // Handle search mode
    let searchMode = false;
    let searchBuffer = '';
    
    // Keyboard input handler
    const handleKeypress = (str: string, key: any) => {
      if (searchMode) {
        // Handle search mode input
        if (key && key.name === 'escape') {
          searchMode = false;
          searchTerm = searchBuffer = '';
          render();
        } else if (key && key.name === 'return') {
          searchMode = false;
          searchTerm = searchBuffer;
          cursorIndex = 0;
          render();
        } else if (key && key.name === 'backspace') {
          searchBuffer = searchBuffer.slice(0, -1);
          searchTerm = searchBuffer;
          render();
          process.stdout.write(colors.accent(`\nSearch: ${searchBuffer}_`));
        } else if (str && str.length === 1 && str.charCodeAt(0) >= 32) {
          searchBuffer += str;
          searchTerm = searchBuffer;
          render();
          process.stdout.write(colors.accent(`\nSearch: ${searchBuffer}_`));
        }
        return;
      }
      
      // Get filtered projects for navigation
      const filteredProjects = searchTerm
        ? selectedProjects.filter(p => 
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.path.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : selectedProjects;
      
      // Handle normal mode input
      if (key && key.name === 'escape') {
        // Cancel and exit
        cleanup();
        resolve([]);
      } else if (key && key.name === 'return') {
        // Confirm selection
        cleanup();
        resolve(selectedProjects.filter(p => p.selected));
      } else if (key && (key.name === 'up' || str === 'k')) {
        // Move cursor up
        cursorIndex = Math.max(cursorIndex - 1, 0);
        render();
      } else if (key && (key.name === 'down' || str === 'j')) {
        // Move cursor down
        cursorIndex = Math.min(cursorIndex + 1, Math.max(0, filteredProjects.length - 1));
        render();
      } else if (str === ' ') {
        // Toggle current selection
        if (filteredProjects[cursorIndex]) {
          const projectId = filteredProjects[cursorIndex].id;
          selectedProjects = selectedProjects.map(p => 
            p.id === projectId ? { ...p, selected: !p.selected } : p
          );
          render();
        }
      } else if (str === 'a' || str === 'A') {
        // Select all
        selectedProjects = selectedProjects.map(p => ({ ...p, selected: true }));
        render();
      } else if (str === 'n' || str === 'N') {
        // Select none
        selectedProjects = selectedProjects.map(p => ({ ...p, selected: false }));
        render();
      } else if (str === '/' || str === 's' || str === 'S') {
        // Enter search mode
        searchMode = true;
        searchBuffer = '';
        render();
        process.stdout.write(colors.accent('\nSearch: _'));
      } else if (str === 'c' || str === 'C') {
        // Clear search
        searchTerm = '';
        cursorIndex = 0;
        render();
      } else if (str === 'q' || str === 'Q') {
        // Quit/cancel
        cleanup();
        resolve([]);
      } else if (str === '?' || str === 'h' || str === 'H') {
        // Show help
        process.stdout.write('\x1b[2J\x1b[H');
        console.log(colors.accent('\n--- Project Selector Help ---\n'));
        console.log('Navigation:');
        console.log('  ↑/k      Move up');
        console.log('  ↓/j      Move down');
        console.log('\nSelection:');
        console.log('  Space    Toggle current project');
        console.log('  a        Select all projects');
        console.log('  n        Deselect all projects');
        console.log('\nSearch:');
        console.log('  / or s   Start search');
        console.log('  c        Clear search');
        console.log('  Esc      Cancel search (while searching)');
        console.log('  Enter    Apply search (while searching)');
        console.log('\nActions:');
        console.log('  Enter    Confirm selection');
        console.log('  q/Esc    Cancel and exit');
        console.log('  ?/h      Show this help');
        console.log(colors.subdued('\nPress any key to continue...'));
        
        // Wait for any key then re-render
        process.stdin.once('keypress', () => {
          render();
        });
      }
    };
    
    // Cleanup function
    const cleanup = () => {
      process.stdin.removeListener('keypress', handleKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    };
    
    // Set up keypress listener
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', handleKeypress);
  });
}

/**
 * Simple checkbox-based project selector (fallback)
 * Enhanced with better formatting and search capability
 */
export async function simpleProjectSelector(
  projects: SelectableProject[],
  message: string = 'Select projects:'
): Promise<SelectableProject[]> {
  if (projects.length === 0) {
    return [];
  }
  
  // Format project choices with proper alignment and colors
  const maxNameLength = Math.max(...projects.map(p => p.name.length));
  const choices = projects.map(p => {
    const paddedName = p.name.padEnd(maxNameLength);
    const sessionInfo = `${p.sessions} session${p.sessions !== 1 ? 's' : ''}`;
    const pathInfo = colors.subdued(` (${p.path})`);
    
    return {
      name: `${paddedName}  ${colors.accent(sessionInfo)}${pathInfo}`,
      value: p.id,
      checked: p.selected,
      short: p.name // Display short name after selection
    };
  });
  
  // Add search capability with inquirer-autocomplete-prompt if available
  // Otherwise fall back to standard checkbox
  try {
    // Try to use searchable checkbox (requires inquirer-checkbox-plus-prompt)
    const CheckboxPlusPrompt = require('inquirer-checkbox-plus-prompt');
    inquirer.registerPrompt('checkbox-plus', CheckboxPlusPrompt);
    
    // Cast to any is required here because inquirer-checkbox-plus-prompt is an optional
    // external package that may not be installed, and inquirer v12's types don't know about it
    const { selected } = await ((inquirer.prompt as any)([
      {
        type: 'checkbox-plus',
        name: 'selected',
        message: `${message} ${colors.hint('(Type to search, Space to select, Enter to confirm)')}`,
        searchable: true,
        highlight: true,
        pageSize: 15,
        source: async (_answersSoFar: any, input: string) => {
          if (!input) return choices;
          
          const searchTerm = input.toLowerCase();
          return choices.filter(choice => {
            const project = projects.find(p => p.id === choice.value);
            return project && (
              project.name.toLowerCase().includes(searchTerm) ||
              project.path.toLowerCase().includes(searchTerm)
            );
          });
        }
      }
    ]) as Promise<{ selected: string[] }>);
    
    return projects.filter(p => selected.includes(p.id));
  } catch (e) {
    // Fall back to standard checkbox prompt if enhanced version not available
    const { selected } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: `${message} ${colors.hint('(Space to select, Enter to confirm)')}`,
        choices,
        pageSize: 15,
        loop: false
      }
    ]);
    
    return projects.filter(p => selected.includes(p.id));
  }
}