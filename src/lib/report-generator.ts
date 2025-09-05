import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { colors, icons } from './ui/styles';
import { logger } from '../utils/logger';
import { parseProjectName } from './ui/project-display';
import { ReportTemplateEngine } from './report-template-engine';
import type { ReportData } from '../types/report-data';

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
 * Handles JSON report generation, processing, and saving
 */
export class ReportGenerator {
  private reportData: ReportData | null = null;
  private capturingJson: boolean = false;
  private jsonBuffer: string = '';
  private reportFilePath: string = '';
  private executionStats: ExecutionStats | null = null;
  private templateEngine: ReportTemplateEngine;

  constructor() {
    this.templateEngine = new ReportTemplateEngine();
  }

  /**
   * Start capturing report content
   */
  public startCapture(): void {
    this.capturingJson = true;
    this.jsonBuffer = '';
    this.reportData = null;
    console.log();
    console.log(colors.highlight('🚀 TEMPLATE-BASED REPORT GENERATOR v0.6.0'));
    console.log(colors.muted('   Using new JSON → Template engine (no direct HTML generation)'));
    console.log();
    console.log(colors.success('📝 Generating report data...'));
  }

  /**
   * Process a message that may contain JSON report data
   */
  public processMessage(text: string): void {
    // Try to detect JSON object in the message
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        // Attempt to parse the JSON
        const parsedData = JSON.parse(jsonMatch[0]) as ReportData;
        
        // Validate that it has the expected structure
        if (parsedData.metadata && parsedData.executiveSummary && parsedData.activityDistribution) {
          this.reportData = parsedData;
          this.capturingJson = false;
          console.log(colors.success('✅ JSON data captured (template engine will format)'));
          logger.debug('Captured report data:', parsedData);
          
          // Store the report path for later
          this.reportFilePath = getUniqueReportFilename(process.cwd());
          console.log(colors.dim(`[DEBUG] Will save report to: ${this.reportFilePath} after stats are available`));
        } else {
          // Not the expected structure, might be capturing multi-line JSON
          if (this.capturingJson) {
            this.jsonBuffer += text;
          }
        }
      } catch (e) {
        // Not valid JSON yet, might be partial
        if (this.capturingJson) {
          this.jsonBuffer += text;
          
          // Try to parse accumulated buffer
          const bufferMatch = this.jsonBuffer.match(/\{[\s\S]*\}/);
          if (bufferMatch) {
            try {
              const parsedData = JSON.parse(bufferMatch[0]) as ReportData;
              if (parsedData.metadata && parsedData.executiveSummary) {
                this.reportData = parsedData;
                this.capturingJson = false;
                this.jsonBuffer = '';
                console.log(colors.success('✅ JSON data captured (template engine will format)'));
                this.reportFilePath = getUniqueReportFilename(process.cwd());
              }
            } catch {
              // Still not complete, continue capturing
              console.log(colors.muted(`Capturing report data... (${(this.jsonBuffer.length / 1024).toFixed(1)} KB)`));
            }
          }
        }
      }
    } else if (this.capturingJson) {
      // No JSON detected but we're capturing, add to buffer
      this.jsonBuffer += text;
      console.log(colors.muted(`Capturing report data... (${(this.jsonBuffer.length / 1024).toFixed(1)} KB)`));
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
    return this.capturingJson;
  }

  /**
   * Check if we have report data ready to save
   */
  public hasReport(): boolean {
    return this.reportData !== null && this.reportFilePath.length > 0;
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
   * Generate HTML from JSON data and save the report
   */
  public async saveReport(): Promise<ReportResult> {
    if (!this.hasReport() || !this.reportData) {
      return {
        success: false,
        error: 'No report data to save'
      };
    }

    console.log(colors.dim('[DEBUG] Processing report with template engine v0.6.0...'));
    
    try {
      // Load the template
      console.log(colors.info('🔧 Loading HTML template...'));
      await this.templateEngine.loadTemplate();
      console.log(colors.success('✅ Template loaded, injecting data...'));
      
      // If we have execution stats, update the report data
      if (this.executionStats) {
        this.reportData.reportGeneration = {
          duration: this.formatDuration(this.executionStats.duration_ms),
          apiTime: this.formatDuration(this.executionStats.duration_api_ms),
          turns: this.executionStats.num_turns,
          estimatedCost: this.executionStats.total_cost_usd,
          sessionId: this.executionStats.session_id
        };
      }
      
      // Generate HTML from the template and data
      const htmlContent = this.templateEngine.generateReport(this.reportData);
      
      // Save the HTML report
      await fs.writeFile(this.reportFilePath, htmlContent);
      const reportFile = parseProjectName(this.reportFilePath);
      console.log(colors.success(`✅ Template-based report saved as: ${reportFile}`));
      console.log(colors.muted(`   Size: ${(htmlContent.length / 1024).toFixed(2)} KB`));
      
      return {
        success: true,
        reportPath: this.reportFilePath,
        reportContent: htmlContent,
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
    
    console.log(colors.success(`${icons.check} Template-based report generation complete! (v0.6.0)`));
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