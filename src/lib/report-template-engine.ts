import { readFileSync } from 'fs';
import { join } from 'path';
import type { ReportData } from '../types/report-data';

export class ReportTemplateEngine {
  private template: string = '';
  
  // Activity color mapping - aligned with vibe-log-react-router
  private readonly ACTIVITY_COLORS: Record<string, string> = {
    'debugging': '#ef4444',
    'feature development': '#10b981',
    'feature': '#10b981',
    'development': '#10b981',
    'refactoring': '#3b82f6',
    'planning': '#eab308',
    'architecture': '#8b5cf6',
    'architecture & planning': '#8b5cf6',
    'research': '#8b5cf6',
    'learning': '#06b6d4',
    'testing': '#f97316',
    'integration': '#3b82f6',
    'integration & testing': '#3b82f6',
    'review': '#ec4899',
    'optimization': '#10b981',
    'debugging & optimization': '#ef4444',
    'coding': '#10b981',
    'documentation': '#8b5cf6',
    'default': '#6b7280'
  };

  async loadTemplate(): Promise<void> {
    // Look for template in multiple locations to support both development and NPX usage
    const possiblePaths = [
      // NPX package - template is directly in dist/ (tsup bundles everything to dist/index.js)
      join(__dirname, 'report-template.html'),
      // NPX package - alternative location
      join(__dirname, '..', 'report-template.html'),
      // NPX package - old location for compatibility
      join(__dirname, '..', 'templates', 'report-template.html'),
      // Development - template is in src/templates
      join(process.cwd(), 'src', 'templates', 'report-template.html'),
      join(process.cwd(), 'vibe-log-cli', 'src', 'templates', 'report-template.html'),
      // Fallback paths
      join(__dirname, '..', '..', 'src', 'templates', 'report-template.html'),
      join(__dirname, '..', '..', 'dist', 'report-template.html'),
    ];
    
    // Debug logging
    if (process.env.VIBELOG_DEBUG === '1') {
      console.log('[DEBUG] Looking for template file...');
      console.log('[DEBUG] __dirname:', __dirname);
      console.log('[DEBUG] process.cwd():', process.cwd());
    }
    
    let templatePath: string | null = null;
    for (const path of possiblePaths) {
      try {
        this.template = readFileSync(path, 'utf-8');
        templatePath = path;
        if (process.env.VIBELOG_DEBUG === '1') {
          console.log('[DEBUG] ✓ Found template at:', path);
        }
        break;
      } catch (err) {
        if (process.env.VIBELOG_DEBUG === '1') {
          console.log('[DEBUG] ✗ Not found at:', path);
        }
      }
    }
    
    if (!templatePath) {
      const errorMsg = `Could not find report template file. Searched in:\n${possiblePaths.join('\n')}`;
      throw new Error(errorMsg);
    }
  }

  generateReport(data: ReportData): string {
    if (!this.template) {
      throw new Error('Template not loaded. Call loadTemplate() first.');
    }

    let html = this.template;

    // Replace all metadata fields
    html = html.replace(/{{metadata\.dateRange}}/g, data.metadata.dateRange);
    html = html.replace(/{{metadata\.totalSessions}}/g, data.metadata.totalSessions.toString());
    html = html.replace(/{{metadata\.dataProcessed}}/g, data.metadata.dataProcessed);
    html = html.replace(/{{metadata\.activeDevelopment}}/g, data.metadata.activeDevelopment);
    html = html.replace(/{{metadata\.projects}}/g, data.metadata.projects.toString());
    html = html.replace(/{{metadata\.generatedAt}}/g, data.metadata.generatedAt);

    // Generate executive summary list
    const executiveSummaryHtml = data.executiveSummary
      .map((item: string) => `                <li>${item}</li>`)
      .join('\n');
    html = html.replace('{{executiveSummary}}', executiveSummaryHtml);

    // Generate activity distribution bars with proper styling
    const activityBarsHtml = Object.entries(data.activityDistribution)
      .map(([activity, percentage]) => {
        const colorKey = activity.toLowerCase();
        const color = this.ACTIVITY_COLORS[colorKey] || this.ACTIVITY_COLORS.default;
        const cssClass = `activity-${colorKey.replace(/[\s&]/g, '-')}`;
        
        return `                <div class="activity-item">
                    <div class="activity-header">
                        <span class="activity-name">${activity}</span>
                        <span class="activity-percentage">${percentage}%</span>
                    </div>
                    <div class="activity-bar">
                        <div class="activity-fill ${cssClass}" style="width: ${percentage}%; background: ${color};"></div>
                    </div>
                </div>`;
      })
      .join('\n');
    html = html.replace('{{activityBars}}', activityBarsHtml);

    // Generate key accomplishments list
    const keyAccomplishmentsHtml = data.keyAccomplishments
      .map((item: string) => `                <li>${item}</li>`)
      .join('\n');
    html = html.replace('{{keyAccomplishments}}', keyAccomplishmentsHtml);

    // Generate project breakdown cards with improved structure
    const projectCardsHtml = data.projectBreakdown && data.projectBreakdown.length > 0
      ? data.projectBreakdown
          .map((project: any) => `                <div class="project-card">
                    <div class="project-header">
                        <span class="project-name">${project.name}</span>
                        <span class="session-count">${project.sessions} sessions</span>
                    </div>
                    <div class="project-stats">Largest: ${project.largestSession}</div>
                    <p class="project-focus">${project.focus}</p>
                </div>`)
          .join('\n')
      : '';
    html = html.replace('{{projectCards}}', projectCardsHtml);

    // Replace prompt quality analysis with all fields
    if (data.promptQuality) {
      html = html.replace(/{{promptQuality\.averageScore}}/g, (data.promptQuality.averageScore || 0).toString());
      html = html.replace(/{{promptQuality\.breakdown\.excellent}}/g, (data.promptQuality.breakdown?.excellent || 0).toString());
      html = html.replace(/{{promptQuality\.breakdown\.good}}/g, (data.promptQuality.breakdown?.good || 0).toString());
      html = html.replace(/{{promptQuality\.breakdown\.fair}}/g, (data.promptQuality.breakdown?.fair || 0).toString());
      html = html.replace(/{{promptQuality\.breakdown\.poor}}/g, (data.promptQuality.breakdown?.poor || 0).toString());
    } else {
      // Default values when promptQuality is not provided
      html = html.replace(/{{promptQuality\.averageScore}}/g, '0');
      html = html.replace(/{{promptQuality\.breakdown\.excellent}}/g, '0');
      html = html.replace(/{{promptQuality\.breakdown\.good}}/g, '0');
      html = html.replace(/{{promptQuality\.breakdown\.fair}}/g, '0');
      html = html.replace(/{{promptQuality\.breakdown\.poor}}/g, '0');
    }
    html = html.replace(/{{promptQuality\.methodology}}/g, data.promptQuality?.methodology || '');
    html = html.replace(/{{promptQuality\.insights}}/g, data.promptQuality?.insights || '');

    // Replace report generation stats
    html = html.replace(/{{reportGeneration\.duration}}/g, data.reportGeneration.duration);
    html = html.replace(/{{reportGeneration\.apiTime}}/g, data.reportGeneration.apiTime);
    html = html.replace(/{{reportGeneration\.turns}}/g, data.reportGeneration.turns.toString());
    html = html.replace(/{{reportGeneration\.estimatedCost}}/g, data.reportGeneration.estimatedCost.toFixed(2));

    // Handle optional sections (timeline and recommendations)
    // For now, remove these placeholders if not implemented
    html = html.replace('{{timeline}}', '');
    html = html.replace('{{recommendations}}', '');

    return html;
  }
}