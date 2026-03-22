/**
 * Temporary Bridge Key API
 *
 * POST /api/agent/keys/temporary - Create a temporary bridge key
 *
 * Authenticates via Bearer token (existing bridge key) and creates a
 * temporary sub-key with short TTL and limited uses. Used by `liveport share`.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateBridgeKey } from "@/lib/bridge-key-auth";
import { getBridgeKeyRepository } from "@/lib/db";
import { generateBridgeKey, getKeyPrefix, hashKey } from "@liveport/shared";
import { getLogger } from "@/lib/logger";
import { checkRateLimitAsync } from "@/lib/rate-limit";

const logger = getLogger("dashboard:api:agent:keys:temporary");

/** Temporary key naming convention */
const TEMPORARY_KEY_NAME = "Temporary (liveport share)";

/** Max TTL per tier in seconds */
export const MAX_TTL_BY_TIER: Record<string, number> = {
  free: 2 * 60 * 60,     // 2 hours
  paid: 24 * 60 * 60,    // 24 hours
};

/** Default TTL in seconds (2 hours) */
export const DEFAULT_TTL_SECONDS = 2 * 60 * 60;

/** Default max uses */
export const DEFAULT_MAX_USES = 1;

/** Absolute cap on maxUses to prevent abuse */
export const MAX_USES_CAP = 100;

/**
 * Compute effective parameters for a temporary key request.
 * Pure function - no side effects, easy to test.
 */
export function computeTemporaryKeyParams(
  requestedTtlSeconds: number | undefined,
  requestedMaxUses: number | undefined,
  tier: string
): { effectiveTtlSeconds: number; effectiveMaxUses: number; expiresAt: Date } {
  // Determine TTL
  const ttlSeconds = requestedTtlSeconds && requestedTtlSeconds > 0
    ? requestedTtlSeconds
    : DEFAULT_TTL_SECONDS;

  // Enforce max TTL per tier
  const maxTtl = MAX_TTL_BY_TIER[tier] || MAX_TTL_BY_TIER.free;
  const effectiveTtlSeconds = Math.min(ttlSeconds, maxTtl);

  // Determine max uses with default and cap
  const effectiveMaxUses = Math.min(
    requestedMaxUses && requestedMaxUses > 0 ? requestedMaxUses : DEFAULT_MAX_USES,
    MAX_USES_CAP
  );

  const expiresAt = new Date(Date.now() + effectiveTtlSeconds * 1000);

  return { effectiveTtlSeconds, effectiveMaxUses, expiresAt };
}

/**
 * POST /api/agent/keys/temporary - Create a temporary bridge key
 */
export async function POST(request: NextRequest) {
  // Validate parent bridge key
  const auth = await validateBridgeKey(request);

  if (!auth.valid) {
    return NextResponse.json(
      { error: auth.error, code: auth.errorCode },
      { status: 401 }
    );
  }

  // Rate limiting - 10 requests per minute per key (stricter for key creation)
  const rateLimit = await checkRateLimitAsync(auth.keyId!, {
    maxRequests: 10,
    windowMs: 60_000,
    keyPrefix: "agent:keys:temporary",
  });

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": rateLimit.limit.toString(),
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Reset": rateLimit.resetAt.toString(),
        },
      }
    );
  }

  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const {
      ttlSeconds: rawTtl,
      maxUses: rawMaxUses,
    } = body as {
      ttlSeconds?: unknown;
      maxUses?: unknown;
    };

    // Validate input types: must be finite integers to prevent coercion bugs
    const requestedTtl = typeof rawTtl === "number" && Number.isInteger(rawTtl) && rawTtl > 0 ? rawTtl : undefined;
    const requestedMaxUses = typeof rawMaxUses === "number" && Number.isInteger(rawMaxUses) && rawMaxUses > 0 ? rawMaxUses : undefined;

    // Determine user tier (default to free for now)
    // TODO: Look up user subscription tier when billing is implemented
    const tier = "free";

    // Compute effective parameters
    const { effectiveTtlSeconds: effectiveTtl, effectiveMaxUses: maxUses, expiresAt } =
      computeTemporaryKeyParams(requestedTtl, requestedMaxUses, tier);

    // Generate the temporary bridge key
    const rawKey = generateBridgeKey();
    const keyPrefix = getKeyPrefix(rawKey);
    const keyHash = await hashKey(rawKey);

    // Create in database
    const repo = getBridgeKeyRepository();
    const created = await repo.create({
      userId: auth.userId!,
      name: TEMPORARY_KEY_NAME,
      keyHash,
      keyPrefix,
      expiresAt,
      maxUses,
    });

    logger.info(
      {
        userId: auth.userId,
        parentKeyId: auth.keyId,
        tempKeyId: created.id,
        ttl: effectiveTtl,
        maxUses,
        tier,
      },
      "Temporary bridge key created via liveport share"
    );

    // Return the raw key (shown once)
    return NextResponse.json({
      key: rawKey,
      id: created.id,
      name: TEMPORARY_KEY_NAME,
      prefix: created.keyPrefix,
      expiresAt: created.expiresAt?.toISOString() || null,
      maxUses: created.maxUses,
      createdAt: created.createdAt.toISOString(),
      tier,
      effectiveTtlSeconds: effectiveTtl,
    }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Failed to create temporary bridge key");
    return NextResponse.json(
      { error: "Failed to create temporary key" },
      { status: 500 }
    );
  }
}
