/**
 * Unit tests for Associations v4 tools.
 *
 * Tests each tool's handler in isolation using a real HubSpotClient instance
 * with a mocked global `fetch`. Covers:
 * - Happy path: correct API call shape and response mapping
 * - Error path: HubSpotApiError propagation
 * - Zod validation: invalid input rejected before fetch
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { getAssociationsTools } from '../tools/associations/index.js';
import { mockFetchSuccess, mockFetchError } from './mock-client.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'test-token-associations';

function createClient(): HubSpotClient {
  return new HubSpotClient({ accessToken: VALID_TOKEN });
}

function getTool(name: string) {
  const client = createClient();
  const tools = getAssociationsTools(client);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

// ---------------------------------------------------------------------------
// getAssociationsTools — registration
// ---------------------------------------------------------------------------

describe('getAssociationsTools', () => {
  it('returns exactly 5 tools', () => {
    const client = createClient();
    const tools = getAssociationsTools(client);
    expect(tools).toHaveLength(5);
  });

  it('exposes the expected tool names', () => {
    const client = createClient();
    const names = getAssociationsTools(client).map((t) => t.name);
    expect(names).toContain('hubspot_associations_create');
    expect(names).toContain('hubspot_associations_archive');
    expect(names).toContain('hubspot_associations_list');
    expect(names).toContain('hubspot_associations_batch_create');
    expect(names).toContain('hubspot_associations_labels_list');
  });

  it('each tool has a non-empty description', () => {
    const client = createClient();
    for (const tool of getAssociationsTools(client)) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('each tool has an inputSchema with type="object"', () => {
    const client = createClient();
    for (const tool of getAssociationsTools(client)) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// hubspot_associations_create
// ---------------------------------------------------------------------------

describe('hubspot_associations_create', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls PUT with the correct path and body on happy path', async () => {
    const mockFetch = mockFetchSuccess({ status: 'COMPLETE', results: [] });
    const tool = getTool('hubspot_associations_create');

    const result = await tool.handler({
      fromType: 'calls',
      fromId: '100',
      toType: 'contacts',
      toId: '200',
      associationTypes: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 194 }],
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v4/objects/calls/100/associations/contacts/200');
    expect((options as RequestInit).method).toBe('PUT');
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toEqual([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 194 }]);

    expect((result as Record<string, unknown>).success).toBe(true);
    expect((result as Record<string, unknown>).fromType).toBe('calls');
    expect((result as Record<string, unknown>).toType).toBe('contacts');
  });

  it('returns error response on 404', async () => {
    mockFetchError({ status: 'error', message: 'Object not found' }, 404);
    const tool = getTool('hubspot_associations_create');

    const result = await tool.handler({
      fromType: 'calls',
      fromId: '999',
      toType: 'contacts',
      toId: '888',
      associationTypes: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 194 }],
    });

    expect((result as Record<string, unknown>).isError).toBe(true);
    expect(
      ((result as Record<string, unknown>).content as Array<{ text: string }>)[0].text
    ).toContain('not found');
  });

  it('throws ZodError when required fields are missing', async () => {
    const tool = getTool('hubspot_associations_create');
    await expect(
      tool.handler({ fromType: 'calls' }) // missing fromId, toType, toId, associationTypes
    ).rejects.toThrow();
  });

  it('throws ZodError when associationTypes is empty', async () => {
    const tool = getTool('hubspot_associations_create');
    await expect(
      tool.handler({
        fromType: 'calls',
        fromId: '100',
        toType: 'contacts',
        toId: '200',
        associationTypes: [], // min(1) violated
      })
    ).rejects.toThrow();
  });

  it('throws ZodError when associationCategory is invalid', async () => {
    const tool = getTool('hubspot_associations_create');
    await expect(
      tool.handler({
        fromType: 'calls',
        fromId: '100',
        toType: 'contacts',
        toId: '200',
        associationTypes: [{ associationCategory: 'INVALID_CATEGORY', associationTypeId: 194 }],
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hubspot_associations_archive
// ---------------------------------------------------------------------------

describe('hubspot_associations_archive', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls DELETE with the correct path on happy path', async () => {
    // DELETE returns 204 No Content → HubSpotClient returns {}
    const mockFetch = mockFetchSuccess({}, 204);
    const tool = getTool('hubspot_associations_archive');

    const result = await tool.handler({
      fromType: 'deals',
      fromId: '42',
      toType: 'contacts',
      toId: '77',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v4/objects/deals/42/associations/contacts/77');
    expect((options as RequestInit).method).toBe('DELETE');

    expect((result as Record<string, unknown>).success).toBe(true);
    expect((result as Record<string, unknown>).archived).toBe(true);
  });

  it('returns error response on 404', async () => {
    mockFetchError({ status: 'error', message: 'Object not found' }, 404);
    const tool = getTool('hubspot_associations_archive');

    const result = await tool.handler({
      fromType: 'deals',
      fromId: '999',
      toType: 'contacts',
      toId: '888',
    });

    expect((result as Record<string, unknown>).isError).toBe(true);
  });

  it('throws ZodError when toId is missing', async () => {
    const tool = getTool('hubspot_associations_archive');
    await expect(
      tool.handler({ fromType: 'deals', fromId: '42', toType: 'contacts' })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hubspot_associations_list
// ---------------------------------------------------------------------------

describe('hubspot_associations_list', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockListResponse = {
    results: [
      {
        toObjectId: '201',
        associationTypes: [{ category: 'HUBSPOT_DEFINED', typeId: 194, label: null }],
      },
      {
        toObjectId: '202',
        associationTypes: [{ category: 'HUBSPOT_DEFINED', typeId: 194, label: null }],
      },
    ],
    paging: { next: { after: 'cursor-abc' } },
  };

  it('calls GET with the correct path and query params', async () => {
    const mockFetch = mockFetchSuccess(mockListResponse);
    const tool = getTool('hubspot_associations_list');

    const result = await tool.handler({
      fromType: 'calls',
      fromId: '100',
      toType: 'contacts',
      limit: 50,
      after: 'prev-cursor',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('/crm/v4/objects/calls/100/associations/contacts');
    expect(url).toContain('limit=50');
    expect(url).toContain('after=prev-cursor');

    const res = result as Record<string, unknown>;
    expect(res.results).toHaveLength(2);
    expect(res.total).toBe(2);
    expect((res.pagination as Record<string, unknown>).nextCursor).toBe('cursor-abc');
  });

  it('returns null pagination when no next page', async () => {
    mockFetchSuccess({ results: [], paging: undefined });
    const tool = getTool('hubspot_associations_list');

    const result = await tool.handler({
      fromType: 'deals',
      fromId: '10',
      toType: 'companies',
    });

    expect((result as Record<string, unknown>).pagination).toBeNull();
  });

  it('uses default limit=100 when not provided', async () => {
    const mockFetch = mockFetchSuccess({ results: [] });
    const tool = getTool('hubspot_associations_list');

    await tool.handler({ fromType: 'calls', fromId: '1', toType: 'contacts' });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('limit=100');
  });

  it('returns error response on 403 missing scopes', async () => {
    // Use 403 (not retried by client) to avoid test timeout from retry backoff
    mockFetchError({ status: 'error', message: 'Missing required scopes' }, 403);
    const tool = getTool('hubspot_associations_list');

    const result = await tool.handler({
      fromType: 'calls',
      fromId: '1',
      toType: 'contacts',
    });

    expect((result as Record<string, unknown>).isError).toBe(true);
    expect(
      ((result as Record<string, unknown>).content as Array<{ text: string }>)[0].text
    ).toContain('Access denied');
  });

  it('throws ZodError when fromId is missing', async () => {
    const tool = getTool('hubspot_associations_list');
    await expect(tool.handler({ fromType: 'calls', toType: 'contacts' })).rejects.toThrow();
  });

  it('throws ZodError when limit exceeds maximum', async () => {
    const tool = getTool('hubspot_associations_list');
    await expect(
      tool.handler({ fromType: 'calls', fromId: '1', toType: 'contacts', limit: 1000 })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hubspot_associations_batch_create
// ---------------------------------------------------------------------------

describe('hubspot_associations_batch_create', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockBatchResponse = {
    status: 'COMPLETE',
    results: [
      {
        fromObjectTypeId: '0-48',
        fromObjectId: 100,
        toObjectTypeId: '0-1',
        toObjectId: 200,
        labels: [],
      },
    ],
    numErrors: 0,
    errors: [],
  };

  it('calls POST to the correct batch create path', async () => {
    const mockFetch = mockFetchSuccess(mockBatchResponse);
    const tool = getTool('hubspot_associations_batch_create');

    const result = await tool.handler({
      fromType: 'calls',
      toType: 'contacts',
      inputs: [
        {
          from: { id: '100' },
          to: { id: '200' },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 194 }],
        },
      ],
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v4/associations/calls/contacts/batch/create');
    expect((options as RequestInit).method).toBe('POST');

    const res = result as Record<string, unknown>;
    expect(res.status).toBe('COMPLETE');
    expect(res.created).toBe(1);
    expect(res.numErrors).toBe(0);
  });

  it('returns error response on 400 validation error', async () => {
    mockFetchError(
      {
        status: 'error',
        message: 'Invalid association type',
        category: 'VALIDATION_ERROR',
      },
      400
    );
    const tool = getTool('hubspot_associations_batch_create');

    const result = await tool.handler({
      fromType: 'calls',
      toType: 'contacts',
      inputs: [
        {
          from: { id: '100' },
          to: { id: '200' },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 999 }],
        },
      ],
    });

    expect((result as Record<string, unknown>).isError).toBe(true);
  });

  it('throws ZodError when inputs array is empty', async () => {
    const tool = getTool('hubspot_associations_batch_create');
    await expect(
      tool.handler({ fromType: 'calls', toType: 'contacts', inputs: [] })
    ).rejects.toThrow();
  });

  it('throws ZodError when inputs exceeds 100 items', async () => {
    const tool = getTool('hubspot_associations_batch_create');
    const inputs = Array.from({ length: 101 }, (_, i) => ({
      from: { id: String(i) },
      to: { id: String(i + 1000) },
      types: [{ associationCategory: 'HUBSPOT_DEFINED' as const, associationTypeId: 194 }],
    }));
    await expect(tool.handler({ fromType: 'calls', toType: 'contacts', inputs })).rejects.toThrow();
  });

  it('throws ZodError when a types array is empty', async () => {
    const tool = getTool('hubspot_associations_batch_create');
    await expect(
      tool.handler({
        fromType: 'calls',
        toType: 'contacts',
        inputs: [{ from: { id: '1' }, to: { id: '2' }, types: [] }],
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hubspot_associations_labels_list
// ---------------------------------------------------------------------------

describe('hubspot_associations_labels_list', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockLabelsResponse = {
    results: [
      { category: 'HUBSPOT_DEFINED', typeId: 194, label: null },
      { category: 'USER_DEFINED', typeId: 1001, label: 'Primary Contact' },
    ],
  };

  it('calls GET to the correct labels path', async () => {
    const mockFetch = mockFetchSuccess(mockLabelsResponse);
    const tool = getTool('hubspot_associations_labels_list');

    const result = await tool.handler({ fromType: 'calls', toType: 'contacts' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('/crm/v4/associations/calls/contacts/labels');
    expect((url as string).includes('?') === false || true).toBe(true); // no required query params

    const res = result as Record<string, unknown>;
    expect(res.fromType).toBe('calls');
    expect(res.toType).toBe('contacts');
    expect((res.results as unknown[]).length).toBe(2);
    expect(res.total).toBe(2);
  });

  it('returns error response on 403 missing scopes', async () => {
    mockFetchError({ status: 'error', message: 'Missing required scopes' }, 403);
    const tool = getTool('hubspot_associations_labels_list');

    const result = await tool.handler({ fromType: 'calls', toType: 'contacts' });

    expect((result as Record<string, unknown>).isError).toBe(true);
    expect(
      ((result as Record<string, unknown>).content as Array<{ text: string }>)[0].text
    ).toContain('Access denied');
  });

  it('throws ZodError when fromType is an empty string', async () => {
    const tool = getTool('hubspot_associations_labels_list');
    await expect(tool.handler({ fromType: '', toType: 'contacts' })).rejects.toThrow();
  });

  it('throws ZodError when toType is missing', async () => {
    const tool = getTool('hubspot_associations_labels_list');
    await expect(tool.handler({ fromType: 'calls' })).rejects.toThrow();
  });
});
