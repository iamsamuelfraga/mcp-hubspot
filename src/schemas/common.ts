/**
 * Shared Zod schemas for HubSpot MCP tool inputs.
 *
 * All tools import from this file to ensure consistent validation, documentation,
 * and JSON Schema shapes across every domain module.
 *
 * Constraint references from HubSpot API:
 * - List limit: 1–100 per page
 * - Search limit: 1–200 per request, 10 000 total (use paging to walk)
 * - Search filterGroups: ≤ 5 groups, ≤ 6 filters per group
 * - Batch operations: ≤ 100 inputs per request
 *
 * @see {@link https://developers.hubspot.com/docs/api/crm/search}
 * @see {@link https://developers.hubspot.com/docs/api/crm/batch-objects}
 */

import { z } from 'zod';
import { CRM_OBJECT_TYPES } from '../utils/object-types.js';

// ---------------------------------------------------------------------------
// Object type enum
// ---------------------------------------------------------------------------

/**
 * Zod enum for all supported CRM object types.
 * Used in every generic CRM tool as the `objectType` parameter.
 *
 * @example
 * const schema = z.object({ objectType: CrmObjectTypeSchema });
 * schema.parse({ objectType: 'deals' }); // OK
 * schema.parse({ objectType: 'contacts' }); // throws ZodError
 */
export const CrmObjectTypeSchema = z
  .enum(CRM_OBJECT_TYPES)
  .describe(
    'CRM object type. Sales objects: deals, line_items, products, quotes. ' +
      'Engagement objects: calls, meetings, tasks, notes, emails.'
  );

// ---------------------------------------------------------------------------
// Pagination (for GET list endpoints)
// ---------------------------------------------------------------------------

/**
 * Pagination parameters for HubSpot v3 cursor-based list endpoints.
 * Pair with `paging.next.after` from the previous response to walk pages.
 */
export const PaginationSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe(
      'Number of records to return per page (1–100). Default: 10. ' +
        'Use the `after` cursor from the previous response to page forward.'
    ),
  after: z
    .string()
    .optional()
    .describe(
      'Pagination cursor from `paging.next.after` in the previous list response. ' +
        'Omit for the first page.'
    ),
});

// ---------------------------------------------------------------------------
// Search (for POST /search endpoints)
// ---------------------------------------------------------------------------

/**
 * A single filter condition in a HubSpot CRM search request.
 *
 * Operators:
 * - EQ / NEQ: exact match / not equal
 * - LT / LTE / GT / GTE: numeric / date comparisons
 * - HAS_PROPERTY / NOT_HAS_PROPERTY: property existence checks
 * - CONTAINS_TOKEN / NOT_CONTAINS_TOKEN: substring match (strings)
 * - IN / NOT_IN: set membership (use `values` array instead of `value`)
 * - BETWEEN: range match (use `value` for lower bound, `highValue` for upper)
 */
export const SearchFilterSchema = z.object({
  propertyName: z.string().min(1).describe('Internal HubSpot property name (e.g., "dealname").'),
  operator: z
    .enum([
      'EQ',
      'NEQ',
      'LT',
      'LTE',
      'GT',
      'GTE',
      'HAS_PROPERTY',
      'NOT_HAS_PROPERTY',
      'CONTAINS_TOKEN',
      'NOT_CONTAINS_TOKEN',
      'IN',
      'NOT_IN',
      'BETWEEN',
    ])
    .describe('Comparison operator.'),
  value: z
    .string()
    .optional()
    .describe('Filter value. Use for EQ, NEQ, LT, LTE, GT, GTE, CONTAINS_TOKEN, BETWEEN.'),
  values: z.array(z.string()).optional().describe('Array of values for IN / NOT_IN operators.'),
  highValue: z.string().optional().describe('Upper bound value for BETWEEN operator.'),
});

/**
 * A filter group; all filters within a group are ANDed together.
 * Maximum 6 filters per group.
 */
export const FilterGroupSchema = z.object({
  filters: z.array(SearchFilterSchema).max(6).describe('Filters within this group (AND). Max 6.'),
});

/**
 * Sort specification for a search result set.
 */
export const SearchSortSchema = z.object({
  propertyName: z.string().describe('Property to sort by.'),
  direction: z
    .enum(['ASCENDING', 'DESCENDING'])
    .describe('Sort direction. Default convention: DESCENDING for dates.'),
});

/**
 * Full search request body schema.
 *
 * Notes:
 * - `filterGroups` are ORed together; filters within each group are ANDed.
 * - `query` performs a full-text search across all searchable string properties.
 * - `properties` must be requested explicitly; HubSpot returns only default properties otherwise.
 * - Search has stricter rate limits (~5 req/s per token) and an indexing latency of several seconds.
 *   Do not use search for immediate read-after-write — use `get` instead.
 */
export const SearchInputSchema = z.object({
  filterGroups: z
    .array(FilterGroupSchema)
    .max(5)
    .optional()
    .describe(
      'OR-ed filter groups (max 5). Each group is AND-ed internally (max 6 filters per group). ' +
        'Omit for unfiltered search (requires `query`).'
    ),
  sorts: z
    .array(SearchSortSchema)
    .optional()
    .describe('Sort specifications. Applied in order. Typically limited to 1–2 sorts.'),
  query: z
    .string()
    .optional()
    .describe(
      'Full-text search query across all searchable string properties. ' +
        'Can be combined with `filterGroups`.'
    ),
  properties: z
    .array(z.string())
    .optional()
    .describe(
      'Array of property names to return. HubSpot only returns default properties if omitted — ' +
        'always specify the properties you need.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(10)
    .describe(
      'Maximum records per response (1–200). Max total results via paging: 10 000. Default: 10.'
    ),
  after: z
    .union([z.string(), z.number().int()])
    .optional()
    .describe(
      'Pagination cursor from `paging.next.after` in the previous search response. ' +
        'Use 0 (or omit) for the first page.'
    ),
});

// ---------------------------------------------------------------------------
// Inline associations (embedded in POST /crm/v3/objects/{type} create body)
// ---------------------------------------------------------------------------

/**
 * An association type descriptor used in v3 inline association creation.
 *
 * - `HUBSPOT_DEFINED`: Standard HubSpot association type (e.g., Deal → Contact = typeId 3).
 * - `USER_DEFINED`: Custom association type created in the portal.
 * - `INTEGRATOR_DEFINED`: Association type defined by an integration.
 *
 * To discover the correct typeId for your portal, call `hubspot_associations_labels_list`.
 */
export const AssociationTypeSchema = z.object({
  associationCategory: z
    .enum(['HUBSPOT_DEFINED', 'USER_DEFINED', 'INTEGRATOR_DEFINED'])
    .describe('Category of the association type.'),
  associationTypeId: z.number().int().describe('Numeric ID of the association type.'),
});

/**
 * A single inline association entry in a CRM object create request.
 *
 * @example
 * // Associate a new quote to deal ID "123" using HUBSPOT_DEFINED type 64
 * {
 *   to: { id: '123' },
 *   types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 64 }],
 * }
 */
export const InlineAssociationSchema = z.object({
  to: z
    .object({ id: z.string().min(1).describe('HubSpot record ID of the target object.') })
    .describe('Target record to associate to.'),
  types: z
    .array(AssociationTypeSchema)
    .min(1)
    .describe('One or more association types to apply for this pairing.'),
});

// ---------------------------------------------------------------------------
// CRM properties
// ---------------------------------------------------------------------------

/**
 * Key-value map of HubSpot CRM property names to their string values.
 *
 * All property values are strings in HubSpot's API.
 * Pass `null` as a value to clear a property.
 *
 * @example
 * { dealname: 'Acme Corp Deal', amount: '50000', closedate: '2025-12-31' }
 */
export const CrmPropertiesSchema = z
  .record(z.string())
  .describe(
    'Key-value map of property names to string values. ' +
      'HubSpot stores all property values as strings. ' +
      'For engagements (calls/meetings/tasks/notes/emails), `hs_timestamp` is required on create.'
  );

// ---------------------------------------------------------------------------
// Batch inputs
// ---------------------------------------------------------------------------

/**
 * A batch ID input: used in batch/archive and as the identifier portion of batch/read.
 */
export const BatchIdInputSchema = z.object({
  id: z.string().min(1).describe('HubSpot record ID.'),
});

/**
 * A batch read input. Accepts either `hs_object_id` (default) or a custom unique
 * property specified at the batch level via `idProperty`.
 */
export const BatchReadInputSchema = z.object({
  id: z.string().min(1).describe('Record identifier value (uses `idProperty` to resolve).'),
});

/**
 * A batch update input: an existing record ID + partial properties to update.
 */
export const BatchUpdateInputSchema = z.object({
  id: z.string().min(1).describe('HubSpot record ID to update.'),
  properties: CrmPropertiesSchema.describe('Properties to update on this record.'),
});

/**
 * A batch create input: properties for a new record plus optional inline associations.
 */
export const BatchCreateInputSchema = z.object({
  properties: CrmPropertiesSchema.describe('Properties for the new record.'),
  associations: z
    .array(InlineAssociationSchema)
    .optional()
    .describe('Optional associations to create with this record.'),
});

/**
 * A batch upsert input: identifies a record by a unique property value and
 * applies the provided properties (creates if not found, updates if found).
 */
export const BatchUpsertInputSchema = z.object({
  idProperty: z
    .string()
    .min(1)
    .describe(
      'Name of the unique property used to identify this record ' +
        '(e.g., "hs_external_id"). Must be marked as unique in HubSpot.'
    ),
  id: z.string().min(1).describe('Value of the `idProperty` that uniquely identifies the record.'),
  properties: CrmPropertiesSchema.describe('Properties to set on create or update.'),
});

// ---------------------------------------------------------------------------
// Re-exported type helpers (TypeScript inference from schemas)
// ---------------------------------------------------------------------------

/** TypeScript type for a single search filter. */
export type SearchFilter = z.infer<typeof SearchFilterSchema>;

/** TypeScript type for a filter group. */
export type FilterGroup = z.infer<typeof FilterGroupSchema>;

/** TypeScript type for the full search input. */
export type SearchInput = z.infer<typeof SearchInputSchema>;

/** TypeScript type for an inline association entry. */
export type InlineAssociation = z.infer<typeof InlineAssociationSchema>;

/** TypeScript type for a CRM properties map. */
export type CrmProperties = z.infer<typeof CrmPropertiesSchema>;
