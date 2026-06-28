/**
 * HubSpot date/time normalization.
 *
 * HubSpot stores all dates as **Unix epoch in milliseconds** (as strings), and
 * has two strict gotchas that cause the classic "off by one day" / rejection
 * bugs:
 *
 *  - `date` properties (and date-only search filters) must be **midnight UTC**.
 *    Any time-of-day offset is rejected ("... is at 7:0:0.0 UTC, not midnight!")
 *    or shifts the stored day. Midnight in a non-UTC timezone is NOT valid.
 *  - Values must be **milliseconds**, not seconds (a common ×1000 mistake that
 *    lands dates in 1970).
 *  - Search `filterGroups` date comparisons expect epoch-ms values, not ISO.
 *
 * This module accepts whatever a caller/LLM is likely to pass — ISO 8601 dates
 * ("2026-06-28"), ISO datetimes, or epoch in seconds/milliseconds — and returns
 * the epoch-ms string HubSpot wants. For `date`-typed values it snaps to
 * midnight UTC.
 *
 * @see {@link https://developers.hubspot.com/docs/api-reference/legacy/crm/properties/guide}
 * @module utils/hubspot-date
 */

/** Milliseconds in one UTC day. */
const MS_PER_DAY = 86_400_000;

/**
 * Heuristic threshold to tell epoch seconds from milliseconds. Epoch seconds
 * for any modern date are ~1.7e9; epoch ms are ~1.7e12. Anything below this
 * magnitude is treated as seconds and scaled up.
 */
const SECONDS_VS_MS_THRESHOLD = 1e11;

/** Matches a bare ISO date with no time component, e.g. "2026-06-28". */
const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Matches an all-digits value (optionally signed), i.e. an epoch number. */
const EPOCH_RE = /^-?\d+$/;

/**
 * Normalizes a date/datetime input into the epoch-milliseconds string HubSpot
 * expects.
 *
 * Accepts:
 *  - epoch milliseconds: `1782604800000` or `"1782604800000"`
 *  - epoch seconds: `1782604800` or `"1782604800"` (auto-scaled ×1000)
 *  - ISO date: `"2026-06-28"` (interpreted as midnight UTC)
 *  - ISO datetime: `"2026-06-28T10:30:00Z"`
 *  - a `Date` instance
 *
 * @param input - The value to normalize.
 * @param options.dateOnly - When true, snap the result to **midnight UTC**
 *   (use for `date`-typed properties and date-only search filters). Default false.
 * @returns The epoch-milliseconds value as a string.
 * @throws {Error} When the input cannot be parsed into a valid date.
 *
 * @example
 * toHubSpotTimestamp('2026-06-28');                    // '1782604800000' (midnight UTC)
 * toHubSpotTimestamp('2026-06-28T10:30:00Z');          // '1782642600000'
 * toHubSpotTimestamp(1782604800, { dateOnly: true });  // seconds → ms, snapped
 */
export function toHubSpotTimestamp(
  input: string | number | Date,
  options: { dateOnly?: boolean } = {}
): string {
  const ms = toEpochMillis(input);
  if (Number.isNaN(ms)) {
    throw new Error(
      `Invalid date: ${JSON.stringify(input)}. Use an ISO date (YYYY-MM-DD), an ISO datetime, or epoch milliseconds.`
    );
  }
  const normalized = options.dateOnly ? snapToMidnightUtc(ms) : ms;
  return String(normalized);
}

/**
 * Floors an epoch-ms value to midnight UTC of the same calendar day.
 *
 * @param ms - Epoch milliseconds.
 * @returns Epoch milliseconds at 00:00:00.000 UTC of that day.
 */
export function snapToMidnightUtc(ms: number): number {
  return ms - (((ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY);
}

/**
 * Parses any supported input into epoch milliseconds (no midnight snapping).
 *
 * @param input - The value to parse.
 * @returns Epoch milliseconds, or `NaN` if unparseable.
 */
function toEpochMillis(input: string | number | Date): number {
  if (input instanceof Date) {
    return input.getTime();
  }

  if (typeof input === 'number') {
    return scaleIfSeconds(input);
  }

  const trimmed = input.trim();

  // Bare ISO date (YYYY-MM-DD): JS parses this as midnight UTC already.
  if (ISO_DATE_ONLY_RE.test(trimmed)) {
    return Date.parse(trimmed);
  }

  // All-digit string → epoch (seconds or ms).
  if (EPOCH_RE.test(trimmed)) {
    return scaleIfSeconds(Number(trimmed));
  }

  // Anything else: let the engine parse it as an ISO datetime.
  return Date.parse(trimmed);
}

/**
 * Scales a numeric epoch up to milliseconds when it looks like seconds.
 *
 * @param value - A numeric epoch value.
 * @returns Epoch milliseconds.
 */
function scaleIfSeconds(value: number): number {
  return Math.abs(value) < SECONDS_VS_MS_THRESHOLD ? value * 1000 : value;
}
