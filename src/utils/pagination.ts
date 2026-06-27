/**
 * Cursor-based pagination helper for HubSpot v3 CRM endpoints.
 *
 * HubSpot v3 uses a cursor model: each response includes a `paging.next.after`
 * value that must be passed as the `after` query parameter in the next request.
 * Iteration stops when `paging.next` is absent.
 *
 * @see {@link https://developers.hubspot.com/docs/api/crm/pagination}
 */
import { type CollectionResponse } from '../types/hubspot-api.js';

/**
 * Iterates over all pages of a HubSpot v3 collection endpoint, collecting
 * all items into a single array.
 *
 * @template T - The type of items in each page.
 * @param fetcher - A function that fetches one page. Receives the cursor `after`
 *   value (undefined for the first page) and returns a CollectionResponse.
 * @param maxItems - Optional upper bound on the number of items to return.
 *   Iteration stops as soon as this many items have been collected.
 * @returns All collected items, up to `maxItems` if specified.
 *
 * @example
 * // Fetch all deals (up to 1000):
 * const deals = await paginate(
 *   (after) => client.get('/crm/v3/objects/deals', { after, limit: '100' }),
 *   1000
 * );
 *
 * @example
 * // Fetch just the first page (no maxItems limit, single page because API returns no cursor):
 * const firstPage = await paginate(
 *   (after) => client.get('/crm/v3/objects/contacts', { after, limit: '10' })
 * );
 */
export async function paginate<T>(
  fetcher: (after?: string) => Promise<CollectionResponse<T>>,
  maxItems?: number
): Promise<T[]> {
  const allItems: T[] = [];
  let after: string | undefined = undefined;

  do {
    const response = await fetcher(after);
    allItems.push(...response.results);

    // Stop if we've hit the requested maximum
    if (maxItems !== undefined && allItems.length >= maxItems) {
      return allItems.slice(0, maxItems);
    }

    // Advance to next page cursor, or stop if there is none
    after = response.paging?.next?.after;
  } while (after !== undefined);

  return allItems;
}
