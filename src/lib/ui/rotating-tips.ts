/**
 * Rotating tips display mechanism for long-running operations
 * Provides engaging content during wait times with smooth transitions
 */

import chalk from 'chalk';
import { getTipsForRotation } from './standup-tips';

export class RotatingTips {
  private tips: string[];
  private currentIndex: number = 0;
  private interval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastLineLength: number = 0;

  constructor(tips?: string[]) {
    this.tips = tips || getTipsForRotation();
    // Shuffle tips for variety
    this.shuffleTips();
  }

  /**
   * Shuffle tips array for random order
   */
  private shuffleTips(): void {
    for (let i = this.tips.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tips[i], this.tips[j]] = [this.tips[j], this.tips[i]];
    }
  }

  /**
   * Clear the current line in the terminal
   */
  private clearLine(): void {
    if (this.lastLineLength > 0) {
      process.stdout.write('\r' + ' '.repeat(this.lastLineLength) + '\r');
    }
  }

  /**
   * Display the current tip
   */
  private displayTip(): void {
    this.clearLine();

    const tip = this.tips[this.currentIndex];
    const output = `${chalk.gray('Tip:')} ${tip}`;

    // Track line length for proper clearing
    // Remove ANSI escape codes to get actual character count
    this.lastLineLength = output.replace(/\x1b\[[0-9;]*m/g, '').length;

    process.stdout.write(output);
  }

  /**
   * Move to next tip
   */
  private nextTip(): void {
    this.currentIndex = (this.currentIndex + 1) % this.tips.length;
    // If we've cycled through all tips, reshuffle
    if (this.currentIndex === 0) {
      this.shuffleTips();
    }
  }

  /**
   * Start rotating tips
   * @param intervalMs - Time between tip changes (default: 4000ms)
   */
  start(intervalMs: number = 4000): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Display first tip immediately
    this.displayTip();

    // Set up tip rotation
    this.interval = setInterval(() => {
      if (this.isRunning) {
        this.nextTip();
        this.displayTip();
      }
    }, intervalMs);
  }

  /**
   * Stop rotating tips and clear the line
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.clearLine();
  }

  /**
   * Pause rotation (keeps current tip displayed)
   */
  pause(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Resume rotation
   */
  resume(intervalMs: number = 4000): void {
    if (this.isRunning) {
      return;
    }

    this.start(intervalMs);
  }

  /**
   * Display a static message (replaces tip)
   */
  showMessage(message: string): void {
    this.clearLine();
    const output = `${chalk.green('✓')} ${message}`;
    this.lastLineLength = output.replace(/\x1b\[[0-9;]*m/g, '').length;
    process.stdout.write(output);
  }

  /**
   * Get current tip being displayed
   */
  getCurrentTip(): string {
    return this.tips[this.currentIndex];
  }

  /**
   * Add a custom tip to the rotation
   */
  addTip(tip: string): void {
    this.tips.push(tip);
  }

  /**
   * Replace all tips with new ones
   */
  setTips(tips: string[]): void {
    this.tips = tips;
    this.currentIndex = 0;
    this.shuffleTips();
  }
}

/**
 * Convenience function to create and start rotating tips
 * Returns a function to stop the rotation
 */
export function startRotatingTips(
  tips?: string[],
  intervalMs: number = 4000
): () => void {
  const rotatingTips = new RotatingTips(tips);
  rotatingTips.start(intervalMs);

  return () => rotatingTips.stop();
}

/**
 * Display tips with a header message
 */
export class RotatingTipsWithHeader {
  private rotatingTips: RotatingTips;
  private headerMessage: string;
  private headerShown: boolean = false;

  constructor(headerMessage: string, tips?: string[]) {
    this.headerMessage = headerMessage;
    this.rotatingTips = new RotatingTips(tips);
  }

  /**
   * Start showing header and tips
   */
  start(tipIntervalMs: number = 4000): void {
    if (!this.headerShown) {
      console.log(chalk.cyan(this.headerMessage));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(); // Empty line for tips
      this.headerShown = true;
    }
    this.rotatingTips.start(tipIntervalMs);
  }

  /**
   * Stop and clear
   */
  stop(): void {
    this.rotatingTips.stop();
  }

  /**
   * Show completion message
   */
  complete(message: string): void {
    this.rotatingTips.showMessage(message);
    console.log(); // New line after completion
  }
}