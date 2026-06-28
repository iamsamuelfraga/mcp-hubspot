/**
 * HubSpot Pipelines tools: resolve pipeline-stage IDs to readable names.
 *
 * Records in HubSpot reference their stage through an internal id, not a
 * label. A deal's `dealstage` property (and a ticket's `hs_pipeline_stage`
 * property) holds an opaque stage id (e.g. `appointmentscheduled` or a numeric
 * value like `1080411889`). On its own that value is meaningless to an LLM —
 * this toolset translates it into a human-readable pipeline + stage: label,
 * display order and metadata (probability, isClosed…).
 *
 * Tools:
 * 1. `hubspot_pipelines_list` — GET /crm/v3/pipelines/{objectType}. List every
 *    pipeline for an object type (deals/tickets), each with its stages.
 * 2. `hubspot_pipelines_get` — GET /crm/v3/pipelines/{objectType}/{pipelineId}.
 *    Fetch a single pipeline by id, with its stages.
 * 3. `hubspot_pipelines_get_stages` — GET
 *    /crm/v3/pipelines/{objectType}/{pipelineId}/stages. List just the stages of
 *    a pipeline — the key tool for translating a `dealstage` /
 *    `hs_pipeline_stage` value into a readable stage label.
 *
 * Required scope: `crm.objects.deals.read` (deals) /
 * `crm.objects.contacts.read` for tickets use `crm.objects.tickets.read`.
 *
 * @see {@link https://developers.hubspot.com/docs/reference/api/crm/pipelines}
 * @module tools/pipelines
 */

import { z } from 'zod';
import { type Tool } from '../../types/common.js';
import { type HubSpotClient } from '../../hubspot-client.js';
import { handleToolError } from '../../utils/error-handler.js';

// ---------------------------------------------------------------------------
// Pipeline response types
// ---------------------------------------------------------------------------

/**
 * A single stage within a pipeline, as returned by the Pipelines API.
 *
 * The `id` field is the value referenced by `dealstage` (deals) or
 * `hs_pipeline_stage` (tickets) on CRM records. `label` is the human-readable
 * name; `metadata` carries stage attributes such as `probability` and
 * `isClosed`.
 */
interface PipelineStage {
  id: string;
  label: string;
  displayOrder: number;
  metadata?: Record<string, string>;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
  writePermissions?: string;
}

/**
 * A pipeline from the HubSpot Pipelines API.
 *
 * The `id` field is the value referenced by `pipeline` on CRM records. Its
 * `stages` array holds the ordered stages a record moves through.
 */
interface Pipeline {
  id: string;
  label: string;
  displayOrder: number;
  stages: PipelineStage[];
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Collection response from GET /crm/v3/pipelines/{objectType}. */
interface PipelinesListResponse {
  results: Pipeline[];
}

/** Collection response from GET /crm/v3/pipelines/{objectType}/{pipelineId}/stages. */
interface PipelineStagesResponse {
  results: PipelineStage[];
}

// ---------------------------------------------------------------------------
// Tool 1: hubspot_pipelines_list
// ---------------------------------------------------------------------------

/** Input schema for listing pipelines of an object type. */
const PipelinesListSchema = z.object({
  objectType: z
    .string()
    .min(1)
    .describe(
      'The CRM object type whose pipelines to list. Use "deals" for deal pipelines (dealstage) ' +
        'or "tickets" for ticket pipelines (hs_pipeline_stage). Example: "deals".'
    ),
});

/**
 * Creates the `hubspot_pipelines_list` tool.
 *
 * Endpoint: GET /crm/v3/pipelines/{objectType}
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for listing HubSpot pipelines.
 */
function buildPipelinesListTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_pipelines_list',
    description:
      'List every pipeline for a CRM object type (use objectType="deals" or "tickets"). ' +
      'Each result includes the pipeline id, label and its ordered `stages` array — so you can ' +
      'translate the numeric/opaque pipeline and stage ids stored on records (a deal’s ' +
      '`pipeline` + `dealstage`, a ticket’s `hs_pipeline_stage`) into readable names. ' +
      'Required scope: crm.objects.deals.read for deals (crm.objects.tickets.read for tickets).',
    inputSchema: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          minLength: 1,
          description:
            'CRM object type whose pipelines to list, e.g. "deals" or "tickets". Required.',
        },
      },
      required: ['objectType'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = PipelinesListSchema.parse(rawArgs);

      try {
        const result = await client.get<PipelinesListResponse>(
          `/crm/v3/pipelines/${encodeURIComponent(args.objectType)}`
        );
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool 2: hubspot_pipelines_get
// ---------------------------------------------------------------------------

/** Input schema for fetching a single pipeline. */
const PipelinesGetSchema = z.object({
  objectType: z
    .string()
    .min(1)
    .describe('The CRM object type the pipeline belongs to, e.g. "deals" or "tickets". Required.'),
  pipelineId: z
    .string()
    .min(1)
    .describe(
      'The pipeline id to resolve — this is the value found in the `pipeline` property of a ' +
        'deal/ticket. Example: "default".'
    ),
});

/**
 * Creates the `hubspot_pipelines_get` tool.
 *
 * Endpoint: GET /crm/v3/pipelines/{objectType}/{pipelineId}
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for fetching a single HubSpot pipeline.
 */
function buildPipelinesGetTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_pipelines_get',
    description:
      'Resolve a single pipeline id to its full pipeline (label + ordered `stages`). ' +
      'Pass objectType ("deals" or "tickets") and the `pipeline` value from a record as ' +
      '`pipelineId` to find out which pipeline that deal/ticket lives in and the stages it can ' +
      'move through. ' +
      'Required scope: crm.objects.deals.read for deals (crm.objects.tickets.read for tickets).',
    inputSchema: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          minLength: 1,
          description:
            'CRM object type the pipeline belongs to, e.g. "deals" or "tickets". Required.',
        },
        pipelineId: {
          type: 'string',
          minLength: 1,
          description:
            'Pipeline id to resolve (the `pipeline` value on a record). Example: "default".',
        },
      },
      required: ['objectType', 'pipelineId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = PipelinesGetSchema.parse(rawArgs);

      try {
        const result = await client.get<Pipeline>(
          `/crm/v3/pipelines/${encodeURIComponent(args.objectType)}/${encodeURIComponent(
            args.pipelineId
          )}`
        );
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool 3: hubspot_pipelines_get_stages
// ---------------------------------------------------------------------------

/** Input schema for fetching the stages of a pipeline. */
const PipelinesGetStagesSchema = z.object({
  objectType: z
    .string()
    .min(1)
    .describe('The CRM object type the pipeline belongs to, e.g. "deals" or "tickets". Required.'),
  pipelineId: z
    .string()
    .min(1)
    .describe(
      'The pipeline id whose stages to list — the `pipeline` value on a deal/ticket. Example: "default".'
    ),
});

/**
 * Creates the `hubspot_pipelines_get_stages` tool.
 *
 * Endpoint: GET /crm/v3/pipelines/{objectType}/{pipelineId}/stages
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for listing the stages of a HubSpot pipeline.
 */
function buildPipelinesGetStagesTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_pipelines_get_stages',
    description:
      'List the stages of a pipeline so you can translate a record’s stage id into a readable ' +
      'label. Pass objectType ("deals" or "tickets") and the `pipeline` value as `pipelineId`; each ' +
      'stage returns its id, label, displayOrder and metadata (e.g. probability, isClosed). ' +
      'The stage `id` is exactly the value stored in a deal’s `dealstage` property (or a ' +
      'ticket’s `hs_pipeline_stage`) — match it to get the human-readable stage name. ' +
      'Required scope: crm.objects.deals.read for deals (crm.objects.tickets.read for tickets).',
    inputSchema: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          minLength: 1,
          description:
            'CRM object type the pipeline belongs to, e.g. "deals" or "tickets". Required.',
        },
        pipelineId: {
          type: 'string',
          minLength: 1,
          description:
            'Pipeline id whose stages to list (the `pipeline` value on a record). Example: "default".',
        },
      },
      required: ['objectType', 'pipelineId'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = PipelinesGetStagesSchema.parse(rawArgs);

      try {
        const result = await client.get<PipelineStagesResponse>(
          `/crm/v3/pipelines/${encodeURIComponent(args.objectType)}/${encodeURIComponent(
            args.pipelineId
          )}/stages`
        );
        return result;
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
 * Returns all Pipelines tools (translate pipeline/stage ids to readable names).
 *
 * Tools included:
 * - `hubspot_pipelines_list`: List every pipeline for an object type.
 * - `hubspot_pipelines_get`: Fetch a single pipeline by id.
 * - `hubspot_pipelines_get_stages`: List a pipeline's stages (dealstage →
 *   label).
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Array of 3 Tool objects ready for MCP registration.
 *
 * @example
 * import { getPipelinesTools } from './tools/pipelines/index.js';
 * const tools = getPipelinesTools(client);
 */
export function getPipelinesTools(client: HubSpotClient): Tool[] {
  return [
    buildPipelinesListTool(client),
    buildPipelinesGetTool(client),
    buildPipelinesGetStagesTool(client),
  ];
}
