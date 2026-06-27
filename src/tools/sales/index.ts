/**
 * HubSpot Sales-specific tools: Deals merge and Quotes assembly.
 *
 * These tools cover operations that go beyond the generic CRM CRUD pattern:
 *
 * 1. `hubspot_deals_merge` — Merges two deal records into one using the
 *    HubSpot v3 deals merge endpoint. The secondary deal is absorbed into
 *    the primary; all associated contacts, companies, and activities are
 *    re-associated to the surviving record.
 *
 * 2. `hubspot_quotes_assemble` — High-level helper that creates a quote and
 *    atomically associates it to a deal and one or more line items via inline
 *    associations in a single POST. Also accepts an owner ID and template ID
 *    as first-class parameters so callers don't need to know property names.
 *
 * @module tools/sales
 */

import { z } from 'zod';
import { type Tool } from '../../types/common.js';
import { type HubSpotClient } from '../../hubspot-client.js';
import { handleToolError } from '../../utils/error-handler.js';
import { type SimplePublicObject } from '../../types/hubspot-api.js';

// ---------------------------------------------------------------------------
// Shared Association type IDs for Quotes
// ---------------------------------------------------------------------------

/**
 * Default HUBSPOT_DEFINED association type IDs for quote relationships.
 *
 * These are the standard type IDs defined by HubSpot for enterprise portals.
 * They may differ across portals — verify with `hubspot_associations_labels_list`
 * if associations are not created correctly.
 *
 * @see {@link https://developers.hubspot.com/docs/api/crm/associations}
 */
const QUOTE_ASSOCIATION_TYPE_IDS = {
  /** Quote → Deal (HUBSPOT_DEFINED). Verify with hubspot_associations_labels_list if needed. */
  deal: 64,
  /** Quote → Line Item (HUBSPOT_DEFINED). Verify with hubspot_associations_labels_list if needed. */
  lineItem: 67,
} as const;

// ---------------------------------------------------------------------------
// Tool 1: hubspot_deals_merge
// ---------------------------------------------------------------------------

/**
 * Input schema for merging two deals.
 */
const DealsMergeSchema = z.object({
  primaryObjectId: z
    .string()
    .min(1)
    .describe(
      'HubSpot ID of the SURVIVING deal. All associated records (contacts, companies, ' +
        'activities) will be moved to this deal. The primary deal is kept after merge.'
    ),
  objectIdToMerge: z
    .string()
    .min(1)
    .describe(
      'HubSpot ID of the deal to ABSORB and archive. Its properties are merged into ' +
        'the primary deal (primary values take precedence). This deal is archived after merge.'
    ),
});

/**
 * Creates the `hubspot_deals_merge` tool.
 *
 * Endpoint: POST /crm/v3/objects/deals/merge
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for merging two HubSpot deal records.
 */
function buildDealsMergeTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_deals_merge',
    description:
      'Merge two HubSpot deal records into one. The secondary deal is absorbed into the primary: ' +
      'all associated contacts, companies, activities, and line items are moved to the primary deal. ' +
      'Properties from the secondary deal fill in any blanks on the primary (primary values take ' +
      'precedence on conflicts). The secondary deal is then archived. ' +
      'This operation is IRREVERSIBLE — confirm the deal IDs before calling. ' +
      'Required scopes: crm.objects.deals.write.',
    inputSchema: {
      type: 'object',
      properties: {
        primaryObjectId: {
          type: 'string',
          minLength: 1,
          description:
            'HubSpot ID of the SURVIVING deal (kept after merge). ' +
            'Its property values take precedence on conflicts.',
        },
        objectIdToMerge: {
          type: 'string',
          minLength: 1,
          description: 'HubSpot ID of the deal to ABSORB. This deal is archived after the merge.',
        },
      },
      required: ['primaryObjectId', 'objectIdToMerge'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = DealsMergeSchema.parse(rawArgs);

      try {
        const result = await client.post<SimplePublicObject>('/crm/v3/objects/deals/merge', {
          primaryObjectId: args.primaryObjectId,
          objectIdToMerge: args.objectIdToMerge,
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool 2: hubspot_quotes_assemble
// ---------------------------------------------------------------------------

/**
 * Input schema for assembling a quote with its associated deal and line items.
 */
const QuotesAssembleSchema = z.object({
  // --- Quote core properties ---
  title: z.string().min(1).describe('Quote title shown to the customer (hs_title). Required.'),
  status: z
    .enum([
      'DRAFT',
      'APPROVAL_NOT_NEEDED',
      'PENDING_APPROVAL',
      'APPROVED',
      'REJECTED',
      'PUBLISHED',
      'CLOSED',
    ])
    .optional()
    .default('DRAFT')
    .describe(
      'Quote lifecycle status (hs_status). Default: DRAFT. ' +
        'Set to APPROVAL_NOT_NEEDED to make it immediately publishable.'
    ),
  expirationDate: z
    .string()
    .optional()
    .describe(
      'Quote expiry date as epoch milliseconds string or ISO 8601 date (hs_expiration_date). ' +
        'Example: "2026-12-31" or "1798761600000".'
    ),
  currency: z
    .string()
    .optional()
    .describe('ISO 4217 currency code (hs_currency). Example: "USD", "EUR".'),
  quoteNumber: z.string().optional().describe('Human-readable quote reference (hs_quote_number).'),
  locale: z
    .string()
    .optional()
    .describe('Locale for number/date formatting (hs_locale). Example: "en-US".'),
  paymentEnabled: z
    .boolean()
    .optional()
    .describe('Enable online payment collection on this quote (hs_payment_enabled).'),

  // --- Sender details ---
  senderFirstName: z.string().optional().describe('Quote sender first name (hs_sender_firstname).'),
  senderLastName: z.string().optional().describe('Quote sender last name (hs_sender_lastname).'),
  senderEmail: z.string().optional().describe('Quote sender email address (hs_sender_email).'),

  // --- Associations ---
  dealId: z
    .string()
    .min(1)
    .describe(
      'HubSpot deal record ID to associate this quote to. The quote appears on the deal timeline. ' +
        'Uses HUBSPOT_DEFINED association type ID 64 (Quote → Deal). ' +
        'Verify with hubspot_associations_labels_list if the default does not work for your portal.'
    ),
  lineItemIds: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'Array of HubSpot line item record IDs to associate to this quote. ' +
        'At least one line item is required. ' +
        'Uses HUBSPOT_DEFINED association type ID 67 (Quote → Line Item). ' +
        'Create line items first with hubspot_crm_create objectType="line_items".'
    ),

  // --- Optional owner/template ---
  ownerId: z
    .string()
    .optional()
    .describe(
      'HubSpot user ID of the quote owner (hubspot_owner_id). ' +
        'Defaults to the deal owner when omitted.'
    ),
  templateId: z
    .string()
    .optional()
    .describe(
      'Quote template ID for PDF rendering (hs_template_id). ' +
        'Determines the visual layout of the published quote.'
    ),

  // --- Escape hatch for additional properties ---
  additionalProperties: z
    .record(z.string())
    .optional()
    .describe(
      'Additional quote properties to set (key-value map). Merged with the explicit parameters; ' +
        'explicit parameters take precedence. Use for portal-specific custom properties.'
    ),

  // --- Custom association type IDs (advanced override) ---
  dealAssociationTypeId: z
    .number()
    .int()
    .optional()
    .default(QUOTE_ASSOCIATION_TYPE_IDS.deal)
    .describe(
      `HUBSPOT_DEFINED association type ID for Quote → Deal. ` +
        `Default: ${QUOTE_ASSOCIATION_TYPE_IDS.deal}. Override if your portal uses a different ID.`
    ),
  lineItemAssociationTypeId: z
    .number()
    .int()
    .optional()
    .default(QUOTE_ASSOCIATION_TYPE_IDS.lineItem)
    .describe(
      `HUBSPOT_DEFINED association type ID for Quote → Line Item. ` +
        `Default: ${QUOTE_ASSOCIATION_TYPE_IDS.lineItem}. Override if your portal uses a different ID.`
    ),
});

/**
 * Creates the `hubspot_quotes_assemble` tool.
 *
 * This high-level helper creates a HubSpot Quote and atomically associates it to
 * a deal and one or more line items in a single API call using HubSpot v3 inline
 * associations.
 *
 * Flow:
 * 1. Assemble the `properties` object from explicit parameters + `additionalProperties`.
 * 2. Build inline `associations` for the deal and each line item.
 * 3. POST /crm/v3/objects/quotes with properties + associations.
 * 4. Return the created quote record.
 *
 * Association type IDs:
 * - Quote → Deal: 64 (HUBSPOT_DEFINED, default; verify with hubspot_associations_labels_list).
 * - Quote → Line Item: 67 (HUBSPOT_DEFINED, default; verify similarly).
 *
 * Prerequisites:
 * - The deal and all line items must already exist in HubSpot.
 * - Required scopes: crm.objects.quotes.write.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for creating a fully-assembled HubSpot quote.
 */
function buildQuotesAssembleTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_quotes_assemble',
    description:
      'Create a HubSpot Quote and associate it to a deal and line items in a single operation. ' +
      'This is a high-level helper that wraps the standard quote create endpoint with inline ' +
      'associations, saving multiple separate API calls. ' +
      'PREREQUISITES: The deal and all line items must already exist. ' +
      'Create line items first with: hubspot_crm_create objectType="line_items". ' +
      'ASSOCIATION TYPE IDs: Uses HUBSPOT_DEFINED typeId 64 (Quote→Deal) and 67 (Quote→LineItem) by default. ' +
      'Override with dealAssociationTypeId / lineItemAssociationTypeId if your portal uses different IDs. ' +
      'Verify IDs with hubspot_associations_labels_list for fromType=quotes. ' +
      'Required scopes: crm.objects.quotes.write.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          minLength: 1,
          description: 'Quote title shown to the customer (hs_title). Required.',
        },
        status: {
          type: 'string',
          enum: [
            'DRAFT',
            'APPROVAL_NOT_NEEDED',
            'PENDING_APPROVAL',
            'APPROVED',
            'REJECTED',
            'PUBLISHED',
            'CLOSED',
          ],
          default: 'DRAFT',
          description:
            'Quote lifecycle status (hs_status). Default: DRAFT. ' +
            'Use APPROVAL_NOT_NEEDED to make publishable immediately.',
        },
        expirationDate: {
          type: 'string',
          description:
            'Quote expiry (hs_expiration_date) as epoch ms string or ISO 8601 (e.g., "2026-12-31").',
        },
        currency: {
          type: 'string',
          description: 'ISO 4217 currency code (hs_currency), e.g., "USD" or "EUR".',
        },
        quoteNumber: {
          type: 'string',
          description: 'Human-readable reference number (hs_quote_number).',
        },
        locale: {
          type: 'string',
          description: 'Locale for number/date formatting (hs_locale), e.g., "en-US".',
        },
        paymentEnabled: {
          type: 'boolean',
          description: 'Enable online payment collection on this quote (hs_payment_enabled).',
        },
        senderFirstName: {
          type: 'string',
          description: 'Sender first name (hs_sender_firstname).',
        },
        senderLastName: {
          type: 'string',
          description: 'Sender last name (hs_sender_lastname).',
        },
        senderEmail: {
          type: 'string',
          description: 'Sender email address (hs_sender_email).',
        },
        dealId: {
          type: 'string',
          minLength: 1,
          description:
            'HubSpot deal ID to associate the quote to. ' +
            'Uses association typeId 64 (HUBSPOT_DEFINED) by default.',
        },
        lineItemIds: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
          description:
            'Array of line item IDs to include in the quote. At least one required. ' +
            'Uses association typeId 67 (HUBSPOT_DEFINED) by default.',
        },
        ownerId: {
          type: 'string',
          description: 'HubSpot user ID of the quote owner (hubspot_owner_id).',
        },
        templateId: {
          type: 'string',
          description: 'Quote template ID for PDF layout (hs_template_id).',
        },
        additionalProperties: {
          type: 'object',
          description:
            'Additional quote properties as key-value pairs. Merged with explicit params; ' +
            'explicit params take precedence.',
          additionalProperties: { type: 'string' },
        },
        dealAssociationTypeId: {
          type: 'integer',
          default: QUOTE_ASSOCIATION_TYPE_IDS.deal,
          description: `Override for Quote→Deal HUBSPOT_DEFINED association typeId. Default: ${QUOTE_ASSOCIATION_TYPE_IDS.deal}.`,
        },
        lineItemAssociationTypeId: {
          type: 'integer',
          default: QUOTE_ASSOCIATION_TYPE_IDS.lineItem,
          description: `Override for Quote→LineItem HUBSPOT_DEFINED association typeId. Default: ${QUOTE_ASSOCIATION_TYPE_IDS.lineItem}.`,
        },
      },
      required: ['title', 'dealId', 'lineItemIds'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = QuotesAssembleSchema.parse(rawArgs);

      try {
        // Build properties map from explicit parameters + additionalProperties escape hatch
        const properties: Record<string, string> = {
          ...(args.additionalProperties ?? {}),
          hs_title: args.title,
          hs_status: args.status,
        };

        // Conditionally add optional properties (avoid setting null values in HubSpot)
        if (args.expirationDate !== undefined)
          properties['hs_expiration_date'] = args.expirationDate;
        if (args.currency !== undefined) properties['hs_currency'] = args.currency;
        if (args.quoteNumber !== undefined) properties['hs_quote_number'] = args.quoteNumber;
        if (args.locale !== undefined) properties['hs_locale'] = args.locale;
        if (args.paymentEnabled !== undefined) {
          properties['hs_payment_enabled'] = String(args.paymentEnabled);
        }
        if (args.senderFirstName !== undefined)
          properties['hs_sender_firstname'] = args.senderFirstName;
        if (args.senderLastName !== undefined)
          properties['hs_sender_lastname'] = args.senderLastName;
        if (args.senderEmail !== undefined) properties['hs_sender_email'] = args.senderEmail;
        if (args.ownerId !== undefined) properties['hubspot_owner_id'] = args.ownerId;
        if (args.templateId !== undefined) properties['hs_template_id'] = args.templateId;

        // Build inline associations array:
        // [deal association, ...line item associations]
        const associations: {
          to: { id: string };
          types: { associationCategory: string; associationTypeId: number }[];
        }[] = [
          // Associate to the deal
          {
            to: { id: args.dealId },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: args.dealAssociationTypeId,
              },
            ],
          },
          // Associate to each line item
          ...args.lineItemIds.map((lineItemId) => ({
            to: { id: lineItemId },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: args.lineItemAssociationTypeId,
              },
            ],
          })),
        ];

        const result = await client.post<SimplePublicObject>('/crm/v3/objects/quotes', {
          properties,
          associations,
        });

        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Domain entry point
// ---------------------------------------------------------------------------

/**
 * Returns all Sales-specific tools (operations that go beyond generic CRM CRUD).
 *
 * Tools included:
 * - `hubspot_deals_merge`: Merge two deal records.
 * - `hubspot_quotes_assemble`: Create + associate a quote in one shot.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Array of 2 Tool objects ready for MCP registration.
 *
 * @example
 * import { getSalesTools } from './tools/sales/index.js';
 * const tools = getSalesTools(client);
 */
export function getSalesTools(client: HubSpotClient): Tool[] {
  return [buildDealsMergeTool(client), buildQuotesAssembleTool(client)];
}
