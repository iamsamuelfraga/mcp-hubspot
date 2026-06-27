/**
 * Unit tests for MCP Resources (setupResources).
 *
 * Strategy: construct a minimal mock Server that captures the registered
 * request handlers in a Map, call setupResources, then invoke each handler
 * directly to validate behaviour without a real MCP transport or HubSpot API.
 *
 * Tests cover:
 * - resources/list returns exactly 3 resources with correct URIs
 * - resources/read returns valid JSON for each known URI
 * - resources/read throws for an unknown URI
 */

import { describe, it, expect } from 'vitest';
import { type Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupResources } from '../resources/index.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Builds a minimal mock Server that captures handlers via setRequestHandler.
 *
 * Extracts the method string from Zod v4 schema shapes so handlers are keyed
 * under their method string (e.g. 'resources/list', 'resources/read').
 */
function buildMockServer() {
  const handlers = new Map<string, (request: unknown) => Promise<unknown>>();

  const mockServer = {
    setRequestHandler: (schema: unknown, handler: (req: unknown) => Promise<unknown>) => {
      // The MCP SDK uses Zod v4. The method literal is at schema.def.shape.method.def.values[0].
      const s = schema as {
        def?: { shape?: { method?: { def?: { values?: string[] } } } };
      };
      const methodValue = s.def?.shape?.method?.def?.values?.[0];
      if (methodValue) {
        handlers.set(methodValue, handler);
      }
    },
  } as unknown as Server;

  return { mockServer, handlers };
}

/** Minimal stub HubSpotClient — resources are static so the client is unused. */
const mockClient = {} as Parameters<typeof setupResources>[1];

// ─── Expected resource URIs ───────────────────────────────────────────────────

const EXPECTED_URIS = [
  'hubspot://scopes-guide',
  'hubspot://crm-object-types',
  'hubspot://conventions',
] as const;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('setupResources', () => {
  it('registers both resources/list and resources/read handlers', () => {
    const { mockServer, handlers } = buildMockServer();
    setupResources(mockServer, mockClient);

    expect(handlers.has('resources/list')).toBe(true);
    expect(handlers.has('resources/read')).toBe(true);
  });

  describe('resources/list', () => {
    it('returns exactly 3 resources', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupResources(mockServer, mockClient);

      const result = (await handlers.get('resources/list')?.({
        method: 'resources/list',
      })) as { resources: unknown[] };

      expect(result.resources).toHaveLength(3);
    });

    it('returns resources with the correct URIs', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupResources(mockServer, mockClient);

      const result = (await handlers.get('resources/list')?.({
        method: 'resources/list',
      })) as { resources: Array<{ uri: string }> };

      const uris = result.resources.map((r) => r.uri);
      for (const expectedUri of EXPECTED_URIS) {
        expect(uris).toContain(expectedUri);
      }
    });

    it('returns resources with name, description, and mimeType fields', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupResources(mockServer, mockClient);

      const result = (await handlers.get('resources/list')?.({
        method: 'resources/list',
      })) as {
        resources: Array<{ uri: string; name: string; description: string; mimeType: string }>;
      };

      for (const resource of result.resources) {
        expect(resource.name).toBeTruthy();
        expect(resource.description).toBeTruthy();
        expect(resource.mimeType).toBe('application/json');
      }
    });
  });

  describe('resources/read', () => {
    it.each(EXPECTED_URIS)('reads %s and returns valid JSON content', async (uri) => {
      const { mockServer, handlers } = buildMockServer();
      setupResources(mockServer, mockClient);

      const result = (await handlers.get('resources/read')?.({
        method: 'resources/read',
        params: { uri },
      })) as { contents: Array<{ uri: string; mimeType: string; text: string }> };

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0];
      expect(content.uri).toBe(uri);
      expect(content.mimeType).toBe('application/json');
      expect(content.text).toBeTruthy();

      // Verify the text is valid JSON (does not throw)
      const parsed = JSON.parse(content.text);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
    });

    it('returns scopes-guide with toolsets structure', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupResources(mockServer, mockClient);

      const result = (await handlers.get('resources/read')?.({
        method: 'resources/read',
        params: { uri: 'hubspot://scopes-guide' },
      })) as { contents: Array<{ text: string }> };

      const parsed = JSON.parse(result.contents[0].text) as {
        toolsets: Record<string, { scopes: string[] }>;
      };

      expect(parsed.toolsets).toBeDefined();
      expect(parsed.toolsets.sales.scopes).toContain('crm.objects.contacts.read');
      expect(parsed.toolsets.workflows.scopes).toContain('automation');
    });

    it('returns crm-object-types with all expected objectType keys', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupResources(mockServer, mockClient);

      const result = (await handlers.get('resources/read')?.({
        method: 'resources/read',
        params: { uri: 'hubspot://crm-object-types' },
      })) as { contents: Array<{ text: string }> };

      const parsed = JSON.parse(result.contents[0].text) as {
        objects: Record<string, unknown>;
      };

      const expectedKeys = [
        'contacts',
        'companies',
        'deals',
        'tickets',
        'quotes',
        'lineItems',
        'notes',
        'calls',
        'emails',
        'meetings',
        'tasks',
      ];
      for (const key of expectedKeys) {
        expect(parsed.objects).toHaveProperty(key);
      }
    });

    it('returns conventions with rateLimits, batchOperations, and pagination', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupResources(mockServer, mockClient);

      const result = (await handlers.get('resources/read')?.({
        method: 'resources/read',
        params: { uri: 'hubspot://conventions' },
      })) as { contents: Array<{ text: string }> };

      const parsed = JSON.parse(result.contents[0].text) as Record<string, unknown>;

      expect(parsed.rateLimits).toBeDefined();
      expect(parsed.batchOperations).toBeDefined();
      expect(parsed.pagination).toBeDefined();
      expect(parsed.searchIndexingLatency).toBeDefined();
    });

    it('throws an error for an unknown URI', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupResources(mockServer, mockClient);

      await expect(
        handlers.get('resources/read')?.({
          method: 'resources/read',
          params: { uri: 'hubspot://unknown-resource' },
        })
      ).rejects.toThrow('Resource not found: hubspot://unknown-resource');
    });
  });
});
