import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HookLock } from '../../../src/lib/hook-lock';
import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';

// Mock the logger to avoid log output during tests
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('HookLock', () => {
  let lock: HookLock;
  let lockPath: string;

  beforeEach(() => {
    lock = new HookLock();
    lockPath = path.join(homedir(), '.vibe-log', 'hook.lock');
  });

  afterEach(async () => {
    // Clean up any lock files after each test
    try {
      await fs.unlink(lockPath);
    } catch {
      // Lock might not exist, that's ok
    }
  });

  describe('acquire()', () => {
    it('should successfully acquire a lock when no lock exists', async () => {
      const result = await lock.acquire();
      expect(result).toBe(true);

      // Verify lock file was created
      const lockContent = await fs.readFile(lockPath, 'utf-8');
      const lockData = JSON.parse(lockContent);
      expect(lockData.pid).toBe(process.pid);
      expect(lockData.timestamp).toBeDefined();
      expect(lockData.host).toBeDefined();
    });

    it('should fail to acquire lock when valid lock already exists', async () => {
      // First acquisition should succeed
      const firstAcquire = await lock.acquire();
      expect(firstAcquire).toBe(true);

      // Second acquisition should fail (lock is still valid)
      const secondLock = new HookLock();
      const secondAcquire = await secondLock.acquire();
      expect(secondAcquire).toBe(false);
    });

    it('should acquire lock when existing lock is stale (> 60 seconds)', async () => {
      // Create a stale lock (70 seconds old)
      const staleLockData = {
        pid: 99999,
        timestamp: Date.now() - 70000, // 70 seconds ago
        host: 'test-host',
      };

      const lockDir = path.dirname(lockPath);
      await fs.mkdir(lockDir, { recursive: true });
      await fs.writeFile(lockPath, JSON.stringify(staleLockData));

      // Should be able to acquire the lock (stale lock should be replaced)
      const result = await lock.acquire();
      expect(result).toBe(true);

      // Verify lock was updated with current process info
      const lockContent = await fs.readFile(lockPath, 'utf-8');
      const lockData = JSON.parse(lockContent);
      expect(lockData.pid).toBe(process.pid);
      expect(lockData.timestamp).toBeGreaterThan(staleLockData.timestamp);
    });

    it('should create lock directory if it does not exist', async () => {
      // Remove the .vibe-log directory if it exists
      const lockDir = path.dirname(lockPath);
      try {
        await fs.rm(lockDir, { recursive: true });
      } catch {
        // Directory might not exist
      }

      // Should create directory and acquire lock
      const result = await lock.acquire();
      expect(result).toBe(true);

      // Verify directory and lock file were created
      const dirExists = await fs.access(lockDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);

      const lockExists = await fs.access(lockPath).then(() => true).catch(() => false);
      expect(lockExists).toBe(true);
    });

    it('should handle invalid lock file content gracefully', async () => {
      // Create lock file with invalid JSON
      const lockDir = path.dirname(lockPath);
      await fs.mkdir(lockDir, { recursive: true });
      await fs.writeFile(lockPath, 'invalid json content');

      // Should treat invalid lock as non-existent and acquire
      const result = await lock.acquire();
      expect(result).toBe(true);

      // Verify lock was updated with valid content
      const lockContent = await fs.readFile(lockPath, 'utf-8');
      const lockData = JSON.parse(lockContent);
      expect(lockData.pid).toBe(process.pid);
    });

    it('should return false and not throw on file system errors', async () => {
      // Mock fs.mkdir to throw an error
      const originalMkdir = fs.mkdir;
      (fs.mkdir as any) = vi.fn().mockRejectedValue(new Error('Permission denied'));

      const result = await lock.acquire();
      expect(result).toBe(false);

      // Restore original mkdir
      (fs.mkdir as any) = originalMkdir;
    });
  });

  describe('release()', () => {
    it('should successfully release an acquired lock', async () => {
      // Acquire a lock first
      await lock.acquire();
      expect(await fs.access(lockPath).then(() => true).catch(() => false)).toBe(true);

      // Release the lock
      await lock.release();

      // Verify lock file was deleted
      const lockExists = await fs.access(lockPath).then(() => true).catch(() => false);
      expect(lockExists).toBe(false);
    });

    it('should not throw when releasing non-existent lock', async () => {
      // Ensure no lock exists
      try {
        await fs.unlink(lockPath);
      } catch {
        // Lock might not exist
      }

      // Should not throw
      await expect(lock.release()).resolves.toBeUndefined();
    });

    it('should handle file system errors gracefully', async () => {
      // This should not throw even if unlink fails
      await expect(lock.release()).resolves.toBeUndefined();
    });
  });

  describe('forceClear()', () => {
    it('should force clear an existing lock', async () => {
      // Create a lock
      await lock.acquire();
      expect(await fs.access(lockPath).then(() => true).catch(() => false)).toBe(true);

      // Force clear
      await lock.forceClear();

      // Verify lock was removed
      const lockExists = await fs.access(lockPath).then(() => true).catch(() => false);
      expect(lockExists).toBe(false);
    });

    it('should not throw when clearing non-existent lock', async () => {
      // Ensure no lock exists
      try {
        await fs.unlink(lockPath);
      } catch {
        // Lock might not exist
      }

      // Should not throw
      await expect(lock.forceClear()).resolves.toBeUndefined();
    });

    it('should allow acquiring lock after force clear', async () => {
      // Acquire initial lock
      await lock.acquire();

      // Force clear
      await lock.forceClear();

      // Should be able to acquire again
      const result = await lock.acquire();
      expect(result).toBe(true);
    });
  });

  describe('concurrent operations', () => {
    it('should prevent concurrent lock acquisitions', async () => {
      // Acquire first lock
      const lock1 = new HookLock();
      const result1 = await lock1.acquire();
      expect(result1).toBe(true);

      // Try to acquire second lock immediately
      const lock2 = new HookLock();
      const result2 = await lock2.acquire();
      expect(result2).toBe(false);

      // Release first lock
      await lock1.release();

      // Now second lock should be acquirable
      const lock3 = new HookLock();
      const result3 = await lock3.acquire();
      expect(result3).toBe(true);
    });

    it('should handle lock acquisition after release', async () => {
      // Acquire and release
      await lock.acquire();
      await lock.release();

      // Should be able to acquire again
      const newLock = new HookLock();
      const result = await newLock.acquire();
      expect(result).toBe(true);
    });
  });

  describe('lock timeout behavior', () => {
    it('should consider lock stale at exactly 60 seconds', async () => {
      // Create a lock exactly 60 seconds old
      const staleLockData = {
        pid: 99999,
        timestamp: Date.now() - 60000, // Exactly 60 seconds
        host: 'test-host',
      };

      const lockDir = path.dirname(lockPath);
      await fs.mkdir(lockDir, { recursive: true });
      await fs.writeFile(lockPath, JSON.stringify(staleLockData));

      // Should be able to acquire (>= 60 seconds is stale)
      const result = await lock.acquire();
      expect(result).toBe(true);
    });

    it('should not consider lock stale at 59 seconds', async () => {
      // Create a lock 59 seconds old (just under timeout)
      const recentLockData = {
        pid: 99999,
        timestamp: Date.now() - 59000, // 59 seconds
        host: 'test-host',
      };

      const lockDir = path.dirname(lockPath);
      await fs.mkdir(lockDir, { recursive: true });
      await fs.writeFile(lockPath, JSON.stringify(recentLockData));

      // Should NOT be able to acquire (< 60 seconds is still valid)
      const result = await lock.acquire();
      expect(result).toBe(false);
    });
  });
});
