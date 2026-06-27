# Contributing to HubSpot MCP Server

Thank you for your interest in contributing to the HubSpot MCP Server! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Requirements](#testing-requirements)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Adding New Tools](#adding-new-tools)
- [Documentation](#documentation)

## Code of Conduct

This project follows a Code of Conduct that all contributors are expected to adhere to. Please be respectful, inclusive, and professional in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your feature or bugfix
4. **Make your changes** with tests and documentation
5. **Submit a pull request** with a clear description

## Development Setup

### Prerequisites

- Node.js >= 20.18.0
- npm >= 10
- Git
- A HubSpot account with Private App access (for manual integration testing)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/mcp-hubspot.git
cd mcp-hubspot

# Install dependencies
npm install

# Set your HubSpot access token for integration testing (optional)
export HUBSPOT_ACCESS_TOKEN="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Build the project
npm run build

# Run tests (no HubSpot token required — all tests are unit tests)
npm test
```

### How to Create a HubSpot Private App

1. Log in to HubSpot and go to **Settings → Integrations → Private Apps**
2. Click **Create a Private App**
3. Name your app and select the required scopes for the toolsets you want to test
4. Click **Create app** and copy the generated access token
5. Set it as the `HUBSPOT_ACCESS_TOKEN` environment variable

### Running Locally with Claude Desktop

For manual testing with Claude Desktop, point the config to your local build:

```json
{
  "mcpServers": {
    "hubspot-dev": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-hubspot/dist/index.js"],
      "env": {
        "HUBSPOT_ACCESS_TOKEN": "pat-na1-...",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

## Project Structure

```
mcp-hubspot/
├── src/
│   ├── index.ts                  # Server entry point and MCP setup
│   ├── hubspot-client.ts         # HTTP client with rate limiting and retry
│   ├── tools/                    # MCP tool implementations
│   │   ├── crm/                  # Generic CRM CRUD/search/batch tools
│   │   ├── sales/                # Deal merge and quote assembly tools
│   │   ├── associations/         # Association management tools
│   │   ├── properties/           # Property definition tools
│   │   ├── workflows/            # Workflow automation v4 BETA tools
│   │   ├── automation/           # Automation callback tools
│   │   └── enrollment/           # Workflow enrollment + v3 legacy tools
│   ├── resources/
│   │   └── index.ts              # Static MCP resources (scopes, types, conventions)
│   ├── prompts/
│   │   └── index.ts              # Guided workflow MCP prompts
│   ├── utils/                    # Utility modules
│   │   ├── logger.ts             # Winston logger
│   │   ├── error-handler.ts      # MCP-compatible error formatting
│   │   ├── metrics.ts            # Performance tracking
│   │   ├── retry.ts              # Retry logic with backoff
│   │   └── toolset-filter.ts     # HUBSPOT_TOOLSETS parsing
│   ├── types/
│   │   └── common.ts             # Shared TypeScript interfaces
│   └── __tests__/                # Unit tests (Vitest)
│       ├── mock-client.ts        # Shared fetch mock helpers
│       ├── setup.ts              # Global test setup
│       ├── crm-tools.test.ts
│       ├── resources.test.ts
│       ├── prompts.test.ts
│       └── ...
├── dist/                         # Compiled output (git-ignored)
├── docs/                         # Additional documentation
├── server.json                   # MCP registry manifest
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js
└── .releaserc.json
```

### Domain Pattern

Each domain in `src/tools/<domain>/index.ts` exports a factory function:

```typescript
export function get<Domain>Tools(client: HubSpotClient): Tool[]
```

This factory is imported in `src/index.ts` and added to the appropriate toolset group.

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bugfix-name
```

### 2. Make Your Changes

- Write clean, readable code with JSDoc comments
- Follow the existing code style (TypeScript strict mode, Prettier, ESLint)
- Add tests for new functionality (all tools must have unit tests)
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:ui

# Type checking only
npm run type-check

# Lint
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code
npm run format
```

### 4. Commit Your Changes

Follow the [commit message format](#commit-message-format).

```bash
git add .
git commit -m "feat(crm): add batch upsert tool"
```

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub targeting the `main` branch.

## Code Style Guidelines

### TypeScript

- Use TypeScript **strict mode** (enforced by `tsconfig.json`)
- Prefer `interface` over `type` for object shapes
- Use explicit return types for exported functions
- Avoid `any` — use `unknown` if the type is truly unknown
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Prefer `const` over `let`; never use `var`

### Formatting

Prettier is configured for consistent formatting:

```bash
npm run format         # Format all source files
npm run format:check   # Check without modifying
```

Prettier also runs automatically on commit via lint-staged.

### Linting

ESLint with TypeScript support:

```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix what's possible
```

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `toolset-filter.ts`)
- **Classes**: `PascalCase` (e.g., `HubSpotClient`)
- **Functions**: `camelCase` (e.g., `getCrmTools`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `API_BASE`)
- **Interfaces/Types**: `PascalCase` (e.g., `CrmListInput`)

### Error Handling

- Always use try/catch for async operations
- Throw descriptive `Error` instances with context
- Use `handleToolError` from `utils/error-handler.ts` for tool-level errors

```typescript
try {
  const result = await client.get('/crm/v3/objects/deals');
  return result;
} catch (error) {
  logger.error('Failed to list deals', error as Error, { context: 'hubspot_crm_list' });
  throw new Error(`Failed to list deals: ${(error as Error).message}`);
}
```

### JSDoc Comments

All exported functions and classes must have JSDoc comments:

```typescript
/**
 * Lists CRM objects of the specified type.
 *
 * @param client - The HubSpotClient instance.
 * @returns Array of MCP Tool definitions for the CRM list operation.
 */
export function getCrmListTool(client: HubSpotClient): Tool {
  // ...
}
```

## Testing Requirements

### Coverage Goals

- Aim for >80% line coverage across the codebase
- All new tools must have unit tests covering:
  - Happy path (successful API response)
  - Error path (HubSpot API error)
  - Validation path (invalid input rejected by Zod)

### Test Pattern

Tests use Vitest and mock the global `fetch` via the helpers in `src/__tests__/mock-client.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { HubSpotClient } from '../hubspot-client.js';
import { getCrmTools } from '../tools/crm/index.js';
import { mockFetchSuccess, mockFetchError } from './mock-client.js';

describe('hubspot_crm_list', () => {
  beforeEach(() => {
    mockFetchSuccess({ results: [], paging: {} });
  });

  it('returns results from the API', async () => {
    const client = new HubSpotClient({ accessToken: 'test-token' });
    const tools = getCrmTools(client);
    const tool = tools.find((t) => t.name === 'hubspot_crm_list')!;

    const result = await tool.handler({ objectType: 'deals' });

    expect(result).toHaveProperty('results');
  });

  it('handles a 429 rate-limit error', async () => {
    mockFetchError({ message: 'Too many requests' }, 429);
    // ...
  });
});
```

### Running Specific Tests

```bash
# Run a specific file
npm test -- crm-tools.test.ts

# Run tests matching a pattern
npm test -- --grep "batch create"

# Run in watch mode
npm test -- --watch
```

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature or new tool
- **fix**: Bug fix
- **docs**: Documentation changes only
- **style**: Code style changes (formatting, missing semicolons)
- **refactor**: Code refactoring without feature changes
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Maintenance tasks, dependency updates
- **ci**: CI/CD pipeline changes

### Scopes

Use the domain or module affected: `crm`, `sales`, `associations`, `properties`, `workflows`, `automation`, `enrollment`, `resources`, `prompts`, `client`, `docs`, `ci`.

### Examples

```
feat(workflows): add workflow performance metrics tool

Implement hubspot_workflows_performance to retrieve execution
statistics for a given workflow and date range.

Closes #42
```

```
fix(client): retry on 503 Service Unavailable responses

HubSpot occasionally returns 503 during maintenance windows.
Add 503 to the list of retryable status codes alongside 429
and 500.

Fixes #38
```

```
docs(readme): clarify Workflows v4 BETA access requirements
```

### Semantic Release

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning. Commit message types determine the version bump:

- `fix:` → Patch bump (0.0.X)
- `feat:` → Minor bump (0.X.0)
- `BREAKING CHANGE:` in body → Major bump (X.0.0)

## Pull Request Process

### Before Submitting

1. All tests pass: `npm test`
2. No type errors: `npm run type-check`
3. No lint errors: `npm run lint`
4. Code is formatted: `npm run format:check`
5. New tools have unit tests
6. Documentation updated if needed

### PR Title

Use the same format as commit messages:

```
feat(crm): add bulk contact import tool
```

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change (existing functionality affected)
- [ ] Documentation update

## Testing
Describe the tests added and how to reproduce the fix or feature manually.

## Checklist
- [ ] Code follows the project's code style
- [ ] Self-review completed
- [ ] Hard-to-understand areas are commented
- [ ] Documentation updated where needed
- [ ] No new compiler warnings
- [ ] Tests added for new functionality
- [ ] All existing tests pass
- [ ] No breaking changes (or documented)

## Related Issues
Closes #(issue number)
```

### Review Process

1. At least one maintainer must approve
2. All CI checks must pass (type-check, lint, build, test on Node 20 and 22)
3. No unresolved review comments
4. Branch is up to date with `main`

## Adding New Tools

### 1. Identify the Domain

Determine which domain the tool belongs to and add it to the appropriate directory under `src/tools/<domain>/`.

### 2. Implement the Tool

```typescript
// src/tools/crm/my-new-tool.ts
import { type HubSpotClient } from '../../hubspot-client.js';
import { type Tool } from '../../types/common.js';
import { z } from 'zod';

const MyNewToolSchema = z.object({
  objectType: z.string().describe('CRM object type (e.g. contacts, deals)'),
  someField: z.string().optional().describe('Optional field description'),
}).strict();

/**
 * Implements the hubspot_crm_my_new tool.
 *
 * @param client - The HubSpotClient instance.
 * @returns MCP Tool definition.
 */
export function getMyNewTool(client: HubSpotClient): Tool {
  return {
    name: 'hubspot_crm_my_new',
    description: `Detailed description for the LLM.

Include:
- What this tool does
- When to use it
- Important caveats or limits`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        objectType: { type: 'string', description: 'CRM object type (e.g. contacts, deals)' },
        someField: { type: 'string', description: 'Optional field description' },
      },
      required: ['objectType'],
    },
    handler: async (args: unknown) => {
      const { objectType, someField } = MyNewToolSchema.parse(args);
      return client.get(`/crm/v3/objects/${objectType}`, { someField });
    },
  };
}
```

### 3. Register in the Domain Index

```typescript
// src/tools/crm/index.ts
import { getMyNewTool } from './my-new-tool.js';

export function getCrmTools(client: HubSpotClient): Tool[] {
  return [
    // ... existing tools
    getMyNewTool(client),
  ];
}
```

### 4. Add Unit Tests

```typescript
// src/__tests__/crm-tools.test.ts  (add to existing file)
describe('hubspot_crm_my_new', () => {
  it('calls the correct endpoint', async () => {
    mockFetchSuccess({ results: [] });
    const result = await findTool('hubspot_crm_my_new').handler({ objectType: 'deals' });
    expect(result).toHaveProperty('results');
  });
});
```

### 5. Update README

Add the new tool to the tool count and the Tool Categories table if it belongs to a new domain.

## Documentation

### Documentation Standards

- Use clear, concise language
- Include code examples for non-obvious behaviour
- Document edge cases and known limitations
- Keep documentation up to date with code changes
- Use proper Markdown formatting

### JSDoc Standards

Every exported symbol must have a JSDoc comment:

```typescript
/**
 * One-line summary.
 *
 * Longer description if needed.
 *
 * @param paramName - What this parameter does.
 * @returns What the function returns.
 * @throws {Error} When and why this throws.
 *
 * @example
 * ```typescript
 * const tools = getCrmTools(client);
 * ```
 */
```

## Questions?

If you have questions:

1. Check the existing documentation in this repo
2. Search [existing issues](https://github.com/iamsamuelfraga/mcp-hubspot/issues) and discussions
3. Open a [GitHub Discussion](https://github.com/iamsamuelfraga/mcp-hubspot/discussions)
4. Open a new issue with the `question` label

Thank you for contributing to HubSpot MCP Server!
