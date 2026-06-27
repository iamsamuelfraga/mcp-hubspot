/**
 * Zod property schemas for HubSpot Sales CRM objects.
 *
 * Each exported schema documents the key properties for a specific object type.
 * Because HubSpot portals support unlimited custom properties, all schemas use
 * `z.record(z.string())` — known properties are listed via `.describe()` for
 * LLM guidance and documentation; arbitrary additional properties are permitted.
 *
 * Usage: import these schemas in tool handlers that work with specific object
 * types (e.g., `hubspot_quotes_assemble`).
 *
 * @see {@link https://developers.hubspot.com/docs/api/crm/deals}
 * @see {@link https://developers.hubspot.com/docs/api/crm/line-items}
 * @see {@link https://developers.hubspot.com/docs/api/crm/products}
 * @see {@link https://developers.hubspot.com/docs/api/crm/quotes}
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

/**
 * Key properties for HubSpot Deal objects.
 *
 * Well-known properties:
 * - `dealname` (required): Display name of the deal.
 * - `amount`: Expected deal value (string, e.g., "50000").
 * - `dealstage`: Pipeline stage ID (internal name, e.g., "appointmentscheduled").
 * - `closedate`: Expected close date (ISO 8601: YYYY-MM-DD or epoch ms string).
 * - `pipeline`: Pipeline ID; defaults to the default pipeline when omitted.
 * - `hubspot_owner_id`: ID of the HubSpot user who owns this deal.
 * - `description`: Free-text description of the deal.
 * - `hs_deal_stage_probability`: Probability of close (0–100, set by pipeline stage).
 *
 * All additional custom properties are also accepted (HubSpot record passthrough).
 */
export const DealPropertiesSchema = z
  .record(z.string())
  .describe(
    'Deal properties. Key fields: dealname (required), amount, dealstage, closedate, ' +
      'pipeline, hubspot_owner_id, description. Custom properties are also accepted.'
  );

/**
 * Zod schema for creating or updating a HubSpot Deal.
 */
export const CreateDealSchema = z.object({
  dealname: z.string().min(1).describe('Display name of the deal (required).'),
  amount: z.string().optional().describe('Expected value as string (e.g., "50000").'),
  dealstage: z.string().optional().describe('Pipeline stage internal ID.'),
  closedate: z
    .string()
    .optional()
    .describe('Expected close date (ISO 8601 YYYY-MM-DD, or epoch ms as string).'),
  pipeline: z
    .string()
    .optional()
    .describe('Pipeline ID. Defaults to the default pipeline when omitted.'),
  hubspot_owner_id: z.string().optional().describe('ID of the owning HubSpot user.'),
  description: z.string().optional().describe('Free-text description.'),
});

/** TypeScript type for deal creation/update input. */
export type CreateDealInput = z.infer<typeof CreateDealSchema>;

// ---------------------------------------------------------------------------
// Line Items
// ---------------------------------------------------------------------------

/**
 * Key properties for HubSpot Line Item objects.
 *
 * Well-known properties:
 * - `name` (required): Display name of the line item.
 * - `quantity`: Number of units (string).
 * - `price`: Unit price (string, e.g., "99.99").
 * - `hs_product_id`: Associated HubSpot product record ID.
 * - `hs_position_on_quote`: Sort order on the quote (integer as string).
 * - `discount`: Discount amount (string).
 * - `hs_discount_percentage`: Discount as percentage (string).
 * - `hs_recurring_billing_period`: Billing period for recurring items (e.g., "P1M").
 * - `currency`: ISO 4217 currency code (e.g., "EUR").
 */
export const LineItemPropertiesSchema = z
  .record(z.string())
  .describe(
    'Line item properties. Key fields: name (required), quantity, price, hs_product_id, ' +
      'hs_position_on_quote, discount, currency. Custom properties are also accepted.'
  );

/**
 * Zod schema for creating or updating a HubSpot Line Item.
 */
export const CreateLineItemSchema = z.object({
  name: z.string().min(1).describe('Display name of the line item (required).'),
  quantity: z.string().optional().describe('Number of units as string (e.g., "2").'),
  price: z.string().optional().describe('Unit price as string (e.g., "99.99").'),
  hs_product_id: z.string().optional().describe('ID of the associated HubSpot product.'),
  hs_position_on_quote: z
    .string()
    .optional()
    .describe('Sort order on the quote (integer as string, starting at 0).'),
  discount: z.string().optional().describe('Discount amount as string.'),
  hs_discount_percentage: z.string().optional().describe('Discount percentage as string.'),
  hs_recurring_billing_period: z
    .string()
    .optional()
    .describe('ISO 8601 duration for recurring billing (e.g., "P1M" = monthly).'),
  currency: z.string().optional().describe('ISO 4217 currency code (e.g., "USD", "EUR").'),
});

/** TypeScript type for line item creation input. */
export type CreateLineItemInput = z.infer<typeof CreateLineItemSchema>;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * Key properties for HubSpot Product objects.
 *
 * Well-known properties:
 * - `name` (required): Product display name.
 * - `description`: Product description.
 * - `price`: Unit price (string).
 * - `hs_cost_of_goods_sold`: Cost of goods sold (string).
 * - `hs_sku`: Stock-keeping unit identifier.
 * - `hs_recurring_billing_period`: Billing period for subscriptions.
 * - `hubspot_owner_id`: Owning user ID.
 */
export const ProductPropertiesSchema = z
  .record(z.string())
  .describe(
    'Product properties. Key fields: name (required), description, price, hs_cost_of_goods_sold, ' +
      'hs_sku, hs_recurring_billing_period. Custom properties are also accepted.'
  );

/**
 * Zod schema for creating or updating a HubSpot Product.
 */
export const CreateProductSchema = z.object({
  name: z.string().min(1).describe('Product display name (required).'),
  description: z.string().optional().describe('Product description.'),
  price: z.string().optional().describe('Unit price as string (e.g., "49.99").'),
  hs_cost_of_goods_sold: z.string().optional().describe('COGS as string.'),
  hs_sku: z.string().optional().describe('Stock-keeping unit identifier.'),
  hs_recurring_billing_period: z
    .string()
    .optional()
    .describe('ISO 8601 billing period duration (e.g., "P1M").'),
  hubspot_owner_id: z.string().optional().describe('Owning HubSpot user ID.'),
});

/** TypeScript type for product creation input. */
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/**
 * Key properties for HubSpot Quote objects.
 *
 * Well-known properties:
 * - `hs_title` (required): Quote title shown to the customer.
 * - `hs_status`: Quote lifecycle status.
 *   Values: DRAFT, APPROVAL_NOT_NEEDED, PENDING_APPROVAL, APPROVED, REJECTED, PUBLISHED, CLOSED.
 * - `hs_expiration_date`: Quote expiry date (epoch ms as string, or ISO date string).
 * - `hs_quote_amount`: Total quote value; HubSpot calculates from line items when omitted.
 * - `hubspot_owner_id`: Owning HubSpot user ID.
 * - `hs_quote_number`: Human-readable quote reference number.
 * - `hs_currency`: ISO 4217 currency code.
 * - `hs_template_id`: ID of the quote template to use for PDF rendering.
 * - `hs_payment_enabled`: Whether payment can be collected via the quote ('true'/'false').
 * - `hs_locale`: Locale for number/date formatting (e.g., "en-US").
 * - `hs_sender_firstname`, `hs_sender_lastname`, `hs_sender_email`: Sender contact details.
 */
export const QuotePropertiesSchema = z
  .record(z.string())
  .describe(
    'Quote properties. Key fields: hs_title (required), hs_status, hs_expiration_date, ' +
      'hubspot_owner_id, hs_currency, hs_template_id, hs_payment_enabled. ' +
      'Custom properties are also accepted.'
  );

/**
 * Zod schema for creating or updating a HubSpot Quote.
 * Used by `hubspot_quotes_assemble`.
 */
export const CreateQuoteSchema = z.object({
  hs_title: z.string().min(1).describe('Quote title shown to the customer (required).'),
  hs_status: z
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
      'Quote lifecycle status. Default: DRAFT. ' +
        'Must transition to APPROVAL_NOT_NEEDED or APPROVED before publishing.'
    ),
  hs_expiration_date: z
    .string()
    .optional()
    .describe('Expiry date as epoch milliseconds string or ISO 8601 date.'),
  hs_currency: z.string().optional().describe('ISO 4217 currency code (e.g., "USD", "EUR").'),
  hs_template_id: z
    .string()
    .optional()
    .describe('Quote template ID for PDF rendering. Use hubspot_crm_list on quotes templates.'),
  hs_payment_enabled: z
    .enum(['true', 'false'])
    .optional()
    .describe("Whether to enable online payment on this quote ('true'/'false')."),
  hs_locale: z.string().optional().describe('Locale for formatting (e.g., "en-US", "es-ES").'),
  hubspot_owner_id: z.string().optional().describe('ID of the owning HubSpot user.'),
  hs_quote_number: z.string().optional().describe('Human-readable quote reference number.'),
  hs_sender_firstname: z.string().optional().describe('Sender first name.'),
  hs_sender_lastname: z.string().optional().describe('Sender last name.'),
  hs_sender_email: z.string().optional().describe('Sender email address.'),
});

/** TypeScript type for quote creation input (used by `hubspot_quotes_assemble`). */
export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;
