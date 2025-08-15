import { describe, it, expect } from 'vitest';
import { VibelogError } from '../../src/utils/errors';

describe('Simple Test', () => {
  it('should create VibelogError', () => {
    const error = new VibelogError('Test error', 'TEST_CODE');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
  });
});