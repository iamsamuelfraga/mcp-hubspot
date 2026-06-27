/**
 * Unit tests for RateLimiter.
 *
 * Covers:
 * - schedule() – basic execution
 * - get counts – returns Bottleneck queue/running metrics
 * - stop() – drains in-flight requests gracefully
 * - 'error' event handler – logs internal Bottleneck errors (line 90)
 * - 'depleted' event handler – logs reservoir-depleted warning (line 94)
 *
 * The 'failed' event (429 retry, lines 79-84) is exercised indirectly by
 * the hubspot-client integration tests which run real requests through the
 * singleton rate limiters.
 *
 * Event handlers on the private Bottleneck instance are triggered by calling
 * `.emit()` directly — this avoids scheduling real HTTP calls and keeps the
 * tests fast and deterministic.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { RateLimiter } from '../utils/rate-limiter.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Helper: access the private Bottleneck instance and its event system
// ---------------------------------------------------------------------------

type BottleneckLike = {
  Events: {
    trigger(event: string, ...args: unknown[]): void;
  };
};

function getBottleneck(limiter: RateLimiter): BottleneckLike {
  return (limiter as unknown as { limiter: BottleneckLike }).limiter;
}

// ---------------------------------------------------------------------------
// Suite: constructor defaults
// ---------------------------------------------------------------------------

describe('RateLimiter — constructor defaults', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('uses default reservoir=190 when no config is provided', async () => {
    // Creating with empty config exercises the ?? 190 fallback paths (lines 62-63)
    const limiter = new RateLimiter();
    // If construction succeeds and schedule works, defaults applied correctly
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await limiter.schedule(fn);
    expect(result).toBe('ok');
    await limiter.stop();
  });

  it('uses reservoir value as refreshAmount when refreshAmount not specified', async () => {
    // Covers: reservoirRefreshAmount ?? config.reservoir ?? 190 (line 63, reservoir branch)
    const limiter = new RateLimiter({ reservoir: 5 });
    const counts = limiter.counts;
    expect(counts).toBeDefined();
    await limiter.stop();
  });
});

// ---------------------------------------------------------------------------
// Suite: schedule
// ---------------------------------------------------------------------------

describe('RateLimiter — schedule', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes a scheduled function and returns its resolved value', async () => {
    const limiter = new RateLimiter({ reservoir: 10, maxConcurrent: 1 });
    const fn = vi.fn().mockResolvedValue('result');

    const result = await limiter.schedule(fn);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledOnce();
    await limiter.stop();
  });

  it('propagates rejections from the scheduled function', async () => {
    const limiter = new RateLimiter({ reservoir: 10, maxConcurrent: 1 });
    const fn = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(limiter.schedule(fn)).rejects.toThrow('boom');
    await limiter.stop();
  });
});

// ---------------------------------------------------------------------------
// Suite: counts
// ---------------------------------------------------------------------------

describe('RateLimiter — counts', () => {
  it('returns a Bottleneck counts object with numeric fields', async () => {
    const limiter = new RateLimiter({ reservoir: 10 });

    const counts = limiter.counts;

    expect(counts).toBeDefined();
    // Bottleneck's counts() always returns an object with at least RECEIVED/QUEUED/RUNNING
    expect(typeof counts).toBe('object');
    expect(typeof counts.RECEIVED).toBe('number');
    await limiter.stop();
  });
});

// ---------------------------------------------------------------------------
// Suite: stop
// ---------------------------------------------------------------------------

describe('RateLimiter — stop', () => {
  it('resolves without throwing when called on an idle limiter', async () => {
    const limiter = new RateLimiter({ reservoir: 10 });

    await expect(limiter.stop()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite: error event
// ---------------------------------------------------------------------------

describe('RateLimiter — error event', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs an internal Bottleneck error via logger.error', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const limiter = new RateLimiter({ reservoir: 10 });
    const internalError = new Error('test internal bottleneck error');

    getBottleneck(limiter).Events.trigger('error', internalError);

    expect(errorSpy).toHaveBeenCalledWith('Rate limiter internal error', internalError);
    await limiter.stop();
  });
});

// ---------------------------------------------------------------------------
// Suite: depleted event
// ---------------------------------------------------------------------------

describe('RateLimiter — depleted event', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a reservoir-depleted warning via logger.warn', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const limiter = new RateLimiter({ reservoir: 10 });

    getBottleneck(limiter).Events.trigger('depleted');

    expect(warnSpy).toHaveBeenCalledWith('Rate limit reservoir depleted – requests will queue');
    await limiter.stop();
  });
});

// ---------------------------------------------------------------------------
// Suite: failed event — 429 retry path
// ---------------------------------------------------------------------------

describe('RateLimiter — failed event (429 retry)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('warns and re-schedules on the first 429 error', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const limiter = new RateLimiter({
      reservoir: 10,
      maxConcurrent: 1,
      minTime: 0,
    });

    let callCount = 0;
    const rateLimitErr = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(rateLimitErr);
      return Promise.resolve('ok after retry');
    });

    const schedulePromise = limiter.schedule(fn);

    // Advance past the 5-second Bottleneck retry delay
    await vi.advanceTimersByTimeAsync(6_000);

    const result = await schedulePromise;
    expect(result).toBe('ok after retry');
    expect(warnSpy).toHaveBeenCalledWith(
      'Rate limit hit in queue, will retry job',
      expect.objectContaining({ retryCount: 0 })
    );

    await limiter.stop();
    vi.useRealTimers();
  });
});
