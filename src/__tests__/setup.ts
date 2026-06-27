/**
 * Vitest global test setup.
 * Imported via `setupFiles` in vitest.config.ts.
 */
import { vi } from 'vitest';

// Reset all mocks between tests to prevent state leakage
afterEach(() => {
  vi.resetAllMocks();
});
