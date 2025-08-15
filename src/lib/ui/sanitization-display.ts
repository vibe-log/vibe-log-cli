import chalk from 'chalk';
import { formatDuration } from '../ui';
import { SessionData } from '../readers/types';

/**
 * Sanitization display component extracted from send.ts
 * Shows summary of what will be uploaded and redacted
 */

/**
 * Display the upload summary with sanitization info
 * @param sessions - Original sessions to be uploaded
 * @param totalRedactions - Total number of redacted items
 */
export function showUploadSummary(sessions: SessionData[], totalRedactions: number): void {
  const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
  
  console.log('');
  console.log(chalk.cyan(
    `Ready to upload ${sessions.length} session${sessions.length !== 1 ? 's' : ''} (${formatDuration(totalDuration)} total)`
  ));
  
  if (totalRedactions > 0) {
    console.log(chalk.gray(`🔒 ${totalRedactions} sensitive items redacted for privacy`));
  }
}

/**
 * Display summary for silent mode (uses logger instead of console)
 * @param sessions - Original sessions to be uploaded
 * @param totalDuration - Total duration in seconds
 */
export function logUploadSummary(
  sessionCount: number, 
  totalDuration: number,
  logger: any
): void {
  logger.info(`Ready to upload ${sessionCount} sessions (${formatDuration(totalDuration)})`);
}

/**
 * Calculate total redactions from API sessions
 * @param apiSessions - Sanitized sessions with redaction metadata
 * @returns Total count of all redacted items
 */
export function countTotalRedactions(apiSessions: any[]): number {
  let totalRedactions = 0;
  
  apiSessions.forEach(session => {
    const messages = JSON.parse(session.data.messageSummary);
    messages.forEach((msg: any) => {
      if (msg.metadata?.redactedItems) {
        Object.values(msg.metadata.redactedItems).forEach((count: any) => {
          totalRedactions += count;
        });
      }
    });
  });
  
  return totalRedactions;
}

/**
 * Get detailed redaction breakdown by type
 * @param apiSessions - Sanitized sessions with redaction metadata
 * @returns Object with counts by redaction type
 */
export function getRedactionBreakdown(apiSessions: any[]): {
  codeBlocks: number;
  credentials: number;
  paths: number;
  urls: number;
  emails: number;
} {
  const counts = {
    codeBlocks: 0,
    credentials: 0,
    paths: 0,
    urls: 0,
    emails: 0,
  };
  
  apiSessions.forEach(session => {
    const messages = JSON.parse(session.data.messageSummary);
    messages.forEach((msg: any) => {
      if (msg.metadata?.redactedItems) {
        Object.entries(msg.metadata.redactedItems).forEach(([key, value]) => {
          if (key in counts) {
            counts[key as keyof typeof counts] += value as number;
          }
        });
      }
    });
  });
  
  return counts;
}