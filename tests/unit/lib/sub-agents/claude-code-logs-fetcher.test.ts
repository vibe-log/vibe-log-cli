import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { 
  checkInstalledSubAgents, 
  installSubAgent, 
  getSubAgentPath,
  getSubAgentsDirectory 
} from '../../../../src/lib/sub-agents/manager';
import { SUB_AGENT_TEMPLATES } from '../../../../src/lib/sub-agents/templates';

vi.mock('fs/promises');
vi.mock('os');

describe.skip('vibe-log-claude-code-logs-fetcher sub-agent', () => {
  const mockHomeDir = '/home/testuser';
  const subAgentName = 'vibe-log-claude-code-logs-fetcher.md';
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('Sub-agent Template', () => {
    it('should have a template defined', () => {
      expect(SUB_AGENT_TEMPLATES[subAgentName]).toBeDefined();
      expect(typeof SUB_AGENT_TEMPLATES[subAgentName]).toBe('string');
    });
    
    it('should include essential documentation sections', () => {
      const template = SUB_AGENT_TEMPLATES[subAgentName];
      
      // Check for key sections
      expect(template).toContain('# vibe-log-claude-code-logs-fetcher');
      expect(template).toContain('## Purpose');
      expect(template).toContain('## Instructions');
      expect(template).toContain('## Directory Name Handling');
      expect(template).toContain('## Session File Structure');
      expect(template).toContain('## Data Extraction Features');
      expect(template).toContain('## Filtering Capabilities');
      expect(template).toContain('## Output Format');
      expect(template).toContain('## Error Handling');
      expect(template).toContain('## Performance Optimizations');
      expect(template).toContain('## Security Considerations');
    });
    
    it('should document Claude Code directory naming conventions', () => {
      const template = SUB_AGENT_TEMPLATES[subAgentName];
      
      // Check for specific examples
      // Note: These tests check for generic examples in the template
      expect(template).toContain('compound project names');
      expect(template).toContain('vibe-log, vibelog-cli');
      expect(template).toContain('canvas-genie');
    });
    
    it('should describe session file parsing details', () => {
      const template = SUB_AGENT_TEMPLATES[subAgentName];
      
      // Check for JSONL parsing info
      expect(template).toContain('.jsonl files');
      expect(template).toContain('sessionId, cwd, timestamp');
      expect(template).toContain('User and assistant messages');
      expect(template).toContain('Tool use results');
    });
    
    it('should include security and privacy considerations', () => {
      const template = SUB_AGENT_TEMPLATES[subAgentName];
      
      expect(template).toContain('Never expose raw file paths');
      expect(template).toContain('Sanitize sensitive information');
      expect(template).toContain('Respect user privacy');
      expect(template).toContain('data isolation between projects');
    });
  });
  
  describe('Sub-agent Installation', () => {
    it('should install to the correct directory', async () => {
      const expectedPath = path.join(mockHomeDir, '.claude', 'agents', subAgentName);
      
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      
      await installSubAgent(subAgentName as any);
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        expect.stringContaining('vibe-log-claude-code-logs-fetcher'),
        'utf-8'
      );
    });
    
    it('should be included in installed agents check', async () => {
      const agentsDir = path.join(mockHomeDir, '.claude', 'agents');
      
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        'vibe-log-track-analyzer.md',
        'vibe-log-claude-code-logs-fetcher.md'
      ] as any);
      
      const status = await checkInstalledSubAgents();
      
      expect(status.installed).toContain(subAgentName);
      expect(status.missing).not.toContain(subAgentName);
    });
    
    it('should be detected as missing when not installed', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        'vibe-log-track-analyzer.md'
      ] as any);
      
      const status = await checkInstalledSubAgents();
      
      expect(status.missing).toContain(subAgentName);
      expect(status.installed).not.toContain(subAgentName);
    });
  });
  
  describe('Sub-agent Path Resolution', () => {
    it('should return correct path for the sub-agent', () => {
      const expectedPath = path.join(mockHomeDir, '.claude', 'agents', subAgentName);
      const actualPath = getSubAgentPath(subAgentName as any);
      
      expect(actualPath).toBe(expectedPath);
    });
    
    it('should use consistent directory structure', () => {
      const agentsDir = getSubAgentsDirectory();
      const expectedDir = path.join(mockHomeDir, '.claude', 'agents');
      
      expect(agentsDir).toBe(expectedDir);
    });
  });
  
  describe('Template Content Validation', () => {
    it.skip('should handle directory name decoding examples correctly', () => {
      // NOTE: This test is skipped because the vibe-log-claude-code-logs-fetcher
      // sub-agent doesn't exist in the current templates.
      // Keeping for reference if the sub-agent is added in the future.
      const template = SUB_AGENT_TEMPLATES[subAgentName];
      
      // Validate the examples match our actual parsing logic
      const examples = [
        { encoded: '-Users-testuser-dev-personal-vibe-log', project: 'vibe-log' },
        { encoded: '-Users-testuser-dev-personal-canvas-genie', project: 'canvas-genie' },
      ];
      
      examples.forEach(({ encoded, project }) => {
        expect(template).toContain(encoded);
        expect(template).toContain(project);
      });
    });
    
    it('should document all key features from the CLI implementation', () => {
      const template = SUB_AGENT_TEMPLATES[subAgentName];
      
      // Features from the actual implementation
      const features = [
        'URL-safe encoded',
        '30-day window',
        'Session duration calculation',
        'File edit tracking',
        'Language detection',
        'Message filtering',
        'Active project detection',
      ];
      
      features.forEach(feature => {
        expect(template.toLowerCase()).toContain(feature.toLowerCase());
      });
    });
    
    it('should provide comprehensive error handling guidance', () => {
      const template = SUB_AGENT_TEMPLATES[subAgentName];
      
      const errorScenarios = [
        'missing Claude Code installation',
        'corrupted or incomplete session files',
        'JSON parsing with fallback',
        'partial data when complete extraction fails',
      ];
      
      errorScenarios.forEach(scenario => {
        expect(template.toLowerCase()).toContain(scenario.toLowerCase());
      });
    });
  });
});