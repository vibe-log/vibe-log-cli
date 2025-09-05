import { describe, it, expect } from 'vitest';
import { ReportTemplateEngine } from '../src/lib/report-template-engine';
import { existsSync } from 'fs';
import { join } from 'path';

describe('ReportTemplateEngine - Critical Tests', () => {
  describe('Template File Discovery', () => {
    it('CRITICAL: Template file must exist in source for development', () => {
      const devTemplatePath = join(process.cwd(), 'src', 'templates', 'report-template.html');
      expect(existsSync(devTemplatePath)).toBe(true);
    });

    it('CRITICAL: Template file must be copied to dist after build', () => {
      const distDir = join(process.cwd(), 'dist');
      // Only check if dist exists (means we're testing after build)
      if (existsSync(distDir)) {
        const distTemplatePath = join(distDir, 'report-template.html');
        expect(existsSync(distTemplatePath)).toBe(true);
      } else {
        // Skip this test if dist doesn't exist yet
        console.log('Skipping dist check - no build directory found');
      }
    });

    it('CRITICAL: Engine must successfully load template', async () => {
      const engine = new ReportTemplateEngine();
      
      // This is the most critical test - the template MUST load
      await expect(engine.loadTemplate()).resolves.not.toThrow();
    });

    it('CRITICAL: Template must be loadable and contain HTML structure', async () => {
      const engine = new ReportTemplateEngine();
      
      // The most critical test - can we load the template at all?
      await engine.loadTemplate();
      
      // Verify the template was actually loaded by checking internal state
      // We're not testing full rendering here, just that the template exists
      expect((engine as any).template).toBeDefined();
      expect((engine as any).template.length).toBeGreaterThan(100);
      expect((engine as any).template).toContain('<!DOCTYPE html>');
    });
  });
});