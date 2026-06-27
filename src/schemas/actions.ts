/**
 * Zod schemas for HubSpot Custom Workflow Actions (Automation v4).
 *
 * These schemas are used for input validation and type inference across the
 * `hubspot_actions_*` tool family. All schemas use `.passthrough()` on object
 * types so that extra fields returned by the HubSpot API are not stripped.
 *
 * @see {@link https://developers.hubspot.com/docs/api/automation/custom-workflow-actions}
 */
import { z } from 'zod';

/**
 * Valid function types for custom workflow action functions.
 *
 * - PRE_ACTION_EXECUTION  – runs before the action executes
 * - PRE_FETCH_OPTIONS     – runs before option values are fetched
 * - POST_FETCH_OPTIONS    – runs after option values are fetched
 */
export const FunctionTypeSchema = z.enum([
  'PRE_ACTION_EXECUTION',
  'PRE_FETCH_OPTIONS',
  'POST_FETCH_OPTIONS',
]);

/**
 * Schema for a single action function definition.
 */
export const ActionFunctionSchema = z
  .object({
    /** The function's execution type. */
    functionType: FunctionTypeSchema,
    /** Optional HubSpot-assigned function ID. */
    id: z.string().optional(),
    /** The JavaScript source code of the function. */
    functionSource: z.string().optional(),
  })
  .passthrough();

/**
 * Schema for a full custom workflow action definition.
 *
 * Used when reading action responses from the API; all fields are optional
 * because the shape varies between list vs. get responses.
 */
export const ActionDefinitionSchema = z
  .object({
    /** HubSpot-assigned action definition ID. */
    id: z.string().optional(),
    /** The developer app ID that owns this action. */
    appId: z.number().optional(),
    /** Input field definitions for the action. */
    inputFields: z.array(z.object({}).passthrough()).optional(),
    /** Output field definitions for the action. */
    outputFields: z.array(z.object({}).passthrough()).optional(),
    /** Localised display labels, keyed by locale code (e.g., "en"). */
    labels: z.record(z.object({}).passthrough()).optional(),
    /** Function definitions attached to this action. */
    functions: z.array(ActionFunctionSchema).optional(),
    /** HubSpot object type IDs this action can be used with. */
    objectTypes: z.array(z.string()).optional(),
    /** Whether the action is published and available in the UI. */
    published: z.boolean().optional(),
    /** Whether this action definition has been archived. */
    archived: z.boolean().optional(),
    /** URL HubSpot calls to execute the action. */
    actionUrl: z.string().optional(),
  })
  .passthrough();

/**
 * Schema for the requires-object configuration endpoint response.
 */
export const RequiresObjectSchema = z
  .object({
    /** Whether this action requires a CRM object to execute. */
    requiresObject: z.boolean(),
  })
  .passthrough();

/**
 * Input schema for creating a new custom workflow action.
 * Omits server-assigned fields (`id`, `appId`).
 */
export const CreateActionInputSchema = ActionDefinitionSchema.omit({ id: true, appId: true });

/**
 * Input schema for updating (replacing) an existing custom workflow action.
 * Same shape as create — all writable fields.
 */
export const UpdateActionInputSchema = CreateActionInputSchema;

/**
 * Input schema for creating or replacing a function by type.
 * `functionSource` is the JavaScript source code string.
 */
export const PutFunctionInputSchema = z
  .object({
    /** The JavaScript source code for this function (required, non-empty). */
    functionSource: z.string().min(1),
  })
  .passthrough();
