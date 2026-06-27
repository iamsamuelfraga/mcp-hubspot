/**
 * Zod schemas for HubSpot Properties API v3.
 *
 * Covers listing, retrieving, and creating CRM object properties.
 *
 * @see {@link https://developers.hubspot.com/docs/api/crm/properties}
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Property field types
// ---------------------------------------------------------------------------

/**
 * HubSpot property data type.
 * Determines how the value is stored and validated.
 */
export const PropertyTypeSchema = z
  .enum([
    'string',
    'number',
    'date',
    'datetime',
    'enumeration',
    'bool',
    'json',
    'object_coordinates',
    'phone_number',
  ])
  .describe(
    'Data type of the property. ' +
      '"string" for text, "number" for numeric, "date"/"datetime" for timestamps, ' +
      '"enumeration" for dropdown lists, "bool" for checkboxes.'
  );

/**
 * HubSpot property field type (controls UI rendering).
 * Must be compatible with the chosen `type`.
 */
export const PropertyFieldTypeSchema = z
  .enum([
    'textarea',
    'text',
    'date',
    'file',
    'number',
    'select',
    'radio',
    'checkbox',
    'booleancheckbox',
    'calculation_equation',
    'html',
    'phonenumber',
  ])
  .describe(
    'UI field type. Common combinations: ' +
      'type=string + fieldType=text/textarea/html, ' +
      'type=enumeration + fieldType=select/radio/checkbox, ' +
      'type=bool + fieldType=booleancheckbox, ' +
      'type=number + fieldType=number, ' +
      'type=date + fieldType=date.'
  );

// ---------------------------------------------------------------------------
// Property option (for enumeration properties)
// ---------------------------------------------------------------------------

/**
 * A single option in an enumeration property.
 */
export const PropertyOptionSchema = z.object({
  label: z.string().min(1).describe('Display label for the option'),
  value: z
    .string()
    .min(1)
    .describe('Internal value stored in HubSpot (must be unique within the property)'),
  displayOrder: z
    .number()
    .int()
    .optional()
    .describe('Position of this option in the dropdown (lower = first)'),
  hidden: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether this option is hidden from the UI'),
});

/** TypeScript type for a property option. */
export type PropertyOption = z.infer<typeof PropertyOptionSchema>;

// ---------------------------------------------------------------------------
// List properties
// ---------------------------------------------------------------------------

/**
 * Input schema for listing all properties of a CRM object type.
 * Maps to GET /crm/v3/properties/{objectType}.
 */
export const ListPropertiesSchema = z.object({
  objectType: z
    .string()
    .min(1)
    .describe(
      'CRM object type whose properties to list. ' +
        'Standard types: "contacts", "companies", "deals", "tickets", "products", ' +
        '"line_items", "quotes", "calls", "meetings", "tasks", "notes", "emails". ' +
        'Custom objects use their numeric object type ID.'
    ),
  archived: z
    .boolean()
    .default(false)
    .describe('Whether to include archived (deleted) properties. Default false.'),
});

/** TypeScript type inferred from ListPropertiesSchema. */
export type ListPropertiesInput = z.infer<typeof ListPropertiesSchema>;

// ---------------------------------------------------------------------------
// Get a single property
// ---------------------------------------------------------------------------

/**
 * Input schema for retrieving a specific property by name.
 * Maps to GET /crm/v3/properties/{objectType}/{propertyName}.
 */
export const GetPropertySchema = z.object({
  objectType: z
    .string()
    .min(1)
    .describe('CRM object type (e.g., "contacts", "deals", "companies")'),
  propertyName: z
    .string()
    .min(1)
    .describe(
      'Internal name of the property (e.g., "dealname", "amount", "hs_deal_stage_probability")'
    ),
});

/** TypeScript type inferred from GetPropertySchema. */
export type GetPropertyInput = z.infer<typeof GetPropertySchema>;

// ---------------------------------------------------------------------------
// Create a property
// ---------------------------------------------------------------------------

/**
 * Input schema for creating a new custom property on a CRM object type.
 * Maps to POST /crm/v3/properties/{objectType}.
 */
export const CreatePropertySchema = z.object({
  objectType: z
    .string()
    .min(1)
    .describe('CRM object type to add the property to (e.g., "contacts", "deals", "companies")'),
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/)
    .describe(
      'Internal property name (lowercase letters, numbers, underscores only). ' +
        'This is the key used when reading/writing the property on objects. ' +
        'Cannot be changed after creation.'
    ),
  label: z
    .string()
    .min(1)
    .describe('Display label shown in HubSpot UI and reports (can include spaces and capitals)'),
  type: PropertyTypeSchema,
  fieldType: PropertyFieldTypeSchema,
  groupName: z
    .string()
    .min(1)
    .describe(
      'Property group this field belongs to (e.g., "dealinformation", "contactinformation"). ' +
        'Use the Properties API to list existing groups.'
    ),
  description: z
    .string()
    .optional()
    .describe('Optional description explaining the purpose of this property'),
  options: z
    .array(PropertyOptionSchema)
    .optional()
    .describe(
      'Required when type=enumeration. Array of selectable options. ' +
        'Each option needs a unique value and a display label.'
    ),
  displayOrder: z
    .number()
    .int()
    .optional()
    .describe('Position of this property in forms and records (lower = earlier)'),
  hasUniqueValue: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Whether this property must be unique across all records of this object type. ' +
        'Useful for external IDs.'
    ),
  hidden: z.boolean().optional().default(false).describe('Whether to hide this property in the UI'),
  formField: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether this property can be used in HubSpot forms'),
});

/** TypeScript type inferred from CreatePropertySchema. */
export type CreatePropertyInput = z.infer<typeof CreatePropertySchema>;
