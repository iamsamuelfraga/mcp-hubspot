/**
 * Mock helpers for HubSpotClient and global fetch in tests.
 *
 * Usage:
 *   import { mockFetchSuccess, mockFetchError, createMockResponse } from './mock-client.js';
 *
 *   beforeEach(() => { mockFetchSuccess({ results: [] }); });
 */
import { vi } from 'vitest';

/**
 * Creates a minimal fetch Response-compatible object for use in mocks.
 *
 * @param body - The JSON body to serialize.
 * @param status - HTTP status code. Default: 200.
 * @param headers - Optional response headers.
 */
export function createMockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  const responseHeaders = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: responseHeaders,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

/**
 * Mocks the global `fetch` to return a successful response with the given body.
 *
 * @param body - The JSON body to return.
 * @param status - HTTP status code. Default: 200.
 * @param headers - Optional response headers.
 * @returns The vitest mock function for further assertions.
 */
export function mockFetchSuccess(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  const mockFn = vi.fn().mockResolvedValue(createMockResponse(body, status, headers));
  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}

/**
 * Mocks the global `fetch` to return an error response (non-2xx).
 *
 * @param errorBody - The HubSpot error body to return.
 * @param status - HTTP status code (e.g., 404, 429, 500).
 * @param headers - Optional response headers (e.g., { 'Retry-After': '5' }).
 * @returns The vitest mock function for further assertions.
 */
export function mockFetchError(
  errorBody: unknown,
  status: number,
  headers: Record<string, string> = {}
) {
  const mockFn = vi.fn().mockResolvedValue(createMockResponse(errorBody, status, headers));
  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}

/**
 * Mocks `fetch` to fail on the first call with a given status, then succeed on subsequent calls.
 *
 * Useful for testing retry logic.
 *
 * @param errorStatus - HTTP status code for the first (failing) call.
 * @param successBody - Body to return on all subsequent calls.
 * @param errorBody - Optional error body for the first call.
 * @returns The vitest mock function.
 */
export function mockFetchFailThenSucceed(
  errorStatus: number,
  successBody: unknown,
  errorBody: unknown = { status: 'error', message: 'Temporary error' }
) {
  const mockFn = vi
    .fn()
    .mockResolvedValueOnce(createMockResponse(errorBody, errorStatus))
    .mockResolvedValue(createMockResponse(successBody, 200));
  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}
