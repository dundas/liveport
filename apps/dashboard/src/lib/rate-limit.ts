/**
 * Rate Limiting Utilities for Dashboard API Routes
 *
 * Provides IP-based rate limiting for authentication endpoints
 * to prevent brute force attacks.
 *
 * Uses Redis for distributed rate limiting (required for multi-instance deployments).
 * Falls back to in-memory store if Redis is not available (development only).
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

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

// Redis client (lazy initialized)
let redisClient: import("ioredis").Redis | null = null;
let redisInitialized = false;

// In-memory fallback store (development only)
const memoryStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Initialize Redis client for rate limiting
 */
async function getRedisClient(): Promise<import("ioredis").Redis | null> {
  if (redisInitialized) {
    return redisClient;
  }

  redisInitialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("[RateLimit] REDIS_URL not configured, using in-memory fallback (not suitable for production)");
    return null;
  }

  try {
    // Dynamic import to avoid bundling issues
    const Redis = (await import("ioredis")).default;
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    // Test connection
    await redisClient.ping();
    console.log("[RateLimit] Redis connected successfully");
    return redisClient;
  } catch (err) {
    console.error("[RateLimit] Failed to connect to Redis:", err);
    return null;
  }
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

  // Vercel specific header
  const vercelIP = request.headers.get("x-vercel-forwarded-for");
  if (vercelIP) {
    return vercelIP.split(",")[0].trim();
  }

  // Fallback to a default (shouldn't happen in production)
  return "unknown";
}

/**
 * Check rate limit using Redis (with in-memory fallback)
 */
export async function checkRateLimitAsync(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { maxRequests, windowMs, keyPrefix = "ratelimit" } = config;
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();

  const redis = await getRedisClient();

  if (redis) {
    // Use Redis for distributed rate limiting
    try {
      // Lua script to atomically increment and set expiry if needed
      // Prevents race conditions where multiple requests set expiry
      const script = `
        local key = KEYS[1]
        local windowMs = tonumber(ARGV[1])
        
        local count = redis.call("INCR", key)
        if count == 1 then
          redis.call("PEXPIRE", key, windowMs)
        end
        local ttl = redis.call("PTTL", key)
        
        return {count, ttl}
      `;

      const result = await redis.eval(script, 1, key, windowMs) as [number, number];
      const count = result[0];
      let ttl = result[1];

      // Handle case where key expired just before PTTL call
      if (ttl === -2) {
        ttl = windowMs;
      }
      // Handle case where key exists but has no expiry (shouldn't happen with this script but good safety)
      if (ttl === -1) {
        await redis.pexpire(key, windowMs);
        ttl = windowMs;
      }

      const resetAt = now + ttl;

      if (count > maxRequests) {
        return {
          success: false,
          remaining: 0,
          limit: maxRequests,
          resetAt,
        };
      }

      return {
        success: true,
        remaining: Math.max(0, maxRequests - count),
        limit: maxRequests,
        resetAt,
      };
    } catch (err) {
      console.error("[RateLimit] Redis error, falling back to memory:", err);
      // Fall through to memory store
    }
  }

  // In-memory fallback
  return checkRateLimitMemory(key, maxRequests, windowMs, now);
}

/**
 * In-memory rate limit check (fallback)
 */
function checkRateLimitMemory(
  key: string,
  maxRequests: number,
  windowMs: number,
  now: number
): RateLimitResult {
  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    cleanupExpiredEntries();
  }

  const entry = memoryStore.get(key);

  // No existing entry or window has reset
  if (!entry || now >= entry.resetAt) {
    memoryStore.set(key, {
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
 * Synchronous rate limit check (uses memory store only)
 * @deprecated Use checkRateLimitAsync for production
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const { maxRequests, windowMs, keyPrefix = "ratelimit" } = config;
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();
  return checkRateLimitMemory(key, maxRequests, windowMs, now);
}

/**
 * Clean up expired entries from the memory store
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (now >= value.resetAt) {
      memoryStore.delete(key);
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
