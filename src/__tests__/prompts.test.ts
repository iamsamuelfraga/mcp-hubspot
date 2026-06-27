/**
 * Unit tests for MCP Prompts (setupPrompts).
 *
 * Strategy: construct a minimal mock Server that captures the registered
 * request handlers in a Map, call setupPrompts, then invoke each handler
 * directly to validate behaviour without a real MCP transport.
 *
 * Tests cover:
 * - prompts/list returns exactly 5 prompts with correct names
 * - prompts/get returns a messages array for each known prompt name
 * - prompts/get resolves argument placeholders in the message text
 * - prompts/get throws for an unknown prompt name
 */

import { describe, it, expect } from 'vitest';
import { type Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupPrompts } from '../prompts/index.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Builds a minimal mock Server that captures handlers via setRequestHandler.
 *
 * Extracts the method string from Zod v4 schema shapes so handlers are keyed
 * under their method string (e.g. 'prompts/list', 'prompts/get').
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

// ─── Expected prompt names ────────────────────────────────────────────────────

const EXPECTED_PROMPT_NAMES = [
  'create-deal-with-line-items',
  'assemble-quote',
  'log-engagement-and-associate',
  'enroll-contact-in-workflow',
  'search-crm-records',
] as const;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('setupPrompts', () => {
  it('registers both prompts/list and prompts/get handlers', () => {
    const { mockServer, handlers } = buildMockServer();
    setupPrompts(mockServer);

    expect(handlers.has('prompts/list')).toBe(true);
    expect(handlers.has('prompts/get')).toBe(true);
  });

  describe('prompts/list', () => {
    it('returns exactly 5 prompts', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/list')?.({
        method: 'prompts/list',
      })) as { prompts: unknown[] };

      expect(result.prompts).toHaveLength(5);
    });

    it('returns prompts with the correct names', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/list')?.({
        method: 'prompts/list',
      })) as { prompts: Array<{ name: string }> };

      const names = result.prompts.map((p) => p.name);
      for (const expectedName of EXPECTED_PROMPT_NAMES) {
        expect(names).toContain(expectedName);
      }
    });

    it('returns prompts with name, description, and arguments fields', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/list')?.({
        method: 'prompts/list',
      })) as {
        prompts: Array<{ name: string; description: string; arguments: unknown[] }>;
      };

      for (const prompt of result.prompts) {
        expect(prompt.name).toBeTruthy();
        expect(prompt.description).toBeTruthy();
        expect(Array.isArray(prompt.arguments)).toBe(true);
      }
    });
  });

  describe('prompts/get', () => {
    it.each(EXPECTED_PROMPT_NAMES)(
      'returns a messages array for prompt "%s"',
      async (promptName) => {
        const { mockServer, handlers } = buildMockServer();
        setupPrompts(mockServer);

        const result = (await handlers.get('prompts/get')?.({
          method: 'prompts/get',
          params: { name: promptName, arguments: {} },
        })) as {
          messages: Array<{ role: string; content: { type: string; text: string } }>;
        };

        expect(Array.isArray(result.messages)).toBe(true);
        expect(result.messages.length).toBeGreaterThan(0);

        const message = result.messages[0];
        expect(message.role).toBe('user');
        expect(message.content.type).toBe('text');
        expect(typeof message.content.text).toBe('string');
        expect(message.content.text.length).toBeGreaterThan(0);
      }
    );

    it('create-deal-with-line-items includes dealName in the message', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/get')?.({
        method: 'prompts/get',
        params: {
          name: 'create-deal-with-line-items',
          arguments: { dealName: 'Q1 Enterprise Deal', closeDate: '2025-03-31' },
        },
      })) as { messages: Array<{ content: { text: string } }> };

      const text = result.messages[0].content.text;
      expect(text).toContain('Q1 Enterprise Deal');
      expect(text).toContain('2025-03-31');
    });

    it('assemble-quote includes dealId and quoteTitle in the message', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/get')?.({
        method: 'prompts/get',
        params: {
          name: 'assemble-quote',
          arguments: { dealId: '12345', quoteTitle: 'Annual Subscription Quote' },
        },
      })) as { messages: Array<{ content: { text: string } }> };

      const text = result.messages[0].content.text;
      expect(text).toContain('12345');
      expect(text).toContain('Annual Subscription Quote');
    });

    it('log-engagement-and-associate includes engagementType, contactId, dealId', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/get')?.({
        method: 'prompts/get',
        params: {
          name: 'log-engagement-and-associate',
          arguments: { engagementType: 'calls', contactId: '67890', dealId: '54321' },
        },
      })) as { messages: Array<{ content: { text: string } }> };

      const text = result.messages[0].content.text;
      expect(text).toContain('calls');
      expect(text).toContain('67890');
      expect(text).toContain('54321');
    });

    it('enroll-contact-in-workflow includes objectId and workflowId', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/get')?.({
        method: 'prompts/get',
        params: {
          name: 'enroll-contact-in-workflow',
          arguments: { objectId: '111', objectType: 'contacts', workflowId: '999' },
        },
      })) as { messages: Array<{ content: { text: string } }> };

      const text = result.messages[0].content.text;
      expect(text).toContain('111');
      expect(text).toContain('999');
    });

    it('search-crm-records includes objectType and filterProperty', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/get')?.({
        method: 'prompts/get',
        params: {
          name: 'search-crm-records',
          arguments: {
            objectType: 'deals',
            filterProperty: 'dealstage',
            filterValue: 'closedwon',
          },
        },
      })) as { messages: Array<{ content: { text: string } }> };

      const text = result.messages[0].content.text;
      expect(text).toContain('deals');
      expect(text).toContain('dealstage');
      expect(text).toContain('closedwon');
    });

    it('returns a description alongside the messages', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/get')?.({
        method: 'prompts/get',
        params: {
          name: 'search-crm-records',
          arguments: { objectType: 'contacts' },
        },
      })) as { description: string; messages: unknown[] };

      expect(typeof result.description).toBe('string');
      expect(result.description.length).toBeGreaterThan(0);
    });

    it('throws an error for an unknown prompt name', async () => {
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      await expect(
        handlers.get('prompts/get')?.({
          method: 'prompts/get',
          params: { name: 'nonexistent-prompt', arguments: {} },
        })
      ).rejects.toThrow('Prompt not found: nonexistent-prompt');
    });

    it('create-deal-with-line-items includes pipelineId and contactId when provided', async () => {
      // Covers the TRUE branches of pipelineLine and contactNote ternaries (lines 73-76)
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/get')?.({
        method: 'prompts/get',
        params: {
          name: 'create-deal-with-line-items',
          arguments: {
            dealName: 'Pipeline Deal',
            pipelineId: 'pipeline_123',
            contactId: 'contact_456',
          },
        },
      })) as { messages: Array<{ content: { text: string } }> };

      const text = result.messages[0].content.text;
      expect(text).toContain('pipeline_123');
      expect(text).toContain('contact_456');
    });

    it('search-crm-records includes query line when query param provided', async () => {
      // Covers the TRUE branch of queryLine ternary (line 428)
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/get')?.({
        method: 'prompts/get',
        params: {
          name: 'search-crm-records',
          arguments: {
            objectType: 'contacts',
            filterProperty: 'email',
            filterValue: 'test@example.com',
            query: 'John',
          },
        },
      })) as { messages: Array<{ content: { text: string } }> };

      const text = result.messages[0].content.text;
      expect(text).toContain('John');
    });

    it('handles prompts/get without arguments gracefully', async () => {
      // Covers the FALSE branch of "if (promptArgs)" (line 527)
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/get')?.({
        method: 'prompts/get',
        params: { name: 'search-crm-records' },
        // arguments deliberately omitted
      })) as { messages: Array<{ content: { text: string } }> };

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('skips undefined values in arguments object', async () => {
      // Covers the FALSE branch of "if (value !== undefined)" (line 529)
      const { mockServer, handlers } = buildMockServer();
      setupPrompts(mockServer);

      const result = (await handlers.get('prompts/get')?.({
        method: 'prompts/get',
        params: {
          name: 'search-crm-records',
          arguments: {
            objectType: 'contacts',
            filterProperty: undefined, // undefined value – should be skipped
          },
        },
      })) as { messages: Array<{ content: { text: string } }> };

      expect(result.messages).toBeDefined();
      // No error thrown — undefined values are safely skipped
    });
  });
});
