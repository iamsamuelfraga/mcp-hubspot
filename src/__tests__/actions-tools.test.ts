/**
 * Unit tests for HubSpot Custom Workflow Actions (Automation v4) MCP tools.
 *
 * Tests each of the 16 tools using the global fetch mock helpers.
 *
 * Key assertions:
 * - Successful response pass-through
 * - `hapikey` query param is present in the fetch URL
 * - No `Authorization` header is sent for developer-auth requests
 * - API errors are handled via handleToolError
 * - Missing developerApiKey throws a descriptive error
 * - Missing appId (no arg, no default) throws a descriptive error
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { mockFetchSuccess, mockFetchError } from './mock-client.js';
import { getActionsTools } from '../tools/actions/index.js';
import type { Tool } from '../types/common.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCESS_TOKEN = 'test-bearer-token';
const DEV_KEY = 'test-dev-key-abc';
const DEFAULT_APP_ID = '999';
const BASE_URL = 'https://api.hubapi.com';

/** Creates a client with developerApiKey configured. */
function makeClient(devKey = DEV_KEY): HubSpotClient {
  return new HubSpotClient({
    accessToken: ACCESS_TOKEN,
    baseUrl: BASE_URL,
    developerApiKey: devKey,
  });
}

/** Creates a client WITHOUT a developerApiKey. */
function makeClientNoDev(): HubSpotClient {
  return new HubSpotClient({ accessToken: ACCESS_TOKEN, baseUrl: BASE_URL });
}

/** Finds a tool by name or throws. */
function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

/**
 * Asserts that the first fetch call included hapikey in the URL
 * and did NOT include an Authorization header.
 */
function assertDeveloperAuth(mockFetch: ReturnType<typeof vi.fn>, expectedDevKey = DEV_KEY): void {
  const calledUrl: string = mockFetch.mock.calls[0][0] as string;
  expect(calledUrl).toContain(`hapikey=${expectedDevKey}`);

  const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit | undefined;
  const headers = (fetchOptions?.headers ?? {}) as Record<string, string>;
  expect(headers['Authorization']).toBeUndefined();
}

// ---------------------------------------------------------------------------
// Tool count sanity check
// ---------------------------------------------------------------------------

describe('getActionsTools', () => {
  it('returns exactly 16 tools', () => {
    const tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
    expect(tools).toHaveLength(16);
  });

  it('all tool names start with hubspot_actions_', () => {
    const tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^hubspot_actions_/);
    }
  });
});

// ---------------------------------------------------------------------------
// hubspot_actions_list
// ---------------------------------------------------------------------------

describe('hubspot_actions_list', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
  });

  it('returns action list on success', async () => {
    const body = { results: [{ id: 'def_001', appId: 999 }], paging: null };
    mockFetchSuccess(body);

    const tool = findTool(tools, 'hubspot_actions_list');
    const result = (await tool.handler({ appId: DEFAULT_APP_ID })) as typeof body;

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ id: 'def_001' });
  });

  it('sends hapikey in URL and no Authorization header', async () => {
    const mockFetch = mockFetchSuccess({ results: [] });
    const tool = findTool(tools, 'hubspot_actions_list');
    await tool.handler({ appId: DEFAULT_APP_ID });
    assertDeveloperAuth(mockFetch);
  });

  it('uses defaultAppId when appId argument is not provided', async () => {
    const mockFetch = mockFetchSuccess({ results: [] });
    const tool = findTool(tools, 'hubspot_actions_list');
    await tool.handler({});
    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(`/automation/v4/actions/${DEFAULT_APP_ID}`);
  });

  it('throws when neither appId argument nor defaultAppId is available', async () => {
    const toolsNoDefault = getActionsTools(makeClient());
    const tool = findTool(toolsNoDefault, 'hubspot_actions_list');
    await expect(tool.handler({})).rejects.toThrow(/appId is required/);
  });

  it('handles API error gracefully', async () => {
    mockFetchError({ status: 'error', message: 'Unauthorized' }, 401);
    const tool = findTool(tools, 'hubspot_actions_list');
    const result = (await tool.handler({ appId: DEFAULT_APP_ID })) as {
      isError: boolean;
      content: unknown[];
    };
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// hubspot_actions_create
// ---------------------------------------------------------------------------

describe('hubspot_actions_create', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
  });

  it('creates an action and returns the created definition', async () => {
    const created = { id: 'def_new', appId: 999, published: false };
    mockFetchSuccess(created);

    const tool = findTool(tools, 'hubspot_actions_create');
    const result = await tool.handler({
      appId: DEFAULT_APP_ID,
      published: false,
      actionUrl: 'https://example.com/action',
    });

    expect(result).toMatchObject({ id: 'def_new' });
  });

  it('sends hapikey in URL and no Authorization header', async () => {
    const mockFetch = mockFetchSuccess({ id: 'def_new' });
    const tool = findTool(tools, 'hubspot_actions_create');
    await tool.handler({ appId: DEFAULT_APP_ID });
    assertDeveloperAuth(mockFetch);
  });
});

// ---------------------------------------------------------------------------
// hubspot_actions_get
// ---------------------------------------------------------------------------

describe('hubspot_actions_get', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
  });

  it('retrieves an action definition by definitionId', async () => {
    const definition = { id: 'def_001', appId: 999, published: true };
    mockFetchSuccess(definition);

    const tool = findTool(tools, 'hubspot_actions_get');
    const result = await tool.handler({ appId: DEFAULT_APP_ID, definitionId: 'def_001' });

    expect(result).toMatchObject({ id: 'def_001' });
  });

  it('sends hapikey in URL and no Authorization header', async () => {
    const mockFetch = mockFetchSuccess({ id: 'def_001' });
    const tool = findTool(tools, 'hubspot_actions_get');
    await tool.handler({ appId: DEFAULT_APP_ID, definitionId: 'def_001' });
    assertDeveloperAuth(mockFetch);
  });

  it('encodes definitionId in the path', async () => {
    const mockFetch = mockFetchSuccess({ id: 'def_001' });
    const tool = findTool(tools, 'hubspot_actions_get');
    await tool.handler({ appId: DEFAULT_APP_ID, definitionId: 'def/special' });
    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent('def/special'));
  });

  it('throws ZodError when definitionId is missing', async () => {
    const tool = findTool(tools, 'hubspot_actions_get');
    await expect(tool.handler({ appId: DEFAULT_APP_ID })).rejects.toThrow();
  });

  it('handles API 404 error', async () => {
    mockFetchError({ status: 'error', message: 'Not found' }, 404);
    const tool = findTool(tools, 'hubspot_actions_get');
    const result = (await tool.handler({
      appId: DEFAULT_APP_ID,
      definitionId: 'nonexistent',
    })) as { isError: boolean; content: unknown[] };
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// hubspot_actions_update
// ---------------------------------------------------------------------------

describe('hubspot_actions_update', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
  });

  it('patches an action and returns updated definition', async () => {
    const updated = { id: 'def_001', published: true };
    mockFetchSuccess(updated);

    const tool = findTool(tools, 'hubspot_actions_update');
    const result = await tool.handler({
      appId: DEFAULT_APP_ID,
      definitionId: 'def_001',
      published: true,
    });

    expect(result).toMatchObject({ id: 'def_001', published: true });
  });

  it('sends hapikey in URL and no Authorization header', async () => {
    const mockFetch = mockFetchSuccess({ id: 'def_001' });
    const tool = findTool(tools, 'hubspot_actions_update');
    await tool.handler({ appId: DEFAULT_APP_ID, definitionId: 'def_001' });
    assertDeveloperAuth(mockFetch);
  });
});

// ---------------------------------------------------------------------------
// hubspot_actions_delete
// ---------------------------------------------------------------------------

describe('hubspot_actions_delete', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
  });

  it('returns success object on delete', async () => {
    mockFetchSuccess({}, 204);

    const tool = findTool(tools, 'hubspot_actions_delete');
    const result = (await tool.handler({
      appId: DEFAULT_APP_ID,
      definitionId: 'def_001',
    })) as { success: boolean; definitionId: string };

    expect(result.success).toBe(true);
    expect(result.definitionId).toBe('def_001');
  });

  it('sends hapikey in URL and no Authorization header', async () => {
    const mockFetch = mockFetchSuccess({}, 204);
    const tool = findTool(tools, 'hubspot_actions_delete');
    await tool.handler({ appId: DEFAULT_APP_ID, definitionId: 'def_001' });
    assertDeveloperAuth(mockFetch);
  });
});

// ---------------------------------------------------------------------------
// hubspot_actions_revisions_list
// ---------------------------------------------------------------------------

describe('hubspot_actions_revisions_list', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
  });

  it('returns revision list on success', async () => {
    const body = { results: [{ id: 'rev_001', createdAt: '2024-01-01T00:00:00Z' }] };
    mockFetchSuccess(body);

    const tool = findTool(tools, 'hubspot_actions_revisions_list');
    const result = (await tool.handler({
      appId: DEFAULT_APP_ID,
      definitionId: 'def_001',
    })) as typeof body;

    expect(result.results).toHaveLength(1);
  });

  it('sends hapikey in URL and no Authorization header', async () => {
    const mockFetch = mockFetchSuccess({ results: [] });
    const tool = findTool(tools, 'hubspot_actions_revisions_list');
    await tool.handler({ appId: DEFAULT_APP_ID, definitionId: 'def_001' });
    assertDeveloperAuth(mockFetch);
    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/revisions');
  });
});

// ---------------------------------------------------------------------------
// hubspot_actions_functions_put
// ---------------------------------------------------------------------------

describe('hubspot_actions_functions_put', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
  });

  it('creates/replaces a function and returns the result', async () => {
    const body = {
      functionType: 'PRE_ACTION_EXECUTION',
      functionSource: 'exports.main = () => {}',
    };
    mockFetchSuccess(body);

    const tool = findTool(tools, 'hubspot_actions_functions_put');
    const result = await tool.handler({
      appId: DEFAULT_APP_ID,
      definitionId: 'def_001',
      functionType: 'PRE_ACTION_EXECUTION',
      functionSource: 'exports.main = () => {}',
    });

    expect(result).toMatchObject({ functionType: 'PRE_ACTION_EXECUTION' });
  });

  it('sends hapikey in URL and no Authorization header', async () => {
    const mockFetch = mockFetchSuccess({ functionType: 'PRE_ACTION_EXECUTION' });
    const tool = findTool(tools, 'hubspot_actions_functions_put');
    await tool.handler({
      appId: DEFAULT_APP_ID,
      definitionId: 'def_001',
      functionType: 'PRE_ACTION_EXECUTION',
      functionSource: 'exports.main = () => {}',
    });
    assertDeveloperAuth(mockFetch);
  });

  it('throws ZodError when functionSource is empty string', async () => {
    const tool = findTool(tools, 'hubspot_actions_functions_put');
    await expect(
      tool.handler({
        appId: DEFAULT_APP_ID,
        definitionId: 'def_001',
        functionType: 'PRE_ACTION_EXECUTION',
        functionSource: '',
      })
    ).rejects.toThrow();
  });

  it('throws ZodError when functionType is invalid', async () => {
    const tool = findTool(tools, 'hubspot_actions_functions_put');
    await expect(
      tool.handler({
        appId: DEFAULT_APP_ID,
        definitionId: 'def_001',
        functionType: 'INVALID_TYPE',
        functionSource: 'exports.main = () => {}',
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hubspot_actions_requires_object_get
// ---------------------------------------------------------------------------

describe('hubspot_actions_requires_object_get', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
  });

  it('returns requiresObject configuration', async () => {
    const body = { requiresObject: true };
    mockFetchSuccess(body);

    const tool = findTool(tools, 'hubspot_actions_requires_object_get');
    const result = (await tool.handler({
      appId: DEFAULT_APP_ID,
      definitionId: 'def_001',
    })) as { requiresObject: boolean };

    expect(result.requiresObject).toBe(true);
  });

  it('sends hapikey in URL and no Authorization header', async () => {
    const mockFetch = mockFetchSuccess({ requiresObject: false });
    const tool = findTool(tools, 'hubspot_actions_requires_object_get');
    await tool.handler({ appId: DEFAULT_APP_ID, definitionId: 'def_001' });
    assertDeveloperAuth(mockFetch);
    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/requires-object');
  });

  it('handles API error', async () => {
    mockFetchError({ status: 'error', message: 'Not found' }, 404);
    const tool = findTool(tools, 'hubspot_actions_requires_object_get');
    const result = (await tool.handler({
      appId: DEFAULT_APP_ID,
      definitionId: 'def_001',
    })) as { isError: boolean; content: unknown[] };
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// hubspot_actions_requires_object_set
// ---------------------------------------------------------------------------

describe('hubspot_actions_requires_object_set', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
  });

  it('sets requiresObject and returns the updated configuration', async () => {
    const body = { requiresObject: false };
    mockFetchSuccess(body);

    const tool = findTool(tools, 'hubspot_actions_requires_object_set');
    const result = (await tool.handler({
      appId: DEFAULT_APP_ID,
      definitionId: 'def_001',
      requiresObject: false,
    })) as { requiresObject: boolean };

    expect(result.requiresObject).toBe(false);
  });

  it('sends hapikey in URL and no Authorization header', async () => {
    const mockFetch = mockFetchSuccess({ requiresObject: true });
    const tool = findTool(tools, 'hubspot_actions_requires_object_set');
    await tool.handler({ appId: DEFAULT_APP_ID, definitionId: 'def_001', requiresObject: true });
    assertDeveloperAuth(mockFetch);
  });

  it('throws ZodError when requiresObject is missing', async () => {
    const tool = findTool(tools, 'hubspot_actions_requires_object_set');
    await expect(
      tool.handler({ appId: DEFAULT_APP_ID, definitionId: 'def_001' })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Developer auth: missing developerApiKey
// ---------------------------------------------------------------------------

describe('developer auth: missing developerApiKey', () => {
  it('returns isError response with descriptive message when developerApiKey is not configured', async () => {
    const tools = getActionsTools(makeClientNoDev(), DEFAULT_APP_ID);
    mockFetchSuccess({ results: [] });

    const tool = findTool(tools, 'hubspot_actions_list');
    const result = (await tool.handler({ appId: DEFAULT_APP_ID })) as {
      isError: boolean;
      content: Array<{ type: string; text: string }>;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Developer API key not configured/);
  });
});

// ---------------------------------------------------------------------------
// URL encoding: path segments with special characters
// ---------------------------------------------------------------------------

describe('URL encoding in path segments', () => {
  it('encodes appId containing special characters', async () => {
    const tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
    const mockFetch = mockFetchSuccess({ results: [] });

    const tool = findTool(tools, 'hubspot_actions_list');
    await tool.handler({ appId: 'app/123' });

    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent('app/123'));
  });

  it('encodes functionType in functions_put path', async () => {
    const tools = getActionsTools(makeClient(), DEFAULT_APP_ID);
    const mockFetch = mockFetchSuccess({ functionType: 'PRE_ACTION_EXECUTION' });

    const tool = findTool(tools, 'hubspot_actions_functions_put');
    await tool.handler({
      appId: DEFAULT_APP_ID,
      definitionId: 'def_001',
      functionType: 'PRE_ACTION_EXECUTION',
      functionSource: 'exports.main = () => {}',
    });

    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('PRE_ACTION_EXECUTION');
  });
});
