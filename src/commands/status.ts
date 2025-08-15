import chalk from 'chalk';
import { requireAuth } from '../lib/auth/token';
import { apiClient } from '../lib/api-client';
import { createSpinner, formatDuration, formatDate } from '../lib/ui';
import { VibelogError } from '../utils/errors';
import { logger } from '../utils/logger';

export async function status(): Promise<void> {
  await requireAuth();
  
  const spinner = createSpinner('Fetching your stats...').start();
  
  try {
    // Fetch streak info
    const streak = await apiClient.getStreak();
    
    // Validate that we received proper streak data
    if (!streak || typeof streak.current !== 'number' || isNaN(streak.current)) {
      throw new Error('Invalid streak data received from server');
    }
    
    spinner.succeed('Stats loaded!');
    
    // Display streak information
    console.log(chalk.cyan('\n📊 Your vibe-log Stats'));
    console.log(chalk.gray('═══════════════════════════════\n'));
    
    // Current streak
    if (streak.current > 0) {
      console.log(chalk.green(`🔥 Current Streak: ${chalk.bold(streak.current)} days`));
    } else {
      console.log(chalk.yellow(`🔥 Current Streak: ${chalk.bold('0')} days`));
      console.log(chalk.gray('   Start building today!'));
    }
    
    // Longest streak
    console.log(chalk.cyan(`🏆 Longest Streak: ${chalk.bold(streak.longestStreak || 0)} days`));
    
    // Points
    console.log(chalk.magenta(`⭐ Total Points: ${chalk.bold(streak.points || 0)}`));
    
    // Total sessions
    console.log(chalk.cyan(`📝 Total Sessions: ${chalk.bold(streak.totalSessions || 0)}`));
    
    // Today's sessions
    if (streak.todaySessions > 0) {
      console.log(chalk.green(`✅ Sessions Today: ${chalk.bold(streak.todaySessions)}`));
    } else {
      console.log(chalk.yellow(`⏰ Sessions Today: ${chalk.bold('0')} - Time to code!`));
    }
    
    console.log(chalk.gray('\n═══════════════════════════════\n'));
    
    // Fetch recent sessions
    try {
      const recentSessions = await apiClient.getRecentSessions(5);
      
      if (recentSessions.length > 0) {
        console.log(chalk.cyan('📅 Recent Sessions:'));
        
        recentSessions.forEach((session) => {
          const date = new Date(session.timestamp);
          const duration = formatDuration(session.duration);
          const project = session.projectName || 'Unknown Project';
          
          console.log(
            chalk.gray(`   • ${formatDate(date)} - ${duration} - ${project}`)
          );
        });
      }
    } catch (error) {
      logger.debug('Failed to fetch recent sessions', error);
      // Don't fail the whole command if recent sessions fail
    }
    
    // Motivational messages based on streak (only show for valid data)
    console.log('');
    if (streak.current === 0) {
      console.log(chalk.yellow('💪 Ready to start your streak? Code with Claude Code and sync your sessions!'));
    } else if (streak.current < 7) {
      console.log(chalk.cyan('🌱 Keep going! You\'re building momentum.'));
    } else if (streak.current < 30) {
      console.log(chalk.green('🚀 Amazing progress! You\'re on fire!'));
    } else if (streak.current < 100) {
      console.log(chalk.magenta('🌟 Incredible dedication! You\'re a coding machine!'));
    } else {
      console.log(chalk.red('🔥🔥🔥 LEGENDARY STREAK! You\'re unstoppable!'));
    }
    
  } catch (error) {
    spinner.fail('Failed to fetch stats');
    
    if (error instanceof VibelogError) {
      throw error;
    }
    
    logger.error('Failed to fetch status', error);
    throw new VibelogError(
      'Failed to fetch your stats. Please try again.',
      'STATUS_FAILED'
    );
  }
}