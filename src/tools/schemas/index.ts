/**
 * HubSpot Custom Object Schemas tools: define and manage custom object types.
 *
 * HubSpot ships standard CRM objects (contacts, companies, deals, tickets…), but
 * portals on supported tiers can also define **custom object types** — bespoke
 * record types (e.g. "Properties", "Subscriptions", "Vehicles") with their own
 * properties, display configuration and associations. This toolset wraps the CRM
 * Schemas API v3 so an agent can inspect, create, update and delete those types.
 *
 * A schema is identified by its `objectType` — either the fully-qualified name
 * (e.g. `p1234_my_object`) or the object type id (e.g. `2-12345678`).
 *
 * Tools:
 * 1. `hubspot_schemas_list` — GET /crm/v3/schemas. List every custom object schema.
 * 2. `hubspot_schemas_get` — GET /crm/v3/schemas/{objectType}. Inspect one schema.
 * 3. `hubspot_schemas_create` — POST /crm/v3/schemas. Define a new custom object type.
 * 4. `hubspot_schemas_update` — PATCH /crm/v3/schemas/{objectType}. Update an existing type.
 * 5. `hubspot_schemas_delete` — DELETE /crm/v3/schemas/{objectType}. Delete a custom object type.
 *
 * Required scopes: `crm.schemas.custom.read` (read) / `crm.schemas.custom.write` (write).
 *
 * @see {@link https://developers.hubspot.com/docs/reference/api/crm/objects/object-library}
 * @module tools/schemas
 */

import { z } from 'zod';
import { type Tool } from '../../types/common.js';
import { type HubSpotClient } from '../../hubspot-client.js';
import { handleToolError } from '../../utils/error-handler.js';

// ---------------------------------------------------------------------------
// Schema response types
// ---------------------------------------------------------------------------

/** Singular/plural labels for a custom object type. */
interface ObjectTypeLabels {
  singular?: string;
  plural?: string;
}

/** A single option for an enumeration property. */
interface PropertyOption {
  label: string;
  value: string;
}

/** A property definition belonging to an object schema. */
interface SchemaProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  options?: PropertyOption[];
}

/** An object schema (custom object type) from the CRM Schemas API. */
interface ObjectSchema {
  id?: string;
  name?: string;
  objectTypeId?: string;
  fullyQualifiedName?: string;
  labels?: ObjectTypeLabels;
  primaryDisplayProperty?: string;
  requiredProperties?: string[];
  searchableProperties?: string[];
  secondaryDisplayProperties?: string[];
  properties?: SchemaProperty[];
  associatedObjects?: string[];
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** List response from GET /crm/v3/schemas. */
interface SchemasListResponse {
  results: ObjectSchema[];
}

// ---------------------------------------------------------------------------
// Shared zod fragments
// ---------------------------------------------------------------------------

/** Zod schema for a single enumeration option. */
const PropertyOptionSchema = z.object({
  label: z.string().describe('Human-readable label shown in the UI.'),
  value: z.string().describe('Internal value stored for this option.'),
});

/** Zod schema for a property definition in a create request. */
const SchemaPropertySchema = z.object({
  name: z.string().min(1).describe('Internal property name (lowercase, no spaces). Required.'),
  label: z.string().min(1).describe('Human-readable property label. Required.'),
  type: z
    .string()
    .min(1)
    .describe(
      'Data type: e.g. "string", "number", "enumeration", "date", "datetime", "bool". Required.'
    ),
  fieldType: z
    .string()
    .min(1)
    .describe(
      'Form field control: e.g. "text", "textarea", "number", "select", "checkbox", "date". Required.'
    ),
  options: z
    .array(PropertyOptionSchema)
    .optional()
    .describe(
      'Enumeration options ({label, value}). Required only for "enumeration" type properties.'
    ),
});

/** JSON-schema fragment describing a property definition item. */
const PROPERTY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Internal property name (lowercase, no spaces). Required.',
    },
    label: { type: 'string', description: 'Human-readable property label. Required.' },
    type: {
      type: 'string',
      description:
        'Data type: e.g. "string", "number", "enumeration", "date", "datetime", "bool". Required.',
    },
    fieldType: {
      type: 'string',
      description:
        'Form field control: e.g. "text", "textarea", "number", "select", "checkbox", "date". Required.',
    },
    options: {
      type: 'array',
      description: 'Enumeration options. Required only for "enumeration" type properties.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Human-readable label.' },
          value: { type: 'string', description: 'Internal stored value.' },
        },
        required: ['label', 'value'],
      },
    },
  },
  required: ['name', 'label', 'type', 'fieldType'],
};

// ---------------------------------------------------------------------------
// Tool 1: hubspot_schemas_list
// ---------------------------------------------------------------------------

/** Input schema for listing object schemas. */
const SchemasListSchema = z.object({
  archived: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, return archived (deleted) object schemas instead of active ones. Default: false.'
    ),
});

/**
 * Creates the `hubspot_schemas_list` tool.
 *
 * Endpoint: GET /crm/v3/schemas
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for listing custom object schemas.
 */
function buildSchemasListTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_schemas_list',
    description:
      'List all custom object schemas (custom object types) defined in the HubSpot account. ' +
      'Each result describes a type: its name, objectTypeId, labels, properties and display configuration. ' +
      'Use this to discover which custom object types exist before reading records or creating new ones. ' +
      'Required scope: crm.schemas.custom.read.',
    inputSchema: {
      type: 'object',
      properties: {
        archived: {
          type: 'boolean',
          default: false,
          description: 'Return archived (deleted) schemas instead of active ones. Default: false.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = SchemasListSchema.parse(rawArgs ?? {});

      try {
        const result = await client.get<SchemasListResponse>('/crm/v3/schemas', {
          archived: args.archived,
        });
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool 2: hubspot_schemas_get
// ---------------------------------------------------------------------------

/** Input schema for fetching a single object schema. */
const SchemasGetSchema = z.object({
  objectType: z
    .string()
    .min(1)
    .describe(
      'The custom object type to inspect — its fully-qualified name (e.g. "p1234_my_object") or ' +
        'object type id (e.g. "2-12345678").'
    ),
});

/**
 * Creates the `hubspot_schemas_get` tool.
 *
 * Endpoint: GET /crm/v3/schemas/{objectType}
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for fetching a single custom object schema.
 */
function buildSchemasGetTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_schemas_get',
    description:
      'Fetch a single custom object schema by its objectType (fully-qualified name like "p1234_my_object" ' +
      'or object type id like "2-12345678"). Returns the full definition: labels, properties, ' +
      'requiredProperties, searchableProperties, display properties and associations. ' +
      'Required scope: crm.schemas.custom.read.',
    inputSchema: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          minLength: 1,
          description:
            'Custom object type: fully-qualified name ("p1234_my_object") or object type id ("2-12345678").',
        },
      },
      required: ['objectType'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = SchemasGetSchema.parse(rawArgs);

      try {
        const result = await client.get<ObjectSchema>(
          `/crm/v3/schemas/${encodeURIComponent(args.objectType)}`
        );
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool 3: hubspot_schemas_create
// ---------------------------------------------------------------------------

/** Input schema for creating a new object schema. */
const SchemasCreateSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe('Internal object name (lowercase, no spaces), e.g. "my_object". Required.'),
  labels: z
    .object({
      singular: z.string().min(1).describe('Singular label, e.g. "Property".'),
      plural: z.string().min(1).describe('Plural label, e.g. "Properties".'),
    })
    .describe('Display labels for the object type ({singular, plural}). Required.'),
  primaryDisplayProperty: z
    .string()
    .optional()
    .describe('Name of the property used as the record title. Optional.'),
  requiredProperties: z
    .array(z.string())
    .optional()
    .describe('Property names that must be set when creating a record. Optional.'),
  searchableProperties: z
    .array(z.string())
    .optional()
    .describe('Property names indexed for search. Optional.'),
  secondaryDisplayProperties: z
    .array(z.string())
    .optional()
    .describe('Property names shown alongside the primary display property. Optional.'),
  properties: z
    .array(SchemaPropertySchema)
    .min(1)
    .describe('Property definitions for the object type. At least one is required.'),
  associatedObjects: z
    .array(z.string())
    .optional()
    .describe(
      'Object types this custom object can associate with, e.g. ["CONTACT", "COMPANY"]. Optional.'
    ),
});

/**
 * Creates the `hubspot_schemas_create` tool.
 *
 * Endpoint: POST /crm/v3/schemas
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for creating a custom object schema.
 */
function buildSchemasCreateTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_schemas_create',
    description:
      'Define a new custom object type (schema) in HubSpot. Provide an internal `name`, display `labels` ' +
      '({singular, plural}) and at least one property definition ({name, label, type, fieldType, options?}). ' +
      'Optionally set primaryDisplayProperty, requiredProperties, searchableProperties, ' +
      'secondaryDisplayProperties and associatedObjects. ' +
      'Required scope: crm.schemas.custom.write.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: 'Internal object name (lowercase, no spaces), e.g. "my_object". Required.',
        },
        labels: {
          type: 'object',
          description: 'Display labels for the object type. Required.',
          properties: {
            singular: { type: 'string', description: 'Singular label, e.g. "Property".' },
            plural: { type: 'string', description: 'Plural label, e.g. "Properties".' },
          },
          required: ['singular', 'plural'],
        },
        primaryDisplayProperty: {
          type: 'string',
          description: 'Name of the property used as the record title. Optional.',
        },
        requiredProperties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Property names that must be set when creating a record. Optional.',
        },
        searchableProperties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Property names indexed for search. Optional.',
        },
        secondaryDisplayProperties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Property names shown alongside the primary display property. Optional.',
        },
        properties: {
          type: 'array',
          items: PROPERTY_JSON_SCHEMA,
          description: 'Property definitions for the object type. At least one is required.',
        },
        associatedObjects: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Object types this custom object can associate with, e.g. ["CONTACT"]. Optional.',
        },
      },
      required: ['name', 'labels', 'properties'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = SchemasCreateSchema.parse(rawArgs);

      try {
        const body: Record<string, unknown> = {
          name: args.name,
          labels: args.labels,
          properties: args.properties,
        };
        if (args.primaryDisplayProperty !== undefined)
          body.primaryDisplayProperty = args.primaryDisplayProperty;
        if (args.requiredProperties !== undefined)
          body.requiredProperties = args.requiredProperties;
        if (args.searchableProperties !== undefined)
          body.searchableProperties = args.searchableProperties;
        if (args.secondaryDisplayProperties !== undefined)
          body.secondaryDisplayProperties = args.secondaryDisplayProperties;
        if (args.associatedObjects !== undefined) body.associatedObjects = args.associatedObjects;

        const result = await client.post<ObjectSchema>('/crm/v3/schemas', body);
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool 4: hubspot_schemas_update
// ---------------------------------------------------------------------------

/** Input schema for updating an existing object schema. */
const SchemasUpdateSchema = z.object({
  objectType: z
    .string()
    .min(1)
    .describe(
      'The custom object type to update — fully-qualified name ("p1234_my_object") or object type id ("2-12345678").'
    ),
  primaryDisplayProperty: z
    .string()
    .optional()
    .describe('New property name to use as the record title. Optional.'),
  requiredProperties: z
    .array(z.string())
    .optional()
    .describe('Replacement list of property names required when creating a record. Optional.'),
  searchableProperties: z
    .array(z.string())
    .optional()
    .describe('Replacement list of property names indexed for search. Optional.'),
  secondaryDisplayProperties: z
    .array(z.string())
    .optional()
    .describe('Replacement list of secondary display property names. Optional.'),
  labels: z
    .object({
      singular: z.string().optional().describe('New singular label.'),
      plural: z.string().optional().describe('New plural label.'),
    })
    .optional()
    .describe('Updated display labels ({singular?, plural?}). Optional.'),
});

/**
 * Creates the `hubspot_schemas_update` tool.
 *
 * Endpoint: PATCH /crm/v3/schemas/{objectType}
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for updating a custom object schema.
 */
function buildSchemasUpdateTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_schemas_update',
    description:
      'Update an existing custom object type (schema). Identify it with `objectType` and pass any of the ' +
      'updatable fields: primaryDisplayProperty, requiredProperties, searchableProperties, ' +
      'secondaryDisplayProperties, labels ({singular?, plural?}). Only the provided fields are changed. ' +
      'Note: properties are not added/removed here — manage individual properties via the Properties API. ' +
      'Required scope: crm.schemas.custom.write.',
    inputSchema: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          minLength: 1,
          description:
            'Custom object type to update: fully-qualified name ("p1234_my_object") or object type id ("2-12345678").',
        },
        primaryDisplayProperty: {
          type: 'string',
          description: 'New property name to use as the record title. Optional.',
        },
        requiredProperties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replacement list of required property names. Optional.',
        },
        searchableProperties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replacement list of searchable property names. Optional.',
        },
        secondaryDisplayProperties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replacement list of secondary display property names. Optional.',
        },
        labels: {
          type: 'object',
          description: 'Updated display labels. Optional.',
          properties: {
            singular: { type: 'string', description: 'New singular label.' },
            plural: { type: 'string', description: 'New plural label.' },
          },
        },
      },
      required: ['objectType'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = SchemasUpdateSchema.parse(rawArgs);

      try {
        const body: Record<string, unknown> = {};
        if (args.primaryDisplayProperty !== undefined)
          body.primaryDisplayProperty = args.primaryDisplayProperty;
        if (args.requiredProperties !== undefined)
          body.requiredProperties = args.requiredProperties;
        if (args.searchableProperties !== undefined)
          body.searchableProperties = args.searchableProperties;
        if (args.secondaryDisplayProperties !== undefined)
          body.secondaryDisplayProperties = args.secondaryDisplayProperties;
        if (args.labels !== undefined) body.labels = args.labels;

        const result = await client.patch<ObjectSchema>(
          `/crm/v3/schemas/${encodeURIComponent(args.objectType)}`,
          body
        );
        return result;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool 5: hubspot_schemas_delete
// ---------------------------------------------------------------------------

/** Input schema for deleting an object schema. */
const SchemasDeleteSchema = z.object({
  objectType: z
    .string()
    .min(1)
    .describe(
      'The custom object type to delete — fully-qualified name ("p1234_my_object") or object type id ("2-12345678").'
    ),
  archived: z
    .boolean()
    .optional()
    .describe(
      'When true, performs a hard delete (?archived=true). A hard delete requires that ALL records of ' +
        'this object type have already been deleted. Optional.'
    ),
});

/**
 * Creates the `hubspot_schemas_delete` tool.
 *
 * Endpoint: DELETE /crm/v3/schemas/{objectType}
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Tool definition for deleting a custom object schema.
 */
function buildSchemasDeleteTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_schemas_delete',
    description:
      'DELETE a custom object type (schema). This removes the entire object type — destructive and ' +
      'irreversible. Set archived=true for a hard delete, which permanently purges the type but requires ' +
      'that ALL of its records have already been deleted first. Use with extreme caution. ' +
      'Required scope: crm.schemas.custom.write.',
    inputSchema: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          minLength: 1,
          description:
            'Custom object type to delete: fully-qualified name ("p1234_my_object") or object type id ("2-12345678").',
        },
        archived: {
          type: 'boolean',
          description:
            'When true, hard delete (?archived=true) — permanently purges the type; all its records must be deleted first.',
        },
      },
      required: ['objectType'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = SchemasDeleteSchema.parse(rawArgs);

      try {
        const result = await client.delete<Record<string, never>>(
          `/crm/v3/schemas/${encodeURIComponent(args.objectType)}`,
          args.archived ? { archived: true } : undefined
        );
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
 * Returns all Schemas tools (manage custom object types).
 *
 * Tools included:
 * - `hubspot_schemas_list`: List all custom object schemas.
 * - `hubspot_schemas_get`: Inspect a single schema.
 * - `hubspot_schemas_create`: Define a new custom object type.
 * - `hubspot_schemas_update`: Update an existing custom object type.
 * - `hubspot_schemas_delete`: Delete a custom object type.
 *
 * @param client - Authenticated HubSpotClient instance.
 * @returns Array of 5 Tool objects ready for MCP registration.
 *
 * @example
 * import { getSchemasTools } from './tools/schemas/index.js';
 * const tools = getSchemasTools(client);
 */
export function getSchemasTools(client: HubSpotClient): Tool[] {
  return [
    buildSchemasListTool(client),
    buildSchemasGetTool(client),
    buildSchemasCreateTool(client),
    buildSchemasUpdateTool(client),
    buildSchemasDeleteTool(client),
  ];
}
