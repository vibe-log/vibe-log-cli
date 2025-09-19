/**
 * Utility functions for standup command
 * Extracted from standup.ts for reusability
 * These are pure functions with no side effects
 */

import { SessionData } from './readers/types';
import { extractProjectName } from './claude-project-parser';

/**
 * Get yesterday's working day (accounting for weekends)
 * Monday returns Friday, Sunday returns Friday, others return yesterday
 */
export function getYesterdayWorkingDay(): Date {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const yesterday = new Date(today);

  if (dayOfWeek === 1) { // Monday
    yesterday.setDate(today.getDate() - 3); // Get Friday
  } else if (dayOfWeek === 0) { // Sunday
    yesterday.setDate(today.getDate() - 2); // Get Friday
  } else {
    yesterday.setDate(today.getDate() - 1); // Get yesterday
  }

  return yesterday;
}

/**
 * Get day name from date
 */
export function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Group sessions by project name
 */
export function groupSessionsByProject(sessions: SessionData[]): Record<string, SessionData[]> {
  const grouped: Record<string, SessionData[]> = {};

  for (const session of sessions) {
    const project = extractProjectName(session.projectPath);
    if (!grouped[project]) {
      grouped[project] = [];
    }
    grouped[project].push(session);
  }

  return grouped;
}

/**
 * Format duration for display
 */
export function formatDuration(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  if (hours >= 1) {
    return `${hours.toFixed(1)} hours`;
  }
  return `${Math.round(totalSeconds / 60)} minutes`;
}