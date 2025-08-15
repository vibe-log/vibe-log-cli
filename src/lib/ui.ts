import chalk from 'chalk';
import ora from 'ora';
import { StreakInfo } from './api-client';

export async function showLogo(): Promise<void> {
  try {
    // Dynamically import oh-my-logo (ESM module) in our CommonJS build
    const { renderFilled } = await import('oh-my-logo');
    
    // Generate the VIBE-LOG logo using oh-my-logo with matrix palette
    // renderFilled directly outputs to console with ink-big-text
    await renderFilled('VIBE-LOG', {
      palette: 'matrix'
    });
    console.log(); // Add a blank line after the logo
  } catch (error) {
    // Fallback to simple text logo if oh-my-logo fails or isn't available
    console.log(chalk.green(`
                         VIBE-LOG
    `));
  }
}

export function showStreakUpdate(streak: StreakInfo): void {
  console.log(chalk.green('\n✨ Streak Update:'));
  console.log(`   Current: ${chalk.bold(streak.current)} days 🔥`);
  console.log(`   Points: ${chalk.bold(streak.points)}`);
  console.log(`   Sessions today: ${chalk.bold(streak.todaySessions)}`);
  
  if (streak.current > 0 && streak.current % 7 === 0) {
    console.log(chalk.yellow(`\n🎉 ${streak.current} day streak! Keep building!`));
  } else if (streak.current > 0 && streak.current % 30 === 0) {
    console.log(chalk.yellow(`\n🏆 AMAZING! ${streak.current} day streak! You're unstoppable!`));
  }
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function showUploadResults(results: any): void {
  if (results.analysisPreview) {
    console.log(chalk.cyan('\n📊 Analysis Preview:'));
    console.log(chalk.gray(results.analysisPreview));
  }
  
  if (results.streak) {
    showStreakUpdate(results.streak);
  }
}

export function showSessionSummary(sessions: any[]): void {
  console.log(chalk.cyan('\nSessions to upload:'));
  
  sessions.forEach((session) => {
    const timestamp = new Date(session.timestamp);
    console.log(
      `  • ${formatDate(timestamp)} - ${formatDuration(session.duration)} - ${
        session.data.projectPath
      }`
    );
  });
}

export function showWelcome(): void {
  console.log(chalk.yellow('\n👋 Welcome to vibe-log!'));
  console.log(chalk.gray('Track your building journey and maintain your streak.\n'));
}

export function showSuccess(message: string): void {
  console.log(chalk.green(`\n✅ ${message}`));
}

export function showError(message: string): void {
  console.log(chalk.red(`\n❌ ${message}`));
}

export function showWarning(message: string): void {
  console.log(chalk.yellow(`\n⚠️  ${message}`));
}

export function showInfo(message: string): void {
  console.log(chalk.cyan(`\nℹ️  ${message}`));
}

export function createSpinner(text: string) {
  return ora({
    text,
    spinner: 'dots',
  });
}