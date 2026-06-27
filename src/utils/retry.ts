/**
 * Retry utility with exponential backoff and jitter for HubSpot API calls.
 *
 * HubSpot does not guarantee a Retry-After header on 429 responses, so this
 * module implements its own exponential backoff with optional jitter. When
 * the Retry-After header IS present (surfaced as `retryAfter` on the error),
 * that value takes precedence over the computed backoff.
 *
 * Retryable HTTP status codes: 429, 500, 502, 503, 504.
 */
import { logger } from './logger.js';

/**
 * Configuration for the `withRetry` wrapper.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts after the initial call fails. Default: 3. */
  maxRetries?: number;
  /** Base delay in milliseconds before the first retry. Default: 1000. */
  initialDelay?: number;
  /** Upper cap on computed backoff delay in milliseconds. Default: 30000. */
  maxDelay?: number;
  /**
   * Multiplier applied to the delay on each successive retry.
   * delay[n] = min(initialDelay * backoffMultiplier^n, maxDelay)
   * Default: 2.
   */
  backoffMultiplier?: number;
  /**
   * When true (default), adds up to 30% random jitter to each computed delay.
   * Jitter prevents thundering-herd on concurrent retries.
   */
  jitter?: boolean;
  /** HTTP status codes that should trigger a retry. Default: [429, 500, 502, 503, 504]. */
  retryableStatuses?: number[];
}

/**
 * Wraps an async function with automatic retry logic using exponential backoff.
 *
 * On each failure the function checks whether the error is retryable by looking
 * at its `statusCode` property. If the error carries a `retryAfter` number
 * (seconds), that value is used directly as the delay instead of the computed
 * backoff.
 *
 * @template T - Return type of the wrapped function.
 * @param fn - The async operation to execute and potentially retry.
 * @param options - Retry configuration (all fields optional with sensible defaults).
 * @returns The resolved value of `fn` on the first successful attempt.
 * @throws The last caught error if all retry attempts are exhausted.
 *
 * @example
 * const data = await withRetry(
 *   () => client.get('/crm/v3/objects/deals'),
 *   { maxRetries: 3, initialDelay: 1000, jitter: true }
 * );
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30_000,
    backoffMultiplier = 2,
    jitter = true,
    retryableStatuses = [429, 500, 502, 503, 504],
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if the error has a retryable status code
      const statusCode =
        error instanceof Error && 'statusCode' in error
          ? (error as { statusCode: number }).statusCode
          : undefined;

      const isRetryable = statusCode !== undefined && retryableStatuses.includes(statusCode);

      // Give up immediately on non-retryable errors or after exhausting retries
      if (!isRetryable || attempt === maxRetries) {
        if (attempt > 0) {
          logger.error('Request failed after retries', error as Error, {
            attempt,
            maxRetries,
            statusCode,
          });
        }
        throw error;
      }

      // Determine actual wait time – honour Retry-After if present
      const retryAfterSeconds =
        error instanceof Error && 'retryAfter' in error
          ? (error as { retryAfter?: number }).retryAfter
          : undefined;

      // Apply jitter BEFORE the cap so the result never exceeds maxDelay.
      // Without Math.min the jittered value can reach maxDelay * 1.3 when
      // `delay` has already saturated at maxDelay.
      const actualDelay = retryAfterSeconds
        ? retryAfterSeconds * 1000
        : jitter
          ? Math.min(delay * (1 + Math.random() * 0.3), maxDelay)
          : delay;

      logger.warn('Request failed, retrying', {
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        delayMs: Math.round(actualDelay),
        statusCode,
        error: (error as Error).message,
      });

      await new Promise<void>((resolve) => setTimeout(resolve, actualDelay));

      // Advance exponential backoff for next iteration (Retry-After overrides don't affect it)
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  // Should be unreachable, but keeps TypeScript happy
  if (lastError) throw lastError;
  throw new Error('Retry failed with no error captured');
}
