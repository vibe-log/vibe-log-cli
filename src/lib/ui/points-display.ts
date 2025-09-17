import chalk from 'chalk';
import { PointsEarned } from '../api-client';

/**
 * Format and display points earned from session uploads
 */
export class PointsDisplayUI {
  private silent: boolean;

  constructor(silent: boolean = false) {
    this.silent = silent;
  }

  /**
   * Display points breakdown with celebratory formatting
   */
  displayPointsEarned(points: PointsEarned): void {
    if (this.silent) {
      return; // Don't display in silent mode
    }

    // Determine the celebratory level based on total points
    const celebrationLevel = this.getCelebrationLevel(points.total);

    // Main points announcement
    console.log('');
    console.log(chalk.bold(celebrationLevel.color(
      `${celebrationLevel.emoji} You earned ${points.total} points! ${celebrationLevel.suffix}`
    )));

    // Show breakdown if there are multiple components
    if (points.streak > 0 || points.volume > 0) {
      console.log(chalk.gray('   Points breakdown:'));

      if (points.streak > 0) {
        const streakDay = Math.log2(points.streak); // Calculate day from points (2^day)
        console.log(chalk.white(`   🔥 Streak (Day ${Math.floor(streakDay)}): ${points.streak} points`));
      }

      if (points.volume > 0) {
        const sessionCount = points.volume; // 1 point per session
        console.log(chalk.white(`   📊 Session${sessionCount > 1 ? 's' : ''} bonus: ${points.volume} point${points.volume > 1 ? 's' : ''}`));
      }

      // Note: Share bonus (if any) is included in total but not shown separately
      // as sharing happens on the web platform, not in CLI
    }

    // Use custom message if provided
    if (points.message && !this.silent) {
      console.log(chalk.dim(`   ${points.message}`));
    }
  }

  /**
   * Display current streak status and next milestone
   */
  displayStreakStatus(currentDay: number, nextDayPoints: number): void {
    if (this.silent) {
      return;
    }

    console.log('');

    if (currentDay === 0) {
      console.log(chalk.cyan('💡 Start your streak today! Upload a session to earn 2 points.'));
    } else if (currentDay <= 7) {
      console.log(chalk.green(`🔥 You're on a ${currentDay}-day streak!`));
      console.log(chalk.dim(`   Keep it up! Upload tomorrow for ${nextDayPoints} points.`));
    } else {
      console.log(chalk.bold.green(`🏆 Amazing ${currentDay}-day streak!`));
      console.log(chalk.dim(`   You've reached maximum daily points (128). Keep shipping!`));
    }
  }

  /**
   * Display streak warning when it's about to expire
   */
  displayStreakWarning(hoursRemaining: number, currentStreak: number, potentialPoints: number): void {
    if (this.silent) {
      return;
    }

    if (hoursRemaining <= 12) {
      console.log('');
      console.log(chalk.bold.yellow(
        `⚠️  Your ${currentStreak}-day streak ends in ${Math.floor(hoursRemaining)} hours!`
      ));
      console.log(chalk.yellow(
        `   Upload a session soon to earn ${potentialPoints} points tomorrow!`
      ));
    }
  }

  /**
   * Display batch upload points summary
   */
  displayBatchPoints(
    sessionCount: number,
    totalPoints: number,
    pointsBreakdown: PointsEarned
  ): void {
    if (this.silent) {
      return;
    }

    console.log('');
    console.log(chalk.bold.cyan(`📦 Batch upload complete!`));
    console.log(chalk.green(`✅ ${sessionCount} sessions uploaded successfully!`));

    if (totalPoints > 0) {
      const level = this.getCelebrationLevel(totalPoints);
      console.log(chalk.bold(level.color(`${level.emoji} Total points earned: ${totalPoints}`)));

      // Show breakdown
      if (pointsBreakdown.streak > 0) {
        console.log(chalk.white(`   🔥 Streak bonus: ${pointsBreakdown.streak} points`));
      }
      if (pointsBreakdown.volume > 0) {
        console.log(chalk.white(`   📊 Session bonuses: ${pointsBreakdown.volume} points`));
      }
      // Note: Total may include share bonus from web platform
    }
  }

  /**
   * Get celebration level based on points earned
   */
  private getCelebrationLevel(points: number): {
    emoji: string;
    color: typeof chalk.green;
    suffix: string;
  } {
    if (points >= 128) {
      return {
        emoji: '🏆',
        color: chalk.bold.magenta,
        suffix: "MAXIMUM POINTS! You're on fire!"
      };
    } else if (points >= 100) {
      return {
        emoji: '🔥',
        color: chalk.bold.red,
        suffix: 'ON FIRE!'
      };
    } else if (points >= 50) {
      return {
        emoji: '🚀',
        color: chalk.bold.cyan,
        suffix: 'Great progress!'
      };
    } else if (points >= 20) {
      return {
        emoji: '⭐',
        color: chalk.bold.green,
        suffix: 'Nice work!'
      };
    } else if (points > 0) {
      return {
        emoji: '🎉',
        color: chalk.green,
        suffix: ''
      };
    } else {
      return {
        emoji: '📊',
        color: chalk.gray,
        suffix: ''
      };
    }
  }

  /**
   * Display points error (when server doesn't return points)
   */
  displayPointsFallback(): void {
    // Silently handle missing points field - for backward compatibility
    // The upload was successful, just no points data
    return;
  }
}