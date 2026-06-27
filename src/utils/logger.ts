/**
 * Singleton logger for the HubSpot MCP server.
 *
 * All output goes to STDERR to avoid polluting the MCP JSON-RPC channel on STDOUT.
 * Log level is controlled via the LOG_LEVEL environment variable (default: info).
 *
 * Security: Authorization tokens and access_token values are automatically
 * redacted before any message is written to the log output.
 */
import winston from 'winston';

/**
 * Supported log levels (mapped from Winston log levels).
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Redacts sensitive values from log messages and metadata objects.
 * Replaces `Bearer <token>` patterns and `access_token` field values with
 * the placeholder `[REDACTED]`.
 *
 * @param value - The string or object to sanitize.
 * @returns A sanitized copy with sensitive data replaced.
 */
function redactSensitive(value: unknown): unknown {
  if (typeof value === 'string') {
    // Redact Bearer tokens in Authorization header values
    return value.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]');
  }

  if (typeof value === 'object' && value !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'access_token' || k === 'accessToken' || k === 'Authorization') {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = redactSensitive(v);
      }
    }
    return sanitized;
  }

  return value;
}

/**
 * Custom Winston format that applies token redaction to all log entries.
 */
const redactFormat = winston.format((info) => {
  if (info.message && typeof info.message === 'string') {
    info.message = redactSensitive(info.message) as string;
  }
  // Redact metadata spread onto the info object (everything besides standard fields)
  const { level, message, timestamp, stack, ...meta } = info;
  const redactedMeta = redactSensitive(meta) as Record<string, unknown>;
  return { level, message, timestamp, stack, ...redactedMeta };
});

/**
 * Structured logger that writes exclusively to STDERR.
 *
 * @example
 * logger.info('Server started', { toolCount: 42 });
 * logger.warn('Rate limit approaching', { remaining: 5 });
 * logger.error('Request failed', new Error('Connection refused'), { endpoint: '/deals' });
 */
export class Logger {
  private readonly winstonLogger: winston.Logger;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.winstonLogger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        redactFormat(),
        winston.format.json()
      ),
      transports: [
        // CRITICAL: Only use stderr for MCP servers (stdout is for JSON-RPC)
        new winston.transports.Console({
          stderrLevels: ['error', 'warn', 'info', 'debug'],
        }),
      ],
    });
  }

  /**
   * Logs a debug-level message. Useful for tracing request/response cycles.
   *
   * @param message - The log message.
   * @param meta - Optional structured metadata to attach.
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.winstonLogger.debug(message, meta);
  }

  /**
   * Logs an info-level message. Used for normal operational events.
   *
   * @param message - The log message.
   * @param meta - Optional structured metadata to attach.
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.winstonLogger.info(message, meta);
  }

  /**
   * Logs a warning-level message. Used for degraded conditions (rate limit approaching, etc.).
   *
   * @param message - The log message.
   * @param meta - Optional structured metadata to attach.
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.winstonLogger.warn(message, meta);
  }

  /**
   * Logs an error-level message with optional Error object and metadata.
   *
   * @param message - The log message.
   * @param error - Optional Error object whose message and stack will be included.
   * @param meta - Optional additional structured metadata.
   */
  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.winstonLogger.error(message, {
      ...meta,
      error: error?.message,
      stack: error?.stack,
    });
  }
}

// Singleton instance – use this throughout the codebase
const logLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || LogLevel.INFO;
export const logger = new Logger(logLevel);
