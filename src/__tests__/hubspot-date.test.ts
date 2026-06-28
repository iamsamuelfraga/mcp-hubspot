/**
 * Unit tests for HubSpot date normalization.
 */
import { describe, it, expect } from 'vitest';
import { toHubSpotTimestamp, snapToMidnightUtc } from '../utils/hubspot-date.js';

// Reference: 2026-06-28T00:00:00Z = 1782604800000 ms.
const JUN_28_MIDNIGHT_UTC = 1782604800000;

describe('toHubSpotTimestamp', () => {
  it('parses a bare ISO date as midnight UTC', () => {
    expect(toHubSpotTimestamp('2026-06-28')).toBe(String(JUN_28_MIDNIGHT_UTC));
  });

  it('does not shift the day (no off-by-one) for date-only input', () => {
    // The classic bug: a local-midnight offset moving the day. Bare ISO date
    // must land exactly on midnight UTC of the SAME day.
    const ms = Number(toHubSpotTimestamp('2026-06-28'));
    expect(new Date(ms).getUTCFullYear()).toBe(2026);
    expect(new Date(ms).getUTCMonth()).toBe(5); // June (0-indexed)
    expect(new Date(ms).getUTCDate()).toBe(28);
    expect(ms % 86_400_000).toBe(0); // exactly midnight UTC
  });

  it('passes through epoch milliseconds unchanged', () => {
    expect(toHubSpotTimestamp(JUN_28_MIDNIGHT_UTC)).toBe(String(JUN_28_MIDNIGHT_UTC));
    expect(toHubSpotTimestamp(String(JUN_28_MIDNIGHT_UTC))).toBe(String(JUN_28_MIDNIGHT_UTC));
  });

  it('scales epoch seconds up to milliseconds', () => {
    expect(toHubSpotTimestamp(1782604800)).toBe(String(JUN_28_MIDNIGHT_UTC));
    expect(toHubSpotTimestamp('1782604800')).toBe(String(JUN_28_MIDNIGHT_UTC));
  });

  it('parses an ISO datetime to exact epoch ms', () => {
    expect(toHubSpotTimestamp('2026-06-28T10:30:00Z')).toBe(
      String(JUN_28_MIDNIGHT_UTC + 37_800_000)
    );
  });

  it('snaps a datetime to midnight UTC when dateOnly is true', () => {
    expect(toHubSpotTimestamp('2026-06-28T10:30:00Z', { dateOnly: true })).toBe(
      String(JUN_28_MIDNIGHT_UTC)
    );
  });

  it('accepts a Date instance', () => {
    expect(toHubSpotTimestamp(new Date(JUN_28_MIDNIGHT_UTC))).toBe(String(JUN_28_MIDNIGHT_UTC));
  });

  it('throws on unparseable input', () => {
    expect(() => toHubSpotTimestamp('not-a-date')).toThrow();
  });
});

describe('snapToMidnightUtc', () => {
  it('floors to midnight UTC of the same day', () => {
    expect(snapToMidnightUtc(JUN_28_MIDNIGHT_UTC + 37_800_000)).toBe(JUN_28_MIDNIGHT_UTC);
  });

  it('is a no-op for a value already at midnight', () => {
    expect(snapToMidnightUtc(JUN_28_MIDNIGHT_UTC)).toBe(JUN_28_MIDNIGHT_UTC);
  });
});
