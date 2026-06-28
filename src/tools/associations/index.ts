/**
 * HubSpot Associations v4 tools.
 *
 * Provides MCP tools for managing associations between HubSpot CRM objects
 * using the v4 Associations API.
 *
 * Default HUBSPOT_DEFINED typeIds for engagement→object associations:
 * - Call:    Contact 194 | Company 182 | Deal 206 | Ticket 220
 * - Email:   Contact 198 | Company 186 | Deal 210 | Ticket 224
 * - Meeting: Contact 200 | Company 188 | Deal 212 | Ticket 226
 * - Note:    Contact 202 | Company 190 | Deal 214 | Ticket 228
 * - Task:    Contact 204 | Company 192 | Deal 216 | Ticket 230
 *
 * IMPORTANT: Always verify typeIds via `hubspot_associations_labels_list` at runtime —
 * they can vary per HubSpot portal.
 *
 * @see {@link https://developers.hubspot.com/docs/api/crm/associations}
 */
import { type HubSpotClient } from '../../hubspot-client.js';
import { type Tool } from '../../types/common.js';
import { handleToolError } from '../../utils/error-handler.js';
import {
  CreateAssociationSchema,
  ArchiveAssociationSchema,
  ListAssociationsSchema,
  BatchCreateAssociationsSchema,
  ListAssociationLabelsSchema,
} from '../../schemas/associations.js';

// ---------------------------------------------------------------------------
// JSON Schema definitions (manually derived from Zod schemas per contract)
// ---------------------------------------------------------------------------

/** Reusable JSON Schema for an association type specifier. */
const associationTypeJsonSchema = {
  type: 'object' as const,
  properties: {
    associationCategory: {
      type: 'string',
      enum: ['HUBSPOT_DEFINED', 'USER_DEFINED', 'INTEGRATOR_DEFINED'],
      description:
        'Who defined the association type. ' +
        'HUBSPOT_DEFINED for built-in types, USER_DEFINED for portal custom labels, ' +
        'INTEGRATOR_DEFINED for app-created types.',
    },
    associationTypeId: {
      type: 'integer',
      minimum: 1,
      description:
        'Numeric association type ID. Use hubspot_associations_labels_list to discover valid IDs.',
    },
  },
  required: ['associationCategory', 'associationTypeId'],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Tool: hubspot_associations_create
// ---------------------------------------------------------------------------

/**
 * Creates or updates an association between two HubSpot objects.
 * Corresponds to PUT /crm/v4/objects/{fromType}/{fromId}/associations/{toType}/{toId}.
 */
function buildCreateAssociationTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_associations_create',
    description:
      'Create or update an association between two HubSpot CRM objects using the v4 API. ' +
      'Use this to link a call/meeting/note/task/email to a contact, company, deal, or ticket, ' +
      'or to link any two objects with a labeled relationship.\n\n' +
      'Default HUBSPOT_DEFINED typeIds (verify via hubspot_associations_labels_list):\n' +
      '  Call:    Contact 194 | Company 182 | Deal 206 | Ticket 220\n' +
      '  Email:   Contact 198 | Company 186 | Deal 210 | Ticket 224\n' +
      '  Meeting: Contact 200 | Company 188 | Deal 212 | Ticket 226\n' +
      '  Note:    Contact 202 | Company 190 | Deal 214 | Ticket 228\n' +
      '  Task:    Contact 204 | Company 192 | Deal 216 | Ticket 230',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromType: {
          type: 'string',
          minLength: 1,
          description:
            'Object type of the source record (e.g., "contacts", "deals", "calls", "meetings")',
        },
        fromId: {
          type: 'string',
          minLength: 1,
          description: 'HubSpot ID of the source record',
        },
        toType: {
          type: 'string',
          minLength: 1,
          description:
            'Object type of the target record (e.g., "contacts", "companies", "deals", "tickets")',
        },
        toId: {
          type: 'string',
          minLength: 1,
          description: 'HubSpot ID of the target record',
        },
        associationTypes: {
          type: 'array',
          items: associationTypeJsonSchema,
          minItems: 1,
          description:
            'One or more association type specifiers. Use hubspot_associations_labels_list ' +
            'to discover available types for your portal.',
        },
      },
      required: ['fromType', 'fromId', 'toType', 'toId', 'associationTypes'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = CreateAssociationSchema.parse(rawArgs);

      try {
        const path = `/crm/v4/objects/${encodeURIComponent(args.fromType)}/${encodeURIComponent(args.fromId)}/associations/${encodeURIComponent(args.toType)}/${encodeURIComponent(args.toId)}`;
        const result = await client.put<unknown>(path, args.associationTypes);

        return {
          success: true,
          fromType: args.fromType,
          fromId: args.fromId,
          toType: args.toType,
          toId: args.toId,
          associationTypes: args.associationTypes,
          result,
        };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_associations_archive
// ---------------------------------------------------------------------------

/**
 * Removes all associations between two specific HubSpot objects.
 * Corresponds to DELETE /crm/v4/objects/{fromType}/{fromId}/associations/{toType}/{toId}.
 */
function buildArchiveAssociationTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_associations_archive',
    description:
      'Remove all associations between two HubSpot CRM objects (v4 API). ' +
      'This deletes the relationship link — it does NOT delete the objects themselves. ' +
      'To remove only a specific labeled association, use the batch archive endpoint instead.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromType: {
          type: 'string',
          minLength: 1,
          description: 'Object type of the source record (e.g., "contacts", "deals", "calls")',
        },
        fromId: {
          type: 'string',
          minLength: 1,
          description: 'HubSpot ID of the source record',
        },
        toType: {
          type: 'string',
          minLength: 1,
          description:
            'Object type of the target record (e.g., "contacts", "companies", "tickets")',
        },
        toId: {
          type: 'string',
          minLength: 1,
          description: 'HubSpot ID of the target record',
        },
      },
      required: ['fromType', 'fromId', 'toType', 'toId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = ArchiveAssociationSchema.parse(rawArgs);

      try {
        const path = `/crm/v4/objects/${encodeURIComponent(args.fromType)}/${encodeURIComponent(args.fromId)}/associations/${encodeURIComponent(args.toType)}/${encodeURIComponent(args.toId)}`;
        await client.delete<unknown>(path);

        return {
          success: true,
          archived: true,
          fromType: args.fromType,
          fromId: args.fromId,
          toType: args.toType,
          toId: args.toId,
        };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_associations_list
// ---------------------------------------------------------------------------

/**
 * Lists all associations for a specific object toward another object type.
 * Corresponds to GET /crm/v4/objects/{fromType}/{fromId}/associations/{toType}.
 */
function buildListAssociationsTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_associations_list',
    description:
      'List all associated records of a given type for a specific HubSpot object (v4 API). ' +
      'For example, retrieve all contacts associated with a deal, or all deals linked to a call. ' +
      'Returns { results, total, pagination: { nextCursor } | null }. ' +
      'Use `pagination.nextCursor` as the "after" parameter to fetch subsequent pages.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromType: {
          type: 'string',
          minLength: 1,
          description: 'Object type of the source record (e.g., "contacts", "deals", "calls")',
        },
        fromId: {
          type: 'string',
          minLength: 1,
          description: 'HubSpot ID of the source record',
        },
        toType: {
          type: 'string',
          minLength: 1,
          description:
            'Object type of associated records to retrieve (e.g., "companies", "tickets", "deals")',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          default: 100,
          description: 'Maximum number of associations to return per page (1-500, default 100)',
        },
        after: {
          type: 'string',
          description:
            'Pagination cursor from the previous response. Use the value of pagination.nextCursor.',
        },
      },
      required: ['fromType', 'fromId', 'toType'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = ListAssociationsSchema.parse(rawArgs);

      try {
        const path = `/crm/v4/objects/${encodeURIComponent(args.fromType)}/${encodeURIComponent(args.fromId)}/associations/${encodeURIComponent(args.toType)}`;
        const response = await client.get<{
          results: {
            toObjectId: string;
            associationTypes: {
              category: string;
              typeId: number;
              label: string | null;
            }[];
          }[];
          paging?: { next?: { after: string } };
        }>(path, {
          limit: args.limit,
          ...(args.after ? { after: args.after } : {}),
        });

        return {
          fromType: args.fromType,
          fromId: args.fromId,
          toType: args.toType,
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
// Tool: hubspot_associations_batch_create
// ---------------------------------------------------------------------------

/**
 * Batch-creates associations between multiple object pairs in a single API call.
 * Corresponds to POST /crm/v4/associations/{fromType}/{toType}/batch/create.
 * Maximum 100 inputs per request.
 */
function buildBatchCreateAssociationsTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_associations_batch_create',
    description:
      'Batch-create associations between multiple HubSpot object pairs in a single request (v4 API). ' +
      'More efficient than individual creates when linking many records at once. ' +
      'Maximum 100 pairs per request. ' +
      'Use this to associate a set of calls with their respective contacts after bulk import, ' +
      'or to link multiple deals to a single company.\n\n' +
      'Default HUBSPOT_DEFINED typeIds (verify via hubspot_associations_labels_list):\n' +
      '  Call:    Contact 194 | Company 182 | Deal 206 | Ticket 220\n' +
      '  Email:   Contact 198 | Company 186 | Deal 210 | Ticket 224\n' +
      '  Meeting: Contact 200 | Company 188 | Deal 212 | Ticket 226\n' +
      '  Note:    Contact 202 | Company 190 | Deal 214 | Ticket 228\n' +
      '  Task:    Contact 204 | Company 192 | Deal 216 | Ticket 230',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromType: {
          type: 'string',
          minLength: 1,
          description: 'Object type of the source records (e.g., "calls", "deals", "contacts")',
        },
        toType: {
          type: 'string',
          minLength: 1,
          description: 'Object type of the target records (e.g., "contacts", "companies", "deals")',
        },
        inputs: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              from: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    minLength: 1,
                    description: 'HubSpot ID of the source object',
                  },
                },
                required: ['id'],
                additionalProperties: false,
              },
              to: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    minLength: 1,
                    description: 'HubSpot ID of the target object',
                  },
                },
                required: ['id'],
                additionalProperties: false,
              },
              types: {
                type: 'array',
                items: associationTypeJsonSchema,
                minItems: 1,
                description: 'Association type specifiers for this pair',
              },
            },
            required: ['from', 'to', 'types'],
            additionalProperties: false,
          },
          description: 'Array of association pairs to create (maximum 100)',
        },
      },
      required: ['fromType', 'toType', 'inputs'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = BatchCreateAssociationsSchema.parse(rawArgs);

      try {
        const path = `/crm/v4/associations/${encodeURIComponent(args.fromType)}/${encodeURIComponent(args.toType)}/batch/create`;
        const response = await client.post<{
          status: string;
          results: {
            fromObjectTypeId: string;
            fromObjectId: number;
            toObjectTypeId: string;
            toObjectId: number;
            labels: string[];
          }[];
          numErrors?: number;
          errors?: { status: string; category: string; message: string }[];
        }>(path, { inputs: args.inputs });

        return {
          fromType: args.fromType,
          toType: args.toType,
          status: response.status,
          results: response.results,
          created: response.results.length,
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
// Tool: hubspot_associations_labels_list
// ---------------------------------------------------------------------------

/**
 * Lists all available association label types between two object types.
 * Corresponds to GET /crm/v4/associations/{fromType}/{toType}/labels.
 *
 * Use this to discover valid associationTypeId values before creating associations.
 */
function buildListAssociationLabelsTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_associations_labels_list',
    description:
      'List all available association label types between two HubSpot object types (v4 API). ' +
      'Use this BEFORE creating associations to discover valid associationTypeId values for your portal. ' +
      'Association typeIds can differ between HubSpot portals — always verify in runtime rather than hardcoding.\n\n' +
      'Example: call this with fromType="calls", toType="contacts" to see all labeled association ' +
      'types available for linking calls to contacts, including their typeIds and categories.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromType: {
          type: 'string',
          minLength: 1,
          description: 'Object type of the source (e.g., "calls", "deals", "contacts", "meetings")',
        },
        toType: {
          type: 'string',
          minLength: 1,
          description:
            'Object type of the target (e.g., "contacts", "companies", "deals", "tickets")',
        },
      },
      required: ['fromType', 'toType'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = ListAssociationLabelsSchema.parse(rawArgs);

      try {
        const path = `/crm/v4/associations/${encodeURIComponent(args.fromType)}/${encodeURIComponent(args.toType)}/labels`;
        const response = await client.get<{
          results: {
            category: string;
            typeId: number;
            label: string | null;
          }[];
        }>(path);

        return {
          fromType: args.fromType,
          toType: args.toType,
          results: response.results,
          total: response.results.length,
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
 * Returns all Associations v4 tools for registration with the MCP server.
 *
 * @param client - The authenticated HubSpotClient instance.
 * @returns Array of Tool objects implementing the associations toolset.
 */
export function getAssociationsTools(client: HubSpotClient): Tool[] {
  return [
    buildCreateAssociationTool(client),
    buildArchiveAssociationTool(client),
    buildListAssociationsTool(client),
    buildBatchCreateAssociationsTool(client),
    buildListAssociationLabelsTool(client),
  ];
}
