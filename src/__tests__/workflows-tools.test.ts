/**
 * Unit tests for HubSpot Automation v4 Workflows (Flows) MCP tools.
 *
 * Tests each of the 9 tools using the global fetch mock helpers:
 * - mockFetchSuccess: simulates a successful API response
 * - mockFetchError: simulates a non-2xx error response
 *
 * Tests verify:
 * - Successful response parsing and return shape
 * - API error delegation through handleToolError
 * - Correct HTTP method, path, and body construction
 * - Zod validation for required fields
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { mockFetchSuccess, mockFetchError } from './mock-client.js';
import { getWorkflowsTools } from '../tools/workflows/index.js';
import type { Tool } from '../types/common.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ACCESS_TOKEN = 'test-token-workflows';
const BASE_URL = 'https://api.hubapi.com';

function makeClient(): HubSpotClient {
  return new HubSpotClient({ accessToken: ACCESS_TOKEN, baseUrl: BASE_URL });
}

/** Finds a tool by name from the toolset. Throws if not found. */
function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found in toolset`);
  return tool;
}

// Sample flow fixture reused across tests
const sampleFlow = {
  id: 'flow_001',
  type: 'CONTACT_FLOW',
  flowType: 'WORKFLOW',
  isEnabled: false,
  objectTypeId: '0-1',
  name: 'Test Contact Workflow',
};

// ---------------------------------------------------------------------------
// hubspot_workflows_list
// ---------------------------------------------------------------------------

describe('hubspot_workflows_list', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getWorkflowsTools(makeClient());
  });

  it('returns paginated list of flows on success', async () => {
    const responseBody = {
      results: [sampleFlow, { ...sampleFlow, id: 'flow_002', name: 'Second Flow' }],
      paging: { next: { after: 'cursor_abc' } },
    };
    mockFetchSuccess(responseBody);

    const tool = findTool(tools, 'hubspot_workflows_list');
    const result = (await tool.handler({ limit: 20 })) as {
      results: unknown[];
      total: number;
      pagination: { nextCursor: string } | null;
    };

    expect(result.results).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.pagination).toEqual({ nextCursor: 'cursor_abc' });
  });

  it('returns null pagination when no next page exists', async () => {
    mockFetchSuccess({ results: [sampleFlow], paging: null });

    const tool = findTool(tools, 'hubspot_workflows_list');
    const result = (await tool.handler({})) as { pagination: null };

    expect(result.pagination).toBeNull();
  });

  it('appends after cursor to query when provided', async () => {
    const fetchMock = mockFetchSuccess({ results: [], paging: null });

    const tool = findTool(tools, 'hubspot_workflows_list');
    await tool.handler({ limit: 10, after: 'cursor_xyz' });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('after=cursor_xyz');
    expect(calledUrl).toContain('limit=10');
  });

  it('handles API error and returns isError response', async () => {
    mockFetchError({ message: 'Unauthorized', category: 'INVALID_AUTHENTICATION' }, 401);

    const tool = findTool(tools, 'hubspot_workflows_list');
    const result = (await tool.handler({})) as { isError: boolean; content: unknown[] };

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// hubspot_workflows_get
// ---------------------------------------------------------------------------

describe('hubspot_workflows_get', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getWorkflowsTools(makeClient());
  });

  it('returns the full flow object for a valid flowId', async () => {
    mockFetchSuccess(sampleFlow);

    const tool = findTool(tools, 'hubspot_workflows_get');
    const result = (await tool.handler({ flowId: 'flow_001' })) as typeof sampleFlow;

    expect(result.id).toBe('flow_001');
    expect(result.name).toBe('Test Contact Workflow');
    expect(result.type).toBe('CONTACT_FLOW');
  });

  it('uses correct GET path with flowId in the URL', async () => {
    const fetchMock = mockFetchSuccess(sampleFlow);

    const tool = findTool(tools, 'hubspot_workflows_get');
    await tool.handler({ flowId: 'flow_001' });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/automation/v4/flows/flow_001');
  });

  it('throws ZodError when flowId is missing', async () => {
    mockFetchSuccess(sampleFlow);

    const tool = findTool(tools, 'hubspot_workflows_get');

    await expect(tool.handler({})).rejects.toThrow();
  });

  it('handles 404 not found error gracefully', async () => {
    mockFetchError({ message: 'Flow not found', category: 'OBJECT_NOT_FOUND' }, 404);

    const tool = findTool(tools, 'hubspot_workflows_get');
    const result = (await tool.handler({ flowId: 'nonexistent_flow' })) as {
      isError: boolean;
    };

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hubspot_workflows_create
// ---------------------------------------------------------------------------

describe('hubspot_workflows_create', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getWorkflowsTools(makeClient());
  });

  it('creates a flow and returns the server response', async () => {
    const createdFlow = { ...sampleFlow, id: 'flow_new' };
    mockFetchSuccess(createdFlow);

    const tool = findTool(tools, 'hubspot_workflows_create');
    const result = (await tool.handler({
      name: 'Test Contact Workflow',
      type: 'CONTACT_FLOW',
      isEnabled: false,
    })) as typeof createdFlow;

    expect(result.id).toBe('flow_new');
    expect(result.name).toBe('Test Contact Workflow');
  });

  it('sends POST to /automation/v4/flows', async () => {
    const fetchMock = mockFetchSuccess({ ...sampleFlow, id: 'flow_new' });

    const tool = findTool(tools, 'hubspot_workflows_create');
    await tool.handler({ name: 'New Flow', type: 'DEAL_FLOW' });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toContain('/automation/v4/flows');
    expect(requestInit.method).toBe('POST');
  });

  it('throws ZodError when required name is missing', async () => {
    mockFetchSuccess(sampleFlow);
    const tool = findTool(tools, 'hubspot_workflows_create');

    await expect(tool.handler({ type: 'CONTACT_FLOW' })).rejects.toThrow();
  });

  it('throws ZodError when required type is missing', async () => {
    mockFetchSuccess(sampleFlow);
    const tool = findTool(tools, 'hubspot_workflows_create');

    await expect(tool.handler({ name: 'Missing type flow' })).rejects.toThrow();
  });

  it('returns isError when POST fails', async () => {
    mockFetchError({ status: 'error', message: 'Server error' }, 500);

    const tool = findTool(tools, 'hubspot_workflows_create');
    const result = (await tool.handler({ name: 'Test Flow', type: 'DEAL_FLOW' })) as {
      isError: boolean;
    };

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hubspot_workflows_update
// ---------------------------------------------------------------------------

describe('hubspot_workflows_update', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getWorkflowsTools(makeClient());
  });

  it('updates a flow and returns the server response', async () => {
    const updatedFlow = { ...sampleFlow, name: 'Updated Flow Name', isEnabled: true };
    mockFetchSuccess(updatedFlow);

    const tool = findTool(tools, 'hubspot_workflows_update');
    const result = (await tool.handler({
      flowId: 'flow_001',
      name: 'Updated Flow Name',
      isEnabled: true,
    })) as typeof updatedFlow;

    expect(result.name).toBe('Updated Flow Name');
    expect(result.isEnabled).toBe(true);
  });

  it('sends PUT to the correct flow URL', async () => {
    const fetchMock = mockFetchSuccess(sampleFlow);

    const tool = findTool(tools, 'hubspot_workflows_update');
    await tool.handler({ flowId: 'flow_001', name: 'Updated' });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toContain('/automation/v4/flows/flow_001');
    expect(requestInit.method).toBe('PUT');
  });

  it('does not include flowId in the PUT request body', async () => {
    const fetchMock = mockFetchSuccess(sampleFlow);

    const tool = findTool(tools, 'hubspot_workflows_update');
    await tool.handler({ flowId: 'flow_001', name: 'Updated Flow' });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('flowId');
    expect(body.name).toBe('Updated Flow');
  });

  it('returns isError when PUT fails', async () => {
    mockFetchError({ status: 'error', message: 'Not Found' }, 404);

    const tool = findTool(tools, 'hubspot_workflows_update');
    const result = (await tool.handler({ flowId: 'missing_flow', name: 'Updated' })) as {
      isError: boolean;
    };

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hubspot_workflows_delete
// ---------------------------------------------------------------------------

describe('hubspot_workflows_delete', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getWorkflowsTools(makeClient());
  });

  it('deletes a flow and returns success confirmation', async () => {
    mockFetchSuccess({}, 204);

    const tool = findTool(tools, 'hubspot_workflows_delete');
    const result = (await tool.handler({ flowId: 'flow_to_delete' })) as {
      success: boolean;
      deleted: boolean;
      flowId: string;
      message: string;
    };

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(true);
    expect(result.flowId).toBe('flow_to_delete');
    expect(result.message).toContain('irreversible');
  });

  it('sends DELETE to the correct flow URL', async () => {
    const fetchMock = mockFetchSuccess({}, 204);

    const tool = findTool(tools, 'hubspot_workflows_delete');
    await tool.handler({ flowId: 'flow_to_delete' });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toContain('/automation/v4/flows/flow_to_delete');
    expect(requestInit.method).toBe('DELETE');
  });

  it('description contains irreversibility warning', () => {
    const tools = getWorkflowsTools(makeClient());
    const tool = findTool(tools, 'hubspot_workflows_delete');

    expect(tool.description.toUpperCase()).toContain('IRREVERSIBLE');
  });

  it('handles API error on delete', async () => {
    mockFetchError({ message: 'Flow not found', category: 'OBJECT_NOT_FOUND' }, 404);

    const tool = findTool(tools, 'hubspot_workflows_delete');
    const result = (await tool.handler({ flowId: 'missing_flow' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hubspot_workflows_batch_read
// ---------------------------------------------------------------------------

describe('hubspot_workflows_batch_read', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getWorkflowsTools(makeClient());
  });

  it('returns batch results for multiple flow IDs', async () => {
    const responseBody = {
      results: [sampleFlow, { ...sampleFlow, id: 'flow_002' }],
      status: 'COMPLETE',
      numErrors: 0,
    };
    mockFetchSuccess(responseBody);

    const tool = findTool(tools, 'hubspot_workflows_batch_read');
    const result = (await tool.handler({ flowIds: ['flow_001', 'flow_002'] })) as {
      results: unknown[];
      total: number;
      status: string;
    };

    expect(result.results).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.status).toBe('COMPLETE');
  });

  it('maps flowIds to inputs[].flowId in the request body', async () => {
    const fetchMock = mockFetchSuccess({ results: [], status: 'COMPLETE', numErrors: 0 });

    const tool = findTool(tools, 'hubspot_workflows_batch_read');
    await tool.handler({ flowIds: ['flow_001', 'flow_002', 'flow_003'] });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      inputs: Array<{ flowId: string }>;
    };

    expect(body.inputs).toHaveLength(3);
    expect(body.inputs[0]).toEqual({ flowId: 'flow_001' });
    expect(body.inputs[1]).toEqual({ flowId: 'flow_002' });
    expect(body.inputs[2]).toEqual({ flowId: 'flow_003' });
  });

  it('sends POST to /automation/v4/flows/batch/read', async () => {
    const fetchMock = mockFetchSuccess({ results: [], status: 'COMPLETE', numErrors: 0 });

    const tool = findTool(tools, 'hubspot_workflows_batch_read');
    await tool.handler({ flowIds: ['flow_001'] });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toContain('/automation/v4/flows/batch/read');
    expect(requestInit.method).toBe('POST');
  });

  it('returns isError when batch read POST fails', async () => {
    mockFetchError({ status: 'error', message: 'Server error' }, 500);

    const tool = findTool(tools, 'hubspot_workflows_batch_read');
    const result = (await tool.handler({ flowIds: ['flow_001', 'flow_002'] })) as {
      isError: boolean;
    };

    expect(result.isError).toBe(true);
  });

  it('defaults numErrors to 0 and errors to [] when absent in response', async () => {
    // Covers the ?? 0 and ?? [] branches (lines 483-484) when API omits those fields
    mockFetchSuccess({ results: [sampleFlow], status: 'COMPLETE' });

    const tool = findTool(tools, 'hubspot_workflows_batch_read');
    const result = (await tool.handler({ flowIds: ['flow_001'] })) as Record<string, unknown>;

    expect(result.numErrors).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hubspot_workflows_email_campaigns
// ---------------------------------------------------------------------------

describe('hubspot_workflows_email_campaigns', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getWorkflowsTools(makeClient());
  });

  it('returns email campaigns for a given flowId', async () => {
    const campaignsResponse = {
      results: [{ id: 'campaign_001', name: 'Welcome Email', flowId: 'flow_001' }],
    };
    mockFetchSuccess(campaignsResponse);

    const tool = findTool(tools, 'hubspot_workflows_email_campaigns');
    const result = await tool.handler({ flowId: 'flow_001' });

    expect(result).toEqual(campaignsResponse);
  });

  it('sends GET with flowId as query param to /automation/v4/flows/email-campaigns', async () => {
    const fetchMock = mockFetchSuccess({ results: [] });

    const tool = findTool(tools, 'hubspot_workflows_email_campaigns');
    await tool.handler({ flowId: 'flow_abc' });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toContain('/automation/v4/flows/email-campaigns');
    expect(calledUrl).toContain('flowId=flow_abc');
    expect(requestInit.method).toBe('GET');
  });

  it('handles API error gracefully', async () => {
    mockFetchError({ message: 'Server Error' }, 500);

    const tool = findTool(tools, 'hubspot_workflows_email_campaigns');
    const result = (await tool.handler({ flowId: 'flow_001' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hubspot_workflows_performance
// ---------------------------------------------------------------------------

describe('hubspot_workflows_performance', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getWorkflowsTools(makeClient());
  });

  it('returns performance data for a given flowId', async () => {
    const performanceData = {
      flowId: 'flow_001',
      enrolled: 1200,
      completed: 890,
      failed: 15,
    };
    mockFetchSuccess(performanceData);

    const tool = findTool(tools, 'hubspot_workflows_performance');
    const result = await tool.handler({ flowId: 'flow_001' });

    expect(result).toEqual(performanceData);
  });

  it('sends GET to /automation/v4/flows/performance/{flowId}', async () => {
    const fetchMock = mockFetchSuccess({ flowId: 'flow_001' });

    const tool = findTool(tools, 'hubspot_workflows_performance');
    await tool.handler({ flowId: 'flow_001' });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toContain('/automation/v4/flows/performance/flow_001');
    expect(requestInit.method).toBe('GET');
  });

  it('handles 404 when flow has no performance data', async () => {
    mockFetchError({ message: 'Not found' }, 404);

    const tool = findTool(tools, 'hubspot_workflows_performance');
    const result = (await tool.handler({ flowId: 'flow_no_data' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hubspot_workflows_id_mappings
// ---------------------------------------------------------------------------

describe('hubspot_workflows_id_mappings', () => {
  let tools: Tool[];

  beforeEach(() => {
    tools = getWorkflowsTools(makeClient());
  });

  it('returns v4 flow ID mappings for legacy v3 workflow IDs', async () => {
    const mappingResponse = {
      results: [
        { legacyWorkflowId: 12345, flowId: 'flow_abc', type: 'CONTACT_FLOW' },
        { legacyWorkflowId: 67890, flowId: 'flow_def', type: 'DEAL_FLOW' },
      ],
      status: 'COMPLETE',
      numErrors: 0,
    };
    mockFetchSuccess(mappingResponse);

    const tool = findTool(tools, 'hubspot_workflows_id_mappings');
    const result = (await tool.handler({ workflowIds: [12345, 67890] })) as {
      results: unknown[];
      total: number;
    };

    expect(result.results).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('maps workflowIds to inputs[].legacyWorkflowId in the request body', async () => {
    const fetchMock = mockFetchSuccess({ results: [], status: 'COMPLETE', numErrors: 0 });

    const tool = findTool(tools, 'hubspot_workflows_id_mappings');
    await tool.handler({ workflowIds: [11111, 22222] });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      inputs: Array<{ legacyWorkflowId: number }>;
    };

    expect(body.inputs).toHaveLength(2);
    expect(body.inputs[0]).toEqual({ legacyWorkflowId: 11111 });
    expect(body.inputs[1]).toEqual({ legacyWorkflowId: 22222 });
  });

  it('sends POST to /automation/v4/workflow-id-mappings/batch/read', async () => {
    const fetchMock = mockFetchSuccess({ results: [], status: 'COMPLETE', numErrors: 0 });

    const tool = findTool(tools, 'hubspot_workflows_id_mappings');
    await tool.handler({ workflowIds: [99999] });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toContain('/automation/v4/workflow-id-mappings/batch/read');
    expect(requestInit.method).toBe('POST');
  });

  it('handles API error for id mappings', async () => {
    // Use 403 (non-retryable) so the retry mechanism does not time the test out
    mockFetchError({ message: 'Access denied', category: 'AUTHORIZATION_ERROR' }, 403);

    const tool = findTool(tools, 'hubspot_workflows_id_mappings');
    const result = (await tool.handler({ workflowIds: [12345] })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });

  it('defaults numErrors to 0 and errors to [] when absent in response', async () => {
    // Covers the ?? 0 and ?? [] branches (lines 635-636) when API omits those fields
    mockFetchSuccess({ results: [{ v3WorkflowId: 111, v4FlowId: 'flow_v4' }], status: 'COMPLETE' });

    const tool = findTool(tools, 'hubspot_workflows_id_mappings');
    const result = (await tool.handler({ workflowIds: [111] })) as Record<string, unknown>;

    expect(result.numErrors).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getWorkflowsTools — meta-tests
// ---------------------------------------------------------------------------

describe('getWorkflowsTools', () => {
  it('exports exactly 9 tools', () => {
    const tools = getWorkflowsTools(makeClient());
    expect(tools).toHaveLength(9);
  });

  it('exports all 9 expected tool names', () => {
    const tools = getWorkflowsTools(makeClient());
    const names = tools.map((t) => t.name);

    expect(names).toContain('hubspot_workflows_list');
    expect(names).toContain('hubspot_workflows_get');
    expect(names).toContain('hubspot_workflows_create');
    expect(names).toContain('hubspot_workflows_update');
    expect(names).toContain('hubspot_workflows_delete');
    expect(names).toContain('hubspot_workflows_batch_read');
    expect(names).toContain('hubspot_workflows_email_campaigns');
    expect(names).toContain('hubspot_workflows_performance');
    expect(names).toContain('hubspot_workflows_id_mappings');
  });

  it('all tools have a valid inputSchema with type: object', () => {
    const tools = getWorkflowsTools(makeClient());
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it('all tools have non-empty name and description', () => {
    const tools = getWorkflowsTools(makeClient());
    for (const tool of tools) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});

// Suppress unused import warning — vi is used via globals from setup.ts
void vi;
