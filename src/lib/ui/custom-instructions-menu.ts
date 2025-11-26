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
  getInstructionsPath
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
  console.log(colors.highlight('   Help the AI understand what matters to you\n'));

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
 * Open file in user's preferred editor
 */
async function openInEditor(filePath: string): Promise<void> {
  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';

  return new Promise((resolve, reject) => {
    const child = spawn(editor, [filePath], {
      stdio: 'inherit'
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
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

    // Auto-sync or show login promotion
    const token = await getToken();
    if (token) {
      console.log(colors.muted('Syncing to cloud...'));
      try {
        const content = await readInstructions();
        if (content) {
          await apiClient.syncInstructions(content, 'cli');
          showSuccess('Changes synced to cloud!');
        }
      } catch (syncError) {
        showError('Failed to sync to cloud');
        if (syncError instanceof Error) {
          console.log(colors.dim(`  ${syncError.message}`));
        }
      }
    } else {
      // Promote login for non-authenticated users
      console.log('');
      console.log(colors.info('💡 Tip: Login to sync instructions across devices'));
      console.log(colors.subdued('   Run: vibe-log auth'));
      console.log(colors.subdued('   Or edit online at app.vibe-log.dev/settings'));
    }
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
    // Create template
    const { writeInstructions: writeFile } = await import('../instructions');
    const DEFAULT_TEMPLATE = `I'm building a SaaS productivity tool as my main project.

My projects:
- main-app: Production SaaS, this is my focus
- side-project: Learning new tech, exploratory work
- client-work: Freelance, billable hours matter

What counts as progress:
- Shipping features to production
- Deep focused coding sessions
- Fixing critical bugs

What to ignore:
- Config/setup tweaks
- Updating dependencies
- Writing docs (unless specifically asked)
`;
    await writeFile(DEFAULT_TEMPLATE);

    // Open in editor immediately (no middle step)
    console.log(colors.info(`\nOpening ${getInstructionsPath()} in your editor...`));
    console.log(colors.subdued('Save and close the editor when done.\n'));

    await openInEditor(getInstructionsPath());
    console.log(colors.success('\nFile saved!'));

    // Auto-sync or show login promotion
    const token = await getToken();
    if (token) {
      // Auto-sync to cloud
      console.log(colors.muted('Syncing to cloud...'));
      try {
        const content = await readInstructions();
        if (content) {
          await apiClient.syncInstructions(content, 'cli');
          showSuccess('Instructions synced to cloud!');
        }
      } catch (syncError) {
        showError('Failed to sync to cloud');
        if (syncError instanceof Error) {
          console.log(colors.dim(`  ${syncError.message}`));
        }
      }
    } else {
      // Promote login for non-authenticated users
      console.log('');
      console.log(colors.info('💡 Tip: Login to sync instructions across devices'));
      console.log(colors.subdued('   Run: vibe-log auth'));
      console.log(colors.subdued('   Or edit online at app.vibe-log.dev/settings'));
    }
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
 * Silently pull from cloud on menu load (cloud is source of truth)
 */
async function autoSyncFromCloud(): Promise<void> {
  const token = await getToken();
  if (!token) return;

  try {
    const cloudInstructions = await apiClient.fetchInstructions();
    if (cloudInstructions.content) {
      // Cloud has content - write to local (cloud wins)
      await writeInstructions(cloudInstructions.content);
    } else {
      // Cloud is empty - delete local file to stay in sync
      await deleteLocalInstructions();
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
