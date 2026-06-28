/**
 * Unit tests for Pipelines tools (getPipelinesTools).
 *
 * Covers:
 * - hubspot_pipelines_list: list every pipeline for an object type
 * - hubspot_pipelines_get: fetch a single pipeline by id
 * - hubspot_pipelines_get_stages: list a pipeline's stages (dealstage → label)
 *
 * Strategy: mock global `fetch` to intercept HubSpotClient HTTP calls.
 * Tests validate happy paths, request shape (URL + method), error handling,
 * and Zod validation for required fields.
 */

import { describe, it, expect } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { getPipelinesTools } from '../tools/pipelines/index.js';
import { type Tool } from '../types/common.js';
import { mockFetchSuccess, mockFetchError } from './mock-client.js';

const ACCESS_TOKEN = 'test-token-pipelines';

function makeTools(): Tool[] {
  const client = new HubSpotClient({ accessToken: ACCESS_TOKEN });
  return getPipelinesTools(client);
}

function getTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found in getPipelinesTools() output`);
  return tool;
}

/** Minimal stage fixture as returned by the Pipelines API. */
const STAGE_FIXTURE = {
  id: 'appointmentscheduled',
  label: 'Appointment Scheduled',
  displayOrder: 0,
  metadata: { isClosed: 'false', probability: '0.2' },
  archived: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-06-01T00:00:00.000Z',
};

/** Minimal pipeline fixture as returned by the Pipelines API. */
const PIPELINE_FIXTURE = {
  id: 'default',
  label: 'Sales Pipeline',
  displayOrder: 0,
  stages: [STAGE_FIXTURE],
  archived: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-06-01T00:00:00.000Z',
};

const PIPELINES_LIST_FIXTURE = {
  results: [PIPELINE_FIXTURE],
};

const STAGES_FIXTURE = {
  results: [STAGE_FIXTURE],
};

// ---------------------------------------------------------------------------
// Suite: getPipelinesTools — exported set
// ---------------------------------------------------------------------------

describe('getPipelinesTools', () => {
  it('returns exactly 3 tools', () => {
    expect(makeTools()).toHaveLength(3);
  });

  it('contains the three pipelines tools', () => {
    const names = makeTools().map((t) => t.name);
    expect(names).toContain('hubspot_pipelines_list');
    expect(names).toContain('hubspot_pipelines_get');
    expect(names).toContain('hubspot_pipelines_get_stages');
  });
});

// ---------------------------------------------------------------------------
// Suite: hubspot_pipelines_list
// ---------------------------------------------------------------------------

describe('hubspot_pipelines_list', () => {
  it('GETs /crm/v3/pipelines/{objectType} and returns the result', async () => {
    const fetchMock = mockFetchSuccess(PIPELINES_LIST_FIXTURE);
    const tool = getTool(makeTools(), 'hubspot_pipelines_list');

    const result = await tool.handler({ objectType: 'deals' });

    const url = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('/crm/v3/pipelines/deals');
    expect(requestInit.method).toBe('GET');
    expect(result).toEqual(PIPELINES_LIST_FIXTURE);
  });

  it('throws when objectType is missing (Zod validation)', async () => {
    const tool = getTool(makeTools(), 'hubspot_pipelines_list');
    await expect(tool.handler({})).rejects.toThrow();
  });

  it('returns a structured error when the API responds 403 (missing scope)', async () => {
    mockFetchError({ message: 'Missing crm.objects.deals.read scope' }, 403);
    const tool = getTool(makeTools(), 'hubspot_pipelines_list');

    const result = (await tool.handler({ objectType: 'deals' })) as { isError?: boolean };
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite: hubspot_pipelines_get
// ---------------------------------------------------------------------------

describe('hubspot_pipelines_get', () => {
  it('GETs /crm/v3/pipelines/{objectType}/{pipelineId} and returns the result', async () => {
    const fetchMock = mockFetchSuccess(PIPELINE_FIXTURE);
    const tool = getTool(makeTools(), 'hubspot_pipelines_get');

    const result = await tool.handler({ objectType: 'deals', pipelineId: 'default' });

    const url = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('/crm/v3/pipelines/deals/default');
    expect(requestInit.method).toBe('GET');
    expect(result).toEqual(PIPELINE_FIXTURE);
  });

  it('throws when pipelineId is missing (Zod validation)', async () => {
    const tool = getTool(makeTools(), 'hubspot_pipelines_get');
    await expect(tool.handler({ objectType: 'deals' })).rejects.toThrow();
  });

  it('returns a structured error when the API responds 403 (missing scope)', async () => {
    mockFetchError({ message: 'Missing crm.objects.deals.read scope' }, 403);
    const tool = getTool(makeTools(), 'hubspot_pipelines_get');

    const result = (await tool.handler({
      objectType: 'deals',
      pipelineId: 'default',
    })) as { isError?: boolean };
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite: hubspot_pipelines_get_stages
// ---------------------------------------------------------------------------

describe('hubspot_pipelines_get_stages', () => {
  it('GETs /crm/v3/pipelines/{objectType}/{pipelineId}/stages and returns the result', async () => {
    const fetchMock = mockFetchSuccess(STAGES_FIXTURE);
    const tool = getTool(makeTools(), 'hubspot_pipelines_get_stages');

    const result = await tool.handler({ objectType: 'deals', pipelineId: 'default' });

    const url = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('/crm/v3/pipelines/deals/default/stages');
    expect(requestInit.method).toBe('GET');
    expect(result).toEqual(STAGES_FIXTURE);
  });

  it('throws when pipelineId is missing (Zod validation)', async () => {
    const tool = getTool(makeTools(), 'hubspot_pipelines_get_stages');
    await expect(tool.handler({ objectType: 'deals' })).rejects.toThrow();
  });

  it('returns a structured error when the API responds 403 (missing scope)', async () => {
    mockFetchError({ message: 'Missing crm.objects.deals.read scope' }, 403);
    const tool = getTool(makeTools(), 'hubspot_pipelines_get_stages');

    const result = (await tool.handler({
      objectType: 'deals',
      pipelineId: 'default',
    })) as { isError?: boolean };
    expect(result.isError).toBe(true);
  });
});
