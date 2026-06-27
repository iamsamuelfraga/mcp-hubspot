/**
 * Tests for error-handler utilities: parseHubSpotError and handleToolError.
 */
import { describe, it, expect } from 'vitest';
import { HubSpotApiError, parseHubSpotError, handleToolError } from '../utils/error-handler.js';

describe('parseHubSpotError', () => {
  it('parses a well-formed HubSpot error body into HubSpotApiError with all fields', () => {
    const body = {
      status: 'error',
      message: 'Property does not exist',
      correlationId: 'abc-123',
      category: 'VALIDATION_ERROR',
      errors: [{ message: 'Field required', code: 'REQUIRED', context: { field: ['dealname'] } }],
    };

    const error = parseHubSpotError(400, body, '/crm/v3/objects/deals');

    expect(error).toBeInstanceOf(HubSpotApiError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Property does not exist');
    expect(error.correlationId).toBe('abc-123');
    expect(error.category).toBe('VALIDATION_ERROR');
    expect(error.endpoint).toBe('/crm/v3/objects/deals');
    expect(error.errors).toHaveLength(1);
    expect(error.errors?.[0].message).toBe('Field required');
    expect(error.errors?.[0].code).toBe('REQUIRED');
  });

  it('handles a malformed (non-object) body with a generic error message', () => {
    const error = parseHubSpotError(500, 'Internal Server Error', '/crm/v3/objects/deals');

    expect(error).toBeInstanceOf(HubSpotApiError);
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Internal Server Error');
    expect(error.correlationId).toBeUndefined();
    expect(error.category).toBeUndefined();
  });

  it('handles null body with a generic fallback message', () => {
    const error = parseHubSpotError(503, null, '/crm/v3/objects/deals');

    expect(error).toBeInstanceOf(HubSpotApiError);
    expect(error.statusCode).toBe(503);
    expect(error.message).toBe('HubSpot API error (HTTP 503)');
  });

  it('includes retryAfter when provided', () => {
    const error = parseHubSpotError(429, { message: 'Too Many Requests' }, '/path', 30);
    expect(error.retryAfter).toBe(30);
  });

  it('parses body with missing message field using generic fallback', () => {
    const error = parseHubSpotError(
      404,
      { category: 'OBJECT_NOT_FOUND' },
      '/crm/v3/objects/deals/999'
    );
    expect(error.message).toBe('HubSpot API error (HTTP 404)');
    expect(error.category).toBe('OBJECT_NOT_FOUND');
  });
});

describe('handleToolError', () => {
  it('returns auth message for 401 HubSpotApiError', () => {
    const error = new HubSpotApiError('Unauthorized', 401, '/crm/v3/objects/deals');
    const result = handleToolError(error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication failed');
    expect(result.content[0].text).toContain('HUBSPOT_ACCESS_TOKEN');
  });

  it('returns permissions message for 403 HubSpotApiError', () => {
    const error = new HubSpotApiError('Forbidden', 403, '/crm/v3/objects/deals');
    const result = handleToolError(error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Access denied');
    expect(result.content[0].text).toContain('scopes');
  });

  it('returns not found message for 404 HubSpotApiError', () => {
    const error = new HubSpotApiError('Not Found', 404, '/crm/v3/objects/deals/999');
    const result = handleToolError(error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('returns rate limit message for 429 HubSpotApiError', () => {
    const error = new HubSpotApiError('Too Many Requests', 429, '/crm/v3/objects/deals');
    const result = handleToolError(error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Rate limit exceeded');
  });

  it('returns server error message for 500 HubSpotApiError', () => {
    const error = new HubSpotApiError('Internal Server Error', 500, '/crm/v3/objects/deals');
    const result = handleToolError(error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('server error');
  });

  it('returns unexpected error message for a generic Error', () => {
    const error = new Error('Something went wrong');
    const result = handleToolError(error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unexpected error');
    expect(result.content[0].text).toContain('Something went wrong');
  });

  it('returns unexpected error message for a non-Error thrown value', () => {
    const result = handleToolError('string error');

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unexpected error');
  });

  it('includes correlationId in the error message when present', () => {
    const error = new HubSpotApiError(
      'Validation error',
      400,
      '/endpoint',
      'VALIDATION_ERROR',
      'corr-id-456'
    );
    const result = handleToolError(error);
    expect(result.content[0].text).toContain('corr-id-456');
  });
});
