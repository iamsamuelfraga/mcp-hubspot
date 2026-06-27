/**
 * Request metrics collector for the HubSpot MCP server.
 *
 * Tracks per-endpoint request counts, error counts, and total duration.
 * Metrics are logged on graceful shutdown and can be queried at any time.
 */

/**
 * Aggregated metrics snapshot returned by `MetricsCollector.getMetrics()`.
 */
export interface Metrics {
  /** Total number of requests recorded since the last reset. */
  requestCount: number;
  /** Total number of failed requests (error=true). */
  errorCount: number;
  /** Sum of all request durations in milliseconds. */
  totalDuration: number;
  /** Average duration per request in milliseconds. 0 if no requests recorded. */
  averageDuration: number;
  /** Error rate as a fraction (0–1). 0 if no requests recorded. */
  errorRate: number;
  /** Request count indexed by endpoint path. */
  requestsByEndpoint: Record<string, number>;
  /** Error count indexed by endpoint path. */
  errorsByEndpoint: Record<string, number>;
}

/**
 * Collects and aggregates request telemetry for the MCP server.
 *
 * Thread-safety note: Node.js is single-threaded so concurrent modification
 * is not a concern. This class uses simple Maps for O(1) per-endpoint updates.
 *
 * @example
 * metricsCollector.recordRequest('/crm/v3/objects/deals', 245, false);
 * metricsCollector.recordRequest('/crm/v3/objects/deals/search', 1200, true);
 *
 * const snapshot = metricsCollector.getMetrics();
 * console.log(`Total requests: ${snapshot.requestCount}`);
 */
export class MetricsCollector {
  private data = {
    requestCount: 0,
    errorCount: 0,
    totalDuration: 0,
    requestsByEndpoint: new Map<string, number>(),
    errorsByEndpoint: new Map<string, number>(),
  };

  /**
   * Records a completed request.
   *
   * @param endpoint - The API path that was called (e.g., `/crm/v3/objects/deals`).
   * @param duration - Request duration in milliseconds.
   * @param error - Whether the request resulted in an error. Default: false.
   */
  recordRequest(endpoint: string, duration: number, error = false): void {
    this.data.requestCount++;
    this.data.totalDuration += duration;

    const count = this.data.requestsByEndpoint.get(endpoint) ?? 0;
    this.data.requestsByEndpoint.set(endpoint, count + 1);

    if (error) {
      this.data.errorCount++;
      const errorCount = this.data.errorsByEndpoint.get(endpoint) ?? 0;
      this.data.errorsByEndpoint.set(endpoint, errorCount + 1);
    }
  }

  /**
   * Returns a snapshot of all collected metrics.
   *
   * @returns A `Metrics` object with computed averages and rates.
   */
  getMetrics(): Metrics {
    const { requestCount, errorCount, totalDuration } = this.data;
    return {
      requestCount,
      errorCount,
      totalDuration,
      averageDuration: requestCount > 0 ? totalDuration / requestCount : 0,
      errorRate: requestCount > 0 ? errorCount / requestCount : 0,
      requestsByEndpoint: Object.fromEntries(this.data.requestsByEndpoint),
      errorsByEndpoint: Object.fromEntries(this.data.errorsByEndpoint),
    };
  }

  /**
   * Resets all metrics counters to zero.
   * Useful for periodic reporting cycles.
   */
  reset(): void {
    this.data = {
      requestCount: 0,
      errorCount: 0,
      totalDuration: 0,
      requestsByEndpoint: new Map(),
      errorsByEndpoint: new Map(),
    };
  }
}

/** Singleton metrics collector – shared across all tool handlers. */
export const metricsCollector = new MetricsCollector();
