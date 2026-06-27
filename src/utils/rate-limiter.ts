/**
 * HubSpot rate limiter implementation using Bottleneck.
 *
 * HubSpot enforces two distinct rate limit buckets:
 *
 * 1. **General API** – 190 requests per 10 seconds for Pro/Enterprise accounts,
 *    100 req/10s for Free/Starter. Configurable via env vars.
 *
 * 2. **Search API** – Stricter bucket (~5 requests per second). Used for all
 *    CRM search endpoints (path pattern: /crm/v3/objects/{type}/search).
 *
 * @see {@link https://developers.hubspot.com/docs/api/usage-details#rate-limits}
 */
import Bottleneck from 'bottleneck';
import { logger } from './logger.js';

/**
 * Configuration options for a Bottleneck-backed rate limiter.
 */
export interface RateLimiterConfig {
  /** Token reservoir size (number of requests allowed in the refill window). */
  reservoir?: number;
  /** Amount of tokens to restore on each refill cycle. */
  reservoirRefreshAmount?: number;
  /** Refill interval in milliseconds. */
  reservoirRefreshInterval?: number;
  /** Maximum number of concurrent in-flight requests. */
  maxConcurrent?: number;
  /** Minimum time (ms) between successive request starts. */
  minTime?: number;
}

/**
 * Thin wrapper around a Bottleneck instance that provides typed scheduling
 * and wires up operational event logging.
 *
 * @example
 * const limiter = new RateLimiter({
 *   reservoir: 190,
 *   reservoirRefreshAmount: 190,
 *   reservoirRefreshInterval: 10_000,
 *   maxConcurrent: 10,
 * });
 *
 * const data = await limiter.schedule(() => fetch('/api/resource'));
 */
export class RateLimiter {
  private readonly limiter: Bottleneck;

  constructor(config: RateLimiterConfig = {}) {
    this.limiter = new Bottleneck({
      reservoir: config.reservoir ?? 190,
      reservoirRefreshAmount: config.reservoirRefreshAmount ?? config.reservoir ?? 190,
      reservoirRefreshInterval: config.reservoirRefreshInterval ?? 10_000,
      maxConcurrent: config.maxConcurrent ?? 10,
      minTime: config.minTime ?? 0,
    });

    // Retry 429s automatically at the Bottleneck level; actual retry with
    // backoff is handled by `withRetry` in `retry.ts`.
    this.limiter.on('failed', async (error, jobInfo) => {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 429) {
        logger.warn('Rate limit hit in queue, will retry job', {
          jobId: jobInfo.options.id,
          retryCount: jobInfo.retryCount,
        });
        // Signal Bottleneck to retry after 5 seconds
        return 5000;
      }
      return undefined;
    });

    this.limiter.on('error', (error: Error) => {
      logger.error('Rate limiter internal error', error);
    });

    this.limiter.on('depleted', () => {
      logger.warn('Rate limit reservoir depleted – requests will queue');
    });
  }

  /**
   * Schedules a function to run within the rate limiter's constraints.
   *
   * @param fn - Async function to execute when a token is available.
   * @returns The resolved value of `fn`.
   */
  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(fn);
  }

  /**
   * Returns current Bottleneck queue/running counts for observability.
   */
  get counts() {
    return this.limiter.counts();
  }

  /**
   * Gracefully stops the limiter, draining in-flight requests.
   */
  async stop(): Promise<void> {
    await this.limiter.stop();
  }
}

/**
 * General-purpose HubSpot API rate limiter.
 * Reservoir: configurable via HUBSPOT_MAX_RESERVOIR (default 190 req/10s).
 * Max concurrency: configurable via HUBSPOT_MAX_CONCURRENT (default 10).
 */
export const generalLimiter = new RateLimiter({
  reservoir: parseInt(process.env['HUBSPOT_MAX_RESERVOIR'] ?? '190', 10),
  reservoirRefreshAmount: parseInt(process.env['HUBSPOT_MAX_RESERVOIR'] ?? '190', 10),
  reservoirRefreshInterval: 10_000, // 10 seconds
  maxConcurrent: parseInt(process.env['HUBSPOT_MAX_CONCURRENT'] ?? '10', 10),
});

/**
 * Search-specific HubSpot rate limiter.
 * HubSpot search endpoints have a stricter ~5 req/second bucket.
 * Used for all CRM search endpoints (path: /crm/v3/objects/{type}/search).
 */
export const searchLimiter = new RateLimiter({
  reservoir: 5,
  reservoirRefreshAmount: 5,
  reservoirRefreshInterval: 1_000, // 1 second
  maxConcurrent: 2,
});
