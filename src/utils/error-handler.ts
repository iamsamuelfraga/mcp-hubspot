/**
 * HubSpot API error handling utilities.
 *
 * Provides:
 * - `HubSpotApiError` – a typed Error subclass capturing HubSpot-specific error metadata.
 * - `parseHubSpotError` – parses raw API error bodies into `HubSpotApiError`.
 * - `handleToolError` – converts any thrown error into an MCP-compatible error response.
 */
import { type HubSpotErrorModel } from '../types/hubspot-api.js';

/**
 * Structured error thrown when the HubSpot API returns a non-2xx response.
 *
 * Extends the built-in Error with HubSpot-specific fields so callers can
 * distinguish API errors from unexpected runtime errors.
 *
 * @example
 * try {
 *   await client.get('/crm/v3/objects/deals/999');
 * } catch (err) {
 *   if (err instanceof HubSpotApiError && err.statusCode === 404) {
 *     console.log('Deal not found:', err.correlationId);
 *   }
 * }
 */
export class HubSpotApiError extends Error {
  /**
   * Creates a new HubSpotApiError.
   *
   * @param message - Human-readable description of the failure.
   * @param statusCode - HTTP status code returned by the API.
   * @param endpoint - The request path that failed (e.g., `/crm/v3/objects/deals`).
   * @param category - HubSpot error category (e.g., VALIDATION_ERROR, RATE_LIMIT).
   * @param correlationId - UUID from HubSpot for support correlation.
   * @param errors - Detailed per-field or per-item validation errors.
   * @param retryAfter - Seconds to wait before retrying (present on 429 responses).
   */
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint?: string,
    public readonly category?: string,
    public readonly correlationId?: string,
    public readonly errors?: {
      message?: string;
      code?: string;
      context?: Record<string, string[]>;
    }[],
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'HubSpotApiError';
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Returns a user-friendly message suitable for display in the MCP tool response.
   * Includes actionable guidance based on the HTTP status code.
   * Never includes the access token.
   *
   * @returns A formatted, multi-line string describing the error and suggested remediation.
   */
  toUserFriendlyMessage(): string {
    const parts: string[] = [`Error: ${this.message}`];

    if (this.statusCode === 401) {
      parts.push(
        '\nAuthentication failed. Please check your HUBSPOT_ACCESS_TOKEN environment variable.',
        'Ensure your HubSpot Private App has the required scopes enabled.'
      );
    } else if (this.statusCode === 403) {
      parts.push(
        '\nAccess denied. Your Private App token may be missing required scopes.',
        'Check the HubSpot Private App settings and ensure all needed scopes are granted.'
      );
    } else if (this.statusCode === 404) {
      parts.push('\nResource not found. The requested HubSpot object may have been deleted.');
    } else if (this.statusCode === 429) {
      const retryMsg = this.retryAfter ? ` Retry after ${this.retryAfter}s.` : '';
      parts.push(`\nRate limit exceeded.${retryMsg} Please try again in a few moments.`);
    } else if (this.statusCode >= 500) {
      parts.push('\nHubSpot server error. Please try again later.');
    }

    if (this.category) {
      parts.push(`\nCategory: ${this.category}`);
    }

    if (this.correlationId) {
      parts.push(`\nCorrelation ID: ${this.correlationId}`);
    }

    if (this.endpoint) {
      parts.push(`\nEndpoint: ${this.endpoint}`);
    }

    if (this.errors && this.errors.length > 0) {
      parts.push('\nDetails:');
      for (const err of this.errors) {
        if (err.message) {
          parts.push(`  - ${err.message}${err.code ? ` (${err.code})` : ''}`);
        }
      }
    }

    return parts.join('\n');
  }
}

/**
 * Parses a raw HubSpot API error response into a `HubSpotApiError`.
 *
 * Handles both well-formed HubSpot error objects and malformed/unexpected
 * body shapes by falling back to a generic error message.
 *
 * @param status - HTTP status code of the failed response.
 * @param body - Parsed response body (may be any shape).
 * @param endpoint - The request path that failed.
 * @param retryAfter - Seconds until retry is allowed (from Retry-After header).
 * @returns A HubSpotApiError populated with all available error details.
 *
 * @example
 * const error = parseHubSpotError(404, responseBody, '/crm/v3/objects/deals/999');
 */
export function parseHubSpotError(
  status: number,
  body: unknown,
  endpoint: string,
  retryAfter?: number
): HubSpotApiError {
  // Attempt to interpret body as the documented HubSpot error model
  if (typeof body === 'object' && body !== null) {
    const errorModel = body as HubSpotErrorModel;
    return new HubSpotApiError(
      errorModel.message ?? `HubSpot API error (HTTP ${status})`,
      status,
      endpoint,
      errorModel.category,
      errorModel.correlationId,
      errorModel.errors?.map((e) => ({
        message: e.message,
        code: e.code,
        context: e.context,
      })),
      retryAfter
    );
  }

  // Fallback for non-JSON or unexpected body shapes
  const message =
    typeof body === 'string' && body.length > 0 ? body : `HubSpot API error (HTTP ${status})`;
  return new HubSpotApiError(
    message,
    status,
    endpoint,
    undefined,
    undefined,
    undefined,
    retryAfter
  );
}

/**
 * Converts any thrown error into an MCP-compatible tool error response.
 *
 * This function is the catch-all in the CallTool handler. It maps known
 * error types to actionable messages and wraps unknown errors generically.
 *
 * @param error - The caught error (may be any type).
 * @returns An MCP content array with `isError: true` suitable for returning
 *          directly from the CallTool handler.
 *
 * @example
 * try {
 *   const result = await tool.handler(args);
 *   return { content: [{ type: 'text', text: JSON.stringify(result) }] };
 * } catch (error) {
 *   return handleToolError(error);
 * }
 */
export function handleToolError(error: unknown): {
  content: [{ type: 'text'; text: string }];
  isError: true;
} {
  if (error instanceof HubSpotApiError) {
    return {
      content: [{ type: 'text', text: error.toUserFriendlyMessage() }],
      isError: true,
    };
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: 'text',
        text: `Unexpected error: ${errorMessage}\n\nPlease report this issue if it persists.`,
      },
    ],
    isError: true,
  };
}
