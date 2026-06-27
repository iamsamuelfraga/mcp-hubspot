/**
 * MCP Resources for HubSpot MCP Server.
 *
 * Registers three static, read-only resources that provide reference
 * information to LLM clients without requiring HubSpot API calls:
 *
 * - `hubspot://scopes-guide`     – Required OAuth scopes per toolset
 * - `hubspot://crm-object-types` – Supported objectType values and key properties
 * - `hubspot://conventions`      – Rate limits, batch limits, pagination, and caveats
 *
 * All resources are static JSON blobs; the `client` parameter is accepted but
 * not used in this phase, allowing future phases to expose dynamic content
 * (e.g. live pipeline stages or property definitions) without changing the
 * function signature.
 *
 * @see {@link https://modelcontextprotocol.io/docs/concepts/resources}
 */
import { type Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { type HubSpotClient } from '../hubspot-client.js';

// ─── Static resource payloads ────────────────────────────────────────────────

/**
 * Required HubSpot Private App OAuth scopes, grouped by toolset.
 *
 * The `workflows` toolset uses the v4 BETA API which requires an extra
 * access-approval step with HubSpot support. The `automation` scope covers
 * both the Automation Callbacks API and the Enrollment/v3 APIs.
 */
const SCOPES_GUIDE = {
  description:
    'Required HubSpot Private App OAuth scopes for each toolset. Grant only the scopes your use-case needs (principle of least privilege).',
  toolsets: {
    sales: {
      scopes: [
        'crm.objects.contacts.read',
        'crm.objects.contacts.write',
        'crm.objects.deals.read',
        'crm.objects.deals.write',
        'crm.objects.quotes.read',
        'crm.objects.quotes.write',
      ],
      notes: 'Covers CRM CRUD/batch for contacts, deals, quotes, and line_items.',
    },
    engagements: {
      scopes: [
        'crm.objects.contacts.read',
        'crm.objects.contacts.write',
        'crm.objects.engagements.read',
        'crm.objects.engagements.write',
      ],
      notes:
        'Covers CRM CRUD/batch for engagement object types: notes, calls, emails, meetings, tasks.',
    },
    associations: {
      scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
      notes: 'Covers creating, archiving, and listing associations between any two CRM objects.',
    },
    properties: {
      scopes: ['crm.schemas.deals.read', 'crm.schemas.contacts.read'],
      notes: 'Covers listing, reading, and creating custom property definitions.',
    },
    workflows: {
      scopes: ['automation'],
      notes:
        'Uses the Workflows v4 BETA API. The `automation` scope is required. Access to the v4 API may require approval from HubSpot; contact HubSpot support if you receive 403 errors.',
    },
    automation: {
      scopes: ['automation'],
      notes:
        'Covers Automation Callbacks (single and batch) and Workflow Enrollment/unenrollment (including v3 legacy read-only tools).',
    },
  },
};

/**
 * Catalogue of supported CRM objectType identifiers and their most useful
 * properties. Pass these strings verbatim as the `objectType` parameter of
 * `hubspot_crm_*` and `hubspot_associations_*` tools.
 *
 * NOTE: Use camelCase for compound object types (e.g. "lineItems", not
 * "line_items") when calling HubSpot APIs.
 */
const CRM_OBJECT_TYPES = {
  description:
    'Supported objectType values for hubspot_crm_* and hubspot_associations_* tools. Use the keys below as the objectType parameter.',
  objects: {
    contacts: {
      description: 'Individual people in your CRM.',
      keyProperties: ['firstname', 'lastname', 'email', 'phone', 'hs_lead_status'],
    },
    companies: {
      description: 'Business organisations in your CRM.',
      keyProperties: ['name', 'domain', 'industry', 'city', 'state'],
    },
    deals: {
      description: 'Sales opportunities tracked through a pipeline.',
      keyProperties: ['dealname', 'amount', 'closedate', 'dealstage', 'pipeline'],
    },
    tickets: {
      description: 'Support tickets or customer service cases.',
      keyProperties: ['subject', 'hs_pipeline_stage', 'hs_ticket_priority'],
    },
    quotes: {
      description: 'Sales quotes sent to prospects.',
      keyProperties: ['hs_title', 'hs_status', 'hs_expiration_date'],
    },
    lineItems: {
      description: 'Individual line items attached to deals or quotes.',
      keyProperties: ['name', 'price', 'quantity', 'hs_product_id'],
    },
    notes: {
      description: 'Internal CRM notes attached to any object.',
      keyProperties: ['hs_note_body', 'hs_timestamp'],
    },
    calls: {
      description: 'Logged phone calls associated with contacts or deals.',
      keyProperties: [
        'hs_call_title',
        'hs_call_direction',
        'hs_call_duration',
        'hs_call_recording_url',
      ],
    },
    emails: {
      description: 'Logged email engagements associated with contacts.',
      keyProperties: ['hs_email_subject', 'hs_email_direction'],
    },
    meetings: {
      description: 'Logged meetings associated with contacts or deals.',
      keyProperties: ['hs_meeting_title', 'hs_meeting_start_time', 'hs_meeting_outcome'],
    },
    tasks: {
      description: 'To-do tasks in your CRM.',
      keyProperties: ['hs_task_subject', 'hs_task_status', 'hs_task_priority'],
    },
  },
};

/**
 * Operational conventions, limits, and caveats to be aware of when using
 * this MCP server.
 */
const CONVENTIONS = {
  description:
    'Rate limits, batch sizes, search latency, pagination, and other operational caveats.',
  rateLimits: {
    privateApps: {
      burst: '100 requests per 10 seconds',
      sustained: '1000 requests per minute',
      recommendation:
        'Use batch endpoints (hubspot_crm_batch_*) whenever you need to read or write more than one object to minimise request count.',
    },
  },
  batchOperations: {
    maxObjectsPerCall: 100,
    note: 'All hubspot_crm_batch_* tools enforce a hard limit of 100 objects per call. Split larger sets into multiple calls.',
  },
  searchIndexingLatency: {
    delay: '1 to 5 minutes',
    note: 'Records created or updated via the API may not appear in hubspot_crm_search results immediately. If a search returns no results right after a write, wait a few minutes and retry.',
  },
  pagination: {
    mechanism: 'Cursor-based (after)',
    howToGetNextPage:
      'Include the value of paging.next.after from the previous response as the `after` parameter on the next call. When paging.next is absent, you have reached the last page.',
  },
  workflowsV4Beta: {
    status: 'BETA',
    warning:
      "The hubspot_workflows_* tools use HubSpot's Workflows v4 API, which is currently in beta. Breaking changes may occur without notice. Contact HubSpot support to request access if you receive 403 errors.",
    stableAlternatives:
      'Use hubspot_workflows_v3_list and hubspot_workflows_v3_get (in the automation toolset) for stable, read-only access to existing workflows.',
  },
  objectTypeCasing: {
    rule: 'Always pass objectType values using the canonical strings from the hubspot://crm-object-types resource (e.g. "lineItems", not "line_items"; "contacts", not "Contacts").',
  },
};

// ─── Resource registry ───────────────────────────────────────────────────────

/**
 * Static resource definitions exposed via `resources/list`.
 */
const RESOURCES = [
  {
    uri: 'hubspot://scopes-guide',
    name: 'HubSpot Private App Scopes Guide',
    description:
      'Required OAuth scopes for each toolset/domain. Use this before creating a Private App to ensure you request the correct permissions.',
    mimeType: 'application/json',
  },
  {
    uri: 'hubspot://crm-object-types',
    name: 'CRM Object Types Catalog',
    description:
      'Supported objectType values and their key properties. Reference this when calling hubspot_crm_* or hubspot_associations_* tools.',
    mimeType: 'application/json',
  },
  {
    uri: 'hubspot://conventions',
    name: 'HubSpot MCP Usage Conventions',
    description:
      'Rate limits, batch size caps, search indexing latency, pagination patterns, and other operational caveats.',
    mimeType: 'application/json',
  },
] as const;

/** Map from URI to static payload for O(1) lookup in the read handler. */
const RESOURCE_DATA: Record<string, unknown> = {
  'hubspot://scopes-guide': SCOPES_GUIDE,
  'hubspot://crm-object-types': CRM_OBJECT_TYPES,
  'hubspot://conventions': CONVENTIONS,
};

// ─── Setup function ──────────────────────────────────────────────────────────

/**
 * Registers MCP resources on the server instance.
 *
 * Registers `resources/list` and `resources/read` handlers for three static
 * reference resources. No HubSpot API calls are made; all content is compiled
 * into the server at startup.
 *
 * @param server - The MCP Server instance to register handlers on.
 * @param _client - The HubSpotClient instance (reserved for future dynamic resources).
 */
export function setupResources(server: Server, _client: HubSpotClient): void {
  // ── List handler ────────────────────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: RESOURCES };
  });

  // ── Read handler ────────────────────────────────────────────────────────────
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    const data = RESOURCE_DATA[uri];
    if (data === undefined) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  });
}
