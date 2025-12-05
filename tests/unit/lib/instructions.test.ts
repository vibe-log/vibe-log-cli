import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises');
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('instructions', () => {
  const mockFs = vi.mocked(fs);

  // Need to import after mocks are set up
  let instructions: typeof import('../../../src/lib/instructions');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Import fresh module after mocks
    instructions = await import('../../../src/lib/instructions');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstructionsPath', () => {
    it('should return path ending with instructions.md in .vibe-log dir', () => {
      const result = instructions.getInstructionsPath();
      expect(result).toContain('.vibe-log');
      expect(result).toMatch(/instructions\.md$/);
    });
  });

  describe('getInstructionsDir', () => {
    it('should return path ending with .vibe-log', () => {
      const result = instructions.getInstructionsDir();
      expect(result).toMatch(/\.vibe-log$/);
    });
  });

  describe('instructionsFileExists', () => {
    it('should return true when file exists', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const result = await instructions.instructionsFileExists();

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalled();
    });

    it('should return false when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await instructions.instructionsFileExists();

      expect(result).toBe(false);
    });
  });

  describe('readInstructions', () => {
    it('should return file content when file exists', async () => {
      const mockContent = 'My custom instructions';
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(mockContent);

      const result = await instructions.readInstructions();

      expect(result).toBe(mockContent);
      // Check readFile was called with a path containing the expected components
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('instructions.md'),
        'utf-8'
      );
    });

    it('should return null when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await instructions.readInstructions();

      expect(result).toBeNull();
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    it('should return null on read error', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await instructions.readInstructions();

      expect(result).toBeNull();
    });
  });

  describe('writeInstructions', () => {
    it('should create directory and write file', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await instructions.writeInstructions('New content');

      // Verify mkdir called with .vibe-log directory
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.vibe-log'),
        { recursive: true }
      );
      // Verify writeFile called with instructions.md path
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('instructions.md'),
        'New content',
        'utf-8'
      );
    });

    it('should throw error on write failure', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      await expect(instructions.writeInstructions('content')).rejects.toThrow('Failed to save instructions');
    });
  });

  describe('createDefaultInstructions', () => {
    it('should create file with default template when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await instructions.createDefaultInstructions();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('instructions.md'),
        instructions.DEFAULT_TEMPLATE,
        'utf-8'
      );
    });

    it('should not overwrite existing file', async () => {
      mockFs.access.mockResolvedValue(undefined);

      await instructions.createDefaultInstructions();

      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('deleteInstructions', () => {
    it('should delete file when it exists', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);

      await instructions.deleteInstructions();

      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('instructions.md')
      );
    });

    it('should do nothing when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      await instructions.deleteInstructions();

      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should throw error on delete failure', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.unlink.mockRejectedValue(new Error('Permission denied'));

      await expect(instructions.deleteInstructions()).rejects.toThrow('Failed to delete instructions');
    });
  });

  describe('getInstructionsCharCount', () => {
    it('should return character count when file exists', async () => {
      const mockContent = 'Hello World'; // 11 characters
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(mockContent);

      const result = await instructions.getInstructionsCharCount();

      expect(result).toBe(11);
    });

    it('should return 0 when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await instructions.getInstructionsCharCount();

      expect(result).toBe(0);
    });
  });

  describe('getInstructionsMetadata', () => {
    it('should return metadata when file exists', async () => {
      const mockContent = 'Test content';
      const mockStats = { mtime: new Date('2024-01-15') };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(mockContent);
      mockFs.stat.mockResolvedValue(mockStats as any);

      const result = await instructions.getInstructionsMetadata();

      expect(result).toEqual({
        exists: true,
        characterCount: mockContent.length,
        lastModified: mockStats.mtime,
      });
    });

    it('should return empty metadata when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await instructions.getInstructionsMetadata();

      expect(result).toEqual({
        exists: false,
        characterCount: 0,
      });
    });

    it('should handle stat error gracefully', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockRejectedValue(new Error('Stat failed'));

      const result = await instructions.getInstructionsMetadata();

      expect(result).toEqual({
        exists: false,
        characterCount: 0,
      });
    });
  });

  describe('DEFAULT_TEMPLATE', () => {
    it('should contain expected sections', () => {
      expect(instructions.DEFAULT_TEMPLATE).toContain('My projects:');
      expect(instructions.DEFAULT_TEMPLATE).toContain('What counts as progress:');
      expect(instructions.DEFAULT_TEMPLATE).toContain('What to ignore:');
    });

    it('should be non-empty', () => {
      expect(instructions.DEFAULT_TEMPLATE.length).toBeGreaterThan(100);
    });
  });
});
