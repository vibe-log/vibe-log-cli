import { vi } from 'vitest';

const mockConfig = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
};

class MockConf {
  constructor() {
    return mockConfig;
  }
}

export default MockConf;
export { mockConfig };