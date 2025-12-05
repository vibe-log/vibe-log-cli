import { describe, it, expect } from 'vitest';
import { buildOrchestratedPrompt } from '../../../../src/lib/prompts/orchestrator';
import { PromptContext } from '../../../../src/types/prompts';

describe('buildOrchestratedPrompt', () => {
  const baseContext: PromptContext = {
    timeframe: 'week',
    days: 7,
    projectPaths: ['/path/to/project'],
    projectNames: ['my-project'],
  };

  describe('custom instructions integration', () => {
    it('should include custom instructions in systemPrompt when provided', () => {
      const context: PromptContext = {
        ...baseContext,
        customInstructions: 'Focus on TypeScript projects only. Ignore documentation updates.',
      };

      const result = buildOrchestratedPrompt(context);

      expect(result.systemPrompt).toContain('Focus on TypeScript projects only');
      expect(result.systemPrompt).toContain('Ignore documentation updates');
      expect(result.systemPrompt).toContain('CUSTOM INSTRUCTIONS');
    });

    it('should not include custom instructions section when not provided', () => {
      const context: PromptContext = {
        ...baseContext,
        customInstructions: undefined,
      };

      const result = buildOrchestratedPrompt(context);

      expect(result.systemPrompt).not.toContain('CUSTOM INSTRUCTIONS');
    });

    it('should not include custom instructions section when empty string', () => {
      const context: PromptContext = {
        ...baseContext,
        customInstructions: '',
      };

      const result = buildOrchestratedPrompt(context);

      expect(result.systemPrompt).not.toContain('CUSTOM INSTRUCTIONS');
    });

    it('should preserve custom instructions formatting (newlines)', () => {
      const multiLineInstructions = `My projects:
- main-app: Production SaaS
- side-project: Learning

What counts as progress:
- Shipping features`;

      const context: PromptContext = {
        ...baseContext,
        customInstructions: multiLineInstructions,
      };

      const result = buildOrchestratedPrompt(context);

      expect(result.systemPrompt).toContain('main-app: Production SaaS');
      expect(result.systemPrompt).toContain('side-project: Learning');
      expect(result.systemPrompt).toContain('Shipping features');
    });
  });

  describe('basic prompt generation', () => {
    it('should generate valid orchestrated prompt structure', () => {
      const result = buildOrchestratedPrompt(baseContext);

      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('command');
      expect(result).toHaveProperty('description');
    });

    it('should include project names in prompt', () => {
      const result = buildOrchestratedPrompt(baseContext);

      expect(result.prompt).toContain('my-project');
    });

    it('should include timeframe in prompt', () => {
      const context: PromptContext = {
        ...baseContext,
        days: 1,
      };

      const result = buildOrchestratedPrompt(context);

      expect(result.prompt).toContain('last 24 hours');
    });

    it('should include status line info in prompt when provided', () => {
      const context: PromptContext = {
        ...baseContext,
        statusLineInstalled: true,
      };

      const result = buildOrchestratedPrompt(context);

      expect(result.prompt).toContain('STATUS LINE INSTALLED: Yes');
    });

    it('should show status line as No when not installed', () => {
      const context: PromptContext = {
        ...baseContext,
        statusLineInstalled: false,
      };

      const result = buildOrchestratedPrompt(context);

      expect(result.prompt).toContain('STATUS LINE INSTALLED: No');
    });
  });
});
