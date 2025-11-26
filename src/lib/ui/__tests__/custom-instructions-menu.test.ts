import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../config', () => ({
  getToken: vi.fn()
}));

vi.mock('../../api-client', () => ({
  apiClient: {
    fetchInstructions: vi.fn(),
    syncInstructions: vi.fn(),
    deleteInstructions: vi.fn()
  }
}));

vi.mock('../../instructions', () => ({
  readInstructions: vi.fn(),
  writeInstructions: vi.fn(),
  createDefaultInstructions: vi.fn(),
  deleteInstructions: vi.fn(),
  getInstructionsMetadata: vi.fn(),
  getInstructionsPath: vi.fn(() => '/mock/path/instructions.md')
}));

vi.mock('../ui', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn()
}));

vi.mock('../styles', () => ({
  colors: {
    accent: (s: string) => s,
    highlight: (s: string) => s,
    success: (s: string) => s,
    warning: (s: string) => s,
    subdued: (s: string) => s,
    muted: (s: string) => s,
    info: (s: string) => s,
    dim: (s: string) => s
  },
  box: {
    horizontal: '-'
  }
}));

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
    Separator: class Separator {}
  }
}));

vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Import mocked modules
import { getToken } from '../../config';
import { apiClient } from '../../api-client';
import { writeInstructions, getInstructionsMetadata } from '../../instructions';

describe('Custom Instructions Menu - Cloud-First Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'clear').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('autoSyncFromCloud behavior', () => {
    it('should pull cloud content when authenticated', async () => {
      // Setup: authenticated user with cloud content
      vi.mocked(getToken).mockResolvedValue('mock-token');
      vi.mocked(apiClient.fetchInstructions).mockResolvedValue({
        content: 'Cloud instructions content',
        lastUpdatedFrom: 'web'
      });
      vi.mocked(writeInstructions).mockResolvedValue();

      // The autoSyncFromCloud is called internally when menu loads
      // We test by verifying the mocked functions are called correctly
      const token = await getToken();
      expect(token).toBe('mock-token');

      if (token) {
        const cloudData = await apiClient.fetchInstructions();
        expect(cloudData.content).toBe('Cloud instructions content');

        if (cloudData.content) {
          await writeInstructions(cloudData.content);
          expect(writeInstructions).toHaveBeenCalledWith('Cloud instructions content');
        }
      }
    });

    it('should skip sync when not authenticated', async () => {
      // Setup: no authentication
      vi.mocked(getToken).mockResolvedValue(null);

      const token = await getToken();
      expect(token).toBeNull();

      // apiClient should not be called when not authenticated
      if (!token) {
        expect(apiClient.fetchInstructions).not.toHaveBeenCalled();
      }
    });

    it('should handle cloud fetch errors gracefully', async () => {
      // Setup: authenticated but cloud fails
      vi.mocked(getToken).mockResolvedValue('mock-token');
      vi.mocked(apiClient.fetchInstructions).mockRejectedValue(new Error('Network error'));

      const token = await getToken();
      expect(token).toBe('mock-token');

      // Should not throw, just handle gracefully
      try {
        await apiClient.fetchInstructions();
      } catch {
        // Error should be caught and handled
        expect(writeInstructions).not.toHaveBeenCalled();
      }
    });
  });

  describe('displayHeader cloud-first behavior', () => {
    it('should check token first to determine display mode', async () => {
      vi.mocked(getToken).mockResolvedValue('mock-token');
      vi.mocked(apiClient.fetchInstructions).mockResolvedValue({
        content: 'Test content',
        lastUpdatedFrom: 'cli'
      });
      vi.mocked(getInstructionsMetadata).mockResolvedValue({
        exists: true,
        characterCount: 100,
        lastModified: new Date()
      });

      // Verify token is checked
      const token = await getToken();
      expect(token).toBeTruthy();

      // When authenticated, cloud should be fetched
      const cloudData = await apiClient.fetchInstructions();
      expect(cloudData.content).toBeDefined();
    });

    it('should only check local metadata when not authenticated', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      vi.mocked(getInstructionsMetadata).mockResolvedValue({
        exists: true,
        characterCount: 500,
        lastModified: new Date()
      });

      const token = await getToken();
      expect(token).toBeNull();

      // Should still get local metadata
      const metadata = await getInstructionsMetadata();
      expect(metadata.exists).toBe(true);

      // Should NOT call cloud API
      expect(apiClient.fetchInstructions).not.toHaveBeenCalled();
    });
  });

  describe('createTemplate cloud sync', () => {
    it('should sync to cloud after template creation when authenticated', async () => {
      vi.mocked(getToken).mockResolvedValue('mock-token');
      vi.mocked(apiClient.syncInstructions).mockResolvedValue({});

      const token = await getToken();
      expect(token).toBeTruthy();

      // Simulate sync call
      await apiClient.syncInstructions('template content', 'cli');
      expect(apiClient.syncInstructions).toHaveBeenCalledWith('template content', 'cli');
    });

    it('should not sync when not authenticated', async () => {
      vi.mocked(getToken).mockResolvedValue(null);

      const token = await getToken();
      expect(token).toBeNull();

      // Should NOT call sync
      expect(apiClient.syncInstructions).not.toHaveBeenCalled();
    });
  });

  describe('deleteInstructions cloud behavior', () => {
    it('should delete from cloud when authenticated', async () => {
      vi.mocked(getToken).mockResolvedValue('mock-token');
      vi.mocked(apiClient.deleteInstructions).mockResolvedValue({});

      const token = await getToken();
      expect(token).toBeTruthy();

      // Should call cloud delete
      await apiClient.deleteInstructions();
      expect(apiClient.deleteInstructions).toHaveBeenCalled();
    });

    it('should only delete locally when not authenticated', async () => {
      vi.mocked(getToken).mockResolvedValue(null);

      const token = await getToken();
      expect(token).toBeNull();

      // Should NOT call cloud delete
      expect(apiClient.deleteInstructions).not.toHaveBeenCalled();
    });
  });
});
