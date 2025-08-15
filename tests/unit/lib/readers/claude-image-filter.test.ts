import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readClaudeSessions } from '../../../../src/lib/readers/claude';
import { filterImageContent, containsImages, countImages } from '../../../../src/lib/readers/image-filter';
import { setupTestEnv, cleanupTestEnv } from '../../../test-utils';
import { claudeSessionFixtures } from '../../../fixtures/claude-sessions';

// Mock modules
vi.mock('fs/promises');
vi.mock('os');

describe('Claude Image Filter', () => {
  const mockHomedir = '/test/home';
  const claudePath = path.join(mockHomedir, '.claude', 'projects');

  beforeEach(() => {
    setupTestEnv();
    vi.mocked(os.homedir).mockReturnValue(mockHomedir);
  });

  afterEach(() => {
    cleanupTestEnv();
  });

  describe('filterImageContent', () => {
    it('should return string content unchanged', () => {
      const content = 'This is a regular text message';
      expect(filterImageContent(content)).toBe(content);
    });

    it('should handle null and undefined content', () => {
      expect(filterImageContent(null)).toBe('');
      expect(filterImageContent(undefined)).toBe('');
    });

    it('should filter single image from structured content', () => {
      const content = [
        { type: 'text', text: "Here's a screenshot of the error" },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'base64data...' } }
      ];
      
      const result = filterImageContent(content);
      expect(result).toBe("Here's a screenshot of the error [1 image attachment]");
      expect(result).not.toContain('base64');
    });

    it('should filter multiple images from structured content', () => {
      const content = [
        { type: 'text', text: 'Check these mockups' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'base64data1...' } },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'base64data2...' } },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'base64data3...' } }
      ];
      
      const result = filterImageContent(content);
      expect(result).toBe('Check these mockups [3 image attachments]');
      expect(result).not.toContain('base64');
    });

    it('should handle mixed content with text before and after images', () => {
      const content = [
        { type: 'text', text: 'The error happens here' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'base64data...' } },
        { type: 'text', text: 'and also in this function' }
      ];
      
      const result = filterImageContent(content);
      expect(result).toBe('The error happens here and also in this function [1 image attachment]');
    });

    it('should handle content with only images', () => {
      const content = [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'base64data...' } }
      ];
      
      const result = filterImageContent(content);
      expect(result).toBe('[1 image attachment]');
    });

    it('should handle assistant structured response arrays', () => {
      const content = [
        { type: 'text', text: "Yes, here's the solution" }
      ];
      
      const result = filterImageContent(content);
      expect(result).toBe("Yes, here's the solution");
    });

    it('should handle plain string arrays', () => {
      const content = ['First part', 'Second part', 'Third part'];
      
      const result = filterImageContent(content);
      expect(result).toBe('First part Second part Third part');
    });

    it('should handle single image object', () => {
      const content = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'base64data...' } };
      
      const result = filterImageContent(content);
      expect(result).toBe('[1 image attachment]');
    });

    it('should handle single text object', () => {
      const content = { type: 'text', text: 'Just some text' };
      
      const result = filterImageContent(content);
      expect(result).toBe('Just some text');
    });

    it('should stringify unknown object types', () => {
      const content = { unknown: 'field', data: 'value' };
      
      const result = filterImageContent(content);
      expect(result).toBe(JSON.stringify(content));
    });
  });

  describe('containsImages', () => {
    it('should return false for string content', () => {
      expect(containsImages('Regular text')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(containsImages(null)).toBe(false);
      expect(containsImages(undefined)).toBe(false);
    });

    it('should return true for array with images', () => {
      const content = [
        { type: 'text', text: 'Text' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'data' } }
      ];
      expect(containsImages(content)).toBe(true);
    });

    it('should return false for array without images', () => {
      const content = [
        { type: 'text', text: 'Text 1' },
        { type: 'text', text: 'Text 2' }
      ];
      expect(containsImages(content)).toBe(false);
    });

    it('should return true for single image object', () => {
      const content = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'data' } };
      expect(containsImages(content)).toBe(true);
    });
  });

  describe('countImages', () => {
    it('should return 0 for string content', () => {
      expect(countImages('Regular text')).toBe(0);
    });

    it('should return 0 for null or undefined', () => {
      expect(countImages(null)).toBe(0);
      expect(countImages(undefined)).toBe(0);
    });

    it('should count images in array', () => {
      const content = [
        { type: 'text', text: 'Text' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'data1' } },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'data2' } },
        { type: 'text', text: 'More text' },
        { type: 'image', source: { type: 'base64', media_type: 'image/gif', data: 'data3' } }
      ];
      expect(countImages(content)).toBe(3);
    });

    it('should return 1 for single image object', () => {
      const content = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'data' } };
      expect(countImages(content)).toBe(1);
    });

    it('should return 0 for non-image object', () => {
      const content = { type: 'text', text: 'Just text' };
      expect(countImages(content)).toBe(0);
    });
  });

  describe('Integration with readClaudeSessions', () => {
    it('should filter images when reading sessions with single image', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['project-with-images'] as any)
        .mockResolvedValueOnce(['image-session.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValueOnce(claudeSessionFixtures.sessionWithSingleImage);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].messages).toHaveLength(2);
      
      // Check that the user message has been filtered
      const userMessage = sessions[0].messages[0];
      expect(userMessage.content).toBe("Here's a screenshot of the error [1 image attachment]");
      expect(userMessage.content).not.toContain('base64');
      expect(userMessage.content).not.toContain('iVBORw0KGgo');
    });

    it('should filter multiple images from sessions', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['design-project'] as any)
        .mockResolvedValueOnce(['multi-image.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValueOnce(claudeSessionFixtures.sessionWithMultipleImages);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      const userMessage = sessions[0].messages[0];
      expect(userMessage.content).toBe('Check these mockups [3 image attachments]');
      expect(userMessage.content).not.toContain('base64');
    });

    it('should handle mixed content correctly', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['debug-project'] as any)
        .mockResolvedValueOnce(['mixed.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValueOnce(claudeSessionFixtures.sessionWithMixedContent);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].messages).toHaveLength(4);
      
      // Check first user message with mixed content
      const firstUserMessage = sessions[0].messages[0];
      expect(firstUserMessage.content).toBe('The error happens here and also in this function [1 image attachment]');
      
      // Check regular text message
      const secondUserMessage = sessions[0].messages[2];
      expect(secondUserMessage.content).toBe('Can you fix it?');
      
      // Check assistant array response
      const assistantArrayMessage = sessions[0].messages[3];
      expect(assistantArrayMessage.content).toBe("Yes, here's the solution");
    });

    it('should not affect sessions without images', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['regular-project'] as any)
        .mockResolvedValueOnce(['regular.jsonl'] as any);
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readFile).mockResolvedValueOnce(claudeSessionFixtures.validSessionFile);
      
      const sessions = await readClaudeSessions();
      
      expect(sessions).toHaveLength(1);
      
      // Verify all messages are unchanged
      expect(sessions[0].messages[0].content).toBe('Create a React component');
      expect(sessions[0].messages[1].content).toBe("I'll create a React component for you");
      expect(sessions[0].messages[2].content).toBe('Add props to the component');
      expect(sessions[0].messages[3].content).toBe("I'll add props to the component");
    });
  });

  describe('Performance', () => {
    it('should handle large base64 data efficiently', () => {
      const largeBase64 = 'A'.repeat(500000); // 500KB of data
      const content = [
        { type: 'text', text: 'Analyze this data' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: largeBase64 } }
      ];
      
      const startTime = performance.now();
      const result = filterImageContent(content);
      const endTime = performance.now();
      
      expect(result).toBe('Analyze this data [1 image attachment]');
      expect(result.length).toBeLessThan(100); // Result should be small
      expect(endTime - startTime).toBeLessThan(10); // Should process in less than 10ms
    });

    it('should handle many images efficiently', () => {
      const manyImages = [];
      for (let i = 0; i < 100; i++) {
        if (i === 0) {
          manyImages.push({ type: 'text', text: 'Many images' });
        }
        manyImages.push({ 
          type: 'image', 
          source: { type: 'base64', media_type: 'image/png', data: 'base64data...' } 
        });
      }
      
      const startTime = performance.now();
      const result = filterImageContent(manyImages);
      const endTime = performance.now();
      
      expect(result).toBe('Many images [100 image attachments]');
      expect(endTime - startTime).toBeLessThan(5); // Should process quickly
    });
  });
});