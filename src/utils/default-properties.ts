/**
 * Default property sets for CRM search results.
 *
 * HubSpot's search/list endpoints return only a minimal set of properties
 * unless the caller explicitly requests more. That forces a second round-trip
 * (or leaves the LLM with bare IDs). This module supplies sensible,
 * business-readable default property sets per object type so a search returns
 * useful records out of the box — while callers can still pass an explicit
 * `properties` list to override.
 *
 * @module utils/default-properties
 */

/**
 * Per-object-type default properties to request on search/list when the caller
 * doesn't specify any. Keyed by the standard object type name.
 */
const DEFAULT_PROPERTIES: Record<string, string[]> = {
  contacts: [
    'firstname',
    'lastname',
    'email',
    'phone',
    'company',
    'jobtitle',
    'lifecyclestage',
    'hubspot_owner_id',
    'createdate',
    'lastmodifieddate',
  ],
  companies: [
    'name',
    'domain',
    'industry',
    'city',
    'country',
    'numberofemployees',
    'lifecyclestage',
    'hubspot_owner_id',
    'createdate',
    'hs_lastmodifieddate',
  ],
  deals: [
    'dealname',
    'amount',
    'dealstage',
    'pipeline',
    'closedate',
    'dealtype',
    'hubspot_owner_id',
    'createdate',
    'hs_lastmodifieddate',
  ],
  tickets: [
    'subject',
    'content',
    'hs_pipeline',
    'hs_pipeline_stage',
    'hs_ticket_priority',
    'hubspot_owner_id',
    'createdate',
    'hs_lastmodifieddate',
  ],
  line_items: ['name', 'quantity', 'price', 'amount', 'hs_product_id', 'createdate'],
  products: ['name', 'description', 'price', 'hs_sku', 'createdate'],
  quotes: ['hs_title', 'hs_status', 'hs_expiration_date', 'hs_currency', 'hubspot_owner_id'],
};

/**
 * Generic fallback for object types without a curated set (e.g. custom objects).
 * These properties exist on virtually every CRM object.
 */
const FALLBACK_PROPERTIES = ['createdate', 'hs_lastmodifieddate', 'hubspot_owner_id'];

/**
 * Returns a sensible default property list for the given object type.
 *
 * @param objectType - Standard object type name (e.g. "deals") or a custom
 *   object type id. Matching is case-insensitive on the standard names.
 * @returns An array of property names to request by default. Never empty.
 *
 * @example
 * defaultSearchProperties('deals');
 * // ['dealname','amount','dealstage','pipeline','closedate', ...]
 */
export function defaultSearchProperties(objectType: string): string[] {
  const key = objectType.trim().toLowerCase();
  return DEFAULT_PROPERTIES[key] ?? FALLBACK_PROPERTIES;
}
