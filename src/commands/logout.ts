import inquirer from 'inquirer';
import chalk from 'chalk';
import { clearToken } from '../lib/config';
import { showSuccess, showInfo } from '../lib/ui';

export async function logout(): Promise<void> {
  console.log(chalk.yellow('\n⚠️  Logout from vibe-log cloud ☁️'));
  console.log(chalk.gray('This will remove your authentication token.\n'));
  
  const { confirmLogout } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmLogout',
      message: 'Are you sure you want to logout?',
      default: false,
    },
  ]);
  
  if (!confirmLogout) {
    showInfo('Logout cancelled. You are still logged in.');
    return;
  }
  
  await clearToken();
  showSuccess('Logged out successfully!');
  
  console.log(chalk.gray('\nTo use vibe-log again, run: npx vibe-log'));
}