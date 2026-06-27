/**
 * HubSpot Custom Workflow Actions tools (Automation v4).
 *
 * Custom Workflow Actions let developers create reusable action types that
 * appear in the HubSpot Workflows editor. They are tied to a developer app
 * and authenticated with a developer API key (hapikey), NOT a private app
 * access token.
 *
 * AUTHENTICATION: All tools in this module use `auth: 'developer'`, which
 * appends `hapikey=<key>` to the URL instead of sending an Authorization header.
 * The HubSpotClient must be initialised with a `developerApiKey`.
 *
 * Provides 16 MCP tools:
 *  1.  hubspot_actions_list                      – List all action definitions for an app
 *  2.  hubspot_actions_create                    – Create a new action definition
 *  3.  hubspot_actions_get                       – Get a single action definition
 *  4.  hubspot_actions_update                    – Update (PATCH) an action definition
 *  5.  hubspot_actions_delete                    – Delete an action definition
 *  6.  hubspot_actions_revisions_list            – List all revisions for an action
 *  7.  hubspot_actions_revisions_get             – Get a specific revision
 *  8.  hubspot_actions_functions_list            – List all functions on an action
 *  9.  hubspot_actions_functions_get_by_type     – Get a function by type
 * 10.  hubspot_actions_functions_put             – Create/replace a function by type
 * 11.  hubspot_actions_functions_delete_by_type  – Delete a function by type
 * 12.  hubspot_actions_functions_get_by_id       – Get a function by type + ID
 * 13.  hubspot_actions_functions_update_by_id    – Replace a function by type + ID
 * 14.  hubspot_actions_functions_delete_by_id    – Delete a function by type + ID
 * 15.  hubspot_actions_requires_object_get       – Get requires-object setting
 * 16.  hubspot_actions_requires_object_set       – Set requires-object setting
 *
 * @see {@link https://developers.hubspot.com/docs/api/automation/custom-workflow-actions}
 */
import { z } from 'zod';
import { type HubSpotClient } from '../../hubspot-client.js';
import { type Tool } from '../../types/common.js';
import { handleToolError } from '../../utils/error-handler.js';
import {
  CreateActionInputSchema,
  UpdateActionInputSchema,
  PutFunctionInputSchema,
  FunctionTypeSchema,
} from '../../schemas/actions.js';

// ---------------------------------------------------------------------------
// Common appId + path helpers
// ---------------------------------------------------------------------------

/**
 * Zod schema shared by all tools that only need appId.
 * Returns appId as a string (coerced from number if provided as number).
 */
const AppIdOnlySchema = z.object({
  appId: z.union([z.string(), z.number().transform(String)]).optional(),
});

/**
 * Zod schema shared by all tools that need appId + definitionId.
 */
const AppAndDefinitionSchema = z.object({
  appId: z.union([z.string(), z.number().transform(String)]).optional(),
  definitionId: z.string().min(1),
});

/**
 * Zod schema for tools that need appId + definitionId + functionType.
 */
const AppDefinitionAndFunctionTypeSchema = z.object({
  appId: z.union([z.string(), z.number().transform(String)]).optional(),
  definitionId: z.string().min(1),
  functionType: FunctionTypeSchema,
});

/**
 * Zod schema for tools that need appId + definitionId + functionType + functionId.
 */
const AppDefinitionFunctionTypeAndIdSchema = z.object({
  appId: z.union([z.string(), z.number().transform(String)]).optional(),
  definitionId: z.string().min(1),
  functionType: FunctionTypeSchema,
  functionId: z.string().min(1),
});

/**
 * Resolves the appId from the tool arguments or the module-level default.
 *
 * @param argAppId - appId provided in the tool call arguments (may be undefined).
 * @param defaultAppId - fallback appId from HUBSPOT_APP_ID env var.
 * @returns The resolved appId as a string.
 * @throws {Error} When neither argument nor default is available.
 */
function resolveAppId(argAppId: string | undefined, defaultAppId: string | undefined): string {
  const appId = argAppId ?? defaultAppId;
  if (!appId) {
    throw new Error(
      'appId is required. Provide it as an argument or set the HUBSPOT_APP_ID environment variable.'
    );
  }
  return appId;
}

/** Base URL path for the custom actions API. */
const BASE = '/automation/v4/actions';

// ---------------------------------------------------------------------------
// JSON Schema fragments reused across multiple tools
// ---------------------------------------------------------------------------

const appIdProp = {
  type: 'string',
  description:
    'HubSpot developer app ID that owns the action. Defaults to HUBSPOT_APP_ID env var if not provided.',
};

const definitionIdProp = {
  type: 'string',
  description: 'Custom action definition ID.',
};

const functionTypeProp = {
  type: 'string',
  enum: ['PRE_ACTION_EXECUTION', 'PRE_FETCH_OPTIONS', 'POST_FETCH_OPTIONS'],
  description: 'Function execution type.',
};

const functionIdProp = {
  type: 'string',
  description: 'HubSpot-assigned function ID.',
};

const actionBodyProps = {
  inputFields: {
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Input field definitions for the action.',
  },
  outputFields: {
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Output field definitions for the action.',
  },
  labels: {
    type: 'object',
    additionalProperties: true,
    description: 'Localised display labels keyed by locale (e.g. "en").',
  },
  functions: {
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Function definitions to attach to this action.',
  },
  objectTypes: {
    type: 'array',
    items: { type: 'string' },
    description: 'HubSpot object type IDs this action can be used with.',
  },
  published: {
    type: 'boolean',
    description: 'Whether the action is published and visible in the Workflows editor.',
  },
  actionUrl: {
    type: 'string',
    description: 'URL HubSpot calls to execute the action.',
  },
};

// ---------------------------------------------------------------------------
// Tool builders
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. hubspot_actions_list
// ---------------------------------------------------------------------------

/**
 * Lists all custom workflow action definitions registered for a developer app.
 * GET /automation/v4/actions/{appId}
 */
function buildActionsListTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_list',
    description:
      'List all custom workflow action definitions registered for a HubSpot developer app. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        limit: { type: 'number', description: 'Maximum number of results to return.' },
        after: { type: 'string', description: 'Pagination cursor from a previous response.' },
        archived: { type: 'boolean', description: 'Include archived action definitions.' },
      },
      required: [],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const base = AppIdOnlySchema.parse(rawArgs);
      const extra = z
        .object({
          limit: z.number().int().optional(),
          after: z.string().optional(),
          archived: z.boolean().optional(),
        })
        .parse(rawArgs);
      const appId = resolveAppId(base.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'GET',
          path: `${BASE}/${encodeURIComponent(appId)}`,
          query: {
            ...(extra.limit !== undefined ? { limit: extra.limit } : {}),
            ...(extra.after !== undefined ? { after: extra.after } : {}),
            ...(extra.archived !== undefined ? { archived: extra.archived } : {}),
          },
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 2. hubspot_actions_create
// ---------------------------------------------------------------------------

/**
 * Creates a new custom workflow action definition for a developer app.
 * POST /automation/v4/actions/{appId}
 */
function buildActionsCreateTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_create',
    description:
      'Create a new custom workflow action definition for a HubSpot developer app. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        ...actionBodyProps,
      },
      required: [],
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const base = AppIdOnlySchema.parse(rawArgs);
      const body = CreateActionInputSchema.parse(rawArgs);
      const appId = resolveAppId(base.appId, defaultAppId);
      // Remove appId from body to avoid sending it in the request payload
      const { ...bodyWithoutAppId } = body as Record<string, unknown>;
      delete bodyWithoutAppId['appId'];
      try {
        const result = await client.request<unknown>({
          method: 'POST',
          path: `${BASE}/${encodeURIComponent(appId)}`,
          body: bodyWithoutAppId,
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 3. hubspot_actions_get
// ---------------------------------------------------------------------------

/**
 * Retrieves a single custom workflow action definition by definition ID.
 * GET /automation/v4/actions/{appId}/{definitionId}
 */
function buildActionsGetTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_get',
    description:
      'Get a single custom workflow action definition by its definition ID. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        archived: { type: 'boolean', description: 'Include archived action definitions.' },
      },
      required: ['definitionId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppAndDefinitionSchema.parse(rawArgs);
      const extra = z.object({ archived: z.boolean().optional() }).parse(rawArgs);
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'GET',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}`,
          query: extra.archived !== undefined ? { archived: extra.archived } : undefined,
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 4. hubspot_actions_update
// ---------------------------------------------------------------------------

/**
 * Updates (patches) an existing custom workflow action definition.
 * PATCH /automation/v4/actions/{appId}/{definitionId}
 */
function buildActionsUpdateTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_update',
    description:
      'Update (PATCH) an existing custom workflow action definition. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        ...actionBodyProps,
      },
      required: ['definitionId'],
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const base = AppAndDefinitionSchema.parse(rawArgs);
      const body = UpdateActionInputSchema.parse(rawArgs);
      const appId = resolveAppId(base.appId, defaultAppId);
      const { ...bodyWithoutMeta } = body as Record<string, unknown>;
      delete bodyWithoutMeta['appId'];
      delete bodyWithoutMeta['definitionId'];
      try {
        const result = await client.request<unknown>({
          method: 'PATCH',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(base.definitionId)}`,
          body: bodyWithoutMeta,
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 5. hubspot_actions_delete
// ---------------------------------------------------------------------------

/**
 * Deletes a custom workflow action definition. This action is irreversible.
 * DELETE /automation/v4/actions/{appId}/{definitionId}
 */
function buildActionsDeleteTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_delete',
    description:
      'Delete a custom workflow action definition. This is IRREVERSIBLE. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
      },
      required: ['definitionId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppAndDefinitionSchema.parse(rawArgs);
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        await client.request<unknown>({
          method: 'DELETE',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}`,
          auth: 'developer',
        });
        return { success: true, definitionId: args.definitionId };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 6. hubspot_actions_revisions_list
// ---------------------------------------------------------------------------

/**
 * Lists all revisions for a custom workflow action definition.
 * GET /automation/v4/actions/{appId}/{definitionId}/revisions
 */
function buildActionsRevisionsListTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_revisions_list',
    description:
      'List all revisions for a custom workflow action definition. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        limit: { type: 'number', description: 'Maximum number of results to return.' },
        after: { type: 'string', description: 'Pagination cursor from a previous response.' },
      },
      required: ['definitionId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const base = AppAndDefinitionSchema.parse(rawArgs);
      const extra = z
        .object({ limit: z.number().int().optional(), after: z.string().optional() })
        .parse(rawArgs);
      const appId = resolveAppId(base.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'GET',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(base.definitionId)}/revisions`,
          query: {
            ...(extra.limit !== undefined ? { limit: extra.limit } : {}),
            ...(extra.after !== undefined ? { after: extra.after } : {}),
          },
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 7. hubspot_actions_revisions_get
// ---------------------------------------------------------------------------

/**
 * Retrieves a specific revision of a custom workflow action definition.
 * GET /automation/v4/actions/{appId}/{definitionId}/revisions/{revisionId}
 */
function buildActionsRevisionsGetTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_revisions_get',
    description:
      'Get a specific revision of a custom workflow action definition. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        revisionId: { type: 'string', description: 'The revision ID to retrieve.' },
      },
      required: ['definitionId', 'revisionId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppAndDefinitionSchema.merge(z.object({ revisionId: z.string().min(1) })).parse(
        rawArgs
      );
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'GET',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}/revisions/${encodeURIComponent(args.revisionId)}`,
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 8. hubspot_actions_functions_list
// ---------------------------------------------------------------------------

/**
 * Lists all functions defined on a custom workflow action.
 * GET /automation/v4/actions/{appId}/{definitionId}/functions
 */
function buildActionsFunctionsListTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_functions_list',
    description:
      'List all functions defined on a custom workflow action definition. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
      },
      required: ['definitionId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppAndDefinitionSchema.parse(rawArgs);
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'GET',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}/functions`,
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 9. hubspot_actions_functions_get_by_type
// ---------------------------------------------------------------------------

/**
 * Retrieves a function on a custom workflow action by its function type.
 * GET /automation/v4/actions/{appId}/{definitionId}/functions/{functionType}
 */
function buildActionsFunctionsGetByTypeTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_functions_get_by_type',
    description:
      'Get a function on a custom workflow action by its type (PRE_ACTION_EXECUTION, ' +
      'PRE_FETCH_OPTIONS, POST_FETCH_OPTIONS). Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        functionType: functionTypeProp,
      },
      required: ['definitionId', 'functionType'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppDefinitionAndFunctionTypeSchema.parse(rawArgs);
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'GET',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}/functions/${encodeURIComponent(args.functionType)}`,
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 10. hubspot_actions_functions_put
// ---------------------------------------------------------------------------

/**
 * Creates or replaces a function on a custom workflow action by type.
 * PUT /automation/v4/actions/{appId}/{definitionId}/functions/{functionType}
 */
function buildActionsFunctionsPutTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_functions_put',
    description:
      'Create or replace a function on a custom workflow action by type. ' +
      'Provide the full JavaScript source code in functionSource. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        functionType: functionTypeProp,
        functionSource: {
          type: 'string',
          description: 'The full JavaScript source code of the function.',
        },
      },
      required: ['definitionId', 'functionType', 'functionSource'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppDefinitionAndFunctionTypeSchema.merge(PutFunctionInputSchema).parse(rawArgs);
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'PUT',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}/functions/${encodeURIComponent(args.functionType)}`,
          body: { functionSource: args.functionSource },
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 11. hubspot_actions_functions_delete_by_type
// ---------------------------------------------------------------------------

/**
 * Deletes a function from a custom workflow action by its type.
 * DELETE /automation/v4/actions/{appId}/{definitionId}/functions/{functionType}
 */
function buildActionsFunctionsDeleteByTypeTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_functions_delete_by_type',
    description:
      'Delete a function from a custom workflow action by its type. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        functionType: functionTypeProp,
      },
      required: ['definitionId', 'functionType'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppDefinitionAndFunctionTypeSchema.parse(rawArgs);
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        await client.request<unknown>({
          method: 'DELETE',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}/functions/${encodeURIComponent(args.functionType)}`,
          auth: 'developer',
        });
        return { success: true, definitionId: args.definitionId, functionType: args.functionType };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 12. hubspot_actions_functions_get_by_id
// ---------------------------------------------------------------------------

/**
 * Retrieves a function on a custom workflow action by its type and ID.
 * GET /automation/v4/actions/{appId}/{definitionId}/functions/{functionType}/{functionId}
 */
function buildActionsFunctionsGetByIdTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_functions_get_by_id',
    description:
      'Get a specific function on a custom workflow action by its type and ID. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        functionType: functionTypeProp,
        functionId: functionIdProp,
      },
      required: ['definitionId', 'functionType', 'functionId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppDefinitionFunctionTypeAndIdSchema.parse(rawArgs);
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'GET',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}/functions/${encodeURIComponent(args.functionType)}/${encodeURIComponent(args.functionId)}`,
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 13. hubspot_actions_functions_update_by_id
// ---------------------------------------------------------------------------

/**
 * Replaces a function on a custom workflow action by its type and ID.
 * PUT /automation/v4/actions/{appId}/{definitionId}/functions/{functionType}/{functionId}
 */
function buildActionsFunctionsUpdateByIdTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_functions_update_by_id',
    description:
      'Replace a function on a custom workflow action by its type and ID. ' +
      'Provide the full JavaScript source code in functionSource. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        functionType: functionTypeProp,
        functionId: functionIdProp,
        functionSource: {
          type: 'string',
          description: 'The full JavaScript source code of the function.',
        },
      },
      required: ['definitionId', 'functionType', 'functionId', 'functionSource'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args =
        AppDefinitionFunctionTypeAndIdSchema.merge(PutFunctionInputSchema).parse(rawArgs);
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'PUT',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}/functions/${encodeURIComponent(args.functionType)}/${encodeURIComponent(args.functionId)}`,
          body: { functionSource: args.functionSource },
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 14. hubspot_actions_functions_delete_by_id
// ---------------------------------------------------------------------------

/**
 * Deletes a function from a custom workflow action by its type and ID.
 * DELETE /automation/v4/actions/{appId}/{definitionId}/functions/{functionType}/{functionId}
 */
function buildActionsFunctionsDeleteByIdTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_functions_delete_by_id',
    description:
      'Delete a function from a custom workflow action by its type and ID. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        functionType: functionTypeProp,
        functionId: functionIdProp,
      },
      required: ['definitionId', 'functionType', 'functionId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppDefinitionFunctionTypeAndIdSchema.parse(rawArgs);
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        await client.request<unknown>({
          method: 'DELETE',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}/functions/${encodeURIComponent(args.functionType)}/${encodeURIComponent(args.functionId)}`,
          auth: 'developer',
        });
        return {
          success: true,
          definitionId: args.definitionId,
          functionType: args.functionType,
          functionId: args.functionId,
        };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 15. hubspot_actions_requires_object_get
// ---------------------------------------------------------------------------

/**
 * Gets the requires-object configuration for a custom workflow action.
 * GET /automation/v4/actions/{appId}/{definitionId}/requires-object
 */
function buildActionsRequiresObjectGetTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_requires_object_get',
    description:
      'Get whether a custom workflow action requires a CRM object to execute. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
      },
      required: ['definitionId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppAndDefinitionSchema.parse(rawArgs);
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'GET',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}/requires-object`,
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 16. hubspot_actions_requires_object_set
// ---------------------------------------------------------------------------

/**
 * Sets the requires-object configuration for a custom workflow action.
 * POST /automation/v4/actions/{appId}/{definitionId}/requires-object
 */
function buildActionsRequiresObjectSetTool(client: HubSpotClient, defaultAppId?: string): Tool {
  return {
    name: 'hubspot_actions_requires_object_set',
    description:
      'Set whether a custom workflow action requires a CRM object to execute. ' +
      'Pass requiresObject: true to enforce object context, false to allow without. ' +
      'Requires a developer API key (hapikey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appId: appIdProp,
        definitionId: definitionIdProp,
        requiresObject: {
          type: 'boolean',
          description: 'Whether this action requires a CRM object context to execute.',
        },
      },
      required: ['definitionId', 'requiresObject'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = AppAndDefinitionSchema.merge(z.object({ requiresObject: z.boolean() })).parse(
        rawArgs
      );
      const appId = resolveAppId(args.appId, defaultAppId);
      try {
        const result = await client.request<unknown>({
          method: 'POST',
          path: `${BASE}/${encodeURIComponent(appId)}/${encodeURIComponent(args.definitionId)}/requires-object`,
          body: { requiresObject: args.requiresObject },
          auth: 'developer',
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Builds all 16 custom workflow action tools, binding them to the shared
 * HubSpotClient and optional default app ID.
 *
 * @param client - An initialised HubSpotClient with `developerApiKey` configured.
 * @param defaultAppId - Optional fallback app ID (from HUBSPOT_APP_ID env var).
 *   Used when individual tool calls do not include an `appId` argument.
 * @returns Array of 16 Tool objects ready for MCP server registration.
 *
 * @example
 * const tools = getActionsTools(client, process.env.HUBSPOT_APP_ID);
 */
export function getActionsTools(client: HubSpotClient, defaultAppId?: string): Tool[] {
  return [
    buildActionsListTool(client, defaultAppId),
    buildActionsCreateTool(client, defaultAppId),
    buildActionsGetTool(client, defaultAppId),
    buildActionsUpdateTool(client, defaultAppId),
    buildActionsDeleteTool(client, defaultAppId),
    buildActionsRevisionsListTool(client, defaultAppId),
    buildActionsRevisionsGetTool(client, defaultAppId),
    buildActionsFunctionsListTool(client, defaultAppId),
    buildActionsFunctionsGetByTypeTool(client, defaultAppId),
    buildActionsFunctionsPutTool(client, defaultAppId),
    buildActionsFunctionsDeleteByTypeTool(client, defaultAppId),
    buildActionsFunctionsGetByIdTool(client, defaultAppId),
    buildActionsFunctionsUpdateByIdTool(client, defaultAppId),
    buildActionsFunctionsDeleteByIdTool(client, defaultAppId),
    buildActionsRequiresObjectGetTool(client, defaultAppId),
    buildActionsRequiresObjectSetTool(client, defaultAppId),
  ];
}
