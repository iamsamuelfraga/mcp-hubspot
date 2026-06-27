/**
 * HubSpot API client.
 *
 * Central HTTP client for all HubSpot API interactions. Provides:
 * - Bearer token authentication (Private App token)
 * - Dual rate limiters (general and search-specific)
 * - Automatic retry with exponential backoff and jitter
 * - Structured error parsing via `parseHubSpotError`
 * - Request metrics recording
 * - Cursor-based pagination helper
 *
 * @example
 * const client = new HubSpotClient({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });
 * const deals = await client.get<CollectionResponse<SimplePublicObject>>('/crm/v3/objects/deals', {
 *   limit: '10',
 *   properties: 'dealname,amount',
 * });
 */
import { type CollectionResponse } from './types/hubspot-api.js';
import { parseHubSpotError, HubSpotApiError } from './utils/error-handler.js';
import { generalLimiter, searchLimiter } from './utils/rate-limiter.js';
import { withRetry } from './utils/retry.js';
import { paginate } from './utils/pagination.js';
import { metricsCollector } from './utils/metrics.js';
import { logger } from './utils/logger.js';

/**
 * Configuration for the HubSpotClient.
 */
export interface HubSpotClientConfig {
  /** HubSpot Private App access token. Never logged or exposed in errors. */
  accessToken: string;
  /** Base URL for HubSpot API. Default: 'https://api.hubapi.com'. */
  baseUrl?: string;
  /**
   * HubSpot Developer API key (hapikey). Required for developer-scoped APIs
   * such as Custom Workflow Actions (/automation/v4/actions).
   * Set via the HUBSPOT_DEVELOPER_API_KEY environment variable.
   */
  developerApiKey?: string;
}

/**
 * Options for a single HTTP request to the HubSpot API.
 */
export interface RequestOptions {
  /** HTTP method. */
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** API path relative to baseUrl (e.g., '/crm/v3/objects/deals'). */
  path: string;
  /**
   * Query parameters. `undefined` values are silently omitted from the URL.
   * Boolean and number values are converted to strings via `.toString()`.
   */
  query?: Record<string, string | number | boolean | undefined>;
  /** Request body for POST/PATCH/PUT. Will be JSON-serialized. */
  body?: unknown;
  /** When true, uses the search-specific rate limiter instead of the general one. */
  useSearchLimiter?: boolean;
  /**
   * Authentication strategy for this request.
   *
   * - `'bearer'` (default) – sends `Authorization: Bearer <accessToken>` header.
   * - `'developer'` – appends `hapikey=<developerApiKey>` as a query param.
   *   No Authorization header is sent. Requires `developerApiKey` to be set
   *   in the client config.
   */
  auth?: 'bearer' | 'developer';
}

/**
 * HubSpot Private App API client.
 *
 * All public methods route through the central `request()` method which handles
 * authentication, rate limiting, retries, and error parsing. Convenience methods
 * (`get`, `post`, `patch`, `put`, `delete`) are thin wrappers over `request`.
 */
export class HubSpotClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  /** Developer API key for hapikey-authenticated endpoints (e.g., Custom Actions). */
  private readonly developerApiKey?: string;

  /**
   * Creates a new HubSpotClient.
   *
   * @param config - Client configuration including the access token.
   */
  constructor(config: HubSpotClientConfig) {
    this.accessToken = config.accessToken;
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') ?? 'https://api.hubapi.com';
    this.developerApiKey = config.developerApiKey;
  }

  /**
   * Central request method. Handles the full lifecycle of an API call:
   * 1. Builds the full URL with filtered query parameters
   * 2. Selects the appropriate rate limiter
   * 3. Wraps the fetch call in `withRetry`
   * 4. Sets Authorization, Content-Type headers
   * 5. Parses X-HubSpot-RateLimit-* headers and logs warnings when remaining < 10
   * 6. Parses Retry-After on 429 responses
   * 7. Parses error bodies via `parseHubSpotError` on non-2xx responses
   * 8. Records request metrics
   *
   * @template T - Expected response body type.
   * @param options - Request configuration.
   * @returns Parsed JSON response body typed as T.
   * @throws {HubSpotApiError} On any non-2xx response from HubSpot.
   *
   * @example
   * const result = await client.request<{ id: string }>({
   *   method: 'POST',
   *   path: '/crm/v3/objects/deals',
   *   body: { properties: { dealname: 'New Deal' } },
   * });
   */
  async request<T>(options: RequestOptions): Promise<T> {
    const { method, path, query, body, useSearchLimiter = false, auth = 'bearer' } = options;
    const endpoint = path;
    const startTime = Date.now();

    // Build URL with query params (filter out undefined values)
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    // Developer auth: append hapikey as a query param (no Authorization header).
    if (auth === 'developer') {
      if (!this.developerApiKey) {
        throw new Error('Developer API key not configured. Set HUBSPOT_DEVELOPER_API_KEY env var.');
      }
      url.searchParams.set('hapikey', this.developerApiKey);
    }

    const limiter = useSearchLimiter ? searchLimiter : generalLimiter;
    let success = false;

    try {
      const result = await withRetry(
        () =>
          limiter.schedule(async () => {
            const headers: Record<string, string> = {
              Accept: 'application/json',
            };

            // Bearer auth: set Authorization header (default for all non-developer calls).
            if (auth !== 'developer') {
              headers['Authorization'] = `Bearer ${this.accessToken}`;
            }

            // Only set Content-Type for requests that send a body
            if (body !== undefined && ['POST', 'PATCH', 'PUT'].includes(method)) {
              headers['Content-Type'] = 'application/json';
            }

            const fetchOptions: RequestInit = {
              method,
              headers,
              ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            };

            logger.debug('HubSpot API request', {
              method,
              path,
              hasBody: body !== undefined,
              useSearchLimiter,
            });

            const response = await fetch(url.toString(), fetchOptions);

            // Log rate limit headers when present
            this.logRateLimitHeaders(response, path);

            if (!response.ok) {
              // Parse Retry-After header for 429 responses
              const retryAfterHeader = response.headers.get('Retry-After');
              const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

              let errorBody: unknown;
              try {
                errorBody = await response.json();
              } catch {
                errorBody = await response.text().catch(() => '');
              }

              throw parseHubSpotError(response.status, errorBody, endpoint, retryAfter);
            }

            // 204 No Content – return empty object
            if (response.status === 204) {
              return {} as T;
            }

            return (await response.json()) as T;
          }),
        {
          maxRetries: 3,
          initialDelay: 1000,
          maxDelay: 30_000,
          backoffMultiplier: 2,
          jitter: true,
          retryableStatuses: [429, 500, 502, 503, 504],
        }
      );

      success = true;
      return result;
    } finally {
      const duration = Date.now() - startTime;
      metricsCollector.recordRequest(endpoint, duration, !success);
    }
  }

  /**
   * Reads X-HubSpot-RateLimit-* headers and emits a warning when remaining
   * requests fall below the alert threshold (10).
   *
   * @param response - The fetch Response object.
   * @param path - The request path (for log context).
   */
  private logRateLimitHeaders(response: Response, path: string): void {
    const remaining = response.headers.get('X-HubSpot-RateLimit-Remaining');
    const limit = response.headers.get('X-HubSpot-RateLimit-Limit');
    const interval = response.headers.get('X-HubSpot-RateLimit-Interval-Milliseconds');

    if (remaining !== null) {
      const remainingNum = parseInt(remaining, 10);
      if (remainingNum < 10) {
        logger.warn('HubSpot rate limit nearly exhausted', {
          remaining: remainingNum,
          limit: limit ?? 'unknown',
          intervalMs: interval ?? 'unknown',
          path,
        });
      }
    }
  }

  /**
   * Sends a GET request to the HubSpot API.
   *
   * @template T - Expected response type.
   * @param path - API path (e.g., `/crm/v3/objects/deals`).
   * @param query - Optional query parameters.
   * @returns Parsed JSON response typed as T.
   *
   * @example
   * const deals = await client.get<CollectionResponse<SimplePublicObject>>(
   *   '/crm/v3/objects/deals',
   *   { limit: 10, properties: 'dealname,amount' }
   * );
   */
  async get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: 'GET', path, query });
  }

  /**
   * Sends a POST request to the HubSpot API.
   *
   * @template T - Expected response type.
   * @param path - API path.
   * @param body - Request body (will be JSON-serialized).
   * @param query - Optional query parameters.
   * @returns Parsed JSON response typed as T.
   *
   * @example
   * const deal = await client.post<SimplePublicObject>(
   *   '/crm/v3/objects/deals',
   *   { properties: { dealname: 'Acme Deal', amount: '5000' } }
   * );
   */
  async post<T>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: 'POST', path, body, query });
  }

  /**
   * Sends a PATCH request to the HubSpot API.
   *
   * @template T - Expected response type.
   * @param path - API path including record ID (e.g., `/crm/v3/objects/deals/123`).
   * @param body - Partial update body (will be JSON-serialized).
   * @returns Parsed JSON response typed as T.
   *
   * @example
   * const updated = await client.patch<SimplePublicObject>(
   *   '/crm/v3/objects/deals/123',
   *   { properties: { dealstage: 'closedwon' } }
   * );
   */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'PATCH', path, body });
  }

  /**
   * Sends a PUT request to the HubSpot API.
   *
   * @template T - Expected response type.
   * @param path - API path.
   * @param body - Request body (will be JSON-serialized).
   * @returns Parsed JSON response typed as T.
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'PUT', path, body });
  }

  /**
   * Sends a DELETE request to the HubSpot API.
   *
   * @template T - Expected response type (typically void/empty).
   * @param path - API path including record ID.
   * @param query - Optional query parameters.
   * @returns Parsed JSON response typed as T (often an empty object on 204).
   *
   * @example
   * await client.delete('/crm/v3/objects/deals/123');
   */
  async delete<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: 'DELETE', path, query });
  }

  /**
   * Fetches all pages of a HubSpot v3 cursor-paginated endpoint.
   *
   * Iterates using `paging.next.after` cursors until no more pages exist,
   * or until `maxItems` items have been collected.
   *
   * @template T - The type of items in each page.
   * @param path - API path for the list endpoint.
   * @param query - Base query parameters (merged with `after` on each page).
   * @param maxItems - Optional cap on total items returned.
   * @returns All items across all pages.
   *
   * @example
   * // Fetch all deals with specific properties:
   * const allDeals = await client.paginateAll<SimplePublicObject>(
   *   '/crm/v3/objects/deals',
   *   { limit: 100, properties: 'dealname,amount,closedate' }
   * );
   *
   * @example
   * // Fetch at most 500 contacts:
   * const contacts = await client.paginateAll<SimplePublicObject>(
   *   '/crm/v3/objects/contacts',
   *   { limit: 100 },
   *   500
   * );
   */
  async paginateAll<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    maxItems?: number
  ): Promise<T[]> {
    return paginate<T>(
      (after) => this.get<CollectionResponse<T>>(path, { ...query, ...(after ? { after } : {}) }),
      maxItems
    );
  }

  /**
   * Executes a search request using the stricter search rate limiter.
   *
   * @template T - Expected response type.
   * @param path - Search endpoint path (e.g., `/crm/v3/objects/deals/search`).
   * @param body - Search request body (filters, sorts, properties, etc.).
   * @returns Parsed JSON response typed as T.
   *
   * @example
   * const results = await client.search<CollectionResponse<SimplePublicObject>>(
   *   '/crm/v3/objects/deals/search',
   *   {
   *     filterGroups: [{ filters: [{ propertyName: 'amount', operator: 'GTE', value: '1000' }] }],
   *     properties: ['dealname', 'amount'],
   *     limit: 10,
   *   }
   * );
   */
  async search<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>({ method: 'POST', path, body, useSearchLimiter: true });
  }
}

// Re-export for convenience
export { HubSpotApiError };
