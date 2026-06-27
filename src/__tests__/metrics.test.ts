/**
 * Unit tests for MetricsCollector.
 *
 * Covers all public methods: recordRequest(), getMetrics(), and reset().
 * Also verifies computed fields (averageDuration, errorRate) and edge cases
 * (zero requests, multiple endpoints, error tracking).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../utils/metrics.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  // -------------------------------------------------------------------------
  // recordRequest
  // -------------------------------------------------------------------------

  describe('recordRequest', () => {
    it('increments requestCount by 1 per call', () => {
      collector.recordRequest('/deals', 100);
      collector.recordRequest('/deals', 200);
      expect(collector.getMetrics().requestCount).toBe(2);
    });

    it('accumulates totalDuration across calls', () => {
      collector.recordRequest('/deals', 100);
      collector.recordRequest('/contacts', 200);
      expect(collector.getMetrics().totalDuration).toBe(300);
    });

    it('tracks request counts per endpoint', () => {
      collector.recordRequest('/deals', 50);
      collector.recordRequest('/deals', 50);
      collector.recordRequest('/contacts', 100);
      const m = collector.getMetrics();
      expect(m.requestsByEndpoint['/deals']).toBe(2);
      expect(m.requestsByEndpoint['/contacts']).toBe(1);
    });

    it('increments errorCount when error=true', () => {
      collector.recordRequest('/deals', 100, true);
      collector.recordRequest('/deals', 50, false);
      expect(collector.getMetrics().errorCount).toBe(1);
    });

    it('tracks error counts per endpoint', () => {
      collector.recordRequest('/deals', 100, true);
      collector.recordRequest('/deals', 50, false);
      expect(collector.getMetrics().errorsByEndpoint['/deals']).toBe(1);
    });

    it('does not increment errorCount when error defaults to false', () => {
      collector.recordRequest('/deals', 100);
      expect(collector.getMetrics().errorCount).toBe(0);
    });

    it('does not add endpoint to errorsByEndpoint when error=false', () => {
      collector.recordRequest('/deals', 100, false);
      expect(collector.getMetrics().errorsByEndpoint['/deals']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getMetrics
  // -------------------------------------------------------------------------

  describe('getMetrics', () => {
    it('returns all-zero metrics for a fresh collector', () => {
      const m = collector.getMetrics();
      expect(m.requestCount).toBe(0);
      expect(m.errorCount).toBe(0);
      expect(m.totalDuration).toBe(0);
      expect(m.averageDuration).toBe(0);
      expect(m.errorRate).toBe(0);
      expect(m.requestsByEndpoint).toEqual({});
      expect(m.errorsByEndpoint).toEqual({});
    });

    it('computes averageDuration as totalDuration / requestCount', () => {
      collector.recordRequest('/deals', 100);
      collector.recordRequest('/deals', 300);
      expect(collector.getMetrics().averageDuration).toBe(200);
    });

    it('returns averageDuration=0 when requestCount is 0', () => {
      expect(collector.getMetrics().averageDuration).toBe(0);
    });

    it('computes errorRate as errorCount / requestCount', () => {
      collector.recordRequest('/deals', 100, true);
      collector.recordRequest('/deals', 100, false);
      expect(collector.getMetrics().errorRate).toBe(0.5);
    });

    it('returns errorRate=0 when requestCount is 0', () => {
      expect(collector.getMetrics().errorRate).toBe(0);
    });

    it('returns requestsByEndpoint as a plain object (not a Map)', () => {
      collector.recordRequest('/deals', 50);
      const m = collector.getMetrics();
      // Object.fromEntries converts Map → plain object
      expect(Object.prototype.toString.call(m.requestsByEndpoint)).toBe('[object Object]');
      expect(m.requestsByEndpoint).not.toBeInstanceOf(Map);
    });

    it('accumulates per-endpoint errors across multiple calls', () => {
      collector.recordRequest('/search', 300, true);
      collector.recordRequest('/search', 400, true);
      collector.recordRequest('/search', 100, false);
      const m = collector.getMetrics();
      expect(m.errorsByEndpoint['/search']).toBe(2);
      expect(m.requestsByEndpoint['/search']).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  describe('reset', () => {
    it('resets all counters to zero', () => {
      collector.recordRequest('/deals', 100, true);
      collector.recordRequest('/contacts', 200);

      collector.reset();

      const m = collector.getMetrics();
      expect(m.requestCount).toBe(0);
      expect(m.errorCount).toBe(0);
      expect(m.totalDuration).toBe(0);
      expect(m.averageDuration).toBe(0);
      expect(m.errorRate).toBe(0);
      expect(m.requestsByEndpoint).toEqual({});
      expect(m.errorsByEndpoint).toEqual({});
    });

    it('allows accumulation after reset', () => {
      collector.recordRequest('/deals', 100);
      collector.reset();
      collector.recordRequest('/contacts', 50);

      const m = collector.getMetrics();
      expect(m.requestCount).toBe(1);
      expect(m.requestsByEndpoint['/contacts']).toBe(1);
      expect(m.requestsByEndpoint['/deals']).toBeUndefined();
    });

    it('can be called on a fresh collector without error', () => {
      expect(() => collector.reset()).not.toThrow();
      expect(collector.getMetrics().requestCount).toBe(0);
    });
  });
});
