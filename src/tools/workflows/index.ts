/**
 * HubSpot Automation v4 Flows (Workflows) tools.
 *
 * IMPORTANT: This module targets the HubSpot Automation v4 API which is
 * currently in BETA. Endpoints, request/response shapes, and available
 * fields may change without notice.
 *
 * Required OAuth scope: `automation`
 *
 * Provides 9 MCP tools for managing HubSpot workflow flows:
 *  1. hubspot_workflows_list           – List all flows (paginated)
 *  2. hubspot_workflows_get            – Get a single flow by ID
 *  3. hubspot_workflows_create         – Create a new flow
 *  4. hubspot_workflows_update         – Replace an existing flow (PUT)
 *  5. hubspot_workflows_delete         – Delete a flow (IRREVERSIBLE)
 *  6. hubspot_workflows_batch_read     – Read multiple flows by ID in one call
 *  7. hubspot_workflows_email_campaigns – Get email campaigns tied to a flow
 *  8. hubspot_workflows_performance    – Get performance metrics for a flow
 *  9. hubspot_workflows_id_mappings    – Map legacy v3 workflow IDs to v4 flow IDs
 *
 * @see {@link https://developers.hubspot.com/docs/api/automation/workflows}
 */
import { type HubSpotClient } from '../../hubspot-client.js';
import { type Tool } from '../../types/common.js';
import { handleToolError } from '../../utils/error-handler.js';
import { CreateFlowSchema, UpdateFlowSchema } from '../../schemas/workflows.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared JSON Schema fragments (manually derived — no zod-to-json-schema)
// ---------------------------------------------------------------------------

/**
 * Permissive JSON Schema representation for recursive/complex BETA objects.
 * Used in inputSchema for fields that map to PublicOrFilterBranch or deeply
 * nested BETA structures where full $ref recursion in JSON Schema is impractical.
 */
const permissiveObjectSchema = {
  type: 'object' as const,
  additionalProperties: true,
  description:
    'Flexible object. This field accepts complex nested structures ' +
    '(e.g., enrollment criteria with recursive filter branches). ' +
    'Refer to the HubSpot Automation v4 BETA documentation for the full schema.',
};

/**
 * Permissive array-of-objects JSON Schema for BETA arrays.
 */
const permissiveArraySchema = {
  type: 'array' as const,
  items: { type: 'object' as const, additionalProperties: true },
  description:
    'Array of objects. Structure varies by flow type. ' +
    'Refer to the HubSpot Automation v4 BETA documentation.',
};

// ---------------------------------------------------------------------------
// Internal Zod input schemas for each tool
// ---------------------------------------------------------------------------

/** Zod schema for hubspot_workflows_list input. */
const ListWorkflowsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  after: z.string().optional(),
});

/** Zod schema for hubspot_workflows_get input. */
const GetWorkflowInputSchema = z.object({
  flowId: z.string().min(1),
});

/** Zod schema for hubspot_workflows_batch_read input. */
const BatchReadWorkflowsInputSchema = z.object({
  flowIds: z.array(z.string().min(1)).min(1).max(100),
});

/** Zod schema for hubspot_workflows_delete input. */
const DeleteWorkflowInputSchema = z.object({
  flowId: z.string().min(1),
});

/** Zod schema for hubspot_workflows_email_campaigns input. */
const WorkflowEmailCampaignsInputSchema = z.object({
  flowId: z.string().min(1),
});

/** Zod schema for hubspot_workflows_performance input. */
const WorkflowPerformanceInputSchema = z.object({
  flowId: z.string().min(1),
});

/** Zod schema for hubspot_workflows_id_mappings input. */
const WorkflowIdMappingsInputSchema = z.object({
  workflowIds: z.array(z.number().int()).min(1),
});

/** Zod schema for hubspot_workflows_update combines flowId + update body. */
const UpdateWorkflowInputSchema = z
  .object({
    flowId: z.string().min(1),
  })
  .merge(UpdateFlowSchema);

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_list
// ---------------------------------------------------------------------------

/**
 * Lists automation flows from the HubSpot v4 Flows API.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for listing flows.
 */
function buildListWorkflowsTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_list',
    description:
      '[BETA] List automation workflows (flows) from HubSpot Automation v4 API. ' +
      'Returns a paginated list of all flows in the portal with shape ' +
      '{ results, total, pagination: { nextCursor } | null }. ' +
      'Use `pagination.nextCursor` from the response as the "after" parameter to fetch subsequent pages. ' +
      'Requires the "automation" OAuth scope.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum number of flows to return per page (1–100, default 20)',
        },
        after: {
          type: 'string',
          description:
            'Pagination cursor from a previous response (paging.next.after). ' +
            'Omit for the first page.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = ListWorkflowsInputSchema.parse(rawArgs);

      try {
        const query: Record<string, string | number | boolean | undefined> = {
          limit: args.limit,
        };
        if (args.after) {
          query.after = args.after;
        }

        const response = await client.get<{
          results: unknown[];
          paging?: { next?: { after: string } };
        }>('/automation/v4/flows', query);

        return {
          results: response.results,
          total: response.results.length,
          pagination: response.paging?.next ? { nextCursor: response.paging.next.after } : null,
        };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_get
// ---------------------------------------------------------------------------

/**
 * Retrieves a single flow by its ID from the HubSpot v4 Flows API.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for fetching a flow.
 */
function buildGetWorkflowTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_get',
    description:
      '[BETA] Get a single automation workflow (flow) by its ID from HubSpot Automation v4 API. ' +
      'Returns the full flow definition including actions, enrollment criteria, and settings. ' +
      'Requires the "automation" OAuth scope.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        flowId: {
          type: 'string',
          minLength: 1,
          description: 'The v4 flow ID (string identifier returned by the Automation v4 API)',
        },
      },
      required: ['flowId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = GetWorkflowInputSchema.parse(rawArgs);

      try {
        const flow = await client.get<unknown>(
          `/automation/v4/flows/${encodeURIComponent(args.flowId)}`
        );
        return flow;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_create
// ---------------------------------------------------------------------------

/**
 * Creates a new automation flow in HubSpot v4.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for creating a flow.
 */
function buildCreateWorkflowTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_create',
    description:
      '[BETA] Create a new automation workflow (flow) in HubSpot Automation v4 API. ' +
      'The "name" and "type" fields are required. All other fields are optional and can be ' +
      'configured after creation using hubspot_workflows_update. ' +
      'Complex fields like enrollmentCriteria use recursive filter branch structures — ' +
      'see the HubSpot Automation v4 BETA documentation for the full schema. ' +
      'Requires the "automation" OAuth scope.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: 'Display name for the workflow. Required.',
        },
        type: {
          type: 'string',
          enum: [
            'CONTACT_FLOW',
            'COMPANY_FLOW',
            'DEAL_FLOW',
            'TICKET_FLOW',
            'QUOTE_FLOW',
            'CONVERSATION_FLOW',
          ],
          description:
            'The CRM object type this flow operates on. ' +
            'Use CONTACT_FLOW for contact-based workflows (most common), ' +
            'DEAL_FLOW for deal-based, etc.',
        },
        flowType: {
          type: 'string',
          enum: ['WORKFLOW', 'ACTION_SET', 'UNKNOWN'],
          description: 'Architectural type. Defaults to WORKFLOW when omitted.',
        },
        objectTypeId: {
          type: 'string',
          description: 'HubSpot internal object type ID string (e.g., "0-1" for contacts).',
        },
        isEnabled: {
          type: 'boolean',
          default: false,
          description:
            'Whether to activate the flow immediately after creation. Defaults to false.',
        },
        enrollmentCriteria: {
          ...permissiveObjectSchema,
          description:
            'Defines when/how records enter the flow. Uses recursive OR/AND filter branch trees. ' +
            'See the HubSpot Automation v4 BETA documentation for the PublicOrFilterBranch schema.',
        },
        actions: {
          ...permissiveArraySchema,
          description:
            'Initial list of automation action nodes for the flow. Each action has a "type" field ' +
            'and type-specific "inputFields". See HubSpot Automation v4 BETA documentation.',
        },
      },
      required: ['name', 'type'],
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const args = CreateFlowSchema.parse(rawArgs);

      try {
        const flow = await client.post<unknown>('/automation/v4/flows', args);
        return flow;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_update
// ---------------------------------------------------------------------------

/**
 * Replaces an existing automation flow in HubSpot v4 (full PUT replacement).
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for updating a flow.
 */
function buildUpdateWorkflowTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_update',
    description:
      '[BETA] Fully replace an existing automation workflow (flow) in HubSpot Automation v4 API. ' +
      'This is a PUT operation — it replaces the entire flow definition. ' +
      'Fields not included in the request body will be reset to their defaults. ' +
      'To fetch the current state before updating, use hubspot_workflows_get first. ' +
      'Requires the "automation" OAuth scope.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        flowId: {
          type: 'string',
          minLength: 1,
          description: 'The v4 flow ID of the flow to update.',
        },
        name: {
          type: 'string',
          minLength: 1,
          description: 'Display name for the workflow.',
        },
        type: {
          type: 'string',
          description: 'CRM object type this flow operates on (CONTACT_FLOW, DEAL_FLOW, etc.).',
        },
        flowType: {
          type: 'string',
          description: 'Architectural type (WORKFLOW, ACTION_SET, UNKNOWN).',
        },
        objectTypeId: {
          type: 'string',
          description: 'HubSpot internal object type ID string.',
        },
        isEnabled: {
          type: 'boolean',
          description: 'Whether the flow is active.',
        },
        enrollmentCriteria: {
          ...permissiveObjectSchema,
          description:
            'Enrollment trigger criteria using recursive OR/AND filter branch trees. ' +
            'See HubSpot Automation v4 BETA documentation.',
        },
        actions: {
          ...permissiveArraySchema,
          description: 'Complete action list for the flow.',
        },
      },
      required: ['flowId'],
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const { flowId, ...updateBody } = UpdateWorkflowInputSchema.parse(rawArgs);

      try {
        const flow = await client.put<unknown>(
          `/automation/v4/flows/${encodeURIComponent(flowId)}`,
          updateBody
        );
        return flow;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_delete
// ---------------------------------------------------------------------------

/**
 * Deletes an automation flow permanently.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for deleting a flow.
 */
function buildDeleteWorkflowTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_delete',
    description:
      '[BETA] WARNING: IRREVERSIBLE. Delete an automation workflow (flow) from HubSpot. ' +
      'The workflow CANNOT be recovered after deletion via the API. ' +
      'Consider disabling the flow (isEnabled: false) instead if you may need it later. ' +
      'Use hubspot_workflows_get to confirm the flow ID before proceeding. ' +
      'Requires the "automation" OAuth scope.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        flowId: {
          type: 'string',
          minLength: 1,
          description:
            'The v4 flow ID of the workflow to permanently delete. ' +
            'WARNING: This action is IRREVERSIBLE and cannot be undone via the API.',
        },
      },
      required: ['flowId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = DeleteWorkflowInputSchema.parse(rawArgs);

      try {
        await client.delete<unknown>(`/automation/v4/flows/${encodeURIComponent(args.flowId)}`);
        return {
          success: true,
          deleted: true,
          flowId: args.flowId,
          message:
            'Flow deleted successfully. This action is irreversible — the flow cannot be recovered.',
        };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_batch_read
// ---------------------------------------------------------------------------

/**
 * Reads multiple flows in a single API request.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for batch reading flows.
 */
function buildBatchReadWorkflowsTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_batch_read',
    description:
      '[BETA] Read multiple automation workflows (flows) by their IDs in a single API call. ' +
      'More efficient than multiple individual hubspot_workflows_get calls when fetching ' +
      'several flows at once. Maximum 100 flow IDs per request. ' +
      'Requires the "automation" OAuth scope.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        flowIds: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 1,
          maxItems: 100,
          description: 'Array of v4 flow IDs to retrieve. Maximum 100 IDs per request.',
        },
      },
      required: ['flowIds'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = BatchReadWorkflowsInputSchema.parse(rawArgs);

      try {
        const body = {
          inputs: args.flowIds.map((id) => ({ flowId: id })),
        };
        const response = await client.post<{
          results: unknown[];
          status?: string;
          numErrors?: number;
          errors?: unknown[];
        }>('/automation/v4/flows/batch/read', body);

        return {
          results: response.results,
          total: response.results.length,
          status: response.status,
          numErrors: response.numErrors ?? 0,
          errors: response.errors ?? [],
        };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_email_campaigns
// ---------------------------------------------------------------------------

/**
 * Retrieves email campaigns associated with a specific flow.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for fetching flow email campaigns.
 */
function buildWorkflowEmailCampaignsTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_email_campaigns',
    description:
      '[BETA] Get the email marketing campaigns associated with a specific automation workflow ' +
      '(flow) in HubSpot Automation v4 API. ' +
      'Returns campaign data linked to Send Email actions within the flow. ' +
      'Requires the "automation" OAuth scope.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        flowId: {
          type: 'string',
          minLength: 1,
          description: 'The v4 flow ID whose associated email campaigns to retrieve.',
        },
      },
      required: ['flowId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = WorkflowEmailCampaignsInputSchema.parse(rawArgs);

      try {
        const response = await client.get<unknown>('/automation/v4/flows/email-campaigns', {
          flowId: args.flowId,
        });
        return response;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_performance
// ---------------------------------------------------------------------------

/**
 * Retrieves performance metrics for a specific flow.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for fetching flow performance data.
 */
function buildWorkflowPerformanceTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_performance',
    description:
      '[BETA] Get performance metrics for a specific automation workflow (flow) from ' +
      'HubSpot Automation v4 API. ' +
      'Returns enrollment counts, action completion rates, and other performance statistics. ' +
      'Requires the "automation" OAuth scope.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        flowId: {
          type: 'string',
          minLength: 1,
          description: 'The v4 flow ID whose performance metrics to retrieve.',
        },
      },
      required: ['flowId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = WorkflowPerformanceInputSchema.parse(rawArgs);

      try {
        const response = await client.get<unknown>(
          `/automation/v4/flows/performance/${encodeURIComponent(args.flowId)}`
        );
        return response;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_id_mappings
// ---------------------------------------------------------------------------

/**
 * Maps legacy v3 workflow IDs to the new v4 flow IDs.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for the ID mappings operation.
 */
function buildWorkflowIdMappingsTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_id_mappings',
    description:
      '[BETA] Map legacy HubSpot Workflows v3 integer IDs to the new Automation v4 flow string IDs. ' +
      'Use this when migrating from the deprecated v3 Workflows API to the v4 Flows API, ' +
      'or when you have stored references to v3 workflow IDs and need the corresponding v4 IDs. ' +
      'Returns a mapping of legacyWorkflowId → v4 flowId. ' +
      'Requires the "automation" OAuth scope.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workflowIds: {
          type: 'array',
          items: { type: 'integer', description: 'Legacy v3 workflow integer ID' },
          minItems: 1,
          description:
            'Array of legacy v3 workflow integer IDs to map to v4 flow IDs. ' +
            'These are the numeric IDs used in the deprecated Workflows v3 API.',
        },
      },
      required: ['workflowIds'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = WorkflowIdMappingsInputSchema.parse(rawArgs);

      try {
        const body = {
          inputs: args.workflowIds.map((id) => ({ legacyWorkflowId: id })),
        };
        const response = await client.post<{
          results: unknown[];
          status?: string;
          numErrors?: number;
          errors?: unknown[];
        }>('/automation/v4/workflow-id-mappings/batch/read', body);

        return {
          results: response.results,
          total: response.results.length,
          status: response.status,
          numErrors: response.numErrors ?? 0,
          errors: response.errors ?? [],
        };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Domain entry point
// ---------------------------------------------------------------------------

/**
 * Returns all Automation v4 Workflows (Flows) tools for registration with
 * the MCP server.
 *
 * BETA notice: The HubSpot Automation v4 API is in BETA. Tool behavior may
 * change as the API stabilises. Requires the `automation` OAuth scope on the
 * HubSpot Private App.
 *
 * @param client - The authenticated HubSpotClient instance.
 * @returns Array of 9 Tool objects implementing the workflows toolset.
 *
 * @example
 * const tools = getWorkflowsTools(client);
 * // tools[0].name === 'hubspot_workflows_list'
 * // ...
 * // tools[8].name === 'hubspot_workflows_id_mappings'
 */
export function getWorkflowsTools(client: HubSpotClient): Tool[] {
  return [
    buildListWorkflowsTool(client),
    buildGetWorkflowTool(client),
    buildCreateWorkflowTool(client),
    buildUpdateWorkflowTool(client),
    buildDeleteWorkflowTool(client),
    buildBatchReadWorkflowsTool(client),
    buildWorkflowEmailCampaignsTool(client),
    buildWorkflowPerformanceTool(client),
    buildWorkflowIdMappingsTool(client),
  ];
}
