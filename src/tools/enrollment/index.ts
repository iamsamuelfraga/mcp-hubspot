/**
 * HubSpot Automation v2 enrollment tools + Automation v3 legacy workflow read tools.
 *
 * Provides MCP tools for:
 * - Enrolling / unenrolling contacts in HubSpot Workflows (v2 API)
 * - Querying active enrollments for a given contact VID (v2 API)
 * - Listing and fetching workflow definitions (v3 legacy API — read-only)
 *
 * @see {@link https://developers.hubspot.com/docs/api/automation/workflows}
 */
import { type HubSpotClient } from '../../hubspot-client.js';
import { type Tool } from '../../types/common.js';
import { handleToolError } from '../../utils/error-handler.js';
import {
  EnrollContactSchema,
  UnenrollContactSchema,
  GetEnrollmentsSchema,
  WorkflowsV3ListSchema,
  WorkflowsV3GetSchema,
} from '../../schemas/enrollment.js';

// ---------------------------------------------------------------------------
// Tool: hubspot_enrollment_enroll
// ---------------------------------------------------------------------------

/**
 * Enrolls a contact into a HubSpot Workflow by email address.
 * Corresponds to POST /automation/v2/workflows/{workflowId}/enrollments/contacts/{email}.
 */
function buildEnrollTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_enrollment_enroll',
    description:
      'Enroll a contact into a HubSpot Workflow (Automation v2). ' +
      'The contact must exist in HubSpot. ' +
      "Use the workflow's numeric ID and the contact's email address.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        workflowId: {
          type: 'integer',
          minimum: 1,
          description: 'Numeric ID of the workflow.',
        },
        email: {
          type: 'string',
          format: 'email',
          description: 'Email address of the contact.',
        },
      },
      required: ['workflowId', 'email'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = EnrollContactSchema.parse(rawArgs);

      try {
        await client.post<unknown>(
          `/automation/v2/workflows/${args.workflowId}/enrollments/contacts/${encodeURIComponent(args.email)}`
        );
        return { success: true, workflowId: args.workflowId, email: args.email };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_enrollment_unenroll
// ---------------------------------------------------------------------------

/**
 * Unenrolls a contact from a HubSpot Workflow by email address.
 * Corresponds to DELETE /automation/v2/workflows/{workflowId}/enrollments/contacts/{email}.
 */
function buildUnenrollTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_enrollment_unenroll',
    description:
      'Unenroll a contact from a HubSpot Workflow (Automation v2). ' +
      'Stops the contact from progressing through remaining workflow actions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workflowId: {
          type: 'integer',
          minimum: 1,
          description: 'Numeric ID of the workflow.',
        },
        email: {
          type: 'string',
          format: 'email',
          description: 'Email address of the contact.',
        },
      },
      required: ['workflowId', 'email'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = UnenrollContactSchema.parse(rawArgs);

      try {
        await client.delete<unknown>(
          `/automation/v2/workflows/${args.workflowId}/enrollments/contacts/${encodeURIComponent(args.email)}`
        );
        return { success: true, workflowId: args.workflowId, email: args.email };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_enrollment_get_enrollments
// ---------------------------------------------------------------------------

/**
 * Retrieves all active workflow enrollments for a contact by VID.
 * Corresponds to GET /automation/v2/enrollments/contacts/{vid}.
 */
function buildGetEnrollmentsTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_enrollment_get_enrollments',
    description:
      'Get all active workflow enrollments for a contact by their HubSpot VID (contact record ID). ' +
      'Returns the list of workflows the contact is currently enrolled in.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        vid: {
          type: 'string',
          pattern: '^\\d+$',
          description: 'HubSpot contact VID (record ID). Must be a numeric string, e.g. "123456".',
        },
      },
      required: ['vid'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = GetEnrollmentsSchema.parse(rawArgs);

      try {
        return await client.get<unknown>(
          `/automation/v2/enrollments/contacts/${encodeURIComponent(args.vid)}`
        );
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_v3_list
// ---------------------------------------------------------------------------

/**
 * Lists all workflow definitions using the legacy v3 API.
 * Corresponds to GET /automation/v3/workflows.
 */
function buildWorkflowsV3ListTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_v3_list',
    description:
      '[LEGACY] List all Workflows using the HubSpot Automation v3 API. ' +
      'This is the legacy API — prefer Automation v4 flows for new integrations. ' +
      'Returns a flat list of workflow definitions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        offset: {
          type: 'integer',
          description: 'Pagination offset.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 25,
          description: 'Number of results to return.',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = WorkflowsV3ListSchema.parse(rawArgs);

      try {
        return await client.get<unknown>('/automation/v3/workflows', {
          offset: args.offset,
          limit: args.limit,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_workflows_v3_get
// ---------------------------------------------------------------------------

/**
 * Fetches a single workflow definition by ID using the legacy v3 API.
 * Corresponds to GET /automation/v3/workflows/{workflowId}.
 */
function buildWorkflowsV3GetTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_workflows_v3_get',
    description:
      '[LEGACY] Get a single Workflow by ID using the HubSpot Automation v3 API. ' +
      'This is the legacy API — prefer Automation v4 flows for new integrations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workflowId: {
          type: 'integer',
          minimum: 1,
          description: 'Numeric ID of the workflow.',
        },
      },
      required: ['workflowId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = WorkflowsV3GetSchema.parse(rawArgs);

      try {
        return await client.get<unknown>(`/automation/v3/workflows/${args.workflowId}`);
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
 * Returns all enrollment and legacy workflow tools for registration with the MCP server.
 *
 * @param client - The authenticated HubSpotClient instance.
 * @returns Array of Tool objects implementing the enrollment and v3 workflows toolset.
 */
export function getEnrollmentTools(client: HubSpotClient): Tool[] {
  return [
    buildEnrollTool(client),
    buildUnenrollTool(client),
    buildGetEnrollmentsTool(client),
    buildWorkflowsV3ListTool(client),
    buildWorkflowsV3GetTool(client),
  ];
}
