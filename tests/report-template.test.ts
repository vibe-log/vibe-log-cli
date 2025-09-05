import { describe, it, expect, beforeAll } from 'vitest';
import { ReportTemplateEngine } from '../src/lib/report-template-engine';
import { existsSync } from 'fs';
import { join } from 'path';

describe('ReportTemplateEngine', () => {
  describe('Template Loading', () => {
    it('should load template successfully in development', async () => {
      const engine = new ReportTemplateEngine();
      
      // This should not throw
      await expect(engine.loadTemplate()).resolves.not.toThrow();
    });

    it('should find template in expected locations', () => {
      // Check that template exists in source for development
      const devTemplatePath = join(process.cwd(), 'src', 'templates', 'report-template.html');
      expect(existsSync(devTemplatePath)).toBe(true);
    });

    it('should have template copied to dist after build', () => {
      // This test runs after build, so dist should exist
      const distTemplatePath = join(process.cwd(), 'dist', 'report-template.html');
      
      // Check if we're in a built environment
      if (existsSync(join(process.cwd(), 'dist'))) {
        expect(existsSync(distTemplatePath)).toBe(true);
      }
    });

    it('should generate report with sample data', async () => {
      const engine = new ReportTemplateEngine();
      await engine.loadTemplate();

      const sampleData = {
        metadata: {
          dateRange: 'Dec 1 - Dec 31, 2024',
          totalSessions: 25,
          dataProcessed: '45 coding sessions',
          activeDevelopment: '112.5 hours',
          projects: 5,
          generatedAt: new Date().toISOString()
        },
        executiveSummary: [
          'Completed 25 sessions',
          'Worked on 5 projects',
          'High productivity'
        ],
        sessions: [],
        activityDistribution: {
          'Feature Development': 40,
          'Debugging': 25,
          'Refactoring': 20,
          'Planning': 15
        },
        keyAccomplishments: [
          'Shipped feature X',
          'Fixed critical bug Y',
          'Improved performance by 50%'
        ],
        projectBreakdown: [
          {
            name: 'Project A',
            sessions: 10,
            largestSession: '4.5h',
            focus: 'Feature development and bug fixes'
          }
        ],
        promptQuality: {
          averageScore: 85,
          breakdown: {
            excellent: 10,
            good: 12,
            fair: 2,
            poor: 1
          },
          methodology: 'Analyzed using Claude-3 quality metrics',
          insights: 'Strong technical prompts with clear context'
        },
        reportGeneration: {
          duration: '10s',
          apiTime: '8s',
          turns: 1,
          estimatedCost: 0.05,
          sessionId: 'test-session'
        }
      };

      const html = engine.generateReport(sampleData as any);
      
      // Verify the HTML contains expected content
      expect(html).toContain('Dec 1 - Dec 31, 2024');
      expect(html).toContain('25');
      expect(html).toContain('45 coding sessions');
      expect(html).toContain('Completed 25 sessions');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when generateReport is called without loading template', () => {
      const engine = new ReportTemplateEngine();
      
      // Try to generate report without loading template first
      expect(() => {
        engine.generateReport({} as any);
      }).toThrow('Template not loaded');
    });
  });
});