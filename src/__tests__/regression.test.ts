/**
 * Regression tests for specific bugs fixed in the code review.
 *
 * (a) BLOCKER: rate-limiter Bottleneck retry cap — with fetch always returning
 *     429, the tool must resolve (with an error result) in finite time and never
 *     hang. Before the fix, the Bottleneck `failed` handler returned 5000 ms
 *     indefinitely, preventing limiter.schedule() from ever rejecting.
 *
 * (b) SHOULD-FIX: get_enrollments vid encoding — a VID containing a slash
 *     ('123/extra') must be rejected by the Zod regex before any HTTP call.
 *
 * (c) SHOULD-FIX: retry jitter cap — jittered delay must never exceed maxDelay,
 *     even when the base delay has already saturated at maxDelay.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { getEnrollmentTools } from '../tools/enrollment/index.js';
import { withRetry } from '../utils/retry.js';
import { HubSpotApiError } from '../utils/error-handler.js';
import { GetEnrollmentsSchema } from '../schemas/enrollment.js';
import { mockFetchError } from './mock-client.js';

// ---------------------------------------------------------------------------
// (a) Rate limiter: Bottleneck retry cap prevents infinite hang on 429
// ---------------------------------------------------------------------------

describe('Regression (a): rate-limiter Bottleneck retry cap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves with an error response in finite time when fetch always returns 429', async () => {
    // Stub fetch to always respond with a 429 (no Retry-After header so
    // withRetry falls back to exponential backoff).
    mockFetchError({ status: 'error', message: 'Too Many Requests' }, 429);

    const client = new HubSpotClient({ accessToken: 'test-token' });

    // Use a tool handler that goes through the full
    // withRetry → limiter.schedule → fetch pipeline.
    const tools = getEnrollmentTools(client);
    const tool = tools.find((t) => t.name === 'hubspot_enrollment_get_enrollments')!;

    // Start the call – it will fire many internal setTimeouts for backoff and
    // for Bottleneck's own retry scheduling.
    const resultPromise = tool.handler({ vid: '12345' });

    // Advance ALL pending timers (including those created by callbacks of
    // earlier timers) until no pending timers remain.
    await vi.runAllTimersAsync();

    const result = (await resultPromise) as { isError: boolean; statusCode?: number };

    // Must resolve (not hang) and return a structured error, not throw.
    expect(result).toBeDefined();
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (b) get_enrollments: non-numeric VID is rejected by schema regex
// ---------------------------------------------------------------------------

describe('Regression (b): get_enrollments vid regex validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a VID that contains a slash (path-injection attempt)', () => {
    expect(() => GetEnrollmentsSchema.parse({ vid: '123/extra' })).toThrow(
      'VID must be a numeric string'
    );
  });

  it('rejects an empty string VID', () => {
    expect(() => GetEnrollmentsSchema.parse({ vid: '' })).toThrow('VID must be a numeric string');
  });

  it('rejects a VID with letters', () => {
    expect(() => GetEnrollmentsSchema.parse({ vid: '12abc' })).toThrow(
      'VID must be a numeric string'
    );
  });

  it('accepts a valid numeric-only VID', () => {
    const parsed = GetEnrollmentsSchema.parse({ vid: '123456' });
    expect(parsed.vid).toBe('123456');
  });

  it('numeric VID is URL-encoded safely (encodeURIComponent of digits is a no-op)', () => {
    // After the schema accepts a numeric VID, encodeURIComponent must not
    // alter it — confirming that path injection is impossible via the schema.
    const { vid } = GetEnrollmentsSchema.parse({ vid: '67890' });
    expect(encodeURIComponent(vid)).toBe('67890');
  });
});

// ---------------------------------------------------------------------------
// (c) withRetry jitter cap: jittered delay must never exceed maxDelay
// ---------------------------------------------------------------------------

describe('Regression (c): retry jitter cap respects maxDelay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never exceeds maxDelay even when delay has saturated at maxDelay', async () => {
    const MAX_DELAY = 100; // deliberately small so saturation happens on first retry
    const capturedDelays: number[] = [];

    // Intercept setTimeout to record delays without actually waiting.
    vi.spyOn(global, 'setTimeout').mockImplementation(
      (fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
        capturedDelays.push(delay ?? 0);
        fn(...args); // fire immediately so withRetry doesn't actually wait
        return 0 as unknown as NodeJS.Timeout;
      }
    );

    const error429 = new HubSpotApiError('Too Many Requests', 429, '/test');

    // Run multiple independent retries to gather a statistical sample of delays.
    for (let run = 0; run < 20; run++) {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error429) // first call fails
        .mockResolvedValue('ok'); // subsequent calls succeed

      await withRetry(fn, {
        maxRetries: 1,
        initialDelay: MAX_DELAY, // already at maxDelay from the start
        maxDelay: MAX_DELAY,
        backoffMultiplier: 2,
        jitter: true,
      });
    }

    // All recorded delays must respect the cap (allow 1ms floating-point slack).
    for (const d of capturedDelays) {
      expect(d).toBeLessThanOrEqual(MAX_DELAY + 1);
    }
    // Sanity: we actually captured some delays (jitter was active).
    expect(capturedDelays.length).toBeGreaterThan(0);
  });

  it('applies jitter so not all delays are the same (randomness is present)', async () => {
    const MAX_DELAY = 500;
    const capturedDelays: number[] = [];

    vi.spyOn(global, 'setTimeout').mockImplementation(
      (fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
        capturedDelays.push(delay ?? 0);
        fn(...args);
        return 0 as unknown as NodeJS.Timeout;
      }
    );

    const error429 = new HubSpotApiError('Too Many Requests', 429, '/test');

    for (let run = 0; run < 10; run++) {
      const fn = vi.fn().mockRejectedValueOnce(error429).mockResolvedValue('ok');
      await withRetry(fn, {
        maxRetries: 1,
        initialDelay: 400,
        maxDelay: MAX_DELAY,
        jitter: true,
      });
    }

    const unique = new Set(capturedDelays.map((d) => Math.round(d)));
    expect(unique.size).toBeGreaterThan(1);
    // All must still be within the cap.
    for (const d of capturedDelays) {
      expect(d).toBeLessThanOrEqual(MAX_DELAY + 1);
    }
  });
});
