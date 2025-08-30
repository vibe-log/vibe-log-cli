import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { colors, icons } from './ui/styles';
import { logger } from '../utils/logger';
import { parseProjectName } from './ui/project-display';

/**
 * Execution statistics from Claude
 */
interface ExecutionStats {
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  session_id: string;
  subtype: string;
  is_error: boolean;
}

/**
 * Report generation result
 */
export interface ReportResult {
  success: boolean;
  reportPath?: string;
  reportContent?: string;
  executionStats?: ExecutionStats;
  error?: string;
}

/**
 * Generate a unique report filename by checking for existing files
 * and appending an incremental suffix if needed
 */
function getUniqueReportFilename(basePath: string): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const baseFilename = `vibe-log-report-${dateStr}`;
  
  // Check if base filename exists
  let filename = `${baseFilename}.html`;
  let fullPath = path.join(basePath, filename);
  
  if (!existsSync(fullPath)) {
    return fullPath;
  }
  
  // If it exists, try with incremental suffixes
  let counter = 1;
  while (counter < 100) { // Reasonable upper limit
    filename = `${baseFilename}-${counter}.html`;
    fullPath = path.join(basePath, filename);
    
    if (!existsSync(fullPath)) {
      return fullPath;
    }
    
    counter++;
  }
  
  // Fallback: use timestamp if somehow we have 100+ reports
  const timestamp = Date.now();
  filename = `${baseFilename}-${timestamp}.html`;
  return path.join(basePath, filename);
}

/**
 * Handles HTML report generation, processing, and saving
 */
export class ReportGenerator {
  private reportContent: string = '';
  private capturingReport: boolean = false;
  private reportFilePath: string = '';
  private executionStats: ExecutionStats | null = null;

  /**
   * Start capturing report content
   */
  public startCapture(): void {
    this.capturingReport = true;
    this.reportContent = '';
    console.log(colors.success('📝 Generating HTML report...'));
  }

  /**
   * Process a message that may contain report content
   */
  public processMessage(text: string): void {
    const hasStartMarker = text.includes('=== REPORT START ===');
    const hasEndMarker = text.includes('=== REPORT END ===');

    // Case 1: Both markers in same message
    if (hasStartMarker && hasEndMarker) {
      console.log(colors.dim('[DEBUG] Found BOTH markers in same message'));
      console.log(colors.success('📝 Generating HTML report...'));
      
      // Extract content between markers
      const match = text.match(/=== REPORT START ===([\s\S]*?)=== REPORT END ===/);
      if (match && match[1]) {
        this.reportContent = match[1];
        console.log(colors.dim(`[DEBUG] Extracted content between markers: ${this.reportContent.length} chars`));
        
        // Store the report path for later
        this.reportFilePath = getUniqueReportFilename(process.cwd());
        
        console.log(colors.dim(`[DEBUG] Will save report to: ${this.reportFilePath} after stats are available`));
        console.log(colors.dim(`[DEBUG] Report size: ${this.reportContent.length} bytes`));
      }
      
      // Show any content before/after markers
      const beforeStart = text.split('=== REPORT START ===')[0];
      if (beforeStart.trim()) {
        console.log('  ' + beforeStart);
      }
      const afterEnd = text.split('=== REPORT END ===')[1];
      if (afterEnd && afterEnd.trim()) {
        console.log('  ' + afterEnd);
      }
    }
    // Case 2: Only start marker
    else if (hasStartMarker) {
      console.log(colors.dim('[DEBUG] Found REPORT START marker'));
      this.capturingReport = true;
      this.reportContent = '';
      console.log(colors.success('📝 Generating HTML report...'));
      
      // Don't display the marker itself
      const beforeMarker = text.split('=== REPORT START ===')[0];
      if (beforeMarker.trim()) {
        console.log('  ' + beforeMarker);
      }
      // Start capturing after the marker
      const afterMarker = text.split('=== REPORT START ===')[1];
      if (afterMarker) {
        this.reportContent += afterMarker;
        console.log(colors.dim(`[DEBUG] Started capturing, initial content: ${afterMarker.length} chars`));
      }
    }
    // Case 3: Only end marker
    else if (hasEndMarker) {
      console.log(colors.dim('[DEBUG] Found REPORT END marker'));
      // Capture content before the end marker
      const beforeMarker = text.split('=== REPORT END ===')[0];
      if (this.capturingReport && beforeMarker) {
        this.reportContent += beforeMarker;
        console.log(colors.dim(`[DEBUG] Final content length: ${this.reportContent.length} chars`));
      }
      
      if (this.capturingReport && this.reportContent.trim()) {
        // Store the report for later processing
        this.capturingReport = false;
        this.reportFilePath = getUniqueReportFilename(process.cwd());
        
        console.log(colors.dim(`[DEBUG] Will save report to: ${this.reportFilePath} after stats are available`));
        console.log(colors.dim(`[DEBUG] Report size: ${this.reportContent.length} bytes`));
      } else {
        console.log(colors.dim(`[DEBUG] Not saving - capturing: ${this.capturingReport}, content length: ${this.reportContent?.length || 0}`));
      }
      
      // Show any content after the end marker
      const afterMarker = text.split('=== REPORT END ===')[1];
      if (afterMarker && afterMarker.trim()) {
        console.log('  ' + afterMarker);
      }
    }
    // Case 4: Content between markers (multi-message capture)
    else if (this.capturingReport) {
      // Capture report content but don't display it
      this.reportContent += text;
      console.log(colors.dim(`[DEBUG] Capturing content: ${text.length} chars, total: ${this.reportContent.length}`));
      // Show progress indicator
      console.log(colors.muted(`Generating report... (${(this.reportContent.length / 1024).toFixed(1)} KB)`));
    }
  }

  /**
   * Set execution statistics for the report
   */
  public setExecutionStats(stats: ExecutionStats): void {
    this.executionStats = stats;
    logger.debug('Set execution stats for report:', stats);
  }

  /**
   * Check if we're currently capturing a report
   */
  public isCapturing(): boolean {
    return this.capturingReport;
  }

  /**
   * Check if we have report content ready to save
   */
  public hasReport(): boolean {
    return this.reportContent.trim().length > 0 && this.reportFilePath.length > 0;
  }

  /**
   * Format duration in milliseconds to human readable
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Post-process and save the HTML report
   */
  public async saveReport(): Promise<ReportResult> {
    if (!this.hasReport()) {
      return {
        success: false,
        error: 'No report content to save'
      };
    }

    console.log(colors.dim('[DEBUG] Processing report with stats...'));
    
    // Post-process the HTML
    let processedContent = this.reportContent.trim();
    
    // 1. Convert vibe-log.dev text to clickable links (if any)
    processedContent = processedContent.replace(
      /vibe-log\.dev/g,
      '<a href="https://vibe-log.dev" style="color: inherit; text-decoration: none;">vibe-log.dev</a>'
    );
    
    // 2. Inject execution stats and promotional footer before </body>
    if (processedContent.includes('</body>')) {
      let statsHtml = '';
      
      // Add stats if available
      if (this.executionStats) {
        statsHtml = `
    <div style="background: white; 
                margin: 40px auto 20px; 
                max-width: 800px; 
                padding: 25px; 
                border-radius: 12px; 
                border: 2px solid #e2e8f0;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="font-size: 16px; color: #2d3748; margin-bottom: 20px; font-weight: 600;">
        📊 Report Generation Stats
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="text-align: center; background: #f7fafc; padding: 15px; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #5a67d8;">${this.formatDuration(this.executionStats.duration_ms)}</div>
          <div style="font-size: 12px; color: #4a5568; margin-top: 5px; font-weight: 500;">⏱️ Duration</div>
        </div>
        <div style="text-align: center; background: #f7fafc; padding: 15px; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #5a67d8;">${this.formatDuration(this.executionStats.duration_api_ms)}</div>
          <div style="font-size: 12px; color: #4a5568; margin-top: 5px; font-weight: 500;">🚀 API Time</div>
        </div>
        <div style="text-align: center; background: #f7fafc; padding: 15px; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #5a67d8;">${this.executionStats.num_turns}</div>
          <div style="font-size: 12px; color: #4a5568; margin-top: 5px; font-weight: 500;">🔄 Turns</div>
        </div>
        <div style="text-align: center; background: #f7fafc; padding: 15px; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #5a67d8;">$${this.executionStats.total_cost_usd.toFixed(2)}</div>
          <div style="font-size: 12px; color: #4a5568; margin-top: 5px; font-weight: 500;">💰 Cost</div>
        </div>
      </div>
      <div style="text-align: center; padding-top: 20px; border-top: 2px solid #e2e8f0;">
        <div style="font-size: 14px; color: #2d3748; margin-bottom: 12px; font-weight: 500;">
          💡 Get instant reports without using your Claude Code subscription
        </div>
        <a href="https://vibe-log.dev" style="display: inline-block; 
           background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
           color: white; 
           text-decoration: none; 
           padding: 10px 24px; 
           border-radius: 6px; 
           font-size: 14px;
           font-weight: 600;
           box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
           transition: transform 0.2s, box-shadow 0.2s;">
          Visit vibe-log.dev →
        </a>
      </div>
    </div>`;
      } else {
        // Even without stats, add a promotional footer
        statsHtml = `
    <div style="text-align: center; margin: 40px auto 20px; max-width: 600px; 
                padding: 25px;
                background: white;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="font-size: 14px; color: #2d3748; margin-bottom: 12px; font-weight: 500;">
        💡 Get instant productivity reports with vibe-log.dev
      </div>
      <a href="https://vibe-log.dev" style="display: inline-block; 
         background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
         color: white; 
         text-decoration: none; 
         padding: 10px 24px; 
         border-radius: 6px; 
         font-size: 14px;
         font-weight: 600;
         box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
        Visit vibe-log.dev →
      </a>
    </div>`;
      }
      
      processedContent = processedContent.replace(
        '</body>',
        statsHtml + '\n</body>'
      );
    }
    
    // Now save the processed report
    try {
      await fs.writeFile(this.reportFilePath, processedContent);
      const reportFile = parseProjectName(this.reportFilePath);
      console.log(colors.success(`✅ Report saved as: ${reportFile}`));
      console.log(colors.muted(`   Size: ${(processedContent.length / 1024).toFixed(2)} KB`));
      
      return {
        success: true,
        reportPath: this.reportFilePath,
        reportContent: processedContent,
        executionStats: this.executionStats || undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(colors.error(`❌ Failed to save report: ${errorMessage}`));
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Display completion message with stats
   */
  public displayCompletionMessage(): void {
    if (!this.reportFilePath) return;

    const reportFile = parseProjectName(this.reportFilePath);
    
    console.log(colors.success(`${icons.check} Report generation complete!`));
    console.log(colors.info(`📁 Report saved as: ${reportFile}`));
    console.log(colors.muted(`📂 Location: ${this.reportFilePath}`));
    console.log();
    console.log(colors.highlight(`🌐 Open in browser:`));
    console.log(colors.accent(`   file://${this.reportFilePath}`));
    
    // Display execution stats if available
    if (this.executionStats) {
      console.log();
      this.displayExecutionStats();
    }
  }

  /**
   * Display execution statistics
   */
  private displayExecutionStats(): void {
    if (!this.executionStats) return;

    console.log(colors.highlight('📊 Execution Statistics:'));
    console.log(colors.muted('  ⏱️  Duration: ') + colors.accent(this.formatDuration(this.executionStats.duration_ms)));
    console.log(colors.muted('  🚀 API Time: ') + colors.accent(this.formatDuration(this.executionStats.duration_api_ms)));
    console.log(colors.muted('  🔄 Turns Used: ') + colors.accent(this.executionStats.num_turns.toString()));
    console.log(colors.muted('  💰 Cost: ') + colors.accent(`$${this.executionStats.total_cost_usd.toFixed(4)}`));
    
    // Show session ID only if present
    if (this.executionStats.session_id) {
      const shortSessionId = this.executionStats.session_id.length > 12 
        ? this.executionStats.session_id.substring(0, 12) + '...' 
        : this.executionStats.session_id;
      console.log(colors.muted('  🆔 Session: ') + colors.dim(shortSessionId));
    }
    
    // Add status indicator based on result type
    if (this.executionStats.subtype === 'error_max_turns') {
      console.log(colors.warning('  ⚠️  Status: Maximum turns reached'));
    } else if (this.executionStats.subtype === 'error_during_execution') {
      console.log(colors.error('  ❌ Status: Error during execution'));
    }
  }
}