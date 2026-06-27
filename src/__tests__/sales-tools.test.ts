/**
 * Unit tests for Sales-specific tools (getSalesTools).
 *
 * Covers:
 * - hubspot_deals_merge: merging two deal records
 * - hubspot_quotes_assemble: creating a quote with inline associations
 *
 * Strategy: mock global `fetch` to intercept HubSpotClient HTTP calls.
 * Tests validate happy paths, error handling, request shape, and
 * Zod validation for required fields.
 */

import { describe, it, expect } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { getSalesTools } from '../tools/sales/index.js';
import { type Tool } from '../types/common.js';
import { mockFetchSuccess, mockFetchError } from './mock-client.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ACCESS_TOKEN = 'test-token-sales';

function makeTools(): Tool[] {
  const client = new HubSpotClient({ accessToken: ACCESS_TOKEN });
  return getSalesTools(client);
}

function getTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found in getSalesTools() output`);
  return tool;
}

/** Minimal merged deal fixture returned by HubSpot after merge. */
const MERGED_DEAL_FIXTURE = {
  id: '100',
  properties: { dealname: 'Merged Deal', amount: '50000' },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-06-01T00:00:00.000Z',
  archived: false,
};

/** Minimal quote fixture returned by HubSpot after create. */
const QUOTE_FIXTURE = {
  id: '500',
  properties: {
    hs_title: 'Enterprise Proposal Q1',
    hs_status: 'DRAFT',
    hs_currency: 'USD',
  },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  archived: false,
};

// ---------------------------------------------------------------------------
// Suite: getSalesTools — exported set
// ---------------------------------------------------------------------------

describe('getSalesTools', () => {
  it('returns exactly 2 tools', () => {
    const tools = makeTools();
    expect(tools).toHaveLength(2);
  });

  it('contains hubspot_deals_merge and hubspot_quotes_assemble', () => {
    const tools = makeTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('hubspot_deals_merge');
    expect(names).toContain('hubspot_quotes_assemble');
  });

  it('every tool has a non-empty description', () => {
    const tools = makeTools();
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(30);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite: hubspot_deals_merge
// ---------------------------------------------------------------------------

describe('hubspot_deals_merge', () => {
  it('merges two deals and returns the surviving record', async () => {
    mockFetchSuccess(MERGED_DEAL_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_deals_merge');

    const result = await tool.handler({
      primaryObjectId: '100',
      objectIdToMerge: '200',
    });
    expect(result).toMatchObject({ id: '100' });
  });

  it('calls POST /crm/v3/objects/deals/merge', async () => {
    const fetchMock = mockFetchSuccess(MERGED_DEAL_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_deals_merge');

    await tool.handler({ primaryObjectId: '100', objectIdToMerge: '200' });

    const url = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('/crm/v3/objects/deals/merge');
    expect(requestInit.method).toBe('POST');
  });

  it('sends primaryObjectId and objectIdToMerge in the request body', async () => {
    const fetchMock = mockFetchSuccess(MERGED_DEAL_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_deals_merge');

    await tool.handler({ primaryObjectId: '100', objectIdToMerge: '200' });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      primaryObjectId: string;
      objectIdToMerge: string;
    };
    expect(body.primaryObjectId).toBe('100');
    expect(body.objectIdToMerge).toBe('200');
  });

  it('throws ZodError when primaryObjectId is missing', async () => {
    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_deals_merge');

    await expect(tool.handler({ objectIdToMerge: '200' })).rejects.toThrow();
  });

  it('throws ZodError when objectIdToMerge is missing', async () => {
    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_deals_merge');

    await expect(tool.handler({ primaryObjectId: '100' })).rejects.toThrow();
  });

  it('returns isError on HubSpot API error', async () => {
    mockFetchError(
      { status: 'error', message: 'Deals not found', category: 'OBJECT_NOT_FOUND' },
      404
    );

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_deals_merge');

    const result = (await tool.handler({
      primaryObjectId: '100',
      objectIdToMerge: '200',
    })) as { isError: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Deals not found/);
  });

  it('returns isError on missing scopes error (403)', async () => {
    mockFetchError(
      { status: 'error', message: 'Missing required scopes', category: 'MISSING_SCOPES' },
      403
    );

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_deals_merge');

    const result = (await tool.handler({
      primaryObjectId: '100',
      objectIdToMerge: '200',
    })) as { isError: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Missing required scopes/);
  });
});

// ---------------------------------------------------------------------------
// Suite: hubspot_quotes_assemble
// ---------------------------------------------------------------------------

describe('hubspot_quotes_assemble', () => {
  it('creates a quote and returns the created record', async () => {
    mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    const result = await tool.handler({
      title: 'Enterprise Proposal Q1',
      dealId: '300',
      lineItemIds: ['401', '402'],
    });
    expect(result).toMatchObject({ id: '500' });
  });

  it('calls POST /crm/v3/objects/quotes', async () => {
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'Q1 Quote',
      dealId: '300',
      lineItemIds: ['401'],
    });

    const url = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('/crm/v3/objects/quotes');
    expect(requestInit.method).toBe('POST');
  });

  it('sets hs_title in properties from the title param', async () => {
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'My Important Quote',
      dealId: '300',
      lineItemIds: ['401'],
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      properties: Record<string, string>;
    };
    expect(body.properties.hs_title).toBe('My Important Quote');
  });

  it('includes deal and line item associations in the request body', async () => {
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'Q1 Quote',
      dealId: '300',
      lineItemIds: ['401', '402'],
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      associations: Array<{ to: { id: string } }>;
    };

    // Should have 3 associations: 1 deal + 2 line items
    expect(body.associations).toHaveLength(3);
    const ids = body.associations.map((a) => a.to.id);
    expect(ids).toContain('300'); // deal
    expect(ids).toContain('401'); // line item 1
    expect(ids).toContain('402'); // line item 2
  });

  it('uses HUBSPOT_DEFINED association category for deal', async () => {
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'Q1 Quote',
      dealId: '300',
      lineItemIds: ['401'],
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      associations: Array<{
        to: { id: string };
        types: Array<{ associationCategory: string; associationTypeId: number }>;
      }>;
    };

    const dealAssoc = body.associations.find((a) => a.to.id === '300');
    expect(dealAssoc).toBeDefined();
    expect(dealAssoc!.types[0].associationCategory).toBe('HUBSPOT_DEFINED');
    expect(dealAssoc!.types[0].associationTypeId).toBe(64);
  });

  it('uses default typeId 67 for line item associations', async () => {
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'Q1 Quote',
      dealId: '300',
      lineItemIds: ['401'],
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      associations: Array<{
        to: { id: string };
        types: Array<{ associationCategory: string; associationTypeId: number }>;
      }>;
    };

    const lineItemAssoc = body.associations.find((a) => a.to.id === '401');
    expect(lineItemAssoc).toBeDefined();
    expect(lineItemAssoc!.types[0].associationTypeId).toBe(67);
  });

  it('respects custom dealAssociationTypeId override', async () => {
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'Q1 Quote',
      dealId: '300',
      lineItemIds: ['401'],
      dealAssociationTypeId: 999,
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      associations: Array<{
        to: { id: string };
        types: Array<{ associationTypeId: number }>;
      }>;
    };

    const dealAssoc = body.associations.find((a) => a.to.id === '300');
    expect(dealAssoc!.types[0].associationTypeId).toBe(999);
  });

  it('sets optional properties when provided', async () => {
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'Full Quote',
      dealId: '300',
      lineItemIds: ['401'],
      currency: 'EUR',
      ownerId: '789',
      templateId: 'tpl-001',
      expirationDate: '2026-12-31',
      locale: 'en-US',
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      properties: Record<string, string>;
    };
    expect(body.properties.hs_currency).toBe('EUR');
    expect(body.properties.hubspot_owner_id).toBe('789');
    expect(body.properties.hs_template_id).toBe('tpl-001');
    expect(body.properties.hs_expiration_date).toBe('2026-12-31');
    expect(body.properties.hs_locale).toBe('en-US');
  });

  it('merges additionalProperties into the request body', async () => {
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'Quote with extras',
      dealId: '300',
      lineItemIds: ['401'],
      additionalProperties: {
        custom_field_1: 'value1',
        custom_field_2: 'value2',
      },
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      properties: Record<string, string>;
    };
    expect(body.properties['custom_field_1']).toBe('value1');
    expect(body.properties['custom_field_2']).toBe('value2');
    // Explicit params still take precedence
    expect(body.properties.hs_title).toBe('Quote with extras');
  });

  it('throws ZodError when title is missing', async () => {
    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await expect(tool.handler({ dealId: '300', lineItemIds: ['401'] })).rejects.toThrow();
  });

  it('throws ZodError when dealId is missing', async () => {
    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await expect(tool.handler({ title: 'Q1 Quote', lineItemIds: ['401'] })).rejects.toThrow();
  });

  it('throws ZodError when lineItemIds is empty array', async () => {
    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await expect(
      tool.handler({ title: 'Q1 Quote', dealId: '300', lineItemIds: [] })
    ).rejects.toThrow();
  });

  it('returns isError on HubSpot API error (e.g., validation error)', async () => {
    mockFetchError(
      { status: 'error', message: 'Property hs_title is required', category: 'VALIDATION_ERROR' },
      400
    );

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    const result = (await tool.handler({
      title: 'Q1 Quote',
      dealId: '300',
      lineItemIds: ['401'],
    })) as { isError: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/hs_title/);
  });

  it('sets hs_status to DRAFT by default', async () => {
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'Default Status Quote',
      dealId: '300',
      lineItemIds: ['401'],
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      properties: Record<string, string>;
    };
    expect(body.properties.hs_status).toBe('DRAFT');
  });

  it('respects explicit status override', async () => {
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'Ready Quote',
      dealId: '300',
      lineItemIds: ['401'],
      status: 'APPROVAL_NOT_NEEDED',
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      properties: Record<string, string>;
    };
    expect(body.properties.hs_status).toBe('APPROVAL_NOT_NEEDED');
  });

  it('sets sender-related optional properties when provided', async () => {
    // Covers branches: senderLastName (line 395), senderFirstName, senderEmail, paymentEnabled, quoteNumber
    const fetchMock = mockFetchSuccess(QUOTE_FIXTURE);

    const tools = makeTools();
    const tool = getTool(tools, 'hubspot_quotes_assemble');

    await tool.handler({
      title: 'Sender Quote',
      dealId: '300',
      lineItemIds: ['401'],
      senderFirstName: 'John',
      senderLastName: 'Doe',
      senderEmail: 'john.doe@example.com',
      paymentEnabled: true,
      quoteNumber: 'Q-2026-001',
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      properties: Record<string, string>;
    };
    expect(body.properties['hs_sender_firstname']).toBe('John');
    expect(body.properties['hs_sender_lastname']).toBe('Doe');
    expect(body.properties['hs_sender_email']).toBe('john.doe@example.com');
    expect(body.properties['hs_payment_enabled']).toBe('true');
    expect(body.properties['hs_quote_number']).toBe('Q-2026-001');
  });
});
