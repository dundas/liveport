/**
 * Temporary Bridge Key API Tests
 *
 * Tests for the computeTemporaryKeyParams pure function extracted from
 * POST /api/agent/keys/temporary, covering:
 * - Valid params produce correct output fields
 * - TTL exceeding tier max is clamped
 * - Default maxUses = 1 when not specified
 * - maxUses capped at MAX_USES_CAP (100)
 * - Expired parent key returns 401 (via route handler mock test)
 * - Rate limit returns 429 (via route handler mock test)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeTemporaryKeyParams,
  MAX_TTL_BY_TIER,
  DEFAULT_TTL_SECONDS,
  DEFAULT_MAX_USES,
  MAX_USES_CAP,
} from "./route";

describe("computeTemporaryKeyParams", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return correct fields with valid inputs", () => {
    const result = computeTemporaryKeyParams(3600, 5, "free");

    expect(result).toHaveProperty("effectiveTtlSeconds");
    expect(result).toHaveProperty("effectiveMaxUses");
    expect(result).toHaveProperty("expiresAt");
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.effectiveTtlSeconds).toBe(3600);
    expect(result.effectiveMaxUses).toBe(5);
  });

  it("should clamp TTL to free tier max when exceeding limit", () => {
    const maxFreeTtl = MAX_TTL_BY_TIER.free; // 2 hours = 7200s
    const requestedTtl = 99999; // way over free tier

    const result = computeTemporaryKeyParams(requestedTtl, 1, "free");

    expect(result.effectiveTtlSeconds).toBe(maxFreeTtl);
  });

  it("should clamp TTL to paid tier max when exceeding limit", () => {
    const maxPaidTtl = MAX_TTL_BY_TIER.paid; // 24 hours = 86400s
    const requestedTtl = 200000;

    const result = computeTemporaryKeyParams(requestedTtl, 1, "paid");

    expect(result.effectiveTtlSeconds).toBe(maxPaidTtl);
  });

  it("should allow TTL within tier limit", () => {
    const result = computeTemporaryKeyParams(1800, 1, "free"); // 30 min, under 2h

    expect(result.effectiveTtlSeconds).toBe(1800);
  });

  it("should default maxUses to 1 when not specified", () => {
    const result = computeTemporaryKeyParams(3600, undefined, "free");

    expect(result.effectiveMaxUses).toBe(DEFAULT_MAX_USES);
    expect(result.effectiveMaxUses).toBe(1);
  });

  it("should default maxUses to 1 when zero is passed", () => {
    const result = computeTemporaryKeyParams(3600, 0, "free");

    expect(result.effectiveMaxUses).toBe(1);
  });

  it("should default maxUses to 1 when negative is passed", () => {
    const result = computeTemporaryKeyParams(3600, -5, "free");

    expect(result.effectiveMaxUses).toBe(1);
  });

  it("should cap maxUses at MAX_USES_CAP (100)", () => {
    const result = computeTemporaryKeyParams(3600, 500, "free");

    expect(result.effectiveMaxUses).toBe(MAX_USES_CAP);
    expect(result.effectiveMaxUses).toBe(100);
  });

  it("should allow maxUses at exactly the cap", () => {
    const result = computeTemporaryKeyParams(3600, 100, "free");

    expect(result.effectiveMaxUses).toBe(100);
  });

  it("should allow maxUses below the cap", () => {
    const result = computeTemporaryKeyParams(3600, 50, "free");

    expect(result.effectiveMaxUses).toBe(50);
  });

  it("should use DEFAULT_TTL_SECONDS when ttl is undefined", () => {
    const result = computeTemporaryKeyParams(undefined, 1, "free");

    expect(result.effectiveTtlSeconds).toBe(DEFAULT_TTL_SECONDS);
  });

  it("should use DEFAULT_TTL_SECONDS when ttl is zero", () => {
    const result = computeTemporaryKeyParams(0, 1, "free");

    expect(result.effectiveTtlSeconds).toBe(DEFAULT_TTL_SECONDS);
  });

  it("should use DEFAULT_TTL_SECONDS when ttl is negative", () => {
    const result = computeTemporaryKeyParams(-100, 1, "free");

    expect(result.effectiveTtlSeconds).toBe(DEFAULT_TTL_SECONDS);
  });

  it("should compute correct expiresAt date", () => {
    const result = computeTemporaryKeyParams(3600, 1, "free");

    const expected = new Date("2025-06-01T01:00:00Z"); // +1 hour
    expect(result.expiresAt.getTime()).toBe(expected.getTime());
  });

  it("should fall back to free tier max for unknown tier", () => {
    const result = computeTemporaryKeyParams(99999, 1, "unknown_tier");

    expect(result.effectiveTtlSeconds).toBe(MAX_TTL_BY_TIER.free);
  });
});

/**
 * Route handler integration tests
 *
 * These test the full POST handler by mocking dependencies.
 */
describe("POST /api/agent/keys/temporary", () => {
  // We need to mock the dependencies before importing the route handler
  vi.mock("@/lib/bridge-key-auth", () => ({
    validateBridgeKey: vi.fn(),
  }));

  vi.mock("@/lib/db", () => ({
    getBridgeKeyRepository: vi.fn(),
  }));

  vi.mock("@liveport/shared", () => ({
    generateBridgeKey: vi.fn(() => "lpk_test_generated_key"),
    getKeyPrefix: vi.fn(() => "lpk_test"),
    hashKey: vi.fn(async () => "hashed_key_value"),
  }));

  vi.mock("@/lib/logger", () => ({
    getLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  }));

  vi.mock("@/lib/rate-limit", () => ({
    checkRateLimitAsync: vi.fn(),
  }));

  // Helper to create a NextRequest-like object
  function makeRequest(body: Record<string, unknown> = {}) {
    const { NextRequest } = require("next/server");
    return new NextRequest("http://localhost/api/agent/keys/temporary", {
      method: "POST",
      headers: {
        Authorization: "Bearer lpk_test_parent_key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when parent key is expired", async () => {
    const { validateBridgeKey } = await import("@/lib/bridge-key-auth");
    vi.mocked(validateBridgeKey).mockResolvedValue({
      valid: false,
      error: "Key has expired",
      errorCode: "KEY_EXPIRED",
    });

    const { POST } = await import("./route");
    const request = makeRequest();
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Key has expired");
    expect(data.code).toBe("KEY_EXPIRED");
  });

  it("should return 401 when parent key is invalid", async () => {
    const { validateBridgeKey } = await import("@/lib/bridge-key-auth");
    vi.mocked(validateBridgeKey).mockResolvedValue({
      valid: false,
      error: "Invalid bridge key",
      errorCode: "INVALID_KEY",
    });

    const { POST } = await import("./route");
    const request = makeRequest();
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Invalid bridge key");
  });

  it("should return 429 when rate limit is exceeded", async () => {
    const { validateBridgeKey } = await import("@/lib/bridge-key-auth");
    vi.mocked(validateBridgeKey).mockResolvedValue({
      valid: true,
      keyId: "key-123",
      userId: "user-456",
    });

    const { checkRateLimitAsync } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimitAsync).mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });

    const { POST } = await import("./route");
    const request = makeRequest();
    const response = await POST(request);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toBe("Rate limit exceeded");
    expect(data.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("should create a temporary key with correct fields when valid", async () => {
    const { validateBridgeKey } = await import("@/lib/bridge-key-auth");
    vi.mocked(validateBridgeKey).mockResolvedValue({
      valid: true,
      keyId: "key-123",
      userId: "user-456",
    });

    const { checkRateLimitAsync } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimitAsync).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 60000,
    });

    const mockCreate = vi.fn().mockResolvedValue({
      id: "temp-key-id",
      keyPrefix: "lpk_test",
      expiresAt: new Date("2025-06-01T02:00:00Z"),
      maxUses: 1,
      createdAt: new Date("2025-06-01T00:00:00Z"),
    });

    const { getBridgeKeyRepository } = await import("@/lib/db");
    vi.mocked(getBridgeKeyRepository).mockReturnValue({
      create: mockCreate,
    } as any);

    const { POST } = await import("./route");
    const request = makeRequest({ ttlSeconds: 3600 });
    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toHaveProperty("key", "lpk_test_generated_key");
    expect(data).toHaveProperty("id", "temp-key-id");
    expect(data).toHaveProperty("prefix", "lpk_test");
    expect(data).toHaveProperty("maxUses");
    expect(data).toHaveProperty("expiresAt");
    expect(data).toHaveProperty("effectiveTtlSeconds");
    expect(data).toHaveProperty("tier", "free");
  });

  it("should default maxUses to 1 in the created key", async () => {
    const { validateBridgeKey } = await import("@/lib/bridge-key-auth");
    vi.mocked(validateBridgeKey).mockResolvedValue({
      valid: true,
      keyId: "key-123",
      userId: "user-456",
    });

    const { checkRateLimitAsync } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimitAsync).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 60000,
    });

    const mockCreate = vi.fn().mockResolvedValue({
      id: "temp-key-id",
      keyPrefix: "lpk_test",
      expiresAt: new Date("2025-06-01T02:00:00Z"),
      maxUses: 1,
      createdAt: new Date("2025-06-01T00:00:00Z"),
    });

    const { getBridgeKeyRepository } = await import("@/lib/db");
    vi.mocked(getBridgeKeyRepository).mockReturnValue({
      create: mockCreate,
    } as any);

    const { POST } = await import("./route");
    // No maxUses in the request body
    const request = makeRequest({ ttlSeconds: 3600 });
    const response = await POST(request);

    expect(response.status).toBe(201);
    // Verify the repo was called with maxUses=1
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ maxUses: 1 })
    );
  });
});
