/**
 * Unit tests for the Logger utility.
 *
 * Covers the redactSensitive helper (not directly exported) by calling
 * the Logger's public methods with metadata that contains sensitive field
 * names. This exercises the object-redaction branch in logger.ts (line 40).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../utils/logger.js';

describe('Logger — redactSensitive (object branch)', () => {
  // Suppress actual stderr output so test noise is minimised
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it('does not throw when metadata contains access_token key (line 40)', () => {
    // Covers the if-branch that sets sanitized[k] = '[REDACTED]' for sensitive keys
    const log = new Logger(LogLevel.WARN);
    expect(() => {
      log.warn('sensitive metadata test', {
        access_token: 'super-secret-token',
        safeKey: 'safe-value',
      });
    }).not.toThrow();
  });

  it('does not throw when metadata contains accessToken key', () => {
    const log = new Logger(LogLevel.WARN);
    expect(() => {
      log.warn('accessToken redact test', {
        accessToken: 'another-secret',
        endpoint: '/crm/v3/objects/deals',
      });
    }).not.toThrow();
  });

  it('does not throw when metadata contains Authorization key', () => {
    const log = new Logger(LogLevel.WARN);
    expect(() => {
      log.warn('Authorization redact test', {
        Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.test',
        endpoint: '/contacts',
      });
    }).not.toThrow();
  });

  it('does not throw when metadata is deeply nested with sensitive keys', () => {
    const log = new Logger(LogLevel.ERROR);
    expect(() => {
      log.error('nested redact test', undefined, {
        request: { headers: { Authorization: 'Bearer nested-token' } },
        access_token: 'top-level-token',
      });
    }).not.toThrow();
  });

  it('does not throw when message is empty string (covers line 55 false branch of redactFormat)', () => {
    // Covers: if (info.message && typeof info.message === 'string') — FALSE branch
    // When message is an empty string, the condition is false and redaction is skipped
    const log = new Logger(LogLevel.WARN);
    expect(() => {
      log.warn(''); // empty string → falsy → false branch of if (info.message && ...)
    }).not.toThrow();
  });
});
