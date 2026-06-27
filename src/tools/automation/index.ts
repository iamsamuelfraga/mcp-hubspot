/**
 * HubSpot Automation v4 — callback completion tools.
 *
 * Provides MCP tools for completing asynchronous custom-action callbacks
 * in HubSpot Workflows using the Automation v4 runtime API.
 *
 * Custom workflow actions can trigger external systems and park the enrollment
 * until the external system calls back with a completion status. These tools
 * cover both single and batch callback completion.
 *
 * @see {@link https://developers.hubspot.com/docs/api/automation/custom-workflow-actions}
 */
import { type HubSpotClient } from '../../hubspot-client.js';
import { type Tool } from '../../types/common.js';
import { handleToolError } from '../../utils/error-handler.js';
import { CallbackCompleteSchema, CallbackCompleteBatchSchema } from '../../schemas/enrollment.js';

// ---------------------------------------------------------------------------
// Tool: hubspot_automation_callback_complete
// ---------------------------------------------------------------------------

/**
 * Completes a single async custom-action callback in a HubSpot Workflow.
 * Corresponds to POST /automation/v4/actions/callbacks/{callbackId}/complete.
 */
function buildCallbackCompleteTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_automation_callback_complete',
    description:
      'Complete a single async custom-action callback in a HubSpot Workflow (v4 automation runtime). ' +
      'Called after your external action finishes. ' +
      'Set hs_execution_state to SUCCESS to continue, FAIL_CONTINUE to continue despite failure, ' +
      'or BLOCK to stop enrollment at this step.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        callbackId: {
          type: 'string',
          minLength: 1,
          description: 'The callback ID from the custom workflow action.',
        },
        outputFields: {
          type: 'object',
          properties: {
            hs_execution_state: {
              type: 'string',
              enum: ['SUCCESS', 'FAIL_CONTINUE', 'BLOCK'],
              description: 'Execution result to report back to the workflow.',
            },
          },
          required: ['hs_execution_state'],
          additionalProperties: false,
        },
      },
      required: ['callbackId', 'outputFields'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = CallbackCompleteSchema.parse(rawArgs);

      try {
        await client.post<unknown>(`/automation/v4/actions/callbacks/${args.callbackId}/complete`, {
          outputFields: { hs_execution_state: args.outputFields.hs_execution_state },
        });
        return { success: true, callbackId: args.callbackId };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_automation_callback_complete_batch
// ---------------------------------------------------------------------------

/**
 * Completes multiple async custom-action callbacks in a single bulk request.
 * Corresponds to POST /automation/v4/actions/callbacks/complete.
 */
function buildCallbackCompleteBatchTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_automation_callback_complete_batch',
    description:
      'Complete multiple async custom-action callbacks in bulk (HubSpot Automation v4). ' +
      'Useful when your external system processed several workflow enrollments concurrently. ' +
      'Each item in callbackInputs must include its own callbackId and hs_execution_state.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        callbackInputs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              callbackId: { type: 'string', minLength: 1 },
              outputFields: {
                type: 'object',
                properties: {
                  hs_execution_state: {
                    type: 'string',
                    enum: ['SUCCESS', 'FAIL_CONTINUE', 'BLOCK'],
                  },
                },
                required: ['hs_execution_state'],
                additionalProperties: false,
              },
            },
            required: ['callbackId', 'outputFields'],
            additionalProperties: false,
          },
          description: 'Array of callback completion objects.',
        },
      },
      required: ['callbackInputs'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = CallbackCompleteBatchSchema.parse(rawArgs);

      try {
        await client.post<unknown>('/automation/v4/actions/callbacks/complete', {
          inputs: args.callbackInputs,
        });
        return { success: true, count: args.callbackInputs.length };
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
 * Returns all Automation callback tools for registration with the MCP server.
 *
 * @param client - The authenticated HubSpotClient instance.
 * @returns Array of Tool objects implementing the automation callback toolset.
 */
export function getAutomationTools(client: HubSpotClient): Tool[] {
  return [buildCallbackCompleteTool(client), buildCallbackCompleteBatchTool(client)];
}
