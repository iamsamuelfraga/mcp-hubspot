/**
 * Zod schemas for HubSpot Automation v4 Flows (Workflows) API.
 *
 * NOTE: This API is in BETA. All top-level schemas use `.passthrough()` to
 * tolerate unknown fields that may appear as the API evolves.
 *
 * Key design decisions:
 * - `PublicOrFilterBranchSchema` uses `z.lazy()` for recursive self-referencing.
 * - `FlowActionSchema` and `FlowSchema` use `.passthrough()` throughout because
 *   the BETA API surface is not fully stable.
 *
 * @see {@link https://developers.hubspot.com/docs/api/automation/workflows}
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// PublicFilter — leaf filter within an enrollment criteria branch
// ---------------------------------------------------------------------------

/**
 * A single filter condition within an enrollment criteria branch.
 *
 * Uses `.passthrough()` because the `operation` sub-object and many other
 * fields are BETA-unstable and vary by filter type.
 */
export const PublicFilterSchema = z
  .object({
    /** Discriminator for the filter type (e.g., 'PROPERTY', 'LIST_MEMBERSHIP'). */
    filterType: z.string(),
    /**
     * The filter operation descriptor (comparator, values, etc.).
     * Schema is undocumented BETA — captured as passthrough object.
     */
    operation: z.object({}).passthrough(),
    /** Property name this filter operates on (present for property-based filters). */
    property: z.string().optional(),
  })
  .passthrough();

/** TypeScript type inferred from PublicFilterSchema. */
export type PublicFilter = z.infer<typeof PublicFilterSchema>;

// ---------------------------------------------------------------------------
// PublicOrFilterBranch — RECURSIVE tree node for enrollment criteria
// ---------------------------------------------------------------------------

/**
 * TypeScript type for the recursive filter branch structure.
 * Declared explicitly because z.infer cannot resolve recursive schemas without
 * a forward declaration.
 */
export interface PublicOrFilterBranch {
  filterBranchType: 'OR' | 'AND';
  filterBranchOperator?: string;
  /** Child branches — same type recursively (OR/AND tree). */
  filterBranches: PublicOrFilterBranch[];
  /** Leaf-level filter conditions applied at this branch. */
  filters: PublicFilter[];
  /** Additional unknown BETA fields. */
  [key: string]: unknown;
}

/**
 * Recursive Zod schema for HubSpot enrollment criteria filter branches.
 *
 * Uses `z.lazy()` to allow the `filterBranches` array to reference the schema
 * being defined, enabling arbitrarily deep nesting of OR/AND branches.
 *
 * The input type is `unknown` because `.default([])` on the filterBranches and
 * filters fields makes those inputs optionally undefined, which is incompatible
 * with the declared output-only TypeScript type. Using `unknown` as the input
 * parameter is the standard zod pattern for recursive schemas where input and
 * output types differ.
 *
 * @example
 * // 2-level nesting:
 * const branch: PublicOrFilterBranch = {
 *   filterBranchType: 'OR',
 *   filterBranches: [
 *     {
 *       filterBranchType: 'AND',
 *       filterBranches: [],
 *       filters: [{ filterType: 'PROPERTY', operation: { operator: 'EQ', value: 'foo' } }],
 *     },
 *   ],
 *   filters: [],
 * };
 */
export const PublicOrFilterBranchSchema: z.ZodType<PublicOrFilterBranch, z.ZodTypeDef, unknown> =
  z.lazy(() =>
    z
      .object({
        /** Whether this node is an OR or AND combinator for its children. */
        filterBranchType: z.enum(['OR', 'AND']),
        /** Optional operator modifier applied at the branch level. */
        filterBranchOperator: z.string().optional(),
        /** Child filter branches (recursive). Defaults to empty array. */
        filterBranches: z.array(PublicOrFilterBranchSchema).default([]),
        /** Leaf filter conditions at this level. Defaults to empty array. */
        filters: z.array(PublicFilterSchema).default([]),
      })
      .passthrough()
  );

// ---------------------------------------------------------------------------
// FlowAction — a single automation action within a flow
// ---------------------------------------------------------------------------

/**
 * Describes a connection edge to the next action in the flow.
 */
export const ActionConnectionSchema = z
  .object({
    /** Edge type (e.g., 'STANDARD_ERROR', 'STANDARD_SUCCESS'). */
    edgeType: z.string(),
    /** ID of the next action node this edge connects to. */
    nextActionId: z.string(),
  })
  .passthrough();

/**
 * A static branch within a branching action (e.g., if/else, A/B split).
 */
export const StaticBranchSchema = z
  .object({
    /** Connection descriptor pointing to the branch's next action. */
    connection: ActionConnectionSchema,
    /** Optional branch value/label. */
    inputValue: z.unknown().optional(),
  })
  .passthrough();

/**
 * A single automation action node within a flow.
 *
 * Uses `.passthrough()` because the BETA API has many action-type-specific
 * fields that are not part of the documented base schema.
 */
export const FlowActionSchema = z
  .object({
    /** Unique identifier of this action within the flow. */
    actionId: z.string().optional(),
    /** Action type discriminator (e.g., 'SET_PROPERTY', 'SEND_EMAIL', 'DELAY'). */
    type: z.string(),
    /** Connection to the next action in the default (happy-path) execution. */
    connection: ActionConnectionSchema.optional(),
    /** Named input fields consumed by this action. */
    inputFields: z.record(z.unknown()).optional(),
    /** Raw input value (varies by action type). */
    inputValue: z.unknown().optional(),
    /** Static branches for conditional branching actions. */
    staticBranches: z.array(StaticBranchSchema).optional(),
    /** Default branch connection for catch-all routing. */
    defaultBranch: z
      .object({
        connection: ActionConnectionSchema,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** TypeScript type inferred from FlowActionSchema. */
export type FlowAction = z.infer<typeof FlowActionSchema>;

// ---------------------------------------------------------------------------
// EnrollmentCriteria — when/how contacts enter the workflow
// ---------------------------------------------------------------------------

/**
 * Defines enrollment criteria — both initial triggers and re-enrollment triggers —
 * using the recursive PublicOrFilterBranch tree.
 */
export const EnrollmentCriteriaSchema = z
  .object({
    /** Primary filter tree controlling initial enrollment. */
    listFilterBranch: PublicOrFilterBranchSchema.optional(),
    /** Array of filter trees controlling re-enrollment. */
    reEnrollmentTriggersFilterBranches: z.array(PublicOrFilterBranchSchema).optional(),
  })
  .passthrough();

/** TypeScript type inferred from EnrollmentCriteriaSchema. */
export type EnrollmentCriteria = z.infer<typeof EnrollmentCriteriaSchema>;

// ---------------------------------------------------------------------------
// FlowSchema — full Automation v4 Flow object
// ---------------------------------------------------------------------------

/**
 * Enum of known flow types (object the flow operates on).
 * Uses z.string() fallback via .or() not needed — .passthrough() handles it.
 */
export const FlowTypeEnumSchema = z.enum([
  'CONTACT_FLOW',
  'COMPANY_FLOW',
  'DEAL_FLOW',
  'TICKET_FLOW',
  'QUOTE_FLOW',
  'CONVERSATION_FLOW',
]);

/**
 * Enum of known flow architectural types.
 */
export const FlowKindEnumSchema = z.enum(['WORKFLOW', 'ACTION_SET', 'UNKNOWN']);

/**
 * Complete Automation v4 Flow object as returned by the HubSpot API.
 *
 * Uses `.passthrough()` because the BETA API may return undocumented fields.
 * All optional fields mirror the API's partial-update semantics.
 */
export const FlowSchema = z
  .object({
    /** HubSpot-assigned flow identifier. */
    id: z.string(),
    /**
     * The CRM object type this flow operates on.
     * Known values: CONTACT_FLOW, COMPANY_FLOW, DEAL_FLOW, TICKET_FLOW,
     * QUOTE_FLOW, CONVERSATION_FLOW. Unknown values pass through.
     */
    type: z.string(),
    /**
     * Architectural type of the flow.
     * Known values: WORKFLOW, ACTION_SET, UNKNOWN.
     */
    flowType: z.string().optional(),
    /** Whether the flow is currently active and enrolling new records. */
    isEnabled: z.boolean(),
    /** HubSpot internal object type ID string (e.g., '0-1' for contacts). */
    objectTypeId: z.string().optional(),
    /** ID of the first action in the flow's action chain. */
    startActionId: z.string().optional(),
    /** Human-readable name of the flow. */
    name: z.string(),
    /** Ordered list of automation actions in this flow. */
    actions: z.array(FlowActionSchema).optional(),
    /** Defines when records enter this flow. */
    enrollmentCriteria: EnrollmentCriteriaSchema.optional(),
    /** Schedule constraints on when the flow executes. */
    enrollmentSchedule: z.object({}).passthrough().optional(),
    /** Optional goal criteria — flow exits early when met. */
    goalFilterBranch: PublicOrFilterBranchSchema.optional(),
    /** Time-based anchor for date-relative flows. */
    eventAnchor: z.object({}).passthrough().optional(),
    /** Time window constraints limiting when actions execute. */
    timeWindows: z.array(z.object({}).passthrough()).optional(),
    /** Date ranges during which the flow is suppressed. */
    blockedDates: z.array(z.object({}).passthrough()).optional(),
    /** Suppression list IDs — records on these lists skip enrollment. */
    suppressionListIds: z.array(z.number()).optional(),
    /** Data source configurations for the flow. */
    dataSources: z.array(z.object({}).passthrough()).optional(),
    /** Settings controlling un-enrollment behavior. */
    unEnrollmentSetting: z.object({}).passthrough().optional(),
    /** Arbitrary portal-defined properties attached to the flow. */
    customProperties: z.record(z.unknown()).optional(),
  })
  .passthrough();

/** TypeScript type inferred from FlowSchema. */
export type Flow = z.infer<typeof FlowSchema>;

// ---------------------------------------------------------------------------
// CreateFlowSchema — input for POST /automation/v4/flows
// ---------------------------------------------------------------------------

/**
 * Input schema for creating a new Automation v4 Flow.
 *
 * Only `name` and `type` are required by the API. All other fields are
 * optional and can be set or updated later via the PUT endpoint.
 */
export const CreateFlowSchema = z
  .object({
    /** Display name for the flow. Required. */
    name: z.string().min(1),
    /**
     * CRM object type this flow operates on.
     * Use one of: CONTACT_FLOW, COMPANY_FLOW, DEAL_FLOW, TICKET_FLOW,
     * QUOTE_FLOW, CONVERSATION_FLOW.
     */
    type: z.string().min(1),
    /** Architectural type. Defaults to WORKFLOW when omitted. */
    flowType: z.string().optional(),
    /** HubSpot object type ID string (e.g., '0-1' for contacts). */
    objectTypeId: z.string().optional(),
    /** Whether to activate the flow immediately. Defaults to false. */
    isEnabled: z.boolean().default(false),
    /** Enrollment trigger criteria. */
    enrollmentCriteria: EnrollmentCriteriaSchema.optional(),
    /** Initial list of actions for the flow. */
    actions: z.array(FlowActionSchema).optional(),
  })
  .passthrough();

/** TypeScript type inferred from CreateFlowSchema. */
export type CreateFlowInput = z.infer<typeof CreateFlowSchema>;

// ---------------------------------------------------------------------------
// UpdateFlowSchema — input for PUT /automation/v4/flows/{flowId}
// ---------------------------------------------------------------------------

/**
 * Input schema for fully replacing an existing Automation v4 Flow.
 *
 * PUT replaces the entire flow definition — all fields are optional except
 * the path parameter `flowId` (handled at the tool level, not here).
 * Fields not provided will be reset to defaults.
 */
export const UpdateFlowSchema = z
  .object({
    /** Display name for the flow. */
    name: z.string().min(1).optional(),
    /** CRM object type this flow operates on. */
    type: z.string().optional(),
    /** Architectural type (WORKFLOW, ACTION_SET, UNKNOWN). */
    flowType: z.string().optional(),
    /** HubSpot object type ID string. */
    objectTypeId: z.string().optional(),
    /** Whether the flow is active. */
    isEnabled: z.boolean().optional(),
    /** Enrollment trigger criteria. */
    enrollmentCriteria: EnrollmentCriteriaSchema.optional(),
    /** Complete action list for the flow. */
    actions: z.array(FlowActionSchema).optional(),
  })
  .passthrough();

/** TypeScript type inferred from UpdateFlowSchema. */
export type UpdateFlowInput = z.infer<typeof UpdateFlowSchema>;
