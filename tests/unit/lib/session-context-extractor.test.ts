import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractConversationContext } from '../../../src/lib/session-context-extractor';
import { ClaudeFileSystem } from '../../../src/lib/claude-fs';

// Mock the logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock ClaudeFileSystem
vi.mock('../../../src/lib/claude-fs', () => {
  return {
    ClaudeFileSystem: vi.fn(() => ({
      readSessionFile: vi.fn()
    }))
  };
});

describe('Session Context Extractor', () => {
  let mockReadSessionFile: ReturnType<typeof vi.fn>;
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Get the mocked readSessionFile method
    mockReadSessionFile = vi.mocked(ClaudeFileSystem).mock.results[0]?.value?.readSessionFile || vi.fn();
  });

  describe('extractConversationContext', () => {
    it('should extract multiple conversation turns from a session file', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"user","content":"Hello Claude","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"assistant","content":"Hello! How can I help you today?","timestamp":"2025-08-27T00:00:02.000Z"},"timestamp":"2025-08-27T00:00:02.000Z"}
{"message":{"role":"user","content":"What database should I use?","timestamp":"2025-08-27T00:00:03.000Z"},"timestamp":"2025-08-27T00:00:03.000Z"}
{"message":{"role":"assistant","content":"What are your requirements? PostgreSQL or MySQL?","timestamp":"2025-08-27T00:00:04.000Z"},"timestamp":"2025-08-27T00:00:04.000Z"}
{"message":{"role":"user","content":"I need ACID compliance","timestamp":"2025-08-27T00:00:05.000Z"},"timestamp":"2025-08-27T00:00:05.000Z"}
{"message":{"role":"assistant","content":"Both support ACID. PostgreSQL has more advanced features.","timestamp":"2025-08-27T00:00:06.000Z"},"timestamp":"2025-08-27T00:00:06.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const result = await extractConversationContext('/tmp/test.jsonl', 3);
      
      // Should include the original mission (first user message)
      expect(result).toContain('ORIGINAL MISSION: Hello Claude');
      
      // Should include recent context
      expect(result).toContain('RECENT CONTEXT:');
      expect(result).toContain('Previous User: What database should I use?');
      expect(result).toContain('Previous Assistant: What are your requirements? PostgreSQL or MySQL?');
      expect(result).toContain('Previous User: I need ACID compliance');
      expect(result).toContain('Previous Assistant: Both support ACID. PostgreSQL has more advanced features.');
    });

    it('should limit the number of conversation turns', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"user","content":"Message 1","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"assistant","content":"Reply 1","timestamp":"2025-08-27T00:00:02.000Z"},"timestamp":"2025-08-27T00:00:02.000Z"}
{"message":{"role":"user","content":"Message 2","timestamp":"2025-08-27T00:00:03.000Z"},"timestamp":"2025-08-27T00:00:03.000Z"}
{"message":{"role":"assistant","content":"Reply 2","timestamp":"2025-08-27T00:00:04.000Z"},"timestamp":"2025-08-27T00:00:04.000Z"}
{"message":{"role":"user","content":"Message 3","timestamp":"2025-08-27T00:00:05.000Z"},"timestamp":"2025-08-27T00:00:05.000Z"}
{"message":{"role":"assistant","content":"Reply 3","timestamp":"2025-08-27T00:00:06.000Z"},"timestamp":"2025-08-27T00:00:06.000Z"}
{"message":{"role":"user","content":"Message 4","timestamp":"2025-08-27T00:00:07.000Z"},"timestamp":"2025-08-27T00:00:07.000Z"}
{"message":{"role":"assistant","content":"Reply 4","timestamp":"2025-08-27T00:00:08.000Z"},"timestamp":"2025-08-27T00:00:08.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const result = await extractConversationContext('/tmp/test.jsonl', 2);
      
      // Should include the original mission (first user message)
      expect(result).toContain('ORIGINAL MISSION: Message 1');
      
      // Should include last 2 turns (messages 3-4 and replies 3-4)
      expect(result).toContain('Message 3');
      expect(result).toContain('Reply 3');
      expect(result).toContain('Message 4');
      expect(result).toContain('Reply 4');
      
      // Should NOT include Message 2 in recent context (but Message 1 is in ORIGINAL MISSION)
      expect(result).not.toContain('Message 2');
    });

    it('should skip meta messages and commands', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"user","content":"Real message 1","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"user","content":"Caveat: The messages below were generated","timestamp":"2025-08-27T00:00:02.000Z"},"isMeta":true,"timestamp":"2025-08-27T00:00:02.000Z"}
{"message":{"role":"user","content":"<command-name>/clear</command-name>","timestamp":"2025-08-27T00:00:03.000Z"},"timestamp":"2025-08-27T00:00:03.000Z"}
{"message":{"role":"assistant","content":"Real reply 1","timestamp":"2025-08-27T00:00:04.000Z"},"timestamp":"2025-08-27T00:00:04.000Z"}
{"message":{"role":"user","content":"Real message 2","timestamp":"2025-08-27T00:00:05.000Z"},"timestamp":"2025-08-27T00:00:05.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const result = await extractConversationContext('/tmp/test.jsonl', 3);
      
      // Should include original mission
      expect(result).toContain('ORIGINAL MISSION: Real message 1');
      
      // Should include recent real messages
      expect(result).toContain('Real reply 1');
      expect(result).toContain('Real message 2');
      
      // Should NOT include meta or command messages
      expect(result).not.toContain('Caveat');
      expect(result).not.toContain('command-name');
    });

    it('should handle array content in messages', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"assistant","content":[{"type":"text","text":"Part 1"},{"type":"text","text":" Part 2"}],"timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"user","content":[{"type":"text","text":"User response"}],"timestamp":"2025-08-27T00:00:02.000Z"},"timestamp":"2025-08-27T00:00:02.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const result = await extractConversationContext('/tmp/test.jsonl', 2);
      
      expect(result).toContain('Part 1\n Part 2');
      expect(result).toContain('User response');
    });

    it('should return null when no valid messages are found', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"user","content":"<command-name>/clear</command-name>"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"user","content":"Caveat: The messages below were generated"},"isMeta":true,"timestamp":"2025-08-27T00:00:02.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const result = await extractConversationContext('/tmp/test.jsonl', 3);
      
      expect(result).toBeNull();
    });
  });

  describe('extractSessionMetadata', () => {
    it('should extract metadata for first prompt in session', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      // Import the function
      const { extractSessionMetadata } = await import('../../../src/lib/session-context-extractor');

      const result = await extractSessionMetadata('/tmp/test.jsonl', 'My first question');

      expect(result.isFirstPrompt).toBe(true);
      expect(result.messageNumber).toBe(1);
      expect(result.totalMessages).toBe(0);
      expect(result.hasImages).toBe(false);
      expect(result.imageCount).toBe(0);
      expect(result.lastAssistantEndsWithQuestion).toBe(false);
    });

    it('should count messages correctly in ongoing conversation', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"user","content":"First question","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"assistant","content":"First answer","timestamp":"2025-08-27T00:00:02.000Z"},"timestamp":"2025-08-27T00:00:02.000Z"}
{"message":{"role":"user","content":"Second question","timestamp":"2025-08-27T00:00:03.000Z"},"timestamp":"2025-08-27T00:00:03.000Z"}
{"message":{"role":"assistant","content":"Second answer","timestamp":"2025-08-27T00:00:04.000Z"},"timestamp":"2025-08-27T00:00:04.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const { extractSessionMetadata } = await import('../../../src/lib/session-context-extractor');

      const result = await extractSessionMetadata('/tmp/test.jsonl', 'Third question');

      expect(result.isFirstPrompt).toBe(false);
      expect(result.messageNumber).toBe(3);
      expect(result.totalMessages).toBe(4);
    });

    it('should detect when last assistant message ends with question', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"user","content":"Help me","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"assistant","content":"Sure! What would you like me to do?","timestamp":"2025-08-27T00:00:02.000Z"},"timestamp":"2025-08-27T00:00:02.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const { extractSessionMetadata } = await import('../../../src/lib/session-context-extractor');

      const result = await extractSessionMetadata('/tmp/test.jsonl', 'Next prompt');

      expect(result.lastAssistantEndsWithQuestion).toBe(true);
    });

    it('should detect images in current prompt', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const { extractSessionMetadata } = await import('../../../src/lib/session-context-extractor');

      const result = await extractSessionMetadata('/tmp/test.jsonl', '[2 image attachments] See the image above');

      expect(result.hasImages).toBe(true);
      expect(result.imageCount).toBe(2);
    });

    it('should detect single image indicator', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const { extractSessionMetadata } = await import('../../../src/lib/session-context-extractor');

      const result = await extractSessionMetadata('/tmp/test.jsonl', 'As shown in the screenshot');

      expect(result.hasImages).toBe(true);
      expect(result.imageCount).toBe(1);
    });

    it('should count truncated messages', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"assistant","content":"This is a very long message that was truncated... ${'x'.repeat(400)}","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const { extractSessionMetadata } = await import('../../../src/lib/session-context-extractor');

      const result = await extractSessionMetadata('/tmp/test.jsonl', 'Next prompt');

      expect(result.truncatedMessages).toBeGreaterThan(0);
    });

    it('should skip meta messages when counting', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"user","content":"Real message 1","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"user","content":"Meta message","timestamp":"2025-08-27T00:00:02.000Z"},"isMeta":true,"timestamp":"2025-08-27T00:00:02.000Z"}
{"message":{"role":"assistant","content":"Real reply","timestamp":"2025-08-27T00:00:03.000Z"},"timestamp":"2025-08-27T00:00:03.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const { extractSessionMetadata } = await import('../../../src/lib/session-context-extractor');

      const result = await extractSessionMetadata('/tmp/test.jsonl', 'Next');

      // Should only count real messages (1 user + 1 assistant = 2 total)
      expect(result.totalMessages).toBe(2);
      expect(result.messageNumber).toBe(2);
    });

    it('should handle array content in assistant messages', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"assistant","content":[{"type":"text","text":"Do you want option A or option B?"}],"timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const { extractSessionMetadata } = await import('../../../src/lib/session-context-extractor');

      const result = await extractSessionMetadata('/tmp/test.jsonl', 'Next');

      expect(result.lastAssistantEndsWithQuestion).toBe(true);
    });

    it('should return default metadata on error', async () => {
      const mockFs = {
        readSessionFile: vi.fn().mockRejectedValue(new Error('File not found'))
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const { extractSessionMetadata } = await import('../../../src/lib/session-context-extractor');

      const result = await extractSessionMetadata('/tmp/nonexistent.jsonl', 'Test');

      // Should return default metadata
      expect(result.isFirstPrompt).toBe(true);
      expect(result.messageNumber).toBe(1);
      expect(result.totalMessages).toBe(0);
    });

    it('should handle malformed JSON lines gracefully', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"user","content":"Valid message","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{invalid json here}
{"message":{"role":"assistant","content":"Valid reply","timestamp":"2025-08-27T00:00:02.000Z"},"timestamp":"2025-08-27T00:00:02.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const { extractSessionMetadata } = await import('../../../src/lib/session-context-extractor');

      const result = await extractSessionMetadata('/tmp/test.jsonl', 'Next');

      // Should still count valid messages
      expect(result.totalMessages).toBe(2);
    });
  });
});