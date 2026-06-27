/**
 * Tests for HubSpotClient – verifies HTTP mechanics, auth headers,
 * error handling, retry behaviour, and pagination.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { HubSpotApiError } from '../utils/error-handler.js';
import { mockFetchSuccess, mockFetchError, mockFetchFailThenSucceed } from './mock-client.js';

const ACCESS_TOKEN = 'test-token-12345';
const BASE_URL = 'https://api.hubapi.com';

function makeClient() {
  return new HubSpotClient({ accessToken: ACCESS_TOKEN, baseUrl: BASE_URL });
}

describe('HubSpotClient.get', () => {
  it('returns parsed JSON on a successful GET request', async () => {
    const body = { results: [{ id: '1', properties: {} }], paging: null };
    mockFetchSuccess(body);

    const client = makeClient();
    const result = await client.get('/crm/v3/objects/deals');

    expect(result).toEqual(body);
  });

  it('sets Authorization: Bearer header on every request', async () => {
    const fetchMock = mockFetchSuccess({ results: [] });
    const client = makeClient();

    await client.get('/crm/v3/objects/deals');

    const callArgs = fetchMock.mock.calls[0];
    const requestInit = callArgs[1] as RequestInit;
    expect((requestInit.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${ACCESS_TOKEN}`
    );
  });

  it('appends query parameters to the URL, omitting undefined values', async () => {
    const fetchMock = mockFetchSuccess({ results: [] });
    const client = makeClient();

    await client.get('/crm/v3/objects/deals', {
      limit: 10,
      properties: 'dealname',
      archived: undefined,
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=10');
    expect(url).toContain('properties=dealname');
    expect(url).not.toContain('archived');
  });

  it('throws HubSpotApiError with statusCode 401 on authentication failure', async () => {
    mockFetchError(
      { status: 'error', message: 'Unauthorized', category: 'INVALID_AUTHENTICATION' },
      401
    );
    const client = makeClient();

    let thrownError: unknown;
    try {
      await client.get('/crm/v3/objects/deals');
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HubSpotApiError);
    expect((thrownError as HubSpotApiError).statusCode).toBe(401);
  });

  it('throws HubSpotApiError with statusCode 404 when resource is not found', async () => {
    mockFetchError(
      { status: 'error', message: 'Resource not found', category: 'OBJECT_NOT_FOUND' },
      404
    );
    const client = makeClient();

    let thrownError: unknown;
    try {
      await client.get('/crm/v3/objects/deals/999');
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HubSpotApiError);
    expect((thrownError as HubSpotApiError).statusCode).toBe(404);
  });
});

describe('HubSpotClient.post', () => {
  it('sends body as JSON with Content-Type: application/json', async () => {
    const responseBody = { id: '123', properties: { dealname: 'Test' } };
    const fetchMock = mockFetchSuccess(responseBody, 201);
    const client = makeClient();

    const requestBody = { properties: { dealname: 'Test Deal' } };
    await client.post('/crm/v3/objects/deals', requestBody);

    const callArgs = fetchMock.mock.calls[0];
    const requestInit = callArgs[1] as RequestInit;
    expect((requestInit.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json'
    );
    expect(requestInit.body).toBe(JSON.stringify(requestBody));
  });

  it('serializes body correctly without extra fields', async () => {
    const fetchMock = mockFetchSuccess({ id: '1' });
    const client = makeClient();

    const body = { properties: { amount: '5000', dealstage: 'presentationscheduled' } };
    await client.post('/crm/v3/objects/deals', body);

    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(body));
  });
});

describe('HubSpotClient retry behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries once after a 429 and succeeds on second attempt', async () => {
    const successBody = { results: [{ id: '1' }] };
    const fetchMock = mockFetchFailThenSucceed(429, successBody, {
      status: 'error',
      message: 'Too Many Requests',
    });
    const client = makeClient();

    const promise = client.get('/crm/v3/objects/deals');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual(successBody);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws HubSpotApiError after exhausting retries on persistent 500', async () => {
    mockFetchError({ status: 'error', message: 'Internal Server Error' }, 500);
    const client = makeClient();

    const promise = client.get('/crm/v3/objects/deals');

    // Pre-attach rejection handler BEFORE advancing timers to prevent unhandled rejection
    let thrownError: unknown;
    const settled = promise.catch((err) => {
      thrownError = err;
    });

    await vi.runAllTimersAsync();
    await settled;

    expect(thrownError).toBeInstanceOf(HubSpotApiError);
    expect((thrownError as HubSpotApiError).statusCode).toBe(500);
  });
});

describe('HubSpotClient.paginateAll', () => {
  it('fetches all pages and returns combined results', async () => {
    const page1 = {
      results: [{ id: '1' }, { id: '2' }],
      paging: { next: { after: 'cursor-2' } },
    };
    const page2 = {
      results: [{ id: '3' }],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue(page1),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue(page2),
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    const result = await client.paginateAll('/crm/v3/objects/deals', { limit: 2 });

    expect(result).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('HubSpotClient search limiter', () => {
  it('uses the search limiter path when useSearchLimiter is true (no throw)', async () => {
    mockFetchSuccess({ results: [] });
    const client = makeClient();

    const result = await client.request({
      method: 'POST',
      path: '/crm/v3/objects/deals/search',
      body: { filterGroups: [] },
      useSearchLimiter: true,
    });

    expect(result).toEqual({ results: [] });
  });
});
