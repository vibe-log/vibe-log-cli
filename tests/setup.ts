import { vi } from 'vitest';

// Global test setup
global.beforeEach = global.beforeEach || (() => {});
global.afterEach = global.afterEach || (() => {});

// Mock console to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: console.info,
  debug: console.debug,
};

// Set test environment
process.env.NODE_ENV = 'test';