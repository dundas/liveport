export class LivePortError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "LivePortError";
  }
}

export class AuthenticationError extends LivePortError {
  constructor(message: string = "Authentication required") {
    super(message, "AUTHENTICATION_REQUIRED", 401);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends LivePortError {
  constructor(message: string = "Access denied") {
    super(message, "ACCESS_DENIED", 403);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends LivePortError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends LivePortError {
  constructor(message: string = "Validation failed") {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends LivePortError {
  constructor(message: string = "Rate limit exceeded") {
    super(message, "RATE_LIMIT_EXCEEDED", 429);
    this.name = "RateLimitError";
  }
}

export class BridgeKeyError extends LivePortError {
  constructor(
    message: string,
    code:
      | "KEY_INVALID"
      | "KEY_EXPIRED"
      | "KEY_REVOKED"
      | "KEY_USAGE_EXCEEDED"
      | "KEY_PORT_NOT_ALLOWED"
  ) {
    super(message, code, 401);
    this.name = "BridgeKeyError";
  }
}

export class TunnelError extends LivePortError {
  constructor(
    message: string,
    code: "TUNNEL_NOT_FOUND" | "TUNNEL_DISCONNECTED" | "TUNNEL_TIMEOUT"
  ) {
    super(message, code, code === "TUNNEL_NOT_FOUND" ? 404 : 400);
    this.name = "TunnelError";
  }
}

// Error response helper
export function toErrorResponse(error: unknown): {
  code: string;
  message: string;
  statusCode: number;
} {
  if (error instanceof LivePortError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message,
      statusCode: 500,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "An unknown error occurred",
    statusCode: 500,
  };
}
