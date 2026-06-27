/**
 * Zod schemas for HubSpot Automation callbacks (v4), Enrollment (v2), and Workflows (v3).
 *
 * Covers:
 * - Completing single and batch async custom-action callbacks (Automation v4)
 * - Enrolling / unenrolling contacts in workflows (Automation v2)
 * - Querying active enrollments for a contact (Automation v2)
 * - Listing and fetching workflow definitions (Automation v3 — legacy)
 *
 * @see {@link https://developers.hubspot.com/docs/api/automation/workflows}
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Automation v4 — callback completion
// ---------------------------------------------------------------------------

/**
 * Input schema for completing a single async custom-action callback.
 * Maps to POST /automation/v4/actions/callbacks/{callbackId}/complete.
 */
export const CallbackCompleteSchema = z.object({
  callbackId: z.string().min(1),
  outputFields: z.object({
    hs_execution_state: z.enum(['SUCCESS', 'FAIL_CONTINUE', 'BLOCK']),
  }),
});

/** TypeScript type inferred from CallbackCompleteSchema. */
export type CallbackCompleteInput = z.infer<typeof CallbackCompleteSchema>;

/**
 * Input schema for completing multiple async custom-action callbacks in bulk.
 * Maps to POST /automation/v4/actions/callbacks/complete.
 */
export const CallbackCompleteBatchSchema = z.object({
  callbackInputs: z.array(
    z.object({
      callbackId: z.string().min(1),
      outputFields: z.object({
        hs_execution_state: z.enum(['SUCCESS', 'FAIL_CONTINUE', 'BLOCK']),
      }),
    })
  ),
});

/** TypeScript type inferred from CallbackCompleteBatchSchema. */
export type CallbackCompleteBatchInput = z.infer<typeof CallbackCompleteBatchSchema>;

// ---------------------------------------------------------------------------
// Automation v2 — enrollment
// ---------------------------------------------------------------------------

/**
 * Input schema for enrolling a contact into a workflow.
 * Maps to POST /automation/v2/workflows/{workflowId}/enrollments/contacts/{email}.
 */
export const EnrollContactSchema = z.object({
  workflowId: z.number().int().positive(),
  email: z.string().email(),
});

/** TypeScript type inferred from EnrollContactSchema. */
export type EnrollContactInput = z.infer<typeof EnrollContactSchema>;

/**
 * Input schema for unenrolling a contact from a workflow.
 * Maps to DELETE /automation/v2/workflows/{workflowId}/enrollments/contacts/{email}.
 */
export const UnenrollContactSchema = z.object({
  workflowId: z.number().int().positive(),
  email: z.string().email(),
});

/** TypeScript type inferred from UnenrollContactSchema. */
export type UnenrollContactInput = z.infer<typeof UnenrollContactSchema>;

/**
 * Input schema for listing all active workflow enrollments for a contact.
 * Maps to GET /automation/v2/enrollments/contacts/{vid}.
 */
export const GetEnrollmentsSchema = z.object({
  vid: z.string().min(1),
});

/** TypeScript type inferred from GetEnrollmentsSchema. */
export type GetEnrollmentsInput = z.infer<typeof GetEnrollmentsSchema>;

// ---------------------------------------------------------------------------
// Automation v3 — workflow definitions (legacy read-only)
// ---------------------------------------------------------------------------

/**
 * Input schema for listing workflows via the legacy v3 API.
 * Maps to GET /automation/v3/workflows.
 */
export const WorkflowsV3ListSchema = z.object({
  offset: z.number().int().optional(),
  limit: z.number().int().min(1).max(100).default(25).optional(),
});

/** TypeScript type inferred from WorkflowsV3ListSchema. */
export type WorkflowsV3ListInput = z.infer<typeof WorkflowsV3ListSchema>;

/**
 * Input schema for fetching a single workflow via the legacy v3 API.
 * Maps to GET /automation/v3/workflows/{workflowId}.
 */
export const WorkflowsV3GetSchema = z.object({
  workflowId: z.number().int().positive(),
});

/** TypeScript type inferred from WorkflowsV3GetSchema. */
export type WorkflowsV3GetInput = z.infer<typeof WorkflowsV3GetSchema>;
