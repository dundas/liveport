import type { Redis } from "ioredis";

/**
 * Rate limiter configuration options
 */
export interface RateLimiterOptions {
  /** Window size in milliseconds (default: 60000 = 1 minute) */
  windowMs: number;
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Key prefix for rate limit keys (default: 'ratelimit') */
  keyPrefix?: string;
}

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the current window */
  remaining: number;
  /** Total limit for the window */
  limit: number;
  /** Timestamp when the window resets (ms since epoch) */
  resetAt: number;
  /** Number of requests made in current window */
  current: number;
}

/**
 * Rate limiter interface
 */
export interface RateLimiter {
  /** Check if a request is allowed (does not increment counter) */
  check(key: string): Promise<RateLimitResult>;
  /** Increment the request counter and return result */
  increment(key: string): Promise<RateLimitResult>;
  /** Reset the rate limit for a key */
  reset(key: string): Promise<void>;
}

/**
 * Creates a sliding window rate limiter using Redis
 *
 * Uses a simple sliding window algorithm:
 * - Each window is identified by the current minute (or configured interval)
 * - Requests are counted within each window
 * - Windows automatically expire after the TTL
 *
 * @param redis - Redis client instance
 * @param options - Rate limiter configuration
 * @returns RateLimiter instance
 */
export function createRateLimiter(
  redis: Redis,
  options: RateLimiterOptions
): RateLimiter {
  const { windowMs, maxRequests, keyPrefix = "ratelimit" } = options;

  // TTL in seconds (add a small buffer)
  const ttlSeconds = Math.ceil(windowMs / 1000) + 1;

  /**
   * Get the current window identifier
   */
  function getCurrentWindow(): number {
    return Math.floor(Date.now() / windowMs);
  }

  /**
   * Get the Redis key for a rate limit window
   */
  function getKey(identifier: string, window: number): string {
    return `${keyPrefix}:${identifier}:${window}`;
  }

  /**
   * Calculate when the current window resets
   */
  function getResetTime(window: number): number {
    return (window + 1) * windowMs;
  }

  return {
    async check(identifier: string): Promise<RateLimitResult> {
      const window = getCurrentWindow();
      const key = getKey(identifier, window);

      const countStr = await redis.get(key);
      const current = countStr ? parseInt(countStr, 10) : 0;
      const remaining = Math.max(0, maxRequests - current);

      return {
        allowed: current < maxRequests,
        remaining,
        limit: maxRequests,
        resetAt: getResetTime(window),
        current,
      };
    },

    async increment(identifier: string): Promise<RateLimitResult> {
      const window = getCurrentWindow();
      const key = getKey(identifier, window);

      // Use a transaction to atomically increment and set TTL
      const pipeline = redis.multi();
      pipeline.incr(key);
      pipeline.expire(key, ttlSeconds);
      const results = await pipeline.exec();

      // Results: [[null, newCount], [null, 1]]
      // Handle potential null from exec
      if (!results || !results[0]) {
        throw new Error("Rate limiter: Redis transaction failed");
      }

      const [err, newCount] = results[0];
      if (err) {
        throw err;
      }

      const current = newCount as number;
      const remaining = Math.max(0, maxRequests - current);

      return {
        allowed: current <= maxRequests,
        remaining,
        limit: maxRequests,
        resetAt: getResetTime(window),
        current,
      };
    },

    async reset(identifier: string): Promise<void> {
      const window = getCurrentWindow();
      const key = getKey(identifier, window);
      await redis.del(key);
    },
  };
}

/**
 * Middleware-style rate limit check that throws on limit exceeded
 *
 * @param rateLimiter - RateLimiter instance
 * @param identifier - Unique identifier for the rate limit (e.g., user ID, IP)
 * @throws Error if rate limit is exceeded
 * @returns RateLimitResult if allowed
 */
export async function enforceRateLimit(
  rateLimiter: RateLimiter,
  identifier: string
): Promise<RateLimitResult> {
  const result = await rateLimiter.increment(identifier);

  if (!result.allowed) {
    const retryAfterMs = result.resetAt - Date.now();
    const error = new Error(
      `Rate limit exceeded. Retry after ${Math.ceil(retryAfterMs / 1000)} seconds.`
    );
    (error as Error & { retryAfter: number }).retryAfter = retryAfterMs;
    throw error;
  }

  return result;
}

/**
 * Default rate limit configurations for different use cases
 */
export const RateLimitPresets = {
  /** API endpoint: 100 requests per minute */
  api: { windowMs: 60_000, maxRequests: 100 },

  /** Authentication: 10 attempts per minute */
  auth: { windowMs: 60_000, maxRequests: 10 },

  /** Tunnel creation: 5 per minute */
  tunnelCreate: { windowMs: 60_000, maxRequests: 5 },

  /** Key validation: 30 per minute */
  keyValidation: { windowMs: 60_000, maxRequests: 30 },

  /** WebSocket connections: 20 per minute */
  websocket: { windowMs: 60_000, maxRequests: 20 },
} as const;
