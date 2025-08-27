import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractLastAssistantMessage } from '../../../src/lib/session-context-extractor';
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

  describe('extractLastAssistantMessage', () => {
    it('should extract the last assistant message from a session file', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"user","content":"Hello Claude","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"assistant","content":"Hello! How can I help you today?","timestamp":"2025-08-27T00:00:02.000Z"},"timestamp":"2025-08-27T00:00:02.000Z"}
{"message":{"role":"user","content":"What database should I use?","timestamp":"2025-08-27T00:00:03.000Z"},"timestamp":"2025-08-27T00:00:03.000Z"}
{"message":{"role":"assistant","content":"What database should I use - PostgreSQL or MySQL?","timestamp":"2025-08-27T00:00:04.000Z"},"timestamp":"2025-08-27T00:00:04.000Z"}`;

      // Create a new mock instance for this test
      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const result = await extractLastAssistantMessage('/tmp/test.jsonl');
      
      expect(result).toBe('What database should I use - PostgreSQL or MySQL?');
      expect(mockFs.readSessionFile).toHaveBeenCalledWith('/tmp/test.jsonl');
    });

    it('should handle assistant messages with array content', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"assistant","content":[{"type":"text","text":"First message"}],"timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"assistant","content":[{"type":"text","text":"What's your preference?"}, {"type":"text","text":" PostgreSQL or MySQL?"}],"timestamp":"2025-08-27T00:00:02.000Z"},"timestamp":"2025-08-27T00:00:02.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const result = await extractLastAssistantMessage('/tmp/test.jsonl');
      
      expect(result).toBe('What\'s your preference?\n PostgreSQL or MySQL?');
    });

    it('should return null when no assistant messages are found', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
{"message":{"role":"user","content":"Hello","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{"message":{"role":"user","content":"Is anyone there?","timestamp":"2025-08-27T00:00:02.000Z"},"timestamp":"2025-08-27T00:00:02.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const result = await extractLastAssistantMessage('/tmp/test.jsonl');
      
      expect(result).toBeNull();
    });

    it('should handle file read errors gracefully', async () => {
      const mockFs = {
        readSessionFile: vi.fn().mockRejectedValue(new Error('File not found'))
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const result = await extractLastAssistantMessage('/nonexistent/file.jsonl');
      
      expect(result).toBeNull();
    });

    it('should skip invalid JSON lines', async () => {
      const sessionContent = `{"sessionId":"test-123","cwd":"/Users/test/project","timestamp":"2025-08-27T00:00:00.000Z"}
INVALID JSON LINE
{"message":{"role":"assistant","content":"Valid message","timestamp":"2025-08-27T00:00:01.000Z"},"timestamp":"2025-08-27T00:00:01.000Z"}
{incomplete json
{"message":{"role":"assistant","content":"Last valid message","timestamp":"2025-08-27T00:00:02.000Z"},"timestamp":"2025-08-27T00:00:02.000Z"}`;

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue(sessionContent)
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      const result = await extractLastAssistantMessage('/tmp/test.jsonl');
      
      expect(result).toBe('Last valid message');
    });

    it('should handle home directory expansion', async () => {
      const originalHome = process.env.HOME;
      process.env.HOME = '/Users/testuser';

      const mockFs = {
        readSessionFile: vi.fn().mockResolvedValue('{"message":{"role":"assistant","content":"Test"},"timestamp":"2025-08-27T00:00:00.000Z"}')
      };
      vi.mocked(ClaudeFileSystem).mockImplementation(() => mockFs as any);

      await extractLastAssistantMessage('~/.claude/test.jsonl');
      
      expect(mockFs.readSessionFile).toHaveBeenCalledWith('/Users/testuser/.claude/test.jsonl');

      // Restore original HOME
      process.env.HOME = originalHome;
    });
  });
});