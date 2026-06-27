/**
 * HubSpot CRM object type registry.
 *
 * Defines the canonical list of CRM object types supported by this MCP server,
 * along with per-type API path, required OAuth scopes, and toolset assignment.
 *
 * Object types map to HubSpot's standard CRM object API at:
 * `https://api.hubapi.com/crm/v3/objects/<objectType>`
 *
 * @see {@link https://developers.hubspot.com/docs/api/crm/understanding-the-crm}
 */

/**
 * Supported HubSpot CRM object type identifiers.
 *
 * These are the `objectType` path segments used in v3 CRM API URLs.
 * Contacts and companies are excluded here since they are covered by
 * standard contact/company tools with their own dedicated endpoints.
 */
export const CRM_OBJECT_TYPES = [
  'deals',
  'line_items',
  'products',
  'quotes',
  'calls',
  'meetings',
  'tasks',
  'notes',
  'emails',
] as const;

/** Union type of all valid CRM object type strings. */
export type CrmObjectType = (typeof CRM_OBJECT_TYPES)[number];

/**
 * Per-object-type configuration metadata used to build API paths and
 * validate OAuth scope requirements at startup.
 */
export interface ObjectTypeConfig {
  /** v3 CRM API base path for this object type (relative to baseUrl). */
  basePath: string;
  /** OAuth scope required to read objects of this type. */
  scopeRead: string;
  /** OAuth scope required to create/update/delete objects of this type. */
  scopeWrite: string;
  /** The HubSpot MCP toolset domain that owns this object type. */
  toolset: 'sales' | 'engagements';
}

/**
 * Metadata registry for all supported CRM object types.
 *
 * Used by tool generators to derive API paths and scope strings without
 * hardcoding them in multiple places.
 *
 * @example
 * const config = OBJECT_TYPE_CONFIG.deals;
 * // { basePath: 'crm/v3/objects/deals', scopeRead: 'crm.objects.deals.read', ... }
 */
export const OBJECT_TYPE_CONFIG: Record<CrmObjectType, ObjectTypeConfig> = {
  deals: {
    basePath: 'crm/v3/objects/deals',
    scopeRead: 'crm.objects.deals.read',
    scopeWrite: 'crm.objects.deals.write',
    toolset: 'sales',
  },
  line_items: {
    basePath: 'crm/v3/objects/line_items',
    scopeRead: 'crm.objects.line_items.read',
    scopeWrite: 'crm.objects.line_items.write',
    toolset: 'sales',
  },
  products: {
    basePath: 'crm/v3/objects/products',
    scopeRead: 'crm.objects.products.read',
    scopeWrite: 'crm.objects.products.write',
    toolset: 'sales',
  },
  quotes: {
    basePath: 'crm/v3/objects/quotes',
    scopeRead: 'crm.objects.quotes.read',
    scopeWrite: 'crm.objects.quotes.write',
    toolset: 'sales',
  },
  calls: {
    basePath: 'crm/v3/objects/calls',
    scopeRead: 'crm.objects.contacts.read',
    scopeWrite: 'crm.objects.contacts.write',
    toolset: 'engagements',
  },
  meetings: {
    basePath: 'crm/v3/objects/meetings',
    scopeRead: 'crm.objects.contacts.read',
    scopeWrite: 'crm.objects.contacts.write',
    toolset: 'engagements',
  },
  tasks: {
    basePath: 'crm/v3/objects/tasks',
    scopeRead: 'crm.objects.contacts.read',
    scopeWrite: 'crm.objects.contacts.write',
    toolset: 'engagements',
  },
  notes: {
    basePath: 'crm/v3/objects/notes',
    scopeRead: 'crm.objects.contacts.read',
    scopeWrite: 'crm.objects.contacts.write',
    toolset: 'engagements',
  },
  emails: {
    basePath: 'crm/v3/objects/emails',
    scopeRead: 'crm.objects.contacts.read',
    scopeWrite: 'crm.objects.contacts.write',
    toolset: 'engagements',
  },
};

/**
 * Validates that a string is a recognized CRM object type and returns it
 * with the proper TypeScript type narrowing.
 *
 * @param type - The string to validate.
 * @returns The validated CrmObjectType.
 * @throws {Error} If `type` is not in the CRM_OBJECT_TYPES list.
 *
 * @example
 * const t = validateObjectType('deals'); // → 'deals' (typed as CrmObjectType)
 * validateObjectType('contacts');        // throws Error
 */
export function validateObjectType(type: string): CrmObjectType {
  if (!isValidObjectType(type)) {
    throw new Error(
      `Invalid CRM object type: "${type}". ` + `Valid types are: ${CRM_OBJECT_TYPES.join(', ')}.`
    );
  }
  return type;
}

/**
 * Type guard that checks whether a string is a valid CRM object type.
 *
 * @param type - The string to check.
 * @returns `true` if `type` is one of the CRM_OBJECT_TYPES values.
 *
 * @example
 * if (isValidObjectType(userInput)) {
 *   const config = OBJECT_TYPE_CONFIG[userInput]; // fully typed
 * }
 */
export function isValidObjectType(type: string): type is CrmObjectType {
  return (CRM_OBJECT_TYPES as readonly string[]).includes(type);
}
