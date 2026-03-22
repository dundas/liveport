/**
 * TTL Computation Tests
 *
 * Tests for computeEffectiveExpiry covering all tier and TTL combinations.
 */

import { describe, it, expect } from "vitest";
import { computeEffectiveExpiry, TIER_MAX_TTL } from "./ttl";

describe("computeEffectiveExpiry", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("should use client TTL when shorter than tier max", () => {
    // Client requests 30 minutes, free tier max is 2 hours
    const result = computeEffectiveExpiry(undefined, 1800, "free", now);
    const expected = new Date(now.getTime() + 1800 * 1000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should cap at tier max when client TTL is longer", () => {
    // Client requests 10 hours, free tier max is 2 hours
    const result = computeEffectiveExpiry(undefined, 36000, "free", now);
    const expected = new Date(now.getTime() + TIER_MAX_TTL.free * 1000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should use key expiry when shorter than both client TTL and tier max", () => {
    // Key expires in 30 minutes, client requests 1 hour, free tier max is 2 hours
    const keyExpiry = new Date(now.getTime() + 1800 * 1000);
    const result = computeEffectiveExpiry(keyExpiry, 3600, "free", now);
    expect(result.getTime()).toBe(keyExpiry.getTime());
  });

  it("should default to tier max when no client TTL is provided", () => {
    const result = computeEffectiveExpiry(undefined, undefined, "free", now);
    const expected = new Date(now.getTime() + TIER_MAX_TTL.free * 1000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should cap free tier at 2 hours (7200 seconds)", () => {
    expect(TIER_MAX_TTL.free).toBe(7200);
    const result = computeEffectiveExpiry(undefined, undefined, "free", now);
    const expected = new Date(now.getTime() + 7200 * 1000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should cap paid tiers at 24 hours (86400 seconds)", () => {
    expect(TIER_MAX_TTL.pro).toBe(86400);
    expect(TIER_MAX_TTL.team).toBe(86400);
    expect(TIER_MAX_TTL.enterprise).toBe(86400);

    for (const tier of ["pro", "team", "enterprise"]) {
      const result = computeEffectiveExpiry(undefined, undefined, tier, now);
      const expected = new Date(now.getTime() + 86400 * 1000);
      expect(result.getTime()).toBe(expected.getTime());
    }
  });

  it("should treat unknown tier as free tier", () => {
    const result = computeEffectiveExpiry(undefined, undefined, "unknown", now);
    const expected = new Date(now.getTime() + TIER_MAX_TTL.free * 1000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should ignore zero or negative client TTL", () => {
    const result0 = computeEffectiveExpiry(undefined, 0, "free", now);
    const resultNeg = computeEffectiveExpiry(undefined, -100, "free", now);
    const expected = new Date(now.getTime() + TIER_MAX_TTL.free * 1000);
    expect(result0.getTime()).toBe(expected.getTime());
    expect(resultNeg.getTime()).toBe(expected.getTime());
  });

  it("should allow paid tier client TTL up to 24 hours", () => {
    // Pro user requests 12 hours - should be allowed (under 24h max)
    const result = computeEffectiveExpiry(undefined, 43200, "pro", now);
    const expected = new Date(now.getTime() + 43200 * 1000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should pick key expiry over tier max when key expires sooner", () => {
    // Key expires in 1 hour, no client TTL, free tier max is 2 hours
    const keyExpiry = new Date(now.getTime() + 3600 * 1000);
    const result = computeEffectiveExpiry(keyExpiry, undefined, "free", now);
    expect(result.getTime()).toBe(keyExpiry.getTime());
  });
});
