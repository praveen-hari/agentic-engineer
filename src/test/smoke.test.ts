import { describe, it, expect } from 'vitest';

/**
 * Smoke test — verifies the test harness is wired correctly.
 * Real tests arrive in Task 3 (Event Stream).
 */
describe('smoke test', () => {
  it('vitest runs and asserts correctly', () => {
    expect(1 + 1).toBe(2);
  });
});
