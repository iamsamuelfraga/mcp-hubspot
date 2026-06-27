#!/usr/bin/env node
/**
 * HubSpot MCP Server entry point.
 *
 * Bootstraps the MCP server with:
 * - Environment validation (HUBSPOT_ACCESS_TOKEN required)
 * - HubSpot API client initialization
 * - Tool registration and toolset filtering
 * - MCP protocol handlers (ListTools, CallTool)
 * - Graceful shutdown with final metrics logging
 * - Uncaught exception/rejection handlers
 *
 * Usage:
 *   HUBSPOT_ACCESS_TOKEN=<token> node dist/index.js
 *
 * @see {@link https://developers.hubspot.com/docs/api/private-apps}
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { HubSpotClient } from './hubspot-client.js';
import { type Tool } from './types/common.js';
import { logger } from './utils/logger.js';
import { handleToolError } from './utils/error-handler.js';
import { metricsCollector } from './utils/metrics.js';
import { getEnabledToolsets, findToolset } from './utils/toolset-filter.js';
import { setupResources } from './resources/index.js';
import { setupPrompts } from './prompts/index.js';

// ─── Environment validation ──────────────────────────────────────────────────

const ACCESS_TOKEN = process.env['HUBSPOT_ACCESS_TOKEN'];

if (!ACCESS_TOKEN) {
  console.error('Error: HUBSPOT_ACCESS_TOKEN environment variable is required');
  console.error('');
  console.error('How to create a HubSpot Private App:');
  console.error('  1. Go to HubSpot → Settings → Integrations → Private Apps');
  console.error('  2. Click "Create a Private App"');
  console.error('  3. Name your app and select the required scopes');
  console.error('  4. Copy the generated access token');
  console.error('');
  console.error('Set it in your Claude Desktop config (~/.claude/claude_desktop_config.json):');
  console.error('{');
  console.error('  "mcpServers": {');
  console.error('    "hubspot": {');
  console.error('      "command": "npx",');
  console.error('      "args": ["-y", "@iamsamuelfraga/mcp-hubspot"],');
  console.error('      "env": {');
  console.error('        "HUBSPOT_ACCESS_TOKEN": "pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"');
  console.error('      }');
  console.error('    }');
  console.error('  }');
  console.error('}');
  process.exit(1);
}

// ─── Client initialization ───────────────────────────────────────────────────

const client = new HubSpotClient({ accessToken: ACCESS_TOKEN });

// ─── Tool registration ───────────────────────────────────────────────────────

/**
 * Registers all domain tool modules and returns the combined tool array.
 *
 * Each domain is added here as its implementation phase completes.
 * Currently returns an empty array (Phase 0 – foundations only).
 *
 * @param _client - The HubSpotClient instance passed to each domain's factory.
 * @returns Array of all registered Tool objects.
 */
function registerTools(_client: HubSpotClient): Tool[] {
  const tools: Tool[] = [
    // Phase 1: Sales tools (deals, line_items, products, quotes)
    // ...getSalesTools(client),
    // Phase 2: Engagement tools (calls, meetings, tasks, notes, emails)
    // ...getEngagementTools(client),
    // Phase 3: Association tools
    // ...getAssociationTools(client),
    // Phase 4: Properties tools
    // ...getPropertyTools(client),
    // Phase 5: Workflows tools
    // ...getWorkflowTools(client),
    // Phase 6: Automation tools
    // ...getAutomationTools(client),
  ];

  return tools;
}

// Build the tool registry
const enabledToolsets = getEnabledToolsets();
const allTools = registerTools(client);

// Filter by enabled toolset (tools with no toolset prefix are always included)
const tools: Record<string, Tool> = {};
for (const tool of allTools) {
  const toolset = findToolset(tool.name, enabledToolsets);
  if (toolset !== undefined) {
    tools[tool.name] = tool;
  } else {
    logger.debug('Toolset disabled, skipping tool', { tool: tool.name });
  }
}

// ─── MCP Server setup ────────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'hubspot-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ListTools handler – returns the schema for every enabled tool
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug('Listing available tools', { count: Object.keys(tools).length });

  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// CallTool handler – executes the requested tool and returns its result
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  logger.info('Tool called', { tool: name, hasArgs: !!args });

  const startTime = Date.now();
  let success = true;

  try {
    const tool = tools[name];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await tool.handler(args ?? {});
    const duration = Date.now() - startTime;

    logger.info('Tool executed successfully', { tool: name, duration });
    metricsCollector.recordRequest(name, duration, false);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    success = false;
    const duration = Date.now() - startTime;

    logger.error('Tool execution failed', error as Error, { tool: name, duration });
    metricsCollector.recordRequest(name, duration, true);

    return handleToolError(error);
  } finally {
    // Success path metrics are recorded in the try block; this prevents double-counting.
    if (!success) {
      // Already recorded above in the catch block.
    }
  }
});

// Register MCP Resources and Prompts (stubs for now)
setupResources(server, client);
setupPrompts(server);

// ─── Server startup ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('HubSpot MCP server started', {
    toolCount: Object.keys(tools).length,
    enabledToolsets,
  });

  logger.debug(
    'Tools by toolset',
    (() => {
      const byToolset: Record<string, number> = {};
      for (const name of Object.keys(tools)) {
        const ts = findToolset(name, enabledToolsets) ?? 'unassigned';
        byToolset[ts] = (byToolset[ts] ?? 0) + 1;
      }
      return byToolset;
    })()
  );
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info(`Shutting down gracefully (${signal})...`);
  const metrics = metricsCollector.getMetrics();
  logger.info('Final metrics', metrics as unknown as Record<string, unknown>);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Uncaught error handlers ─────────────────────────────────────────────────

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled rejection', new Error(String(reason)));
  process.exit(1);
});

// ─── Launch ──────────────────────────────────────────────────────────────────

main().catch((error: Error) => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});
