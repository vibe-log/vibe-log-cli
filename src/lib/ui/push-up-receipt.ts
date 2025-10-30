import chalk from 'chalk';
import clipboardy from 'clipboardy';
import { brandColors } from './styles';

/**
 * Generate ASCII receipt for completed push-ups
 */
export function generatePushUpReceipt(pushUps: number): string {
  const date = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const calories = Math.round(pushUps * 0.29);

  // Calculate dynamic width based on content
  const dateLine = ` Date: ${date}`;
  const pushUpsLine = ` Push-ups: ${pushUps}`;
  const caloriesLine = ` Calories: ~${calories}`;

  const maxContentWidth = Math.max(
    dateLine.length,
    pushUpsLine.length,
    caloriesLine.length,
    '       🔥 You are absolutely AWESOME!🔥 '.length
  );

  const innerWidth = Math.max(46, maxContentWidth);

  const padLine = (content: string): string => {
    const padding = Math.max(0, innerWidth - content.length);
    return content + ' '.repeat(padding);
  };

  const border = '═'.repeat(innerWidth);

  const receipt = `
╔${border}╗
║${padLine('      💪 CLAUDE GYM - PUSH-UP CHALLENGE')}║
║${padLine('                 RECEIPT')}║
╠${border}╣
║${padLine(dateLine)}║
║${padLine(pushUpsLine)}║
║${padLine(caloriesLine)}║
║${padLine('')}║
║${padLine('        🔥 You are absolutely AWESOME!🔥')}║
║${padLine('')}║
╚${border}╝
`;

  return receipt;
}

/**
 * Generate plain text version for clipboard
 */
export function generatePlainTextReceipt(pushUps: number): string {
  const date = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const calories = Math.round(pushUps * 0.29);

  return `💪 CLAUDE GYM - PUSH-UP CHALLENGE RECEIPT
Date: ${date}
Push-ups: ${pushUps}
Calories: ~${calories}

🔥 You are absolutely AWESOME!🔥`;
}

/**
 * Display receipt with copy-to-clipboard functionality
 */
export async function displayReceiptWithCopyOption(pushUps: number): Promise<void> {
  const receipt = generatePushUpReceipt(pushUps);
  const plainText = generatePlainTextReceipt(pushUps);

  console.log(brandColors.primary(receipt));
  console.log();

  // Try to copy to clipboard
  try {
    await clipboardy.write(plainText);
    console.log(brandColors.primary('✓ Receipt copied to clipboard!'));
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not copy to clipboard automatically'));
    console.log(chalk.gray('   You can manually copy the receipt above'));
  }
}
