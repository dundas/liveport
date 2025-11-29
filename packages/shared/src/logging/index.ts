/**
 * Structured Logging Utility
 *
 * Provides consistent logging across all LivePort services using pino.
 * - JSON output in production for log aggregation
 * - Pretty output in development for readability
 * - Request ID tracking for distributed tracing
 */

import pino from "pino";
import type { Logger, LoggerOptions } from "pino";

export interface LogContext {
  requestId?: string;
  userId?: string;
  keyId?: string;
  tunnelId?: string;
  service?: string;
  [key: string]: unknown;
}

export interface CreateLoggerOptions {
  /** Service name (e.g., 'dashboard', 'tunnel-server') */
  service: string;
  /** Log level (default: 'info' in production, 'debug' in development) */
  level?: string;
  /** Force pretty printing even in production */
  pretty?: boolean;
}

/**
 * Create a pino logger instance for a service
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const { service, level, pretty } = options;

  const isDev = process.env.NODE_ENV !== "production";
  const logLevel = level || (isDev ? "debug" : "info");

  const pinoOptions: LoggerOptions = {
    level: logLevel,
    base: {
      service,
      env: process.env.NODE_ENV || "development",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  // Use pretty printing in development or when explicitly requested
  if (isDev || pretty) {
    pinoOptions.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    };
  }

  return pino(pinoOptions);
}

/**
 * Create a child logger with additional context
 */
export function withContext(logger: Logger, context: LogContext): Logger {
  return logger.child(context);
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Default logger instances for common services
 */
let defaultLogger: Logger | null = null;

/**
 * Get or create the default logger
 */
export function getLogger(service = "liveport"): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger({ service });
  }
  return defaultLogger;
}

/**
 * Reset the default logger (useful for testing)
 */
export function resetLogger(): void {
  defaultLogger = null;
}

/**
 * Log levels as constants
 */
export const LogLevel = {
  FATAL: "fatal",
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  DEBUG: "debug",
  TRACE: "trace",
} as const;

export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Structured error logging helper
 */
export function logError(
  logger: Logger,
  error: Error | unknown,
  message: string,
  context?: LogContext
): void {
  if (error instanceof Error) {
    logger.error(
      {
        ...context,
        err: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      },
      message
    );
  } else {
    logger.error(
      {
        ...context,
        err: error,
      },
      message
    );
  }
}

/**
 * HTTP request logging helper
 */
export function logRequest(
  logger: Logger,
  req: {
    method: string;
    url: string;
    headers?: Record<string, string | undefined>;
  },
  res: {
    statusCode: number;
    duration?: number;
  },
  context?: LogContext
): void {
  const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

  logger[level](
    {
      ...context,
      req: {
        method: req.method,
        url: req.url,
        userAgent: req.headers?.["user-agent"],
      },
      res: {
        statusCode: res.statusCode,
        duration: res.duration,
      },
    },
    `${req.method} ${req.url} ${res.statusCode}`
  );
}

export type { Logger };
