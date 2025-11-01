import inquirer from 'inquirer';
import { colors, icons, box } from './styles';

/**
 * Display privacy notice and get user confirmation for cloud mode
 * Returns true if user accepts, false if they decline
 */
export async function showPrivacyNotice(): Promise<boolean> {
  console.clear();
  
  // Header
  console.log(colors.primary(box.doubleTopLeft + box.doubleHorizontal.repeat(58) + box.doubleTopRight));
  console.log(
    colors.primary(box.doubleVertical) + 
    colors.highlight('  Setting up vibe-log cloud mode...                   ') +
    colors.primary(box.doubleVertical)
  );
  console.log(colors.primary(box.tLeft + box.horizontal.repeat(58) + box.tRight));
  console.log('');
  
  // Advantages section
  console.log(colors.accent('  Cloud Mode Advantages:'));
  console.log(colors.success(`  ${icons.check} Uses 0 tokens (our infrastructure)`));
  console.log(colors.success(`  ${icons.check} Weekly recaps & Daily standup emails`));
  console.log(colors.success(`  ${icons.check} Optimization insights & coaching plan`));
  console.log(colors.success(`  ${icons.check} Interactive dashboard`));
  console.log('');
  
  // Privacy section
  console.log(colors.primary(box.tLeft + box.horizontal.repeat(58) + box.tRight));
  console.log('');
  console.log(colors.accent('  🔒 Privacy Notice:'));
  console.log('');
  console.log(' We take privacy seriously, vibe-log cloud will:');
  console.log(colors.success(`  ${icons.check} Analyze sessions on our infrastructure`));
  console.log(colors.success(`  ${icons.check} Your code and personal data never leaves your machine`));
  console.log('');
  console.log(colors.subdued('  Your code and sensitive information stay private.'));
  console.log('');
  console.log(colors.subdued('  Read our privacy policy: ') + colors.primary('https://vibe-log.dev/privacy'));
  console.log('');
  console.log(colors.primary(box.bottomLeft + box.horizontal.repeat(58) + box.bottomRight));
  console.log('');
  
  // Confirmation prompt
  const { accept } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'accept',
      message: 'Accept and continue with cloud setup',
      default: true
    }
  ]);

  return accept;
}

/**
 * Show a brief privacy reminder (for users who have seen it before)
 */
export async function showPrivacyReminder(): Promise<boolean> {
  console.log('');
  console.log(colors.accent('🔒 Privacy Reminder:'));
  console.log(colors.subdued('• Cloud mode uses our infrastructure (0 tokens)'));
  console.log(colors.subdued('• We store anonymized metrics only'));
  console.log(colors.subdued('• Your code remains private'));
  console.log(colors.subdued('• Privacy policy: https://vibe-log.dev/privacy'));
  console.log('');
  
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Continue with cloud setup?',
      default: true
    }
  ]);
  
  return proceed;
}