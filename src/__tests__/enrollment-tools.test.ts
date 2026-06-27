/**
 * Tests for Automation v2 enrollment tools and v3 legacy workflow read tools.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { getEnrollmentTools } from '../tools/enrollment/index.js';
import { mockFetchSuccess, mockFetchError } from './mock-client.js';

describe('Enrollment Tools', () => {
  let client: HubSpotClient;
  let tools: ReturnType<typeof getEnrollmentTools>;

  beforeEach(() => {
    client = new HubSpotClient({ accessToken: 'test-token' });
    tools = getEnrollmentTools(client);
  });

  describe('hubspot_enrollment_enroll', () => {
    it('posts to the correct URL and returns { success, workflowId, email }', async () => {
      const fetchMock = mockFetchSuccess({}, 204);
      const tool = tools.find((t) => t.name === 'hubspot_enrollment_enroll')!;

      const result = await tool.handler({ workflowId: 12345, email: 'test@example.com' });

      expect(result).toEqual({ success: true, workflowId: 12345, email: 'test@example.com' });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(
        '/automation/v2/workflows/12345/enrollments/contacts/test%40example.com'
      );
    });

    it('properly URL-encodes special characters in the email (+ sign)', async () => {
      const fetchMock = mockFetchSuccess({}, 204);
      const tool = tools.find((t) => t.name === 'hubspot_enrollment_enroll')!;

      await tool.handler({ workflowId: 12345, email: 'test+tag@example.com' });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('test%2Btag%40example.com');
    });

    it('throws ZodError when email is invalid', async () => {
      const tool = tools.find((t) => t.name === 'hubspot_enrollment_enroll')!;

      await expect(tool.handler({ workflowId: 12345, email: 'not-an-email' })).rejects.toThrow();
    });

    it('returns error object on 404 without throwing', async () => {
      mockFetchError({ message: 'Workflow not found', category: 'OBJECT_NOT_FOUND' }, 404);
      const tool = tools.find((t) => t.name === 'hubspot_enrollment_enroll')!;

      const result = await tool.handler({ workflowId: 99999, email: 'test@example.com' });

      expect(result).toHaveProperty('isError', true);
    });
  });

  describe('hubspot_enrollment_unenroll', () => {
    it('deletes to the correct URL and returns { success, workflowId, email }', async () => {
      const fetchMock = mockFetchSuccess({}, 204);
      const tool = tools.find((t) => t.name === 'hubspot_enrollment_unenroll')!;

      const result = await tool.handler({ workflowId: 12345, email: 'test@example.com' });

      expect(result).toEqual({ success: true, workflowId: 12345, email: 'test@example.com' });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(
        '/automation/v2/workflows/12345/enrollments/contacts/test%40example.com'
      );
    });

    it('throws ZodError when workflowId is missing', async () => {
      const tool = tools.find((t) => t.name === 'hubspot_enrollment_unenroll')!;

      await expect(tool.handler({ email: 'test@example.com' })).rejects.toThrow();
    });
  });

  describe('hubspot_enrollment_get_enrollments', () => {
    it('gets enrollments for a contact by VID and returns the API response', async () => {
      const enrollmentsResponse = { workflows: [{ id: 1 }, { id: 2 }] };
      const fetchMock = mockFetchSuccess(enrollmentsResponse);
      const tool = tools.find((t) => t.name === 'hubspot_enrollment_get_enrollments')!;

      const result = await tool.handler({ vid: '123' });

      expect(result).toEqual(enrollmentsResponse);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/automation/v2/enrollments/contacts/123');
    });
  });

  describe('hubspot_workflows_v3_list', () => {
    it('lists workflows from the v3 API and returns the API response', async () => {
      const workflowsResponse = { workflows: [{ id: 1, name: 'Test Workflow' }], total: 1 };
      const fetchMock = mockFetchSuccess(workflowsResponse);
      const tool = tools.find((t) => t.name === 'hubspot_workflows_v3_list')!;

      const result = await tool.handler({});

      expect(result).toEqual(workflowsResponse);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/automation/v3/workflows');
    });
  });

  describe('hubspot_workflows_v3_get', () => {
    it('gets a single workflow by ID and returns the API response', async () => {
      const workflowResponse = { id: 456, name: 'My Workflow' };
      const fetchMock = mockFetchSuccess(workflowResponse);
      const tool = tools.find((t) => t.name === 'hubspot_workflows_v3_get')!;

      const result = await tool.handler({ workflowId: 456 });

      expect(result).toEqual(workflowResponse);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/automation/v3/workflows/456');
    });
  });
});
