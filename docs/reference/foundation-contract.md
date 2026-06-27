# HubSpot MCP — Foundation Contract

This document is the authoritative reference for agents implementing tool domains in Phase 1+.
Read this before writing any tool code.

---

## 1. HubSpotClient — Complete Method Signatures

All tools receive a `HubSpotClient` instance from `registerTools(client)` in `src/index.ts`.

```typescript
import { HubSpotClient } from '../../hubspot-client.js';
import type { CollectionResponse, SimplePublicObject } from '../../types/hubspot-api.js';
```

### Constructor

```typescript
new HubSpotClient(config: HubSpotClientConfig)

interface HubSpotClientConfig {
  accessToken: string;   // HubSpot Private App token — never logged
  baseUrl?: string;      // Default: 'https://api.hubapi.com'
}
```

### Core Method: `request<T>(options)`

```typescript
async request<T>(options: RequestOptions): Promise<T>

interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;         // e.g., '/crm/v3/objects/deals'
  query?: Record<string, string | number | boolean | undefined>;  // undefined values omitted
  body?: unknown;       // JSON-serialized for POST/PATCH/PUT
  useSearchLimiter?: boolean;  // true for /search endpoints (stricter rate limit)
}
```

Automatically handles:
- `Authorization: Bearer <token>` header
- `Content-Type: application/json` (POST/PATCH/PUT with body only)
- Rate limiting (general: 190 req/10s, search: 5 req/s)
- Retry with exponential backoff + jitter (429, 500-504)
- `Retry-After` header honoring on 429
- `X-HubSpot-RateLimit-*` monitoring (warns when remaining < 10)
- `parseHubSpotError` on non-2xx responses
- Metrics recording

### Convenience Methods

```typescript
// GET with optional query params
async get<T>(path: string, query?: Record<string, ...>): Promise<T>

// POST with optional body and query params
async post<T>(path: string, body?: unknown, query?: Record<string, ...>): Promise<T>

// PATCH (partial update) with optional body
async patch<T>(path: string, body?: unknown): Promise<T>

// PUT (full replace) with optional body
async put<T>(path: string, body?: unknown): Promise<T>

// DELETE with optional query params
async delete<T>(path: string, query?: Record<string, ...>): Promise<T>

// Search using stricter rate limiter
async search<T>(path: string, body: unknown): Promise<T>

// Fetch all cursor-paginated pages into a single array
async paginateAll<T>(
  path: string,
  query?: Record<string, ...>,
  maxItems?: number
): Promise<T[]>
```

---

## 2. Usage Examples

### GET with query params

```typescript
const deals = await client.get<CollectionResponse<SimplePublicObject>>(
  '/crm/v3/objects/deals',
  {
    limit: 100,
    properties: 'dealname,amount,closedate,dealstage',
    archived: false,
  }
);
// deals.results → SimplePublicObject[]
// deals.paging?.next?.after → cursor for next page
```

### POST with body

```typescript
const deal = await client.post<SimplePublicObject>(
  '/crm/v3/objects/deals',
  {
    properties: {
      dealname: 'Acme Corp - Enterprise',
      amount: '50000',
      dealstage: 'appointmentscheduled',
      closedate: '2025-12-31',
    },
  }
);
// deal.id → HubSpot record ID
```

### Search with `useSearchLimiter: true`

```typescript
const results = await client.search<CollectionResponse<SimplePublicObject>>(
  '/crm/v3/objects/deals/search',
  {
    filterGroups: [
      {
        filters: [
          { propertyName: 'amount', operator: 'GTE', value: '10000' },
          { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
        ],
      },
    ],
    properties: ['dealname', 'amount', 'closedate'],
    sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
    limit: 50,
    after: 0,
  }
);
```

Note: `client.search()` automatically uses `useSearchLimiter: true`. You can also call
`client.request({ ..., useSearchLimiter: true })` directly for custom paths.

### paginateAll — Collect all pages

```typescript
// Fetch ALL contacts (no limit) – be careful with large datasets
const allContacts = await client.paginateAll<SimplePublicObject>(
  '/crm/v3/objects/contacts',
  { limit: 100, properties: 'firstname,lastname,email' }
);

// Fetch at most 500 deals
const recentDeals = await client.paginateAll<SimplePublicObject>(
  '/crm/v3/objects/deals',
  { limit: 100, properties: 'dealname,amount' },
  500
);
```

---

## 3. The Tool Interface

Every tool is an object that satisfies the `Tool` interface from `src/types/common.ts`:

```typescript
export interface Tool {
  name: string;          // 'hubspot_<domain>_<action>'
  description: string;   // Shown to the LLM in tool list
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;  // JSON Schema property definitions
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: (args: unknown) => Promise<unknown>;
}
```

### Complete Tool Example

```typescript
import { z } from 'zod';
import { type Tool } from '../../types/common.js';
import { type HubSpotClient } from '../../hubspot-client.js';
import { handleToolError } from '../../utils/error-handler.js';

// Step 1: Define the Zod schema for input validation
const ListDealsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10)
    .describe('Maximum number of deals to return (1-100)'),
  properties: z.string().optional()
    .describe('Comma-separated list of properties to include (e.g., "dealname,amount,closedate")'),
  after: z.string().optional()
    .describe('Pagination cursor from a previous response paging.next.after'),
  archived: z.boolean().default(false)
    .describe('Whether to include archived (deleted) deals'),
});

// Step 2: Derive the TypeScript type from the Zod schema
type ListDealsInput = z.infer<typeof ListDealsSchema>;

// Step 3: Build the JSON Schema inputSchema MANUALLY (no external lib needed)
// Pattern: translate each Zod field into a JSON Schema property descriptor.
const listDealsInputSchema = {
  type: 'object' as const,
  properties: {
    limit: {
      type: 'number',
      description: 'Maximum number of deals to return (1-100)',
      default: 10,
      minimum: 1,
      maximum: 100,
    },
    properties: {
      type: 'string',
      description: 'Comma-separated list of properties to include (e.g., "dealname,amount,closedate")',
    },
    after: {
      type: 'string',
      description: 'Pagination cursor from a previous response paging.next.after',
    },
    archived: {
      type: 'boolean',
      description: 'Whether to include archived (deleted) deals',
      default: false,
    },
  },
  required: [],
  additionalProperties: false,
};

// Step 4: Implement the tool factory function
export function getListDealsTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_sales_list_deals',
    description:
      'List deals from HubSpot CRM. Returns deal records with their properties. ' +
      'Use the "after" cursor for pagination. Default limit is 10.',
    inputSchema: listDealsInputSchema,
    handler: async (rawArgs: unknown) => {
      // Step 5: Parse and validate input with Zod
      const args = ListDealsSchema.parse(rawArgs);

      try {
        const response = await client.get<{
          results: Array<{ id: string; properties: Record<string, string | null> }>;
          paging?: { next?: { after: string } };
        }>('/crm/v3/objects/deals', {
          limit: args.limit,
          properties: args.properties,
          after: args.after,
          archived: args.archived,
        });

        return {
          deals: response.results,
          pagination: response.paging?.next
            ? { nextCursor: response.paging.next.after }
            : null,
          total: response.results.length,
        };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
```

---

## 4. Registering a Domain Module

### Directory structure

```
src/tools/
  sales/
    index.ts       ← exports getSalesTools(client): Tool[]
    list-deals.ts  ← individual tool factories (optional split)
    create-deal.ts
  engagements/
    index.ts
  ...
```

### Domain index.ts pattern

```typescript
// src/tools/sales/index.ts
import { type HubSpotClient } from '../../hubspot-client.js';
import { type Tool } from '../../types/common.js';

export function getSalesTools(client: HubSpotClient): Tool[] {
  return [
    {
      name: 'hubspot_sales_list_deals',
      description: '...',
      inputSchema: { ... },
      handler: async (args) => { ... },
    },
    {
      name: 'hubspot_sales_get_deal',
      description: '...',
      inputSchema: { ... },
      handler: async (args) => { ... },
    },
    // ... more tools
  ];
}
```

### Wiring into src/index.ts

In the `registerTools()` function inside `src/index.ts`, add:

```typescript
import { getSalesTools } from './tools/sales/index.js';

function registerTools(client: HubSpotClient): Tool[] {
  return [
    ...getSalesTools(client),      // ← add this
    // ...getEngagementTools(client),
  ];
}
```

The toolset filter automatically maps `hubspot_sales_*` tool names to the `sales` toolset via `findToolset()`.

### How toolset filtering works

```
Tool name:   'hubspot_sales_list_deals'
             ↓ strip 'hubspot_' prefix
Normalized:  'sales_list_deals'
             ↓ longest-prefix match against enabled toolsets
Toolset:     'sales'

If 'sales' is in HUBSPOT_TOOLSETS (or HUBSPOT_TOOLSETS is unset) → tool is exposed
Otherwise → tool is hidden from ListTools
```

---

## 5. Zod Schema Conventions

All tool input schemas live in `src/schemas/<domain>.ts`.

### Standard patterns

```typescript
// src/schemas/sales.ts
import { z } from 'zod';

// Reusable base: CRM object ID (always a string in HubSpot v3)
export const ObjectIdSchema = z.string().min(1).describe('HubSpot CRM object ID');

// Reusable: property list selector
export const PropertiesSchema = z.string().optional()
  .describe('Comma-separated property names to include in the response');

// Reusable: pagination cursor
export const AfterCursorSchema = z.string().optional()
  .describe('Pagination cursor from paging.next.after');

// Reusable: pagination limit
export const LimitSchema = z.number().int().min(1).max(100).default(10)
  .describe('Maximum number of records to return (1-100)');

// Domain-specific schema
export const CreateDealSchema = z.object({
  dealname: z.string().min(1).describe('Name of the deal'),
  amount: z.string().optional().describe('Deal value as a string (e.g., "5000")'),
  dealstage: z.string().optional().describe('Pipeline stage ID'),
  closedate: z.string().optional().describe('Expected close date (ISO 8601: YYYY-MM-DD)'),
  pipeline: z.string().optional().describe('Pipeline ID (defaults to default pipeline)'),
});
```

### Zod → JSON Schema conversion

The project builds JSON Schema objects **manually** — no `zod-to-json-schema` library.

Map Zod types to JSON Schema as follows:

| Zod type | JSON Schema type | Notes |
|----------|-----------------|-------|
| `z.string()` | `{ type: 'string' }` | |
| `z.string().min(1)` | `{ type: 'string', minLength: 1 }` | |
| `z.number()` | `{ type: 'number' }` | |
| `z.number().int()` | `{ type: 'integer' }` | use `'integer'` not `'number'` |
| `z.number().min(1).max(100)` | `{ type: 'number', minimum: 1, maximum: 100 }` | |
| `z.boolean()` | `{ type: 'boolean' }` | |
| `z.enum(['a','b'])` | `{ type: 'string', enum: ['a','b'] }` | |
| `z.array(z.string())` | `{ type: 'array', items: { type: 'string' } }` | |
| `.optional()` | Remove from `required[]` | field is still in `properties` |
| `.default(val)` | Add `default: val` to property | |
| `.describe('...')` | Add `description: '...'` to property | ALWAYS add for clarity |

The `required` array lists fields that do NOT have `.optional()` or `.default()`.

### Full example

```typescript
// Zod schema:
const CreateDealSchema = z.object({
  dealname: z.string().min(1).describe('Name of the deal'),
  amount: z.string().optional().describe('Deal value as string'),
  limit: z.number().int().min(1).max(100).default(10).describe('Max results'),
});

// Corresponding manual JSON Schema:
const inputSchema = {
  type: 'object' as const,
  properties: {
    dealname: {
      type: 'string',
      minLength: 1,
      description: 'Name of the deal',
    },
    amount: {
      type: 'string',
      description: 'Deal value as string',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 10,
      description: 'Max results',
    },
  },
  required: ['dealname'],        // only non-optional, non-default fields
  additionalProperties: false,
};
```

---

## 6. Tool Naming Convention

All tool names follow: `hubspot_<toolset>_<action>`

| Toolset | Example tools |
|---------|--------------|
| `sales` | `hubspot_sales_list_deals`, `hubspot_sales_get_deal`, `hubspot_sales_create_deal`, `hubspot_sales_update_deal`, `hubspot_sales_delete_deal`, `hubspot_sales_search_deals` |
| `engagements` | `hubspot_engagements_list_calls`, `hubspot_engagements_create_note`, `hubspot_engagements_get_meeting` |
| `associations` | `hubspot_associations_list`, `hubspot_associations_create`, `hubspot_associations_delete` |
| `properties` | `hubspot_properties_list`, `hubspot_properties_get`, `hubspot_properties_create` |
| `workflows` | `hubspot_workflows_list`, `hubspot_workflows_get`, `hubspot_workflows_enable` |
| `automation` | `hubspot_automation_list_sequences`, `hubspot_automation_enroll_contact` |

Actions: `list`, `get`, `create`, `update`, `delete`, `search`, `batch_read`, `batch_create`, `batch_update`, `batch_delete`

---

## 7. Error Handling in Tool Handlers

Always wrap API calls in try/catch and return `handleToolError` on failures:

```typescript
handler: async (rawArgs: unknown) => {
  const args = MyInputSchema.parse(rawArgs);  // Zod validation (throws ZodError on bad input)
  
  try {
    const result = await client.get<MyResponseType>('/crm/v3/...', { ... });
    return result;  // Auto-serialized to JSON by the CallTool handler
  } catch (error) {
    return handleToolError(error);
    // HubSpotApiError → structured message with statusCode, correlationId, endpoint
    // Other errors → 'Unexpected error: ...'
  }
},
```

Note: ZodError from `.parse()` is NOT caught here intentionally — the MCP server's global
error handler wraps it. If you want to provide a user-friendly message for invalid args,
use `.safeParse()` instead.

---

## 8. Useful Utilities Reference

```typescript
// Pagination
import { paginate } from '../../utils/pagination.js';
const items = await paginate(
  (after) => client.get('/crm/v3/objects/deals', { after, limit: 100 }),
  500  // optional maxItems
);

// Batch processing
import { chunk, processBatchesSequential } from '../../utils/batch.js';
const batches = chunk(ids, 100);  // splits into sub-arrays of ≤100
const results = await processBatchesSequential(
  ids,
  async (batch) => {
    const response = await client.post('/crm/v3/objects/deals/batch/read', {
      inputs: batch.map((id) => ({ id })),
      properties: ['dealname'],
    });
    return response.results;
  }
);

// Object type validation
import { validateObjectType, OBJECT_TYPE_CONFIG } from '../../utils/object-types.js';
const validType = validateObjectType(userInput);  // throws on invalid type
const config = OBJECT_TYPE_CONFIG[validType];      // { basePath, scopeRead, scopeWrite, toolset }

// Logging
import { logger } from '../../utils/logger.js';
logger.info('Tool executed', { dealId: result.id });
logger.warn('Large result set', { count: items.length });
logger.error('Unexpected error', error as Error, { context: 'batch read' });
```
