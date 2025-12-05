import inquirer from 'inquirer';
import { colors, box } from './styles';
import { showSuccess, showError, showInfo } from '../ui';
import { logger } from '../../utils/logger';
import {
  readInstructions,
  writeInstructions,
  createDefaultInstructions,
  deleteInstructions as deleteLocalInstructions,
  getInstructionsMetadata,
  getInstructionsPath,
  DEFAULT_TEMPLATE
} from '../instructions';
import { apiClient } from '../api-client';
import { getToken } from '../config';
import { spawn } from 'child_process';

/**
 * Display header with current instructions status
 * Cloud-first for authenticated users, local-only for non-authenticated
 */
async function displayHeader(): Promise<void> {
  console.log(colors.accent('\n📝 Custom Instructions'));
  console.log(colors.subdued('   Help the AI understand your work so it can give you relevant insights.'));
  console.log(colors.subdued('   Used in: daily standups, reports, and cloud dashboard\n'));

  const token = await getToken();
  const metadata = await getInstructionsMetadata();

  if (token) {
    // Authenticated: Show cloud status first (source of truth)
    try {
      const cloudInstructions = await apiClient.fetchInstructions();
      if (cloudInstructions.content) {
        console.log(colors.success('☁️  Synced to cloud'));
        console.log(colors.subdued(`  Characters: ${cloudInstructions.content.length.toLocaleString()}`));
        console.log(colors.subdued(`  Last updated from: ${cloudInstructions.lastUpdatedFrom || 'unknown'}`));
      } else {
        console.log(colors.warning('☁️  No instructions yet'));
        console.log(colors.subdued('  Create instructions to personalize your AI analysis'));
      }
    } catch {
      console.log(colors.warning('☁️  Could not check cloud status'));
    }

    // Show local file as secondary info
    if (metadata.exists) {
      console.log('');
      console.log(colors.subdued(`📁 Local copy: ${getInstructionsPath()}`));
    }
  } else {
    // Not authenticated: Show local status only
    if (metadata.exists) {
      console.log(colors.success('✓ Local instructions file'));
      console.log(colors.subdued(`  Path: ${getInstructionsPath()}`));
      console.log(colors.subdued(`  Characters: ${metadata.characterCount.toLocaleString()}`));
      if (metadata.lastModified) {
        console.log(colors.subdued(`  Last modified: ${metadata.lastModified.toLocaleString()}`));
      }
    } else {
      console.log(colors.warning('✗ No instructions file'));
      console.log(colors.subdued('  Create one to personalize your AI analysis'));
    }
  }

  console.log('');
  console.log(box.horizontal.repeat(60));
  console.log('');
}

/**
 * Get the default editor based on environment and platform
 */
function getDefaultEditor(): string {
  // Check environment variables first (user preference)
  if (process.env.EDITOR) return process.env.EDITOR;
  if (process.env.VISUAL) return process.env.VISUAL;

  // Platform-specific fallbacks
  if (process.platform === 'win32') {
    return 'notepad';
  }

  // macOS/Linux: vim is more universal than nano (macOS has vim by default)
  return 'vim';
}

/**
 * Open file in user's preferred editor
 */
async function openInEditor(filePath: string): Promise<void> {
  const editor = getDefaultEditor();

  return new Promise((resolve, reject) => {
    const child = spawn(editor, [filePath], {
      stdio: 'inherit',
      shell: process.platform === 'win32'  // Windows needs shell for notepad
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });

    child.on('error', () => {
      // Helpful error message
      const hint = process.platform === 'win32'
        ? 'Set the EDITOR environment variable to your preferred editor'
        : 'Set the EDITOR environment variable (e.g., export EDITOR=nano)';
      reject(new Error(`Failed to open editor "${editor}". ${hint}`));
    });
  });
}

/**
 * Sync local instructions to cloud (if authenticated) or show login promotion
 * @param successMessage - Custom success message for the sync
 */
async function syncToCloudOrPromptLogin(successMessage: string = 'Synced to cloud!'): Promise<void> {
  const token = await getToken();
  if (token) {
    console.log(colors.muted('Syncing to cloud...'));
    try {
      const content = await readInstructions();
      if (content) {
        await apiClient.syncInstructions(content, 'cli');
        showSuccess(successMessage);
      }
    } catch (syncError) {
      showError('Failed to sync to cloud');
      if (syncError instanceof Error) {
        console.log(colors.dim(`  ${syncError.message}`));
      }
    }
  } else {
    console.log('');
    console.log(colors.info('💡 Tip: Login to sync instructions across devices'));
    console.log(colors.subdued('   Run: vibe-log auth'));
    console.log(colors.subdued('   Or edit online at app.vibe-log.dev/settings'));
  }
}

/**
 * View current instructions
 */
async function viewInstructions(): Promise<void> {
  console.clear();
  console.log(colors.accent('\n📖 Current Instructions\n'));

  const content = await readInstructions();

  if (!content) {
    console.log(colors.warning('No instructions file found.'));
    console.log(colors.subdued('\nCreate one using "Create default template" option.'));
    return;
  }

  // Display content with line numbers for large files
  const lines = content.split('\n');
  const maxLines = 50;

  if (lines.length > maxLines) {
    console.log(colors.subdued(`Showing first ${maxLines} lines of ${lines.length} total:\n`));
    console.log(lines.slice(0, maxLines).join('\n'));
    console.log(colors.subdued(`\n... and ${lines.length - maxLines} more lines`));
  } else {
    console.log(content);
  }
}

/**
 * Edit instructions in user's editor
 */
async function editInstructions(): Promise<void> {
  const metadata = await getInstructionsMetadata();

  if (!metadata.exists) {
    console.log(colors.warning('\nNo instructions file found.'));
    const { create } = await inquirer.prompt([{
      type: 'confirm',
      name: 'create',
      message: 'Would you like to create one with a template?',
      default: true
    }]);

    if (create) {
      await createDefaultInstructions();
      console.log(colors.success('\nTemplate created!'));
    } else {
      return;
    }
  }

  console.log(colors.info(`\nOpening ${getInstructionsPath()} in your editor...`));
  console.log(colors.subdued('Save and close the editor when done.\n'));

  try {
    await openInEditor(getInstructionsPath());
    console.log(colors.success('\nFile saved!'));

    await syncToCloudOrPromptLogin('Changes synced to cloud!');
  } catch (error) {
    showError('Failed to open editor');
    if (error instanceof Error) {
      console.log(colors.dim(`  ${error.message}`));
    }
    logger.error('Editor open failed:', error);
  }
}

/**
 * Create default template and open in editor immediately
 */
async function createTemplate(): Promise<void> {
  const metadata = await getInstructionsMetadata();

  if (metadata.exists) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: colors.warning('Instructions file already exists. Overwrite with template?'),
      default: false
    }]);

    if (!overwrite) {
      console.log(colors.muted('\nCancelled.'));
      return;
    }
  }

  try {
    // Create template using the shared default template
    await writeInstructions(DEFAULT_TEMPLATE);

    // Open in editor immediately (no middle step)
    console.log(colors.info(`\nOpening ${getInstructionsPath()} in your editor...`));
    console.log(colors.subdued('Save and close the editor when done.\n'));

    await openInEditor(getInstructionsPath());
    console.log(colors.success('\nFile saved!'));

    await syncToCloudOrPromptLogin('Instructions synced to cloud!');
  } catch (error) {
    showError('Failed to create or edit template');
    if (error instanceof Error) {
      console.log(colors.dim(`  ${error.message}`));
    }
    logger.error('Template creation failed:', error);
  }
}

/**
 * Delete instructions (local and cloud)
 */
async function deleteInstructions(): Promise<void> {
  const metadata = await getInstructionsMetadata();

  if (!metadata.exists) {
    showInfo('No local instructions file to delete.');
    return;
  }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: colors.warning('Delete instructions (local file AND cloud)?'),
    default: false
  }]);

  if (!confirm) {
    console.log(colors.muted('\nCancelled.'));
    return;
  }

  try {
    // Delete from cloud first (if authenticated)
    const token = await getToken();
    if (token) {
      console.log(colors.muted('Deleting from cloud...'));
      try {
        await apiClient.deleteInstructions();
      } catch (cloudError) {
        // Log but continue with local delete
        logger.error('Cloud delete failed:', cloudError);
      }
    }

    // Delete local file
    await deleteLocalInstructions();
    showSuccess('Instructions deleted!');
  } catch (error) {
    showError('Failed to delete instructions');
    logger.error('Delete failed:', error);
  }
}

/**
 * Wait for user to press Enter
 */
async function promptToContinue(): Promise<void> {
  await inquirer.prompt({
    type: 'input',
    name: 'continue',
    message: 'Press Enter to continue...',
    default: ''
  });
}

/**
 * Sync instructions on menu load
 * - Cloud has content → cloud wins, write to local
 * - Cloud is empty, local exists → sync local to cloud
 */
async function autoSyncFromCloud(): Promise<void> {
  const token = await getToken();
  if (!token) return;

  try {
    const cloudInstructions = await apiClient.fetchInstructions();
    if (cloudInstructions.content) {
      // Cloud has content - cloud wins, write to local
      await writeInstructions(cloudInstructions.content);
      console.log(colors.dim('  ↓ Synced from cloud'));
    } else {
      // Cloud is empty - check if local has content to push up
      const localContent = await readInstructions();
      if (localContent) {
        // Local exists but cloud is empty - push local to cloud
        await apiClient.syncInstructions(localContent, 'cli');
        console.log(colors.dim('  ↑ Synced local to cloud'));
      }
    }
  } catch {
    // Silently ignore - will show in header if there's an issue
  }
}

/**
 * Main custom instructions menu
 */
export async function showCustomInstructionsMenu(): Promise<void> {
  let shouldContinue = true;
  let isFirstLoad = true;

  while (shouldContinue) {
    console.clear();

    // Auto-sync from cloud on first load (cloud is source of truth)
    if (isFirstLoad) {
      console.log(colors.muted('Syncing with cloud...'));
      await autoSyncFromCloud();
      isFirstLoad = false;
      console.clear();
    }

    await displayHeader();

    const metadata = await getInstructionsMetadata();

    // Build menu choices based on state
    const choices: any[] = [];

    if (metadata.exists) {
      choices.push({
        name: '📖 View instructions',
        value: 'view'
      });
      choices.push({
        name: '✏️  Edit instructions',
        value: 'edit'
      });
    } else {
      choices.push({
        name: '✨ Create default template',
        value: 'create'
      });
    }

    // Delete option if file exists
    if (metadata.exists) {
      choices.push(new inquirer.Separator());
      choices.push({
        name: '🗑️  Delete instructions',
        value: 'delete'
      });
    }

    choices.push(
      new inquirer.Separator(),
      {
        name: '← Back to main menu',
        value: 'back'
      }
    );

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices,
      pageSize: 12
    }]);

    switch (action) {
      case 'view':
        await viewInstructions();
        await promptToContinue();
        break;

      case 'edit':
        await editInstructions();
        await promptToContinue();
        break;

      case 'create':
        await createTemplate();
        await promptToContinue();
        break;

      case 'delete':
        await deleteInstructions();
        await promptToContinue();
        break;

      case 'back':
        shouldContinue = false;
        break;
    }
  }
}
