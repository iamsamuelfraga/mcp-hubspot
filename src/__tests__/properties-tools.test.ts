/**
 * Unit tests for Properties v3 tools.
 *
 * Tests each tool's handler in isolation using a real HubSpotClient instance
 * with a mocked global `fetch`. Covers:
 * - Happy path: correct API call shape and response mapping
 * - Error path: HubSpotApiError propagation
 * - Zod validation: invalid input rejected before fetch
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { getPropertiesTools } from '../tools/properties/index.js';
import { mockFetchSuccess, mockFetchError } from './mock-client.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'test-token-properties';

function createClient(): HubSpotClient {
  return new HubSpotClient({ accessToken: VALID_TOKEN });
}

function getTool(name: string) {
  const client = createClient();
  const tools = getPropertiesTools(client);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

const mockPropertyDefinition = {
  name: 'dealname',
  label: 'Deal Name',
  type: 'string',
  fieldType: 'text',
  groupName: 'dealinformation',
  description: 'The name of the deal',
  options: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
  archived: false,
  hubspotDefined: true,
};

// ---------------------------------------------------------------------------
// getPropertiesTools — registration
// ---------------------------------------------------------------------------

describe('getPropertiesTools', () => {
  it('returns exactly 3 tools', () => {
    const client = createClient();
    const tools = getPropertiesTools(client);
    expect(tools).toHaveLength(3);
  });

  it('exposes the expected tool names', () => {
    const client = createClient();
    const names = getPropertiesTools(client).map((t) => t.name);
    expect(names).toContain('hubspot_properties_list');
    expect(names).toContain('hubspot_properties_get');
    expect(names).toContain('hubspot_properties_create');
  });

  it('each tool has a non-empty description', () => {
    const client = createClient();
    for (const tool of getPropertiesTools(client)) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('each tool has an inputSchema with type="object"', () => {
    const client = createClient();
    for (const tool of getPropertiesTools(client)) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// hubspot_properties_list
// ---------------------------------------------------------------------------

describe('hubspot_properties_list', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls GET to the correct path with defaults', async () => {
    const mockFetch = mockFetchSuccess({
      results: [mockPropertyDefinition],
    });
    const tool = getTool('hubspot_properties_list');

    const result = await tool.handler({ objectType: 'deals' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('/crm/v3/properties/deals');
    expect(url).toContain('archived=false');

    const res = result as Record<string, unknown>;
    expect(res.objectType).toBe('deals');
    expect(res.total).toBe(1);
    expect((res.results as unknown[])[0]).toEqual(mockPropertyDefinition);
  });

  it('passes archived=true when requested', async () => {
    const mockFetch = mockFetchSuccess({ results: [] });
    const tool = getTool('hubspot_properties_list');

    await tool.handler({ objectType: 'contacts', archived: true });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('archived=true');
  });

  it('works with engagement object types like "calls"', async () => {
    const mockFetch = mockFetchSuccess({ results: [] });
    const tool = getTool('hubspot_properties_list');

    await tool.handler({ objectType: 'calls' });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('/crm/v3/properties/calls');
  });

  it('returns error response on 404', async () => {
    mockFetchError(
      { status: 'error', message: 'Object type not found', category: 'OBJECT_NOT_FOUND' },
      404
    );
    const tool = getTool('hubspot_properties_list');

    const result = await tool.handler({ objectType: 'nonexistent_type' });

    expect((result as Record<string, unknown>).isError).toBe(true);
    expect(
      ((result as Record<string, unknown>).content as Array<{ text: string }>)[0].text
    ).toContain('not found');
  });

  it('throws ZodError when objectType is missing', async () => {
    const tool = getTool('hubspot_properties_list');
    await expect(tool.handler({})).rejects.toThrow();
  });

  it('throws ZodError when objectType is an empty string', async () => {
    const tool = getTool('hubspot_properties_list');
    await expect(tool.handler({ objectType: '' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hubspot_properties_get
// ---------------------------------------------------------------------------

describe('hubspot_properties_get', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls GET to the correct path with objectType and propertyName', async () => {
    const mockFetch = mockFetchSuccess(mockPropertyDefinition);
    const tool = getTool('hubspot_properties_get');

    const result = await tool.handler({ objectType: 'deals', propertyName: 'dealname' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('/crm/v3/properties/deals/dealname');

    // Result is the raw property definition
    expect((result as Record<string, unknown>).name).toBe('dealname');
    expect((result as Record<string, unknown>).type).toBe('string');
  });

  it('returns enumeration property with options', async () => {
    const enumProperty = {
      ...mockPropertyDefinition,
      name: 'dealstage',
      label: 'Deal Stage',
      type: 'enumeration',
      fieldType: 'select',
      options: [
        {
          label: 'Appointment Scheduled',
          value: 'appointmentscheduled',
          displayOrder: 0,
          hidden: false,
        },
        { label: 'Closed Won', value: 'closedwon', displayOrder: 5, hidden: false },
      ],
    };
    mockFetchSuccess(enumProperty);
    const tool = getTool('hubspot_properties_get');

    const result = await tool.handler({ objectType: 'deals', propertyName: 'dealstage' });

    const res = result as Record<string, unknown>;
    expect(res.type).toBe('enumeration');
    expect((res.options as unknown[]).length).toBe(2);
  });

  it('returns error response on 404 when property does not exist', async () => {
    mockFetchError(
      { status: 'error', message: 'Property does not exist', category: 'OBJECT_NOT_FOUND' },
      404
    );
    const tool = getTool('hubspot_properties_get');

    const result = await tool.handler({ objectType: 'deals', propertyName: 'nonexistent' });

    expect((result as Record<string, unknown>).isError).toBe(true);
  });

  it('returns error response on 401 when token is invalid', async () => {
    mockFetchError({ status: 'error', message: 'Unauthorized' }, 401);
    const tool = getTool('hubspot_properties_get');

    const result = await tool.handler({ objectType: 'deals', propertyName: 'dealname' });

    expect((result as Record<string, unknown>).isError).toBe(true);
    expect(
      ((result as Record<string, unknown>).content as Array<{ text: string }>)[0].text
    ).toContain('Authentication failed');
  });

  it('throws ZodError when propertyName is missing', async () => {
    const tool = getTool('hubspot_properties_get');
    await expect(tool.handler({ objectType: 'deals' })).rejects.toThrow();
  });

  it('throws ZodError when objectType is missing', async () => {
    const tool = getTool('hubspot_properties_get');
    await expect(tool.handler({ propertyName: 'dealname' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hubspot_properties_create
// ---------------------------------------------------------------------------

describe('hubspot_properties_create', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const createdPropertyResponse = {
    name: 'custom_priority',
    label: 'Custom Priority',
    type: 'enumeration',
    fieldType: 'select',
    groupName: 'dealinformation',
    description: 'Custom deal priority level',
    options: [
      { label: 'High', value: 'high' },
      { label: 'Low', value: 'low' },
    ],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    archived: false,
    hubspotDefined: false,
  };

  it('calls POST to the correct path with property body', async () => {
    const mockFetch = mockFetchSuccess(createdPropertyResponse);
    const tool = getTool('hubspot_properties_create');

    const result = await tool.handler({
      objectType: 'deals',
      name: 'custom_priority',
      label: 'Custom Priority',
      type: 'enumeration',
      fieldType: 'select',
      groupName: 'dealinformation',
      description: 'Custom deal priority level',
      options: [
        { label: 'High', value: 'high' },
        { label: 'Low', value: 'low' },
      ],
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v3/properties/deals');
    expect((options as RequestInit).method).toBe('POST');

    const body = JSON.parse((options as RequestInit).body as string);
    // objectType must NOT be in the body — it's a path param
    expect(body).not.toHaveProperty('objectType');
    expect(body.name).toBe('custom_priority');
    expect(body.type).toBe('enumeration');
    expect(body.options).toHaveLength(2);

    const res = result as Record<string, unknown>;
    expect(res.name).toBe('custom_priority');
    expect(res.hubspotDefined).toBe(false);
  });

  it('creates a simple text property without options', async () => {
    const mockFetch = mockFetchSuccess({
      name: 'external_ref',
      label: 'External Reference',
      type: 'string',
      fieldType: 'text',
      groupName: 'dealinformation',
      description: '',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      archived: false,
      hubspotDefined: false,
    });
    const tool = getTool('hubspot_properties_create');

    await tool.handler({
      objectType: 'deals',
      name: 'external_ref',
      label: 'External Reference',
      type: 'string',
      fieldType: 'text',
      groupName: 'dealinformation',
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.type).toBe('string');
    expect(body.fieldType).toBe('text');
    expect(body.options).toBeUndefined();
  });

  it('returns error response on 409 conflict (property already exists)', async () => {
    mockFetchError(
      {
        status: 'error',
        message: 'Property already exists',
        category: 'VALIDATION_ERROR',
      },
      409
    );
    const tool = getTool('hubspot_properties_create');

    const result = await tool.handler({
      objectType: 'deals',
      name: 'dealname',
      label: 'Deal Name',
      type: 'string',
      fieldType: 'text',
      groupName: 'dealinformation',
    });

    expect((result as Record<string, unknown>).isError).toBe(true);
  });

  it('throws ZodError when name contains invalid characters', async () => {
    const tool = getTool('hubspot_properties_create');
    await expect(
      tool.handler({
        objectType: 'deals',
        name: 'My Custom Field!', // spaces and ! are invalid
        label: 'My Custom Field',
        type: 'string',
        fieldType: 'text',
        groupName: 'dealinformation',
      })
    ).rejects.toThrow();
  });

  it('throws ZodError when type is invalid', async () => {
    const tool = getTool('hubspot_properties_create');
    await expect(
      tool.handler({
        objectType: 'deals',
        name: 'my_field',
        label: 'My Field',
        type: 'invalid_type', // not in enum
        fieldType: 'text',
        groupName: 'dealinformation',
      })
    ).rejects.toThrow();
  });

  it('throws ZodError when fieldType is invalid', async () => {
    const tool = getTool('hubspot_properties_create');
    await expect(
      tool.handler({
        objectType: 'deals',
        name: 'my_field',
        label: 'My Field',
        type: 'string',
        fieldType: 'invalid_field_type',
        groupName: 'dealinformation',
      })
    ).rejects.toThrow();
  });

  it('throws ZodError when required fields are missing', async () => {
    const tool = getTool('hubspot_properties_create');
    await expect(
      tool.handler({
        objectType: 'deals',
        name: 'my_field',
        // label, type, fieldType, groupName missing
      })
    ).rejects.toThrow();
  });

  it('returns error response on 500 server error', async () => {
    mockFetchError({ status: 'error', message: 'Internal Server Error' }, 500);
    const tool = getTool('hubspot_properties_create');

    const result = await tool.handler({
      objectType: 'contacts',
      name: 'test_field',
      label: 'Test Field',
      type: 'string',
      fieldType: 'text',
      groupName: 'contactinformation',
    });

    expect((result as Record<string, unknown>).isError).toBe(true);
    expect(
      ((result as Record<string, unknown>).content as Array<{ text: string }>)[0].text
    ).toContain('server error');
  });
});
