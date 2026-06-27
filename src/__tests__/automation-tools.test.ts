/**
 * Tests for Automation v4 callback completion tools.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { getAutomationTools } from '../tools/automation/index.js';
import { mockFetchSuccess, mockFetchError } from './mock-client.js';

describe('Automation Tools', () => {
  let client: HubSpotClient;
  let tools: ReturnType<typeof getAutomationTools>;

  beforeEach(() => {
    client = new HubSpotClient({ accessToken: 'test-token' });
    tools = getAutomationTools(client);
  });

  describe('hubspot_automation_callback_complete', () => {
    it('posts to the correct URL and returns { success, callbackId }', async () => {
      const fetchMock = mockFetchSuccess({}, 204);
      const tool = tools.find((t) => t.name === 'hubspot_automation_callback_complete')!;

      const result = await tool.handler({
        callbackId: 'cb-123',
        outputFields: { hs_execution_state: 'SUCCESS' },
      });

      expect(result).toEqual({ success: true, callbackId: 'cb-123' });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/automation/v4/actions/callbacks/cb-123/complete');
    });

    it('returns error object on 404 without throwing', async () => {
      mockFetchError({ message: 'Callback not found', category: 'OBJECT_NOT_FOUND' }, 404);
      const tool = tools.find((t) => t.name === 'hubspot_automation_callback_complete')!;

      const result = await tool.handler({
        callbackId: 'cb-missing',
        outputFields: { hs_execution_state: 'SUCCESS' },
      });

      expect(result).toHaveProperty('isError', true);
    });

    it('throws ZodError when callbackId is missing', async () => {
      const tool = tools.find((t) => t.name === 'hubspot_automation_callback_complete')!;

      await expect(
        tool.handler({ outputFields: { hs_execution_state: 'SUCCESS' } })
      ).rejects.toThrow();
    });

    it('throws ZodError when hs_execution_state is an invalid value', async () => {
      const tool = tools.find((t) => t.name === 'hubspot_automation_callback_complete')!;

      await expect(
        tool.handler({
          callbackId: 'cb-123',
          outputFields: { hs_execution_state: 'INVALID_STATE' },
        })
      ).rejects.toThrow();
    });
  });

  describe('hubspot_automation_callback_complete_batch', () => {
    it('posts inputs array to the correct URL and returns { success, count }', async () => {
      const fetchMock = mockFetchSuccess({}, 204);
      const tool = tools.find((t) => t.name === 'hubspot_automation_callback_complete_batch')!;

      const callbackInputs = [
        { callbackId: 'cb-1', outputFields: { hs_execution_state: 'SUCCESS' } },
        { callbackId: 'cb-2', outputFields: { hs_execution_state: 'FAIL_CONTINUE' } },
      ];

      const result = await tool.handler({ callbackInputs });

      expect(result).toEqual({ success: true, count: 2 });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/automation/v4/actions/callbacks/complete');
    });

    it('throws ZodError when callbackInputs is missing', async () => {
      const tool = tools.find((t) => t.name === 'hubspot_automation_callback_complete_batch')!;

      await expect(tool.handler({})).rejects.toThrow();
    });

    it('returns isError when POST fails', async () => {
      mockFetchError({ status: 'error', message: 'Server error' }, 500);
      const tool = tools.find((t) => t.name === 'hubspot_automation_callback_complete_batch')!;

      const result = (await tool.handler({
        callbackInputs: [{ callbackId: 'cb-1', outputFields: { hs_execution_state: 'SUCCESS' } }],
      })) as { isError: boolean };

      expect(result.isError).toBe(true);
    });
  });
});
