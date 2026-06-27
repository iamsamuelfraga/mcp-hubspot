/**
 * Zod schemas for HubSpot Associations API v4.
 *
 * Covers individual association CRUD, batch operations, and label discovery.
 *
 * @see {@link https://developers.hubspot.com/docs/api/crm/associations}
 */
import { z } from 'zod';

/**
 * Association category — who defined the association type.
 *
 * - `HUBSPOT_DEFINED` — built-in HubSpot types (e.g., Deal→Contact).
 * - `USER_DEFINED` — custom types created by the portal user.
 * - `INTEGRATOR_DEFINED` — types created by a third-party integration/app.
 */
export const AssociationCategorySchema = z
  .enum(['HUBSPOT_DEFINED', 'USER_DEFINED', 'INTEGRATOR_DEFINED'])
  .describe(
    'Who defined the association type. ' +
      'HUBSPOT_DEFINED for built-in types (e.g., Call→Contact 194), ' +
      'USER_DEFINED for portal-level custom labels, ' +
      'INTEGRATOR_DEFINED for app-created types.'
  );

/**
 * A single association type specifier — combines a category with a numeric typeId.
 *
 * Default HUBSPOT_DEFINED typeIds for engagement→object associations:
 * - Call:    Contact 194 | Company 182 | Deal 206 | Ticket 220
 * - Email:   Contact 198 | Company 186 | Deal 210 | Ticket 224
 * - Meeting: Contact 200 | Company 188 | Deal 212 | Ticket 226
 * - Note:    Contact 202 | Company 190 | Deal 214 | Ticket 228
 * - Task:    Contact 204 | Company 192 | Deal 216 | Ticket 230
 *
 * Always verify typeIds at runtime via `hubspot_associations_labels_list` —
 * they can vary per portal.
 */
export const AssociationTypeSchema = z.object({
  associationCategory: AssociationCategorySchema,
  associationTypeId: z
    .number()
    .int()
    .positive()
    .describe(
      'Numeric association type identifier. ' +
        'Use hubspot_associations_labels_list to discover valid IDs for your portal.'
    ),
});

/** TypeScript type for a single association type specifier. */
export type AssociationType = z.infer<typeof AssociationTypeSchema>;

// ---------------------------------------------------------------------------
// Individual association operations
// ---------------------------------------------------------------------------

/**
 * Input schema for creating (or updating) a single association between two objects.
 * Maps to PUT /crm/v4/objects/{fromType}/{fromId}/associations/{toType}/{toId}.
 */
export const CreateAssociationSchema = z.object({
  fromType: z
    .string()
    .min(1)
    .describe('Object type of the source record (e.g., "contacts", "deals", "calls", "meetings")'),
  fromId: z.string().min(1).describe('HubSpot ID of the source record'),
  toType: z
    .string()
    .min(1)
    .describe(
      'Object type of the target record (e.g., "contacts", "deals", "companies", "tickets")'
    ),
  toId: z.string().min(1).describe('HubSpot ID of the target record'),
  associationTypes: z
    .array(AssociationTypeSchema)
    .min(1)
    .describe(
      'One or more association type specifiers. At minimum provide one item with ' +
        'associationCategory and associationTypeId. Use hubspot_associations_labels_list ' +
        'to discover available types.'
    ),
});

/** TypeScript type inferred from CreateAssociationSchema. */
export type CreateAssociationInput = z.infer<typeof CreateAssociationSchema>;

/**
 * Input schema for archiving (deleting) a single association.
 * Maps to DELETE /crm/v4/objects/{fromType}/{fromId}/associations/{toType}/{toId}.
 */
export const ArchiveAssociationSchema = z.object({
  fromType: z
    .string()
    .min(1)
    .describe('Object type of the source record (e.g., "contacts", "deals", "calls")'),
  fromId: z.string().min(1).describe('HubSpot ID of the source record'),
  toType: z
    .string()
    .min(1)
    .describe('Object type of the target record (e.g., "contacts", "companies", "tickets")'),
  toId: z.string().min(1).describe('HubSpot ID of the target record'),
});

/** TypeScript type inferred from ArchiveAssociationSchema. */
export type ArchiveAssociationInput = z.infer<typeof ArchiveAssociationSchema>;

/**
 * Input schema for listing associations of a single object.
 * Maps to GET /crm/v4/objects/{fromType}/{fromId}/associations/{toType}.
 */
export const ListAssociationsSchema = z.object({
  fromType: z
    .string()
    .min(1)
    .describe('Object type of the source record (e.g., "contacts", "deals", "calls")'),
  fromId: z.string().min(1).describe('HubSpot ID of the source record'),
  toType: z
    .string()
    .min(1)
    .describe('Object type of associated records to retrieve (e.g., "companies", "tickets")'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe('Maximum number of associations to return per page (1-500, default 100)'),
  after: z
    .string()
    .optional()
    .describe('Pagination cursor from a previous response paging.next.after'),
});

/** TypeScript type inferred from ListAssociationsSchema. */
export type ListAssociationsInput = z.infer<typeof ListAssociationsSchema>;

// ---------------------------------------------------------------------------
// Batch association operations
// ---------------------------------------------------------------------------

/**
 * A single input item for batch create.
 * Represents one directional association from a specific object to another.
 */
export const BatchAssociationInputSchema = z.object({
  from: z
    .object({
      id: z.string().min(1).describe('HubSpot ID of the source object'),
    })
    .describe('Source object'),
  to: z
    .object({
      id: z.string().min(1).describe('HubSpot ID of the target object'),
    })
    .describe('Target object'),
  types: z
    .array(AssociationTypeSchema)
    .min(1)
    .describe('Association type specifiers for this pair'),
});

/**
 * Input schema for batch-creating associations between many object pairs.
 * Maps to POST /crm/v4/associations/{fromType}/{toType}/batch/create.
 * Maximum 100 inputs per request.
 */
export const BatchCreateAssociationsSchema = z.object({
  fromType: z
    .string()
    .min(1)
    .describe('Object type of the source records (e.g., "calls", "deals", "contacts")'),
  toType: z
    .string()
    .min(1)
    .describe('Object type of the target records (e.g., "contacts", "companies", "deals")'),
  inputs: z
    .array(BatchAssociationInputSchema)
    .min(1)
    .max(100)
    .describe('Array of association pairs to create (maximum 100)'),
});

/** TypeScript type inferred from BatchCreateAssociationsSchema. */
export type BatchCreateAssociationsInput = z.infer<typeof BatchCreateAssociationsSchema>;

// ---------------------------------------------------------------------------
// Labels discovery
// ---------------------------------------------------------------------------

/**
 * Input schema for listing available association label types between two object types.
 * Maps to GET /crm/v4/associations/{fromType}/{toType}/labels.
 */
export const ListAssociationLabelsSchema = z.object({
  fromType: z
    .string()
    .min(1)
    .describe('Object type of the source (e.g., "calls", "deals", "contacts")'),
  toType: z
    .string()
    .min(1)
    .describe('Object type of the target (e.g., "contacts", "companies", "deals")'),
});

/** TypeScript type inferred from ListAssociationLabelsSchema. */
export type ListAssociationLabelsInput = z.infer<typeof ListAssociationLabelsSchema>;
