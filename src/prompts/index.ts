/**
 * MCP Prompts stub.
 *
 * Prompts will be implemented in a future phase. This stub satisfies the
 * import in `src/index.ts` and provides the correct function signature for
 * future implementors.
 *
 * @see {@link https://modelcontextprotocol.io/docs/concepts/prompts}
 */
import { type Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Registers MCP prompts on the server instance.
 *
 * Currently a no-op stub. Future phases will register prompts such as
 * deal analysis templates, pipeline review prompts, and CRM workflow guides.
 *
 * @param _server - The MCP Server instance.
 */
export function setupPrompts(_server: Server): void {
  // Prompts will be added in a future implementation phase.
}
