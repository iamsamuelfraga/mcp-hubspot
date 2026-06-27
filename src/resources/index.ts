/**
 * MCP Resources stub.
 *
 * Resources will be implemented in a future phase. This stub satisfies the
 * import in `src/index.ts` and provides the correct function signature for
 * future implementors.
 *
 * @see {@link https://modelcontextprotocol.io/docs/concepts/resources}
 */
import { type Server } from '@modelcontextprotocol/sdk/server/index.js';
import { type HubSpotClient } from '../hubspot-client.js';

/**
 * Registers MCP resources on the server instance.
 *
 * Currently a no-op stub. Future phases will register resources such as
 * HubSpot object schemas, property definitions, and pipeline configurations.
 *
 * @param _server - The MCP Server instance.
 * @param _client - The HubSpotClient instance (for future use).
 */
export function setupResources(_server: Server, _client: HubSpotClient): void {
  // Resources will be added in a future implementation phase.
}
