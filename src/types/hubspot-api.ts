/**
 * HubSpot API type definitions.
 *
 * These types model the HubSpot REST API v3 response shapes, error model,
 * and pagination structures used across all CRM object endpoints.
 */

/**
 * Cursor-based pagination pointers returned by HubSpot list endpoints.
 *
 * @example
 * // A response with a next page:
 * { next: { after: "10", link: "https://api.hubapi.com/crm/v3/objects/deals?after=10" } }
 */
export interface Paging {
  /** Pointer to the next page of results. Present when more items exist. */
  next?: {
    /** Cursor value to pass as `after` query param in the next request. */
    after: string;
    /** Full URL of the next page (informational). */
    link?: string;
  };
  /** Pointer to the previous page of results. Present when paginating backwards. */
  prev?: {
    /** Cursor value to pass as `before` query param in the previous request. */
    before: string;
    /** Full URL of the previous page (informational). */
    link?: string;
  };
}

/**
 * Standard collection response wrapper used by HubSpot v3 list endpoints.
 *
 * @template T - The type of items in the collection.
 *
 * @example
 * const response: CollectionResponse<SimplePublicObject> = {
 *   results: [...],
 *   paging: { next: { after: "10" } }
 * };
 */
export interface CollectionResponse<T> {
  /** The page of items returned by this request. */
  results: T[];
  /** Pagination cursors; absent when there is only one page. */
  paging?: Paging;
}

/**
 * Async batch operation response returned by HubSpot batch read/write endpoints.
 *
 * @template T - The type of items in the batch result.
 */
export interface BatchResponse<T> {
  /** Overall status of the batch job ("COMPLETE", "PENDING", etc.). */
  status: string;
  /** Successfully processed items. */
  results: T[];
  /** ISO timestamp when the batch job started. */
  startedAt: string;
  /** ISO timestamp when the batch job completed. */
  completedAt: string;
  /** Number of items that encountered errors during processing. */
  numErrors?: number;
  /** Detailed error information for failed items. */
  errors?: HubSpotErrorModel[];
}

/**
 * HubSpot API error response model.
 *
 * HubSpot returns structured error bodies on 4xx/5xx responses. This interface
 * captures all documented fields from the error model.
 *
 * @see {@link https://developers.hubspot.com/docs/api/error-handling}
 *
 * @example
 * // A typical validation error:
 * {
 *   status: "error",
 *   message: "Property does not exist",
 *   correlationId: "9a70f83b-...",
 *   category: "VALIDATION_ERROR"
 * }
 */
export interface HubSpotErrorModel {
  /** Always "error" for error responses. */
  status?: string;
  /** Human-readable description of the error. */
  message?: string;
  /** UUID for correlating this error with HubSpot support tickets. */
  correlationId?: string;
  /**
   * High-level error category.
   * Known values: VALIDATION_ERROR, RATE_LIMIT, MISSING_SCOPES,
   * OBJECT_NOT_FOUND, INVALID_AUTHENTICATION, etc.
   */
  category?: string;
  /** Optional sub-category providing additional context within a category. */
  subCategory?: string;
  /** Detailed per-field or per-item errors for batch/validation failures. */
  errors?: {
    /** Human-readable description of the specific error. */
    message?: string;
    /** The input field or property that caused the error. */
    in?: string;
    /** Machine-readable error code. */
    code?: string;
    /** Optional sub-category for nested errors. */
    subCategory?: string;
    /** Structured context data for the error (e.g., allowed values). */
    context?: Record<string, string[]>;
  }[];
  /** Arbitrary context object with additional error metadata. */
  context?: Record<string, unknown>;
  /** Links to documentation or related resources. */
  links?: Record<string, string>;
}

/**
 * A HubSpot CRM object (deal, contact, company, etc.) returned by v3 endpoints.
 *
 * @example
 * const deal: SimplePublicObject = {
 *   id: "12345",
 *   properties: { dealname: "Acme Corp", amount: "5000" },
 *   createdAt: "2024-01-01T00:00:00.000Z",
 *   updatedAt: "2024-06-01T00:00:00.000Z"
 * };
 */
export interface SimplePublicObject {
  /** HubSpot internal record ID. */
  id: string;
  /** Key-value map of CRM properties. Values may be null for unset properties. */
  properties: Record<string, string | null>;
  /** ISO timestamp when this object was created. */
  createdAt: string;
  /** ISO timestamp when this object was last modified. */
  updatedAt: string;
  /** Whether this record has been archived (soft-deleted). */
  archived?: boolean;
  /** ISO timestamp when this record was archived, if applicable. */
  archivedAt?: string;
  /** Associated objects, keyed by association type. */
  associations?: Record<string, unknown>;
}

/**
 * Generic batch input wrapper for HubSpot batch write endpoints.
 *
 * @template T - The type of each input item.
 *
 * @example
 * const input: BatchInput<{ id: string }> = {
 *   inputs: [{ id: "123" }, { id: "456" }]
 * };
 */
export interface BatchInput<T> {
  /** The items to process in this batch request. */
  inputs: T[];
}
