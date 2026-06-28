/**
 * Unit tests for Schemas tools (getSchemasTools).
 *
 * Covers:
 * - hubspot_schemas_list: list all custom object schemas
 * - hubspot_schemas_get: inspect a single schema
 * - hubspot_schemas_create: define a new custom object type
 * - hubspot_schemas_update: update an existing custom object type
 * - hubspot_schemas_delete: delete a custom object type
 *
 * Strategy: mock global `fetch` to intercept HubSpotClient HTTP calls.
 * Tests validate happy paths, request shape (method + URL path), error handling,
 * and Zod validation for required fields.
 */

import { describe, it, expect } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { getSchemasTools } from '../tools/schemas/index.js';
import { type Tool } from '../types/common.js';
import { mockFetchSuccess, mockFetchError } from './mock-client.js';

const ACCESS_TOKEN = 'test-token-schemas';

function makeTools(): Tool[] {
  const client = new HubSpotClient({ accessToken: ACCESS_TOKEN });
  return getSchemasTools(client);
}

function getTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found in getSchemasTools() output`);
  return tool;
}

/** Minimal object schema fixture as returned by the Schemas API. */
const SCHEMA_FIXTURE = {
  id: '2-12345678',
  name: 'my_object',
  objectTypeId: '2-12345678',
  fullyQualifiedName: 'p1234_my_object',
  labels: { singular: 'My Object', plural: 'My Objects' },
  primaryDisplayProperty: 'my_object_name',
  properties: [{ name: 'my_object_name', label: 'Name', type: 'string', fieldType: 'text' }],
  archived: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-06-01T00:00:00.000Z',
};

const SCHEMAS_LIST_FIXTURE = {
  results: [SCHEMA_FIXTURE],
};

// ---------------------------------------------------------------------------
// Suite: getSchemasTools — exported set
// ---------------------------------------------------------------------------

describe('getSchemasTools', () => {
  it('returns exactly 5 tools', () => {
    expect(makeTools()).toHaveLength(5);
  });

  it('contains the 5 expected tool names', () => {
    const names = makeTools().map((t) => t.name);
    expect(names).toEqual([
      'hubspot_schemas_list',
      'hubspot_schemas_get',
      'hubspot_schemas_create',
      'hubspot_schemas_update',
      'hubspot_schemas_delete',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Suite: hubspot_schemas_list
// ---------------------------------------------------------------------------

describe('hubspot_schemas_list', () => {
  it('GETs /crm/v3/schemas and returns the results', async () => {
    const fetchMock = mockFetchSuccess(SCHEMAS_LIST_FIXTURE);
    const tool = getTool(makeTools(), 'hubspot_schemas_list');

    const result = await tool.handler({});

    const url = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('/crm/v3/schemas');
    expect(requestInit.method).toBe('GET');
    expect(url).toContain('archived=false');
    expect(result).toEqual(SCHEMAS_LIST_FIXTURE);
  });

  it('applies archived=true in the query', async () => {
    const fetchMock = mockFetchSuccess(SCHEMAS_LIST_FIXTURE);
    const tool = getTool(makeTools(), 'hubspot_schemas_list');

    await tool.handler({ archived: true });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('archived=true');
  });

  it('returns a structured error when the API responds 403 (missing scope)', async () => {
    mockFetchError({ message: 'Missing crm.schemas.custom.read scope' }, 403);
    const tool = getTool(makeTools(), 'hubspot_schemas_list');

    const result = (await tool.handler({})) as { isError?: boolean };
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite: hubspot_schemas_get
// ---------------------------------------------------------------------------

describe('hubspot_schemas_get', () => {
  it('GETs /crm/v3/schemas/{objectType}', async () => {
    const fetchMock = mockFetchSuccess(SCHEMA_FIXTURE);
    const tool = getTool(makeTools(), 'hubspot_schemas_get');

    const result = await tool.handler({ objectType: 'p1234_my_object' });

    const url = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('/crm/v3/schemas/p1234_my_object');
    expect(requestInit.method).toBe('GET');
    expect(result).toEqual(SCHEMA_FIXTURE);
  });

  it('throws when objectType is missing (Zod validation)', async () => {
    const tool = getTool(makeTools(), 'hubspot_schemas_get');
    await expect(tool.handler({})).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite: hubspot_schemas_create
// ---------------------------------------------------------------------------

describe('hubspot_schemas_create', () => {
  const VALID_CREATE_ARGS = {
    name: 'my_object',
    labels: { singular: 'My Object', plural: 'My Objects' },
    properties: [{ name: 'my_object_name', label: 'Name', type: 'string', fieldType: 'text' }],
  };

  it('POSTs /crm/v3/schemas with the assembled body', async () => {
    const fetchMock = mockFetchSuccess(SCHEMA_FIXTURE);
    const tool = getTool(makeTools(), 'hubspot_schemas_create');

    const result = await tool.handler(VALID_CREATE_ARGS);

    const url = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('/crm/v3/schemas');
    expect(requestInit.method).toBe('POST');

    const body = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(body.name).toBe('my_object');
    expect(body.labels).toEqual({ singular: 'My Object', plural: 'My Objects' });
    expect(body.properties).toHaveLength(1);
    expect(result).toEqual(SCHEMA_FIXTURE);
  });

  it('includes optional fields when provided', async () => {
    const fetchMock = mockFetchSuccess(SCHEMA_FIXTURE);
    const tool = getTool(makeTools(), 'hubspot_schemas_create');

    await tool.handler({
      ...VALID_CREATE_ARGS,
      primaryDisplayProperty: 'my_object_name',
      requiredProperties: ['my_object_name'],
      associatedObjects: ['CONTACT'],
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(body.primaryDisplayProperty).toBe('my_object_name');
    expect(body.requiredProperties).toEqual(['my_object_name']);
    expect(body.associatedObjects).toEqual(['CONTACT']);
  });

  it('throws when name is missing (Zod validation)', async () => {
    const tool = getTool(makeTools(), 'hubspot_schemas_create');
    await expect(
      tool.handler({
        labels: { singular: 'My Object', plural: 'My Objects' },
        properties: [{ name: 'n', label: 'N', type: 'string', fieldType: 'text' }],
      })
    ).rejects.toThrow();
  });

  it('throws when properties is empty (Zod validation)', async () => {
    const tool = getTool(makeTools(), 'hubspot_schemas_create');
    await expect(
      tool.handler({
        name: 'my_object',
        labels: { singular: 'My Object', plural: 'My Objects' },
        properties: [],
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite: hubspot_schemas_update
// ---------------------------------------------------------------------------

describe('hubspot_schemas_update', () => {
  it('PATCHes /crm/v3/schemas/{objectType} with only provided fields', async () => {
    const fetchMock = mockFetchSuccess(SCHEMA_FIXTURE);
    const tool = getTool(makeTools(), 'hubspot_schemas_update');

    const result = await tool.handler({
      objectType: '2-12345678',
      primaryDisplayProperty: 'my_object_name',
      labels: { plural: 'My Objects Renamed' },
    });

    const url = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('/crm/v3/schemas/2-12345678');
    expect(requestInit.method).toBe('PATCH');

    const body = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(body.primaryDisplayProperty).toBe('my_object_name');
    expect(body.labels).toEqual({ plural: 'My Objects Renamed' });
    expect(body.objectType).toBeUndefined();
    expect(result).toEqual(SCHEMA_FIXTURE);
  });

  it('throws when objectType is missing (Zod validation)', async () => {
    const tool = getTool(makeTools(), 'hubspot_schemas_update');
    await expect(tool.handler({ primaryDisplayProperty: 'x' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite: hubspot_schemas_delete
// ---------------------------------------------------------------------------

describe('hubspot_schemas_delete', () => {
  it('DELETEs /crm/v3/schemas/{objectType}', async () => {
    const fetchMock = mockFetchSuccess({});
    const tool = getTool(makeTools(), 'hubspot_schemas_delete');

    await tool.handler({ objectType: 'p1234_my_object' });

    const url = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('/crm/v3/schemas/p1234_my_object');
    expect(requestInit.method).toBe('DELETE');
    expect(url).not.toContain('archived=');
  });

  it('appends archived=true for a hard delete', async () => {
    const fetchMock = mockFetchSuccess({});
    const tool = getTool(makeTools(), 'hubspot_schemas_delete');

    await tool.handler({ objectType: 'p1234_my_object', archived: true });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('archived=true');
  });

  it('throws when objectType is missing (Zod validation)', async () => {
    const tool = getTool(makeTools(), 'hubspot_schemas_delete');
    await expect(tool.handler({})).rejects.toThrow();
  });
});
