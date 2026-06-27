/**
 * Tests for the withRetry utility.
 */
import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../utils/retry.js';
import { HubSpotApiError } from '../utils/error-handler.js';

describe('withRetry', () => {
  it('calls the function once and returns its value when it succeeds immediately', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxRetries: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once after a 429 error then returns success on second call', async () => {
    vi.useFakeTimers();
    const rateLimitError = new HubSpotApiError('Too Many Requests', 429, '/path');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue('success after retry');

    const resultPromise = withRetry(fn, {
      maxRetries: 3,
      initialDelay: 100,
      jitter: false,
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('success after retry');
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('throws after exhausting maxRetries with persistent 429 errors', async () => {
    vi.useFakeTimers();
    const rateLimitError = new HubSpotApiError('Too Many Requests', 429, '/path');
    const fn = vi.fn().mockRejectedValue(rateLimitError);

    const resultPromise = withRetry(fn, {
      maxRetries: 3,
      initialDelay: 100,
      jitter: false,
    });

    // Pre-attach rejection handler BEFORE advancing timers to prevent unhandled rejection
    let capturedError: unknown;
    const settled = resultPromise.catch((err) => {
      capturedError = err;
    });

    await vi.runAllTimersAsync();
    await settled;

    expect(capturedError).toBeInstanceOf(HubSpotApiError);
    expect((capturedError as Error).message).toBe('Too Many Requests');
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    vi.useRealTimers();
  });

  it('does not retry on a non-retryable 400 error', async () => {
    const validationError = new HubSpotApiError('Bad Request', 400, '/path');
    const fn = vi.fn().mockRejectedValue(validationError);

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        initialDelay: 100,
        jitter: false,
        retryableStatuses: [429, 500, 502, 503, 504],
      })
    ).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1); // No retries
  });

  it('treats plain Error (no statusCode) as non-retryable and throws immediately (line 79 FALSE branch)', async () => {
    // Covers: (error instanceof Error && 'statusCode' in error) → FALSE
    // A plain Error lacks the statusCode property → statusCode = undefined → isRetryable = false
    const plainError = new Error('plain error without statusCode');
    const fn = vi.fn().mockRejectedValue(plainError);

    await expect(
      withRetry(fn, { maxRetries: 3, initialDelay: 100, jitter: false })
    ).rejects.toThrow('plain error without statusCode');
    expect(fn).toHaveBeenCalledTimes(1); // No retries on non-retryable error
  });

  it('retries a custom 429-like error that lacks retryAfter property (line 99 FALSE branch)', async () => {
    // Covers: (error instanceof Error && 'retryAfter' in error) → FALSE
    // A custom error with statusCode=429 but no retryAfter property → retryAfterSeconds = undefined
    // The retry uses exponential backoff instead of the Retry-After value
    vi.useFakeTimers();
    const customRateLimitError = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(customRateLimitError)
      .mockResolvedValue('ok after retry');

    const resultPromise = withRetry(fn, {
      maxRetries: 2,
      initialDelay: 100,
      jitter: false,
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('ok after retry');
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not retry on a non-retryable 401 error', async () => {
    const authError = new HubSpotApiError('Unauthorized', 401, '/path');
    const fn = vi.fn().mockRejectedValue(authError);

    await expect(
      withRetry(fn, { maxRetries: 3, initialDelay: 100, jitter: false })
    ).rejects.toThrow('Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses retryAfter from the error when present instead of computed backoff', async () => {
    vi.useFakeTimers();
    const rateLimitError = new HubSpotApiError(
      'Too Many Requests',
      429,
      '/path',
      undefined,
      undefined,
      undefined,
      10
    );
    const fn = vi.fn().mockRejectedValueOnce(rateLimitError).mockResolvedValue('ok');

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const resultPromise = withRetry(fn, {
      maxRetries: 3,
      initialDelay: 1000,
      jitter: false,
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('ok');
    // Should have been called with ~10000ms (10 seconds from retryAfter)
    const delays = setTimeoutSpy.mock.calls.map(([, delay]) => delay as number);
    expect(delays.some((d) => (d as number) >= 9000 && (d as number) <= 11000)).toBe(true);
    vi.useRealTimers();
  });

  it('produces different delays across runs when jitter is enabled', async () => {
    const delays: number[] = [];
    const originalSetTimeout = vi
      .spyOn(global, 'setTimeout')
      .mockImplementation(
        (fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
          delays.push(delay ?? 0);
          fn(...args);
          return 0 as unknown as NodeJS.Timeout;
        }
      );

    const rateLimitError = new HubSpotApiError('Too Many Requests', 429, '/path');

    for (let i = 0; i < 5; i++) {
      const fn = vi.fn().mockRejectedValueOnce(rateLimitError).mockResolvedValue('ok');
      await withRetry(fn, { maxRetries: 1, initialDelay: 1000, jitter: true });
    }

    originalSetTimeout.mockRestore();

    // With jitter, not all delays should be identical
    const uniqueDelays = new Set(delays.map((d) => Math.round(d)));
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });

  it('throws "Retry failed with no error captured" when maxRetries is negative', async () => {
    // Covers the "unreachable" line 129: with maxRetries=-1 the for loop
    // condition (0 <= -1) is false immediately so the loop body never runs,
    // lastError stays undefined, and the fallback throw executes.
    const fn = vi.fn().mockResolvedValue('should not be called');

    await expect(withRetry(fn, { maxRetries: -1 })).rejects.toThrow(
      'Retry failed with no error captured'
    );
    expect(fn).not.toHaveBeenCalled();
  });
});
