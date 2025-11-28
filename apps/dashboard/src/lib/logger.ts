/**
 * Simple Console Logger for Next.js Dashboard
 * 
 * This is a lightweight logger that works in both Node.js and Edge runtimes.
 * It provides a similar API to pino but uses console.log under the hood.
 */

export interface LogContext {
  requestId?: string;
  userId?: string;
  keyId?: string;
  tunnelId?: string;
  service?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug: (obj: LogContext | string, msg?: string) => void;
  info: (obj: LogContext | string, msg?: string) => void;
  warn: (obj: LogContext | string, msg?: string) => void;
  error: (obj: LogContext | string, msg?: string) => void;
  child: (context: LogContext) => Logger;
}

const isDev = process.env.NODE_ENV !== "production";

function formatLog(level: string, context: LogContext, message?: string): string {
  const timestamp = new Date().toISOString();
  const contextStr = Object.keys(context).length > 0 
    ? ` ${JSON.stringify(context)}` 
    : "";
  return `[${timestamp}] ${level.toUpperCase()}:${contextStr} ${message || ""}`;
}

function createLogFn(level: string, baseContext: LogContext) {
  return (objOrMsg: LogContext | string, msg?: string) => {
    let context: LogContext;
    let message: string | undefined;

    if (typeof objOrMsg === "string") {
      context = baseContext;
      message = objOrMsg;
    } else {
      context = { ...baseContext, ...objOrMsg };
      message = msg;
    }

    const formatted = formatLog(level, context, message);

    switch (level) {
      case "debug":
        if (isDev) console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
    }
  };
}

function createLogger(context: LogContext = {}): Logger {
  return {
    debug: createLogFn("debug", context),
    info: createLogFn("info", context),
    warn: createLogFn("warn", context),
    error: createLogFn("error", context),
    child: (childContext: LogContext) => createLogger({ ...context, ...childContext }),
  };
}

// Default logger instance
let defaultLogger: Logger | null = null;

/**
 * Get the default logger instance
 */
export function getLogger(service = "dashboard"): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger({ service });
  }
  return defaultLogger;
}

/**
 * Reset the logger (for testing)
 */
export function resetLogger(): void {
  defaultLogger = null;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

export { createLogger };

