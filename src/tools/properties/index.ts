/**
 * HubSpot Properties API v3 tools.
 *
 * Provides MCP tools for discovering and managing CRM object properties.
 * Properties define the fields available on HubSpot CRM records.
 *
 * @see {@link https://developers.hubspot.com/docs/api/crm/properties}
 */
import { type HubSpotClient } from '../../hubspot-client.js';
import { type Tool } from '../../types/common.js';
import { handleToolError } from '../../utils/error-handler.js';
import {
  ListPropertiesSchema,
  GetPropertySchema,
  CreatePropertySchema,
} from '../../schemas/properties.js';

// ---------------------------------------------------------------------------
// Tool: hubspot_properties_list
// ---------------------------------------------------------------------------

/**
 * Lists all properties defined for a CRM object type.
 * Corresponds to GET /crm/v3/properties/{objectType}.
 */
function buildListPropertiesTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_properties_list',
    description:
      'List all properties (fields) defined for a HubSpot CRM object type. ' +
      'Returns both default HubSpot properties and custom properties created by your team. ' +
      'Use this to discover available property names before reading or writing record data.\n\n' +
      'Standard object types: "contacts", "companies", "deals", "tickets", "products", ' +
      '"line_items", "quotes", "calls", "meetings", "tasks", "notes", "emails". ' +
      'Custom objects use their numeric object type ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectType: {
          type: 'string',
          minLength: 1,
          description:
            'CRM object type whose properties to list. ' +
            'Standard types: "contacts", "companies", "deals", "tickets", "products", ' +
            '"line_items", "quotes", "calls", "meetings", "tasks", "notes", "emails".',
        },
        archived: {
          type: 'boolean',
          default: false,
          description: 'Whether to include archived (deleted) properties. Default false.',
        },
      },
      required: ['objectType'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = ListPropertiesSchema.parse(rawArgs);

      try {
        const response = await client.get<{
          results: {
            name: string;
            label: string;
            type: string;
            fieldType: string;
            groupName: string;
            description: string;
            options?: { label: string; value: string }[];
            createdAt?: string;
            updatedAt?: string;
            archived?: boolean;
            hubspotDefined?: boolean;
          }[];
        }>(`/crm/v3/properties/${args.objectType}`, {
          archived: args.archived,
        });

        return {
          objectType: args.objectType,
          results: response.results,
          total: response.results.length,
        };
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_properties_get
// ---------------------------------------------------------------------------

/**
 * Retrieves a single property definition by name.
 * Corresponds to GET /crm/v3/properties/{objectType}/{propertyName}.
 */
function buildGetPropertyTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_properties_get',
    description:
      'Retrieve the full definition of a specific HubSpot CRM property by its internal name. ' +
      'Returns the property type, field type, group, options (for enumeration fields), ' +
      'and whether it is a HubSpot default or custom property. ' +
      'Useful for inspecting field constraints before creating or updating records.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectType: {
          type: 'string',
          minLength: 1,
          description: 'CRM object type (e.g., "contacts", "deals", "companies")',
        },
        propertyName: {
          type: 'string',
          minLength: 1,
          description:
            'Internal name of the property (e.g., "dealname", "amount", "hs_deal_stage_probability")',
        },
      },
      required: ['objectType', 'propertyName'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = GetPropertySchema.parse(rawArgs);

      try {
        const response = await client.get<{
          name: string;
          label: string;
          type: string;
          fieldType: string;
          groupName: string;
          description: string;
          options?: { label: string; value: string; displayOrder: number; hidden: boolean }[];
          createdAt?: string;
          updatedAt?: string;
          archived?: boolean;
          hubspotDefined?: boolean;
          hasUniqueValue?: boolean;
          formField?: boolean;
        }>(`/crm/v3/properties/${args.objectType}/${args.propertyName}`);

        return response;
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hubspot_properties_create
// ---------------------------------------------------------------------------

/**
 * Creates a new custom property on a CRM object type.
 * Corresponds to POST /crm/v3/properties/{objectType}.
 */
function buildCreatePropertyTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_properties_create',
    description:
      'Create a new custom property (field) on a HubSpot CRM object type. ' +
      'Use this to extend deal, contact, company, or other object records with ' +
      'business-specific data fields.\n\n' +
      'Common type+fieldType combinations:\n' +
      '  Single-line text:  type="string",      fieldType="text"\n' +
      '  Multi-line text:   type="string",      fieldType="textarea"\n' +
      '  Number:            type="number",      fieldType="number"\n' +
      '  Date:              type="date",        fieldType="date"\n' +
      '  Dropdown:          type="enumeration", fieldType="select"  (requires options)\n' +
      '  Checkbox list:     type="enumeration", fieldType="checkbox" (requires options)\n' +
      '  Yes/No toggle:     type="bool",        fieldType="booleancheckbox"\n\n' +
      'Note: property names must be lowercase with underscores (e.g., "my_custom_field"). ' +
      'The name cannot be changed after creation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectType: {
          type: 'string',
          minLength: 1,
          description:
            'CRM object type to add the property to (e.g., "contacts", "deals", "companies")',
        },
        name: {
          type: 'string',
          minLength: 1,
          pattern: '^[a-z0-9_]+$',
          description:
            'Internal property name (lowercase letters, numbers, underscores only). ' +
            'Used as the key when reading/writing this field. Cannot be changed after creation.',
        },
        label: {
          type: 'string',
          minLength: 1,
          description: 'Display label shown in HubSpot UI and reports',
        },
        type: {
          type: 'string',
          enum: [
            'string',
            'number',
            'date',
            'datetime',
            'enumeration',
            'bool',
            'json',
            'object_coordinates',
            'phone_number',
          ],
          description:
            'Data type. Common values: "string", "number", "date", "datetime", "enumeration", "bool".',
        },
        fieldType: {
          type: 'string',
          enum: [
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
          ],
          description:
            'UI rendering type. Must be compatible with the chosen "type" field. ' +
            'See tool description for common combinations.',
        },
        groupName: {
          type: 'string',
          minLength: 1,
          description:
            'Property group this field belongs to (e.g., "dealinformation", "contactinformation")',
        },
        description: {
          type: 'string',
          description: 'Optional description explaining the purpose of this property',
        },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                minLength: 1,
                description: 'Display label for this option',
              },
              value: {
                type: 'string',
                minLength: 1,
                description: 'Internal value (must be unique within this property)',
              },
              displayOrder: {
                type: 'integer',
                description: 'Position in the dropdown (lower = first)',
              },
              hidden: {
                type: 'boolean',
                default: false,
                description: 'Whether to hide this option',
              },
            },
            required: ['label', 'value'],
            additionalProperties: false,
          },
          description:
            'Required when type="enumeration". Array of selectable options, each with a unique value.',
        },
        displayOrder: {
          type: 'integer',
          description: 'Position of this property in forms and records (lower = earlier)',
        },
        hasUniqueValue: {
          type: 'boolean',
          default: false,
          description:
            'Whether values must be unique across all records of this type. Useful for external IDs.',
        },
        hidden: {
          type: 'boolean',
          default: false,
          description: 'Whether to hide this property in the UI',
        },
        formField: {
          type: 'boolean',
          default: true,
          description: 'Whether this property can be used in HubSpot forms',
        },
      },
      required: ['objectType', 'name', 'label', 'type', 'fieldType', 'groupName'],
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = CreatePropertySchema.parse(rawArgs);

      try {
        // Build the request body — extract objectType from the path segment
        const { objectType, ...propertyBody } = args;

        const response = await client.post<{
          name: string;
          label: string;
          type: string;
          fieldType: string;
          groupName: string;
          description: string;
          options?: { label: string; value: string }[];
          createdAt: string;
          updatedAt: string;
          archived: boolean;
          hubspotDefined: boolean;
        }>(`/crm/v3/properties/${objectType}`, propertyBody);

        return response;
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
 * Returns all Properties v3 tools for registration with the MCP server.
 *
 * @param client - The authenticated HubSpotClient instance.
 * @returns Array of Tool objects implementing the properties toolset.
 */
export function getPropertiesTools(client: HubSpotClient): Tool[] {
  return [
    buildListPropertiesTool(client),
    buildGetPropertyTool(client),
    buildCreatePropertyTool(client),
  ];
}
