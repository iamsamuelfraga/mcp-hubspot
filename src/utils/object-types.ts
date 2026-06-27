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
  'contacts',
  'companies',
  'deals',
  'tickets',
  'line_items',
  'products',
  'quotes',
  'calls',
  'meetings',
  'tasks',
  'notes',
  'emails',
] as const;

/** Union type of all standard CRM object type strings. */
export type CrmObjectType = (typeof CRM_OBJECT_TYPES)[number];

/**
 * Matches HubSpot custom object type IDs (and standard fully-qualified IDs),
 * e.g. `2-12345678` for a custom object or `0-3` for deals. The generic CRM
 * tools accept these directly so any portal's custom objects are reachable.
 */
export const CUSTOM_OBJECT_TYPE_RE = /^\d+-\d+$/;

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
  toolset: 'sales' | 'engagements' | 'crm';
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
  contacts: {
    basePath: 'crm/v3/objects/contacts',
    scopeRead: 'crm.objects.contacts.read',
    scopeWrite: 'crm.objects.contacts.write',
    toolset: 'crm',
  },
  companies: {
    basePath: 'crm/v3/objects/companies',
    scopeRead: 'crm.objects.companies.read',
    scopeWrite: 'crm.objects.companies.write',
    toolset: 'crm',
  },
  deals: {
    basePath: 'crm/v3/objects/deals',
    scopeRead: 'crm.objects.deals.read',
    scopeWrite: 'crm.objects.deals.write',
    toolset: 'sales',
  },
  tickets: {
    basePath: 'crm/v3/objects/tickets',
    scopeRead: 'crm.objects.tickets.read',
    scopeWrite: 'crm.objects.tickets.write',
    toolset: 'crm',
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
export function validateObjectType(type: string): string {
  if (!isAcceptedObjectType(type)) {
    throw new Error(
      `Invalid CRM object type: "${type}". ` +
        `Valid types are: ${CRM_OBJECT_TYPES.join(', ')}, ` +
        `or a custom object type ID like "2-12345678".`
    );
  }
  return type;
}

/** Returns `true` for a HubSpot custom/fully-qualified object type ID (e.g. `2-12345678`). */
export function isCustomObjectType(type: string): boolean {
  return CUSTOM_OBJECT_TYPE_RE.test(type);
}

/** Returns `true` if `type` is a known standard type or a custom object type ID. */
export function isAcceptedObjectType(type: string): boolean {
  return isValidObjectType(type) || isCustomObjectType(type);
}

/**
 * Resolves the API path/scope config for any accepted object type.
 *
 * Standard types come from {@link OBJECT_TYPE_CONFIG}; custom object type IDs
 * (e.g. `2-12345678`) get a synthesized config pointing at
 * `crm/v3/objects/<id>` with the generic custom-object scopes.
 *
 * @throws {Error} If `type` is neither a known type nor a custom object ID.
 */
export function getObjectTypeConfig(type: string): ObjectTypeConfig {
  if (isValidObjectType(type)) {
    return OBJECT_TYPE_CONFIG[type];
  }
  if (isCustomObjectType(type)) {
    return {
      basePath: `crm/v3/objects/${type}`,
      scopeRead: 'crm.objects.custom.read',
      scopeWrite: 'crm.objects.custom.write',
      toolset: 'crm',
    };
  }
  throw new Error(`Invalid CRM object type: "${type}".`);
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
