/**
 * Zod property schemas for HubSpot Engagement objects.
 *
 * Engagements represent sales activities logged against CRM objects:
 * Calls, Meetings, Tasks, Notes, and Emails.
 *
 * Common requirement:
 * - `hs_timestamp` is REQUIRED for all engagement creates.
 *   For tasks it represents the due date; for calls/meetings it is the activity time.
 *   Provide as epoch milliseconds string (e.g., "1735689600000") or ISO 8601 string.
 * - `hubspot_owner_id` is strongly recommended to attribute activities to a rep.
 *
 * All schemas use `z.record(z.string())` for the properties map to allow
 * arbitrary custom properties (HubSpot record passthrough).
 *
 * @see {@link https://developers.hubspot.com/docs/api/crm/calls}
 * @see {@link https://developers.hubspot.com/docs/api/crm/meetings}
 * @see {@link https://developers.hubspot.com/docs/api/crm/tasks}
 * @see {@link https://developers.hubspot.com/docs/api/crm/notes}
 * @see {@link https://developers.hubspot.com/docs/api/crm/email}
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared engagement property base
// ---------------------------------------------------------------------------

/**
 * Properties common to ALL engagement types.
 *
 * - `hs_timestamp` (required on create): Activity timestamp as epoch ms string or ISO 8601.
 *   For tasks: represents the due date.
 * - `hubspot_owner_id`: HubSpot user ID of the responsible rep.
 */
export const EngagementCommonSchema = z.object({
  hs_timestamp: z
    .string()
    .describe(
      'Activity timestamp as epoch milliseconds string (e.g., "1735689600000") or ISO 8601. ' +
        'REQUIRED when creating any engagement. For tasks, this is the due date.'
    ),
  hubspot_owner_id: z.string().optional().describe('HubSpot user ID of the responsible sales rep.'),
});

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/**
 * Key properties for HubSpot Call engagement objects.
 *
 * Well-known properties (in addition to common):
 * - `hs_call_title`: Call subject / title.
 * - `hs_call_body`: Call notes / outcome.
 * - `hs_call_duration`: Duration in milliseconds (string).
 * - `hs_call_direction`: INBOUND or OUTBOUND.
 * - `hs_call_status`: BUSY, CALLING_CRM_USER, CANCELED, COMPLETED, CONNECTING, FAILED,
 *                     IN_PROGRESS, MISSED, NO_ANSWER, QUEUED, RINGING.
 * - `hs_call_disposition`: Outcome disposition ID (portal-specific GUID).
 * - `hs_call_from_number`: Caller phone number (E.164 format).
 * - `hs_call_to_number`: Callee phone number (E.164 format).
 * - `hs_call_recording_url`: URL to the call recording (must be accessible by HubSpot).
 */
export const CallPropertiesSchema = z
  .record(z.string())
  .describe(
    'Call properties. hs_timestamp is REQUIRED. Key fields: hs_call_title, hs_call_body, ' +
      'hs_call_duration (ms string), hs_call_direction (INBOUND/OUTBOUND), hs_call_status, ' +
      'hs_call_disposition, hs_call_from_number, hs_call_to_number, hs_call_recording_url.'
  );

/**
 * Zod schema for creating a HubSpot Call engagement.
 */
export const CreateCallSchema = EngagementCommonSchema.extend({
  hs_call_title: z.string().optional().describe('Call title or subject.'),
  hs_call_body: z.string().optional().describe('Call notes or outcome summary.'),
  hs_call_duration: z.string().optional().describe('Call duration in milliseconds as string.'),
  hs_call_direction: z
    .enum(['INBOUND', 'OUTBOUND'])
    .optional()
    .describe('Whether the call was inbound or outbound.'),
  hs_call_status: z
    .enum([
      'BUSY',
      'CALLING_CRM_USER',
      'CANCELED',
      'COMPLETED',
      'CONNECTING',
      'FAILED',
      'IN_PROGRESS',
      'MISSED',
      'NO_ANSWER',
      'QUEUED',
      'RINGING',
    ])
    .optional()
    .describe('Call status/outcome.'),
  hs_call_disposition: z
    .string()
    .optional()
    .describe('Outcome disposition ID (portal-specific GUID).'),
  hs_call_from_number: z
    .string()
    .optional()
    .describe('Caller phone number in E.164 format (e.g., "+15551234567").'),
  hs_call_to_number: z
    .string()
    .optional()
    .describe('Callee phone number in E.164 format (e.g., "+15559876543").'),
  hs_call_recording_url: z
    .string()
    .url()
    .optional()
    .describe('URL to the call recording (must be publicly accessible by HubSpot).'),
});

/** TypeScript type for call creation input. */
export type CreateCallInput = z.infer<typeof CreateCallSchema>;

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

/**
 * Key properties for HubSpot Meeting engagement objects.
 *
 * Well-known properties (in addition to common):
 * - `hs_meeting_title`: Meeting subject.
 * - `hs_meeting_body`: Meeting description / agenda.
 * - `hs_meeting_start_time`: Meeting start time (epoch ms string).
 * - `hs_meeting_end_time`: Meeting end time (epoch ms string).
 * - `hs_meeting_location`: Physical or virtual meeting location.
 * - `hs_meeting_outcome`: Meeting result (COMPLETED, CANCELLED, NO_SHOW, RESCHEDULED).
 * - `hs_internal_meeting_notes`: Private notes not shared with attendees.
 */
export const MeetingPropertiesSchema = z
  .record(z.string())
  .describe(
    'Meeting properties. hs_timestamp is REQUIRED. Key fields: hs_meeting_title, hs_meeting_body, ' +
      'hs_meeting_start_time (epoch ms), hs_meeting_end_time (epoch ms), hs_meeting_location, ' +
      'hs_meeting_outcome (COMPLETED/CANCELLED/NO_SHOW/RESCHEDULED).'
  );

/**
 * Zod schema for creating a HubSpot Meeting engagement.
 */
export const CreateMeetingSchema = EngagementCommonSchema.extend({
  hs_meeting_title: z.string().optional().describe('Meeting subject or title.'),
  hs_meeting_body: z.string().optional().describe('Meeting description or agenda.'),
  hs_meeting_start_time: z.string().optional().describe('Start time as epoch milliseconds string.'),
  hs_meeting_end_time: z.string().optional().describe('End time as epoch milliseconds string.'),
  hs_meeting_location: z.string().optional().describe('Meeting location (physical or URL).'),
  hs_meeting_outcome: z
    .enum(['COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'])
    .optional()
    .describe('Meeting result.'),
  hs_internal_meeting_notes: z
    .string()
    .optional()
    .describe('Private meeting notes not shared with attendees.'),
});

/** TypeScript type for meeting creation input. */
export type CreateMeetingInput = z.infer<typeof CreateMeetingSchema>;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * Key properties for HubSpot Task engagement objects.
 *
 * Note: `hs_timestamp` represents the task DUE DATE, not an activity timestamp.
 *
 * Well-known properties (in addition to common):
 * - `hs_task_subject` (required): Task title.
 * - `hs_task_body`: Task description.
 * - `hs_task_status`: NOT_STARTED, IN_PROGRESS, COMPLETED, WAITING, DEFERRED.
 * - `hs_task_priority`: LOW, MEDIUM, HIGH.
 * - `hs_task_type`: EMAIL, CALL, TODO.
 * - `hs_task_completion_date`: When the task was completed (epoch ms string).
 */
export const TaskPropertiesSchema = z
  .record(z.string())
  .describe(
    'Task properties. hs_timestamp is REQUIRED (= due date). Key fields: hs_task_subject (required), ' +
      'hs_task_body, hs_task_status (NOT_STARTED/IN_PROGRESS/COMPLETED/WAITING/DEFERRED), ' +
      'hs_task_priority (LOW/MEDIUM/HIGH), hs_task_type (EMAIL/CALL/TODO).'
  );

/**
 * Zod schema for creating a HubSpot Task engagement.
 */
export const CreateTaskSchema = EngagementCommonSchema.extend({
  hs_task_subject: z.string().min(1).describe('Task title or subject (required).'),
  hs_task_body: z.string().optional().describe('Task description or notes.'),
  hs_task_status: z
    .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'WAITING', 'DEFERRED'])
    .optional()
    .describe('Task status. Default: NOT_STARTED.'),
  hs_task_priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().describe('Task priority level.'),
  hs_task_type: z.enum(['EMAIL', 'CALL', 'TODO']).optional().describe('Task activity type.'),
});

/** TypeScript type for task creation input. */
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/**
 * Key properties for HubSpot Note engagement objects.
 *
 * Well-known properties (in addition to common):
 * - `hs_note_body` (required): Note content (HTML supported).
 * - `hs_attachment_ids`: Semicolon-separated list of HubSpot file IDs attached to this note.
 */
export const NotePropertiesSchema = z
  .record(z.string())
  .describe(
    'Note properties. hs_timestamp is REQUIRED. Key fields: hs_note_body (required, HTML supported), ' +
      'hs_attachment_ids (semicolon-separated HubSpot file IDs).'
  );

/**
 * Zod schema for creating a HubSpot Note engagement.
 */
export const CreateNoteSchema = EngagementCommonSchema.extend({
  hs_note_body: z.string().min(1).describe('Note content. HTML is supported (required).'),
  hs_attachment_ids: z
    .string()
    .optional()
    .describe('Semicolon-separated HubSpot file IDs to attach to this note.'),
});

/** TypeScript type for note creation input. */
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

/**
 * Key properties for HubSpot Email engagement objects.
 *
 * Email engagements log email activity in the CRM timeline. They do NOT send
 * actual emails — use HubSpot Marketing Email for that.
 *
 * Well-known properties (in addition to common):
 * - `hs_email_direction`: INBOUND (received) or OUTBOUND (sent).
 * - `hs_email_status`: BOUNCED, FAILED, SCHEDULED, SENDING, SENT.
 * - `hs_email_subject`: Email subject line.
 * - `hs_email_text`: Plain-text email body.
 * - `hs_email_html`: HTML email body.
 * - `hs_email_headers`: JSON-encoded email headers object.
 *
 * Additional scope required: `sales-email-read` to read email body content.
 */
export const EmailPropertiesSchema = z
  .record(z.string())
  .describe(
    'Email engagement properties. hs_timestamp is REQUIRED. Key fields: hs_email_direction ' +
      '(INBOUND/OUTBOUND), hs_email_status, hs_email_subject, hs_email_text, hs_email_html, ' +
      'hs_email_headers (JSON string). Reading body content requires "sales-email-read" scope.'
  );

/**
 * Zod schema for creating a HubSpot Email engagement.
 */
export const CreateEmailSchema = EngagementCommonSchema.extend({
  hs_email_direction: z
    .enum(['INBOUND', 'OUTBOUND'])
    .optional()
    .describe('Whether the email was received (INBOUND) or sent (OUTBOUND).'),
  hs_email_status: z
    .enum(['BOUNCED', 'FAILED', 'SCHEDULED', 'SENDING', 'SENT'])
    .optional()
    .describe('Email delivery status.'),
  hs_email_subject: z.string().optional().describe('Email subject line.'),
  hs_email_text: z.string().optional().describe('Plain-text email body.'),
  hs_email_html: z.string().optional().describe('HTML email body.'),
  hs_email_headers: z
    .string()
    .optional()
    .describe(
      'Email headers serialized as a JSON string ' +
        '(e.g., \'{"from": {"email": "rep@company.com"}}\').'
    ),
});

/** TypeScript type for email engagement creation input. */
export type CreateEmailInput = z.infer<typeof CreateEmailSchema>;
