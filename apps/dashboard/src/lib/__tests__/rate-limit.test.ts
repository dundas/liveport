/**
 * Rate Limiting Tests
 *
 * Tests for the rate limiting utilities including:
 * - In-memory rate limiting
 * - Redis-based rate limiting
 * - IP extraction from various headers
 * - Rate limit responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Next.js modules
vi.mock("next/server", () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn((body, init) => ({
      body,
      status: init?.status || 200,
      headers: new Map(Object.entries(init?.headers || {})),
    })),
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

// Import after mocking
import {
  checkRateLimit,
  getClientIP,
  rateLimitedResponse,
  addRateLimitHeaders,
  AuthRateLimits,
  type RateLimitConfig,
  type RateLimitResult,
} from "../rate-limit";
import { NextRequest, NextResponse } from "next/server";

describe("Rate Limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("checkRateLimit (in-memory)", () => {
    it("should allow requests within the limit", () => {
      const config: RateLimitConfig = {
        maxRequests: 5,
        windowMs: 60000,
        keyPrefix: "test",
      };

      // First request should succeed
      const result1 = checkRateLimit("user1", config);
      expect(result1.success).toBe(true);
      expect(result1.remaining).toBe(4);
      expect(result1.limit).toBe(5);

      // Second request should succeed
      const result2 = checkRateLimit("user1", config);
      expect(result2.success).toBe(true);
      expect(result2.remaining).toBe(3);
    });

    it("should block requests over the limit", () => {
      const config: RateLimitConfig = {
        maxRequests: 3,
        windowMs: 60000,
        keyPrefix: "test-block",
      };

      // Use up all requests
      checkRateLimit("user2", config);
      checkRateLimit("user2", config);
      checkRateLimit("user2", config);

      // Fourth request should be blocked
      const result = checkRateLimit("user2", config);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should reset after window expires", () => {
      const config: RateLimitConfig = {
        maxRequests: 2,
        windowMs: 60000,
        keyPrefix: "test-reset",
      };

      // Use up all requests
      checkRateLimit("user3", config);
      checkRateLimit("user3", config);

      // Should be blocked
      const blocked = checkRateLimit("user3", config);
      expect(blocked.success).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(60001);

      // Should be allowed again
      const allowed = checkRateLimit("user3", config);
      expect(allowed.success).toBe(true);
      expect(allowed.remaining).toBe(1);
    });

    it("should use separate counters for different identifiers", () => {
      const config: RateLimitConfig = {
        maxRequests: 2,
        windowMs: 60000,
        keyPrefix: "test-separate",
      };

      // User A uses up their limit
      checkRateLimit("userA", config);
      checkRateLimit("userA", config);
      const userABlocked = checkRateLimit("userA", config);
      expect(userABlocked.success).toBe(false);

      // User B should still have their full limit
      const userBResult = checkRateLimit("userB", config);
      expect(userBResult.success).toBe(true);
      expect(userBResult.remaining).toBe(1);
    });

    it("should use separate counters for different key prefixes", () => {
      const loginConfig: RateLimitConfig = {
        maxRequests: 2,
        windowMs: 60000,
        keyPrefix: "login",
      };

      const signupConfig: RateLimitConfig = {
        maxRequests: 2,
        windowMs: 60000,
        keyPrefix: "signup",
      };

      // Use up login limit
      checkRateLimit("user", loginConfig);
      checkRateLimit("user", loginConfig);
      const loginBlocked = checkRateLimit("user", loginConfig);
      expect(loginBlocked.success).toBe(false);

      // Signup should still work
      const signupResult = checkRateLimit("user", signupConfig);
      expect(signupResult.success).toBe(true);
    });
  });

  describe("getClientIP", () => {
    it("should extract IP from x-forwarded-for header", () => {
      const request = {
        headers: {
          get: vi.fn((name: string) => {
            if (name === "x-forwarded-for") return "1.2.3.4, 5.6.7.8";
            return null;
          }),
        },
      } as unknown as NextRequest;

      expect(getClientIP(request)).toBe("1.2.3.4");
    });

    it("should extract IP from x-real-ip header", () => {
      const request = {
        headers: {
          get: vi.fn((name: string) => {
            if (name === "x-real-ip") return "10.0.0.1";
            return null;
          }),
        },
      } as unknown as NextRequest;

      expect(getClientIP(request)).toBe("10.0.0.1");
    });

    it("should extract IP from fly-client-ip header", () => {
      const request = {
        headers: {
          get: vi.fn((name: string) => {
            if (name === "fly-client-ip") return "192.168.1.1";
            return null;
          }),
        },
      } as unknown as NextRequest;

      expect(getClientIP(request)).toBe("192.168.1.1");
    });

    it("should extract IP from x-vercel-forwarded-for header", () => {
      const request = {
        headers: {
          get: vi.fn((name: string) => {
            if (name === "x-vercel-forwarded-for") return "203.0.113.1, 198.51.100.1";
            return null;
          }),
        },
      } as unknown as NextRequest;

      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("should return 'unknown' when no IP headers present", () => {
      const request = {
        headers: {
          get: vi.fn(() => null),
        },
      } as unknown as NextRequest;

      expect(getClientIP(request)).toBe("unknown");
    });

    it("should prioritize x-forwarded-for over other headers", () => {
      const request = {
        headers: {
          get: vi.fn((name: string) => {
            if (name === "x-forwarded-for") return "1.1.1.1";
            if (name === "x-real-ip") return "2.2.2.2";
            if (name === "fly-client-ip") return "3.3.3.3";
            return null;
          }),
        },
      } as unknown as NextRequest;

      expect(getClientIP(request)).toBe("1.1.1.1");
    });
  });

  describe("rateLimitedResponse", () => {
    it("should return 429 status with correct headers", () => {
      const result: RateLimitResult = {
        success: false,
        remaining: 0,
        limit: 5,
        resetAt: Date.now() + 30000, // 30 seconds from now
      };

      const response = rateLimitedResponse(result);

      expect(response.status).toBe(429);
      expect(response.body.error).toBe("Too many requests");
      expect(response.body.retryAfter).toBe(30);
      expect(response.headers.get("Retry-After")).toBe("30");
      expect(response.headers.get("X-RateLimit-Limit")).toBe("5");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    });
  });

  describe("addRateLimitHeaders", () => {
    it("should add rate limit headers to response", () => {
      const mockResponse = {
        headers: {
          set: vi.fn(),
        },
      } as unknown as NextResponse;

      const result: RateLimitResult = {
        success: true,
        remaining: 3,
        limit: 5,
        resetAt: Date.now() + 60000,
      };

      addRateLimitHeaders(mockResponse, result);

      expect(mockResponse.headers.set).toHaveBeenCalledWith("X-RateLimit-Limit", "5");
      expect(mockResponse.headers.set).toHaveBeenCalledWith("X-RateLimit-Remaining", "3");
      expect(mockResponse.headers.set).toHaveBeenCalledWith(
        "X-RateLimit-Reset",
        expect.any(String)
      );
    });
  });

  describe("AuthRateLimits presets", () => {
    it("should have correct login limits", () => {
      expect(AuthRateLimits.login.maxRequests).toBe(5);
      expect(AuthRateLimits.login.windowMs).toBe(60000);
      expect(AuthRateLimits.login.keyPrefix).toBe("auth:login");
    });

    it("should have correct signup limits", () => {
      expect(AuthRateLimits.signup.maxRequests).toBe(3);
      expect(AuthRateLimits.signup.windowMs).toBe(60000);
      expect(AuthRateLimits.signup.keyPrefix).toBe("auth:signup");
    });

    it("should have correct password reset limits", () => {
      expect(AuthRateLimits.passwordReset.maxRequests).toBe(3);
      expect(AuthRateLimits.passwordReset.windowMs).toBe(300000);
      expect(AuthRateLimits.passwordReset.keyPrefix).toBe("auth:reset");
    });

    it("should have correct key creation limits", () => {
      expect(AuthRateLimits.keyCreate.maxRequests).toBe(10);
      expect(AuthRateLimits.keyCreate.windowMs).toBe(3600000);
      expect(AuthRateLimits.keyCreate.keyPrefix).toBe("keys:create");
    });
  });
});

describe("Rate Limiting Edge Cases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should handle concurrent requests correctly", () => {
    const config: RateLimitConfig = {
      maxRequests: 10,
      windowMs: 60000,
      keyPrefix: "concurrent",
    };

    // Simulate 10 concurrent requests
    const results = Array(10)
      .fill(null)
      .map(() => checkRateLimit("concurrent-user", config));

    // All should succeed
    results.forEach((result, index) => {
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(10 - index - 1);
    });

    // 11th request should fail
    const blocked = checkRateLimit("concurrent-user", config);
    expect(blocked.success).toBe(false);
  });

  it("should handle very short windows", () => {
    const config: RateLimitConfig = {
      maxRequests: 1,
      windowMs: 100, // 100ms window
      keyPrefix: "short-window",
    };

    // First request succeeds
    const result1 = checkRateLimit("short-user", config);
    expect(result1.success).toBe(true);

    // Second request blocked
    const result2 = checkRateLimit("short-user", config);
    expect(result2.success).toBe(false);

    // Advance past window
    vi.advanceTimersByTime(101);

    // Third request succeeds
    const result3 = checkRateLimit("short-user", config);
    expect(result3.success).toBe(true);
  });

  it("should handle missing keyPrefix", () => {
    const config: RateLimitConfig = {
      maxRequests: 5,
      windowMs: 60000,
      // No keyPrefix
    };

    const result = checkRateLimit("no-prefix-user", config);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });
});

