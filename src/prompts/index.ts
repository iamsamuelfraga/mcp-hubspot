/**
 * MCP Prompts for HubSpot MCP Server.
 *
 * Registers five guided workflow prompts that help LLM clients orchestrate
 * multi-step HubSpot operations correctly. Each prompt returns a `user`
 * message with step-by-step instructions referencing the appropriate tools.
 *
 * Registered prompts:
 * 1. `create-deal-with-line-items`   – Create a Deal and attach Line Items
 * 2. `assemble-quote`                – Assemble a Quote from an existing Deal
 * 3. `log-engagement-and-associate`  – Log a CRM engagement and associate it
 * 4. `enroll-contact-in-workflow`    – Enroll an object in a HubSpot Workflow
 * 5. `search-crm-records`            – Search CRM records with filters and pagination
 *
 * @see {@link https://modelcontextprotocol.io/docs/concepts/prompts}
 */
import { type Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ─── Prompt definitions ──────────────────────────────────────────────────────

/** Shape of a single prompt argument descriptor. */
interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

/** Internal prompt definition used to populate the registry. */
interface PromptDefinition {
  name: string;
  description: string;
  arguments: PromptArgument[];
  /** Generates the user message text given the resolved argument values. */
  buildMessage: (args: Record<string, string>) => string;
}

// ─── 1. create-deal-with-line-items ─────────────────────────────────────────

const CREATE_DEAL_WITH_LINE_ITEMS: PromptDefinition = {
  name: 'create-deal-with-line-items',
  description: 'Guide to create a Deal and attach Line Items from HubSpot Products',
  arguments: [
    {
      name: 'dealName',
      description: 'Name for the new deal',
      required: true,
    },
    {
      name: 'contactId',
      description: 'HubSpot contact ID to associate with the deal (optional)',
      required: false,
    },
    {
      name: 'closeDate',
      description: 'Expected close date in YYYY-MM-DD format (optional)',
      required: false,
    },
    {
      name: 'pipelineId',
      description: 'Pipeline ID to place the deal in (optional, defaults to the default pipeline)',
      required: false,
    },
  ],
  buildMessage: (args) => {
    const { dealName, contactId, closeDate, pipelineId } = args;
    const closeDateLine = closeDate
      ? `  - closedate: "${closeDate}"`
      : '  - closedate: (set your target close date in YYYY-MM-DD format)';
    const pipelineLine = pipelineId
      ? `  - pipeline: "${pipelineId}"`
      : '  - pipeline: (omit to use the default pipeline, or specify a pipeline ID)';
    const contactNote = contactId
      ? `An existing contact ID has been provided (${contactId}). Skip to Step 2.`
      : 'No contact ID was provided. If you want to associate this deal with a contact, use **hubspot_crm_search** first (objectType: "contacts", filterGroups with propertyName: "email" or "lastname") to locate the correct contact before proceeding.';

    return `You are creating a HubSpot Deal named "${dealName}" and attaching one or more Line Items to it.

## Contact Lookup (optional pre-step)
${contactNote}

## Step 1 — Create the Deal
Call **hubspot_crm_create** with the following parameters:
- objectType: "deals"
- properties:
  - dealname: "${dealName}"
  - dealstage: (required — use a valid stage ID for the pipeline, e.g. "appointmentscheduled")
${closeDateLine}
${pipelineLine}

Save the "id" from the response — you will need it in Step 3 and Step 4.

## Step 2 — Create each Line Item
For every product you want to attach, call **hubspot_crm_create** with:
- objectType: "lineItems"
- properties:
  - name: (product name)
  - price: (unit price as a number)
  - quantity: (number of units)
  - hs_product_id: (optional — ID of an existing HubSpot Product to link)

Save the "id" of each created line item.

## Step 3 — Associate Line Items with the Deal
For each line item created in Step 2, call **hubspot_associations_create** with:
- fromObjectType: "lineItems"
- fromObjectId: (line item ID from Step 2)
- toObjectType: "deals"
- toObjectId: (deal ID from Step 1)
- associationType: "line_item_to_deal" (or use hubspot_associations_labels_list to find the correct label)

## Step 4 — (Optional) Associate the Contact with the Deal
If you have a contact ID, call **hubspot_associations_create** with:
- fromObjectType: "deals"
- fromObjectId: (deal ID from Step 1)
- toObjectType: "contacts"
- toObjectId: (contact ID)
- associationType: "deal_to_contact"

## Verification
Call **hubspot_crm_get** with objectType: "deals" and the deal ID to confirm the deal was created correctly. You can also call **hubspot_associations_list** to verify the line items are linked.

## Tips
- Batch-create line items using **hubspot_crm_batch_create** (objectType: "lineItems") if you have more than one — it is more efficient.
- Batch-create associations using **hubspot_associations_batch_create** if you have multiple line items to link.
- Batch operations support up to 100 objects per call.`;
  },
};

// ─── 2. assemble-quote ───────────────────────────────────────────────────────

const ASSEMBLE_QUOTE: PromptDefinition = {
  name: 'assemble-quote',
  description: 'Guide to assemble a HubSpot Quote from an existing Deal',
  arguments: [
    {
      name: 'dealId',
      description: 'HubSpot deal ID to base the quote on',
      required: true,
    },
    {
      name: 'quoteTitle',
      description: 'Title for the quote (optional, defaults to the deal name)',
      required: false,
    },
  ],
  buildMessage: (args) => {
    const { dealId, quoteTitle } = args;
    const titleNote = quoteTitle
      ? `Use the provided title: "${quoteTitle}"`
      : 'Use the deal name as the quote title, or choose an appropriate title.';

    return `You are assembling a HubSpot Quote from deal ID "${dealId}".

## Step 1 — Verify the Deal Exists
Call **hubspot_crm_get** with:
- objectType: "deals"
- objectId: "${dealId}"
- properties: ["dealname", "amount", "dealstage", "pipeline"]

Confirm the deal is in an appropriate stage before proceeding. Note the deal name for use as the quote title.

## Step 2 — Check for Line Items
A quote requires at least one line item associated with the deal. Call **hubspot_associations_list** with:
- fromObjectType: "deals"
- fromObjectId: "${dealId}"
- toObjectType: "lineItems"

If no line items are found, create them first using the **create-deal-with-line-items** prompt before continuing.

## Step 3 — Assemble the Quote
Call **hubspot_quotes_assemble** with:
- dealId: "${dealId}"
- quoteProperties:
  - hs_title: (${titleNote})
  - hs_expiration_date: (required — set an expiry date in YYYY-MM-DD format, e.g. 30 days from today)
  - hs_status: "DRAFT" (start as a draft)

**Required fields**: hs_title and hs_expiration_date must always be provided. The quote will fail to assemble without them.

## Step 4 — Update Quote Status
After reviewing the assembled quote, update its status using **hubspot_crm_update** with:
- objectType: "quotes"
- objectId: (quote ID from Step 3)
- properties:
  - hs_status: one of:
    - "DRAFT" — still being edited
    - "APPROVAL_NOT_NEEDED" — ready to send without an approval flow
    - "PENDING_APPROVAL" — submitted for internal approval before sending
    - "APPROVED" — approved and ready to share with the prospect

## Step 5 — Verify
Call **hubspot_crm_get** with objectType: "quotes" and the quote ID to confirm all properties are set correctly before sharing with the prospect.

## Tips
- You can retrieve the assembled quote at any time using **hubspot_crm_get** with objectType: "quotes".
- Use **hubspot_crm_search** (objectType: "quotes", filter on hs_title or hs_status) to find existing quotes for this deal.`;
  },
};

// ─── 3. log-engagement-and-associate ────────────────────────────────────────

const LOG_ENGAGEMENT_AND_ASSOCIATE: PromptDefinition = {
  name: 'log-engagement-and-associate',
  description:
    'Guide to log a CRM engagement (call, email, or meeting) and associate it with contacts/deals',
  arguments: [
    {
      name: 'engagementType',
      description: 'Type of engagement: calls, emails, meetings, notes, or tasks',
      required: true,
    },
    {
      name: 'contactId',
      description: 'HubSpot contact ID to associate the engagement with (optional)',
      required: false,
    },
    {
      name: 'dealId',
      description: 'HubSpot deal ID to associate the engagement with (optional)',
      required: false,
    },
  ],
  buildMessage: (args) => {
    const { engagementType, contactId, dealId } = args;

    const propertyGuides: Record<string, string> = {
      calls: `  - hs_call_title: (brief title or subject)
  - hs_call_direction: "INBOUND" or "OUTBOUND"
  - hs_call_duration: (duration in milliseconds, e.g. 300000 for 5 minutes)
  - hs_call_recording_url: (optional recording URL)
  - hs_call_status: "COMPLETED" | "FAILED" | "MISSED" | "BUSY" | "NO_ANSWER"`,
      emails: `  - hs_email_subject: (email subject line)
  - hs_email_direction: "INCOMING_EMAIL" | "OUTGOING_EMAIL" | "FORWARDED_EMAIL"
  - hs_email_html: (optional HTML email body)
  - hs_email_text: (optional plain text body)`,
      meetings: `  - hs_meeting_title: (meeting title or subject)
  - hs_meeting_start_time: (start datetime in ISO 8601, e.g. "2025-03-15T14:00:00Z")
  - hs_meeting_end_time: (end datetime in ISO 8601)
  - hs_meeting_outcome: "COMPLETED" | "CANCELED" | "NO_SHOW" | "RESCHEDULED"
  - hs_meeting_body: (optional meeting notes)`,
      notes: `  - hs_note_body: (note content — supports basic HTML)
  - hs_timestamp: (timestamp in milliseconds since epoch)`,
      tasks: `  - hs_task_subject: (task title)
  - hs_task_status: "NOT_STARTED" | "IN_PROGRESS" | "WAITING" | "DEFERRED" | "COMPLETED"
  - hs_task_priority: "HIGH" | "MEDIUM" | "LOW" | "NONE"
  - hs_task_body: (optional task description)
  - hs_timestamp: (due date in milliseconds since epoch)`,
    };

    const properties =
      propertyGuides[engagementType] ??
      '  - (look up properties for this object type using hubspot_properties_list)';

    const associationSteps = [];
    if (contactId) {
      associationSteps.push(`### Associate with Contact (ID: ${contactId})
Call **hubspot_associations_create** with:
- fromObjectType: "${engagementType}"
- fromObjectId: (engagement ID from Step 1)
- toObjectType: "contacts"
- toObjectId: "${contactId}"
- associationType: "${engagementType.slice(0, -1)}_to_contact" (verify with hubspot_associations_labels_list if needed)`);
    }
    if (dealId) {
      associationSteps.push(`### Associate with Deal (ID: ${dealId})
Call **hubspot_associations_create** with:
- fromObjectType: "${engagementType}"
- fromObjectId: (engagement ID from Step 1)
- toObjectType: "deals"
- toObjectId: "${dealId}"
- associationType: "${engagementType.slice(0, -1)}_to_deal" (verify with hubspot_associations_labels_list if needed)`);
    }
    if (!contactId && !dealId) {
      associationSteps.push(
        `No contact or deal ID was provided. If you want to associate this engagement, use **hubspot_crm_search** to find the relevant contact or deal first, then call **hubspot_associations_create** with the appropriate IDs.`
      );
    }

    return `You are logging a HubSpot **${engagementType}** engagement and associating it with CRM records.

## Step 1 — Create the Engagement
Call **hubspot_crm_create** with:
- objectType: "${engagementType}"
- properties:
${properties}

Save the "id" from the response.

## Step 2 — Create Associations
${associationSteps.join('\n\n')}

## Step 3 — Verify
Call **hubspot_crm_get** with objectType: "${engagementType}" and the engagement ID to confirm the record was created correctly.

## Tips
- Retrieve the available association type labels using **hubspot_associations_labels_list** if you are unsure of the correct associationType string.
- If you need to log multiple engagements of the same type, consider using **hubspot_crm_batch_create** with objectType: "${engagementType}" and then **hubspot_associations_batch_create** for efficiency.
- Properties and allowed values are subject to your HubSpot account configuration. Use **hubspot_properties_list** (objectType: "${engagementType}") to discover all available properties.`;
  },
};

// ─── 4. enroll-contact-in-workflow ──────────────────────────────────────────

const ENROLL_CONTACT_IN_WORKFLOW: PromptDefinition = {
  name: 'enroll-contact-in-workflow',
  description: 'Guide to enroll a contact (or other object) in a HubSpot Workflow',
  arguments: [
    {
      name: 'objectId',
      description: 'HubSpot object ID to enroll in the workflow',
      required: true,
    },
    {
      name: 'objectType',
      description: 'Object type to enroll (e.g. contacts, deals, companies) — defaults to contacts',
      required: true,
    },
    {
      name: 'workflowId',
      description:
        'HubSpot workflow ID to enroll the object in (optional — will list available workflows if omitted)',
      required: false,
    },
  ],
  buildMessage: (args) => {
    const { objectId, objectType = 'contacts', workflowId } = args;

    const workflowStep = workflowId
      ? `A workflow ID has been provided: **${workflowId}**. Skip to Step 2.`
      : `No workflow ID was provided. Call **hubspot_workflows_list** to retrieve available workflows.
- Use the optional "objectTypeId" filter to narrow results to workflows that enroll "${objectType}" objects.
- Review the returned list and identify the workflow ID you want to use.
- Note: **hubspot_workflows_list** uses the v4 BETA API. If it returns a 403, request access from HubSpot support or use **hubspot_workflows_v3_list** for a read-only view of existing workflows.`;

    return `You are enrolling HubSpot **${objectType}** object (ID: ${objectId}) into a workflow.

> **Important:** The workflow enrollment tools use the HubSpot v4 API, which is currently in **BETA**. Breaking changes may occur. If you encounter 403 errors, contact HubSpot support to request access to the Workflows v4 API.

## Step 1 — Find the Workflow
${workflowStep}

## Step 2 — Verify the Object Exists
Call **hubspot_crm_get** with:
- objectType: "${objectType}"
- objectId: "${objectId}"

Confirm the object exists and is in a state appropriate for workflow enrollment before proceeding.

## Step 3 — Enroll the Object
Call **hubspot_enrollment_enroll** with:
- objectId: "${objectId}"
- objectType: "${objectType}"
- workflowId: ${workflowId ? `"${workflowId}"` : '(workflow ID from Step 1)'}

A successful response indicates the object has been enrolled. Enrollment may be asynchronous — the object will enter the workflow at the next scheduled execution interval.

## Step 4 — Verify Enrollment
Call **hubspot_enrollment_get_enrollments** with:
- objectId: "${objectId}"
- objectType: "${objectType}"

Confirm the workflow appears in the enrolled workflows list.

## Unenrolling
To remove the object from a workflow later, call **hubspot_enrollment_unenroll** with:
- objectId: "${objectId}"
- objectType: "${objectType}"
- workflowId: (workflow ID)

## Tips
- Use **hubspot_workflows_get** to inspect a specific workflow's details before enrolling, including its trigger conditions and enrolled object type.
- If the object does not meet the workflow's enrollment criteria, the enrollment may be silently rejected by HubSpot.
- For high-volume enrollments, consider using the workflow's built-in trigger conditions instead of API enrollment.`;
  },
};

// ─── 5. search-crm-records ───────────────────────────────────────────────────

const SEARCH_CRM_RECORDS: PromptDefinition = {
  name: 'search-crm-records',
  description: 'Guide to search CRM records with filters, sort, and pagination',
  arguments: [
    {
      name: 'objectType',
      description: 'CRM object type to search (e.g. contacts, deals, companies, tickets)',
      required: true,
    },
    {
      name: 'query',
      description: 'Free-text search query (optional)',
      required: false,
    },
    {
      name: 'filterProperty',
      description: 'Property name to filter on (optional)',
      required: false,
    },
    {
      name: 'filterValue',
      description: 'Value to filter by (optional, used with filterProperty)',
      required: false,
    },
  ],
  buildMessage: (args) => {
    const { objectType, query, filterProperty, filterValue } = args;

    const filterExample =
      filterProperty && filterValue
        ? `  - filterGroups: [{ filters: [{ propertyName: "${filterProperty}", operator: "EQ", value: "${filterValue}" }] }]`
        : `  - filterGroups: [
      {
        filters: [
          {
            propertyName: "dealstage",    // Property to filter on
            operator: "EQ",               // One of: EQ, NEQ, GT, GTE, LT, LTE, BETWEEN, IN, NOT_IN, HAS_PROPERTY, NOT_HAS_PROPERTY, CONTAINS_TOKEN, NOT_CONTAINS_TOKEN
            value: "appointmentscheduled" // Value to match
          }
        ]
      }
    ]
    // Multiple filters in the same filterGroup are AND-ed together.
    // Multiple filterGroups are OR-ed together.`;

    const queryLine = query
      ? `  - query: "${query}"  // Free-text search across all indexed properties`
      : `  // Omit "query" for filter-only searches`;

    return `You are searching HubSpot **${objectType}** records using **hubspot_crm_search**.

> **Indexing latency**: Records created or updated via the API may take **1 to 5 minutes** to appear in search results. If your search returns no results immediately after a write, wait a few minutes and retry.

## Basic Search Call
Call **hubspot_crm_search** with:
- objectType: "${objectType}"
${queryLine}
${filterExample}
  - sorts: [{ propertyName: "createdate", direction: "DESCENDING" }]  // Sort by most recent first
  - properties: ["firstname", "lastname", "email"]  // Properties to include in results
  - limit: 10   // Number of results per page (max 100)

## Operators Reference
| Operator | Description |
|----------|-------------|
| EQ | Equals |
| NEQ | Not equals |
| GT | Greater than |
| GTE | Greater than or equal |
| LT | Less than |
| LTE | Less than or equal |
| BETWEEN | Between two values (requires highValue) |
| IN | In a list of values |
| NOT_IN | Not in a list of values |
| HAS_PROPERTY | Property has any value (not null/empty) |
| NOT_HAS_PROPERTY | Property is null or empty |
| CONTAINS_TOKEN | Property contains the search token (useful for multi-select properties) |
| NOT_CONTAINS_TOKEN | Property does not contain the token |

## Pagination
The response includes a "paging" object. To get the next page:
1. Check if "paging.next.after" exists in the response.
2. If present, call **hubspot_crm_search** again with the same parameters plus:
   - after: (value of paging.next.after)
3. Repeat until "paging.next" is absent — that indicates the last page.

## Discovering Properties
If you are unsure which properties exist for "${objectType}", call **hubspot_properties_list** with objectType: "${objectType}" to retrieve the full property catalogue.

## Tips
- Combine "query" (free-text) with "filterGroups" (structured filters) in the same call for more precise results.
- Sort by multiple properties by adding more entries to the "sorts" array.
- The "properties" array controls which fields are returned — always specify only what you need to keep responses compact.
- To count records without fetching data, set limit: 0 and check the "total" field in the response.`;
  },
};

// ─── Prompt registry ─────────────────────────────────────────────────────────

/** All registered prompts, in display order. */
const PROMPTS: PromptDefinition[] = [
  CREATE_DEAL_WITH_LINE_ITEMS,
  ASSEMBLE_QUOTE,
  LOG_ENGAGEMENT_AND_ASSOCIATE,
  ENROLL_CONTACT_IN_WORKFLOW,
  SEARCH_CRM_RECORDS,
];

/** Map from prompt name to definition for O(1) lookup. */
const PROMPT_MAP = new Map<string, PromptDefinition>(PROMPTS.map((p) => [p.name, p]));

// ─── Setup function ──────────────────────────────────────────────────────────

/**
 * Registers MCP prompts on the server instance.
 *
 * Registers `prompts/list` and `prompts/get` handlers for five guided workflow
 * prompts. Each prompt returns a single `user` message with step-by-step
 * instructions that orchestrate the correct sequence of HubSpot tools.
 *
 * @param server - The MCP Server instance to register handlers on.
 */
export function setupPrompts(server: Server): void {
  // ── List handler ────────────────────────────────────────────────────────────
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: PROMPTS.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    };
  });

  // ── Get handler ─────────────────────────────────────────────────────────────
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: promptArgs } = request.params;

    const prompt = PROMPT_MAP.get(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    const resolvedArgs: Record<string, string> = {};
    if (promptArgs) {
      for (const [key, value] of Object.entries(promptArgs)) {
        if (value !== undefined) {
          resolvedArgs[key] = String(value);
        }
      }
    }

    return {
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt.buildMessage(resolvedArgs),
          },
        },
      ],
    };
  });
}
