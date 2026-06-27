/**
 * Shared type definitions used across all MCP tool modules.
 *
 * The `Tool` interface is the contract that every HubSpot tool must satisfy.
 * It combines the MCP tool descriptor (name, description, inputSchema) with
 * the runtime handler that executes the tool logic.
 */

/**
 * MCP tool definition consumed by the server's ListTools and CallTool handlers.
 *
 * Every domain module exposes a `get<Domain>Tools(client)` function that returns
 * an array of Tool objects. The server registers these at startup.
 *
 * @example
 * const myTool: Tool = {
 *   name: 'hubspot_crm_list_deals',
 *   description: 'List deals from HubSpot CRM',
 *   inputSchema: {
 *     type: 'object',
 *     properties: {
 *       limit: { type: 'number', description: 'Max results (1-100)', default: 10 }
 *     },
 *     required: []
 *   },
 *   handler: async (args) => {
 *     // ... implementation
 *   }
 * };
 */
export interface Tool {
  /** Unique tool identifier. Convention: `hubspot_<domain>_<action>`. */
  name: string;
  /** Human-readable description shown to the LLM in the tool list. */
  description: string;
  /**
   * JSON Schema describing the tool's input arguments.
   * Properties map directly to what the LLM will send as `arguments` in CallTool.
   */
  inputSchema: {
    type: 'object';
    /** Map of argument names to their JSON Schema definitions. */
    properties: Record<string, unknown>;
    /** List of required argument names. */
    required?: string[];
    /** Whether to allow additional properties not defined in the schema. */
    additionalProperties?: boolean;
  };
  /**
   * Executes the tool with the provided arguments.
   *
   * @param args - Raw arguments from the MCP CallTool request (already parsed JSON).
   * @returns A value that will be JSON-serialized into the tool response content.
   * @throws {HubSpotApiError} When the HubSpot API returns an error.
   */
  handler: (args: unknown) => Promise<unknown>;
}
