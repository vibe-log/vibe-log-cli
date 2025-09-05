import { showHooksManagementMenu } from '../lib/ui/hooks-menu';
import { showLogo } from '../lib/ui';
import { showMainMenu } from '../lib/ui/main-menu';
import { detectSetupState } from '../lib/detector';
import { currentVersion } from '../index';

/**
 * Command to directly open the auto-sync configuration menu
 * This provides a shortcut to the hooks management interface
 */
export async function installAutoSync(): Promise<void> {
  // Show logo for consistency with other commands
  await showLogo(currentVersion);
  
  // Go directly to the hooks management menu
  await showHooksManagementMenu();
  
  // After exiting hooks menu, show the main menu
  const state = await detectSetupState();
  await showMainMenu(state, null);
}