/**
 * Shared display utilities for statusline formatting
 * Provides consistent formatting across different statusline types
 */

/**
 * Get color-coded emoji based on score
 * Used by prompt analysis statusline for quality indication
 *
 * @param score - Numeric score from 0-100
 * @returns Emoji representing score range
 */
export function getScoreEmoji(score: number): string {
  if (score <= 40) return '🔴';      // Poor (0-40)
  if (score <= 60) return '🟠';      // Fair (41-60)
  if (score <= 80) return '🟡';      // Good (61-80)
  return '🟢';                       // Excellent (81-100)
}

/**
 * Get progress emoji based on completion percentage
 * Used by challenge statusline for progress indication
 *
 * @param percentage - Completion percentage from 0-100
 * @returns Emoji representing progress
 */
export function getProgressEmoji(percentage: number): string {
  if (percentage === 0) return '⚪';         // Not started
  if (percentage < 25) return '🔴';         // Just started
  if (percentage < 50) return '🟠';         // Making progress
  if (percentage < 75) return '🟡';         // Half way
  if (percentage < 100) return '🟢';        // Almost there
  return '✅';                              // Complete!
}

/**
 * Format a number with appropriate suffix (K, M)
 * Used for displaying large numbers compactly
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

/**
 * Truncate text to maximum length with ellipsis
 * Preserves whole words when possible
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Try to truncate at last space within limit
  const truncated = text.substring(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    // If we found a space reasonably close to the limit, use it
    return truncated.substring(0, lastSpace) + '...';
  }

  // Otherwise just hard truncate
  return truncated + '...';
}
