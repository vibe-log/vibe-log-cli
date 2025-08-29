/**
 * Centralized utility for generating promotional tips
 * Used by prompt-analyzer to show tips after analysis completion
 */

/**
 * Generate a promotional tip for analysis results
 * Shows tips only 10% of the time to avoid being intrusive
 * Only shown after an analysis completes, not in empty states
 * 
 * @param isAuthenticated - Whether the user is logged into cloud mode
 * @returns Formatted promotional tip with newline, or empty string (90% of the time)
 */
export function generatePromotionalTip(isAuthenticated: boolean): string {
  // Only show tip 10% of the time
  if (Math.random() > 0.1) {
    return '';
  }
  
  if (isAuthenticated) {
    // Cloud mode: Show clickable hyperlink to analytics dashboard
    // Terminal hyperlink format: OSC 8 escape sequence
    const analyticsUrl = 'https://app.vibe-log.dev/dashboard/analytics?tab=improve&time=week';
    
    // Using ANSI escape codes for color and hyperlink
    const yellow = '\u001b[93m';
    const reset = '\u001b[0m';
    const linkStart = `\u001b]8;;${analyticsUrl}\u001b\\`;
    const linkEnd = `\u001b]8;;\u001b\\`;
    
    // Create the clickable link
    const linkText = 'See improvements';
    const hyperlink = `${linkStart}${yellow}${linkText}${reset}${linkEnd}`;
    
    return `\n📊 View your prompt improvement across sessions ${hyperlink}`;
  } else {
    // Local mode: Suggest using the CLI for local reports
    return '\n💡 run: `npx vibe-log-cli` → Generate Local Report to see your productivity over time';
  }
}