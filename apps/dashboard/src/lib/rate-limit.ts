/**
 * Rate Limiting Utilities for Dashboard API Routes
 *
 * Provides IP-based rate limiting for authentication endpoints
 * to prevent brute force attacks.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

// In-memory store for rate limiting (use Redis in production for multi-instance)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Key prefix for identifying the rate limit type */
  keyPrefix?: string;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

/**
 * Get the client IP address from the request
 */
export function getClientIP(request: NextRequest): string {
  // Check various headers for the real IP (when behind a proxy)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // Fly.io specific header
  const flyClientIP = request.headers.get("fly-client-ip");
  if (flyClientIP) {
    return flyClientIP;
  }

  // Fallback to a default (shouldn't happen in production)
  return "unknown";
}

/**
 * Check rate limit for a given identifier
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const { maxRequests, windowMs, keyPrefix = "ratelimit" } = config;
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();

  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    cleanupExpiredEntries();
  }

  const entry = rateLimitStore.get(key);

  // No existing entry or window has reset
  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      success: true,
      remaining: maxRequests - 1,
      limit: maxRequests,
      resetAt: now + windowMs,
    };
  }

  // Increment counter
  entry.count += 1;

  // Check if over limit
  if (entry.count > maxRequests) {
    return {
      success: false,
      remaining: 0,
      limit: maxRequests,
      resetAt: entry.resetAt,
    };
  }

  return {
    success: true,
    remaining: maxRequests - entry.count,
    limit: maxRequests,
    resetAt: entry.resetAt,
  };
}

/**
 * Clean up expired entries from the store
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now >= value.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Rate limit presets for common use cases
 */
export const AuthRateLimits = {
  /** Login attempts: 5 per minute per IP */
  login: { maxRequests: 5, windowMs: 60_000, keyPrefix: "auth:login" },
  /** Signup attempts: 3 per minute per IP */
  signup: { maxRequests: 3, windowMs: 60_000, keyPrefix: "auth:signup" },
  /** Password reset: 3 per 5 minutes per IP */
  passwordReset: { maxRequests: 3, windowMs: 300_000, keyPrefix: "auth:reset" },
  /** API key creation: 10 per hour per user */
  keyCreate: { maxRequests: 10, windowMs: 3600_000, keyPrefix: "keys:create" },
} as const;

/**
 * Create a rate-limited response
 */
export function rateLimitedResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);

  return NextResponse.json(
    {
      error: "Too many requests",
      message: `Rate limit exceeded. Please try again in ${retryAfterSeconds} seconds.`,
      retryAfter: retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}

/**
 * Add rate limit headers to a successful response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  return response;
}

/**
 * Middleware helper to apply rate limiting to a route
 */
export async function withRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const ip = getClientIP(request);
  const result = checkRateLimit(ip, config);

  if (!result.success) {
    return rateLimitedResponse(result);
  }

  const response = await handler();
  return addRateLimitHeaders(response, result);
}

/**
 * Get rate limit headers for the current request (async version using headers())
 */
export async function getClientIPFromHeaders(): Promise<string> {
  const headersList = await headers();

  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIP = headersList.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  const flyClientIP = headersList.get("fly-client-ip");
  if (flyClientIP) {
    return flyClientIP;
  }

  return "unknown";
}
