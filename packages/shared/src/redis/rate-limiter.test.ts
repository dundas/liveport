import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Redis } from "ioredis";
import {
  createRateLimiter,
  enforceRateLimit,
  RateLimitPresets,
  type RateLimiter,
} from "./rate-limiter";

// Mock Redis client
function createMockRedis(): Redis {
  const storage = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => storage.get(key) || null),
    del: vi.fn(async (key: string) => {
      storage.delete(key);
      return 1;
    }),
    multi: vi.fn(() => {
      let newCount = 0;
      return {
        incr: vi.fn((key: string) => {
          const current = parseInt(storage.get(key) || "0", 10);
          newCount = current + 1;
          storage.set(key, String(newCount));
        }),
        expire: vi.fn(),
        exec: vi.fn(async () => [[null, newCount], [null, 1]]),
      };
    }),
  } as unknown as Redis;
}

describe("Rate Limiter", () => {
  let redis: Redis;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    redis = createMockRedis();
    rateLimiter = createRateLimiter(redis, {
      windowMs: 60_000,
      maxRequests: 5,
      keyPrefix: "test",
    });
  });

  describe("createRateLimiter", () => {
    it("should create a rate limiter with check, increment, and reset methods", () => {
      expect(rateLimiter).toHaveProperty("check");
      expect(rateLimiter).toHaveProperty("increment");
      expect(rateLimiter).toHaveProperty("reset");
      expect(typeof rateLimiter.check).toBe("function");
      expect(typeof rateLimiter.increment).toBe("function");
      expect(typeof rateLimiter.reset).toBe("function");
    });
  });

  describe("check", () => {
    it("should return allowed=true when no requests have been made", async () => {
      const result = await rateLimiter.check("user123");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
      expect(result.limit).toBe(5);
      expect(result.current).toBe(0);
    });

    it("should not increment the counter", async () => {
      await rateLimiter.check("user123");
      await rateLimiter.check("user123");
      await rateLimiter.check("user123");

      const result = await rateLimiter.check("user123");
      expect(result.current).toBe(0);
    });
  });

  describe("increment", () => {
    it("should increment the counter and return updated result", async () => {
      const result = await rateLimiter.increment("user123");

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
      expect(result.remaining).toBe(4);
    });

    it("should track multiple increments", async () => {
      await rateLimiter.increment("user123");
      await rateLimiter.increment("user123");
      const result = await rateLimiter.increment("user123");

      expect(result.current).toBe(3);
      expect(result.remaining).toBe(2);
    });

    it("should return allowed=false when limit is exceeded", async () => {
      // Use up all 5 requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.increment("user123");
      }

      // 6th request should be blocked
      const result = await rateLimiter.increment("user123");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.current).toBe(6);
    });

    it("should track different users separately", async () => {
      await rateLimiter.increment("user1");
      await rateLimiter.increment("user1");
      await rateLimiter.increment("user2");

      const result1 = await rateLimiter.check("user1");
      const result2 = await rateLimiter.check("user2");

      expect(result1.current).toBe(2);
      expect(result2.current).toBe(1);
    });

    it("should return resetAt timestamp in the future", async () => {
      const before = Date.now();
      const result = await rateLimiter.increment("user123");
      const after = Date.now();

      expect(result.resetAt).toBeGreaterThan(before);
      // Should reset within the window
      expect(result.resetAt).toBeLessThanOrEqual(after + 60_000);
    });
  });

  describe("reset", () => {
    it("should reset the counter for a user", async () => {
      await rateLimiter.increment("user123");
      await rateLimiter.increment("user123");

      await rateLimiter.reset("user123");

      const result = await rateLimiter.check("user123");
      expect(result.current).toBe(0);
    });

    it("should call redis del with correct key", async () => {
      await rateLimiter.reset("user123");
      expect(redis.del).toHaveBeenCalled();
    });
  });

  describe("enforceRateLimit", () => {
    it("should return result when under limit", async () => {
      const result = await enforceRateLimit(rateLimiter, "user123");

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
    });

    it("should throw error when limit exceeded", async () => {
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.increment("user123");
      }

      await expect(enforceRateLimit(rateLimiter, "user123")).rejects.toThrow(
        /Rate limit exceeded/
      );
    });

    it("should include retryAfter in error", async () => {
      for (let i = 0; i < 5; i++) {
        await rateLimiter.increment("user123");
      }

      try {
        await enforceRateLimit(rateLimiter, "user123");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error & { retryAfter: number }).retryAfter).toBeDefined();
        expect((error as Error & { retryAfter: number }).retryAfter).toBeGreaterThan(0);
      }
    });
  });

  describe("RateLimitPresets", () => {
    it("should have api preset", () => {
      expect(RateLimitPresets.api).toEqual({
        windowMs: 60_000,
        maxRequests: 100,
      });
    });

    it("should have auth preset", () => {
      expect(RateLimitPresets.auth).toEqual({
        windowMs: 60_000,
        maxRequests: 10,
      });
    });

    it("should have tunnelCreate preset", () => {
      expect(RateLimitPresets.tunnelCreate).toEqual({
        windowMs: 60_000,
        maxRequests: 5,
      });
    });

    it("should have keyValidation preset", () => {
      expect(RateLimitPresets.keyValidation).toEqual({
        windowMs: 60_000,
        maxRequests: 30,
      });
    });

    it("should have websocket preset", () => {
      expect(RateLimitPresets.websocket).toEqual({
        windowMs: 60_000,
        maxRequests: 20,
      });
    });
  });
});
