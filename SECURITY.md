# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of the HubSpot MCP Server seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do Not Publicly Disclose

**Please do not open a public GitHub issue for security vulnerabilities.** Public disclosure can put the entire community at risk before a fix is available.

### 2. Report Privately

Send a detailed report to:

**Email**: security@iamsamuelfraga.dev

Or use GitHub's private security advisory feature:

1. Go to the [Security tab](https://github.com/nubiia-dev/mcp-hubspot/security)
2. Click "Report a vulnerability"
3. Fill out the form with details

### 3. Include in Your Report

To help us assess and fix the vulnerability quickly, please include:

- **Description**: Clear explanation of the vulnerability
- **Impact**: What could an attacker achieve?
- **Steps to reproduce**: Detailed reproduction steps
- **Affected versions**: Which versions are affected?
- **Suggested fix**: If you have ideas for fixing it
- **Your environment**: Node version, OS, etc.

### Example Report

```
Subject: [SECURITY] Access Token Exposure in Debug Logs

Description:
The server logs access tokens in plain text when debug logging is enabled,
potentially exposing credentials in log files.

Impact:
An attacker with access to log files could steal Private App tokens and gain
unauthorized access to HubSpot CRM data.

Steps to Reproduce:
1. Enable LOG_LEVEL=debug
2. Start the server with HUBSPOT_ACCESS_TOKEN set
3. Trigger any API call
4. Check logs — token is visible in request headers

Affected Versions:
All versions up to 0.1.0

Suggested Fix:
Redact access tokens in logger.ts before writing to logs.

Environment:
- Node.js: 20.18.0
- OS: macOS 14.0
- Package version: 0.1.0
```

## Response Timeline

We will respond to security reports according to the following timeline:

- **24 hours**: Acknowledge receipt of your report
- **72 hours**: Provide initial assessment and severity rating
- **7 days**: Provide a fix timeline or mitigation steps
- **30 days**: Release a patch (for critical vulnerabilities, much sooner)

## Security Best Practices

### For Users

#### 1. Protect Your Access Token

**Never commit access tokens to version control:**

```bash
# WRONG - Don't do this
git commit -m "add config" claude_desktop_config.json

# RIGHT - Use environment variables
# Add to .gitignore:
echo "claude_desktop_config.json" >> .gitignore
```

**Use environment variables or secure secret management:**

- Store tokens in environment variables only
- Use a password manager for token storage
- Rotate tokens regularly (every 90 days recommended)
- Use separate tokens for development and production

To rotate a HubSpot Private App token:
1. Go to **HubSpot → Settings → Integrations → Private Apps**
2. Select your app
3. Click **Rotate token**
4. Update all locations where the old token is used

#### 2. Principle of Least Privilege

Grant your Private App only the minimum scopes needed for your use case:

1. In HubSpot, go to **Settings → Integrations → Private Apps**
2. Edit your app and navigate to the **Scopes** tab
3. Enable only the scopes required for the toolsets you use (see README for the scope table)
4. Regularly audit active scopes and remove any you no longer need

#### 3. Use Toolset Filtering

Restrict the server to only the domains you actually need:

```json
{
  "env": {
    "HUBSPOT_ACCESS_TOKEN": "pat-na1-...",
    "HUBSPOT_TOOLSETS": "sales,properties"
  }
}
```

This reduces the blast radius if a token is compromised.

#### 4. Monitor for Suspicious Activity

- Review HubSpot's **Private App** activity logs regularly
- Monitor for unexpected API calls in your HubSpot audit log (**Settings → Account Management → Audit Log**)
- Set up HubSpot notifications for unusual usage patterns
- Review connected Private Apps periodically and delete any you no longer use

#### 5. Keep the Package Updated

```bash
# Check for updates
npm outdated -g @nubiia/mcp-hubspot

# Update to latest version
npm update -g @nubiia/mcp-hubspot
```

#### 6. Secure Your Development Environment

- Use encrypted file systems on development machines
- Enable file system access controls (chmod 600 on config files)
- Do not share development machines or tokens
- Use secure network connections only

### For Contributors

#### 1. Code Security

- Never log sensitive data (tokens, passwords, PII) — even in debug mode
- Validate all inputs with Zod schemas before processing
- Sanitize user inputs before constructing API calls
- Avoid `eval()` and similar dynamic code execution
- Use TypeScript strict mode to catch type errors at compile time

#### 2. Dependency Security

```bash
# Audit dependencies before committing
npm audit

# Fix automatically where safe
npm audit fix

# Check for outdated packages
npm outdated
```

#### 3. Secrets in Tests

```typescript
// WRONG - Hardcoded secrets
const token = 'pat-na1-abc123';

// RIGHT - Use environment variables or mocks
const token = process.env.HUBSPOT_ACCESS_TOKEN ?? 'mock-token-for-tests';
```

#### 4. Secure Communication

- Only use HTTPS for all HubSpot API calls (enforced by the client)
- Do not disable certificate validation
- Use TLS 1.2 or higher (Node.js default)

## Known Security Considerations

### 1. Access Token Storage

The MCP server receives the Private App access token through environment variables configured in Claude Desktop. The token is:

- Stored in memory only (never persisted to disk by this server)
- Not logged, even in debug mode
- Not transmitted except to the HubSpot API over HTTPS
- Cleared when the process terminates

**User Responsibility**: The token is stored in Claude Desktop's config file. Users should:
- Protect this file with appropriate permissions: `chmod 600 ~/Library/Application\ Support/Claude/claude_desktop_config.json`
- Encrypt their file system
- Not share their config file or commit it to version control

### 2. Rate Limiting

The server implements rate limiting to protect your HubSpot API quota:

- 100 requests per 10 seconds (burst capacity)
- 1000 requests per minute (sustained rate)
- Automatic retry with exponential backoff on 429 responses

This protects against accidental flooding of your HubSpot account.

### 3. Input Validation

All tool inputs are validated with Zod schemas:

- Strict type checking
- Range and format validation
- Required field enforcement
- Unknown property rejection (`.strict()` schemas)

This prevents injection attacks and malformed API requests.

### 4. Error Information Disclosure

Errors are sanitised before being returned to the LLM client to prevent information leakage:

- Access tokens are never included in error messages
- Internal file paths are not exposed
- Stack traces are limited in production mode
- HubSpot API error bodies are forwarded as-is (they may contain object IDs — this is intentional for debugging)

### 5. Dependency Vulnerabilities

We use automated tooling to detect dependency vulnerabilities:

- GitHub Dependabot alerts on the repository
- `npm audit` runs in every CI pipeline
- Dependencies are pinned to minor version ranges to prevent unvetted upgrades

## Security Features

### 1. HTTPS Only

All HubSpot API communication uses HTTPS:

```typescript
// Enforced in HubSpotClient
const API_BASE = 'https://api.hubapi.com';
```

### 2. Input Sanitisation

All inputs are validated with Zod before being sent to HubSpot:

```typescript
const validated = CrmSearchSchema.parse(args);
// Zod throws ZodError on invalid input, preventing malformed requests
```

### 3. Rate Limiting

Prevents accidental API quota exhaustion:

```typescript
const limiter = new Bottleneck({
  minTime: 100,        // max 10 req/s
  maxConcurrent: 5,
});
```

### 4. Error Handling

Sensitive information is never exposed in errors:

```typescript
// Tokens and internal details are redacted in handleToolError
return handleToolError(error);
```

## Vulnerability Disclosure Policy

When we fix a security vulnerability:

1. **Patch Released**: Fix is deployed in a new version
2. **Security Advisory**: Published on [GitHub Security Advisories](https://github.com/nubiia-dev/mcp-hubspot/security/advisories)
3. **Notification**: Users notified through GitHub releases and npm
4. **Credit**: Reporter credited (if desired) in the advisory

## Security Hall of Fame

We recognise security researchers who responsibly disclose vulnerabilities:

<!-- This section will be populated with contributors who report valid security issues -->

*No vulnerabilities have been reported yet.*

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [npm Security Best Practices](https://docs.npmjs.com/packages-and-modules/securing-your-code)
- [HubSpot Private Apps Security](https://developers.hubspot.com/docs/api/private-apps)
- [HubSpot API Rate Limits](https://developers.hubspot.com/docs/api/usage-details)

## Questions?

For security-related questions that are not vulnerabilities:

- Open a [GitHub Discussion](https://github.com/nubiia-dev/mcp-hubspot/discussions)
- Tag with the `security` label
- Or email security@iamsamuelfraga.dev

Thank you for helping keep HubSpot MCP Server secure!
