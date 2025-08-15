import { vi } from 'vitest';
import { AxiosInstance } from 'axios';
import path from 'path';
import os from 'os';

// Mock environment setup
export function setupTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.VIBELOG_API_URL = 'https://test.vibe-log.dev';
  
  // Mock home directory for tests
  vi.spyOn(os, 'homedir').mockReturnValue('/test/home');
}

// Cleanup function for after each test
export function cleanupTestEnv() {
  vi.clearAllMocks();
  vi.resetAllMocks();
  delete process.env.VIBELOG_API_URL;
  delete process.env.VIBELOG_TOKEN;
  delete process.env.VIBELOG_DEBUG;
}

// Mock axios instance
export function createMockAxiosInstance(): AxiosInstance {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    request: vi.fn(),
    head: vi.fn(),
    options: vi.fn(),
    getUri: vi.fn(),
    defaults: {
      headers: {
        common: {},
        delete: {},
        get: {},
        head: {},
        post: {},
        put: {},
        patch: {},
      },
    },
    interceptors: {
      request: {
        use: vi.fn(),
        eject: vi.fn(),
        clear: vi.fn(),
      },
      response: {
        use: vi.fn(),
        eject: vi.fn(),
        clear: vi.fn(),
      },
    },
  } as any;
}

// Mock console methods
export function mockConsole() {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };

  const mocks = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  };

  return {
    mocks,
    restore: () => {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
    },
  };
}

// Test data generators
export const testData = {
  createSession: (overrides = {}) => ({
    tool: 'claude_code',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    duration: 3600,
    projectPath: '/test/project',
    messages: [
      {
        role: 'user',
        content: 'Create a function to calculate fibonacci',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      },
      {
        role: 'assistant',
        content: 'Here is the fibonacci function...',
        timestamp: new Date('2024-01-15T10:05:00Z'),
      },
    ],
    metadata: {
      files_edited: 2,
      languages: ['TypeScript', 'JavaScript'],
    },
    ...overrides,
  }),

  createStreakInfo: (overrides = {}) => ({
    current: 5,
    points: 150,
    longestStreak: 10,
    totalSessions: 25,
    todaySessions: 2,
    ...overrides,
  }),

  createAuthToken: () => 'test-auth-token-123',

  createClaudeLogEntry: (overrides = {}) => ({
    sessionId: 'test-session-123',
    cwd: '/test/project',
    timestamp: '2024-01-15T10:00:00Z',
    message: {
      role: 'user',
      content: 'Test message',
      timestamp: '2024-01-15T10:00:00Z',
    },
    ...overrides,
  }),
};

// Wait utility for async operations
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock file system utilities
export const mockFs = {
  createMockFile: (content: string) => ({
    content,
    encoding: 'utf-8',
  }),
  
  createMockDirectory: (files: Record<string, string>) => {
    const mockFiles = new Map();
    Object.entries(files).forEach(([path, content]) => {
      mockFiles.set(path, content);
    });
    return mockFiles;
  },
};

// Assertion helpers
export const assertHelpers = {
  expectCalledWithAuth: (mockFn: any, token: string) => {
    expect(mockFn).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
        }),
      })
    );
  },

  expectErrorWithCode: (error: any, code: string) => {
    expect(error).toHaveProperty('code', code);
  },

  expectConsoleOutput: (mockConsole: any, type: string, pattern: RegExp) => {
    const calls = mockConsole.mocks[type].mock.calls;
    const found = calls.some((call: any[]) => 
      call.some(arg => pattern.test(String(arg)))
    );
    expect(found).toBe(true);
  },
};