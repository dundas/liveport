/**
 * Bridge Key Authentication
 *
 * Validates bridge keys for Agent API endpoints.
 */

import { NextRequest } from "next/server";
import { getBridgeKeyRepository } from "./db";
import { getKeyPrefix, verifyKey, isBcryptHash, legacySha256Hash } from "@liveport/shared";

export interface AuthResult {
  valid: boolean;
  keyId?: string;
  userId?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Validate a bridge key from the Authorization header
 */
export async function validateBridgeKey(request: NextRequest): Promise<AuthResult> {
  // Get Authorization header
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return {
      valid: false,
      error: "Missing Authorization header",
      errorCode: "MISSING_AUTH",
    };
  }

  // Extract token from "Bearer <token>" format
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      valid: false,
      error: "Invalid Authorization header format",
      errorCode: "INVALID_AUTH_FORMAT",
    };
  }

  const bridgeKey = match[1];

  // Validate key format
  if (!bridgeKey.startsWith("lpk_")) {
    return {
      valid: false,
      error: "Invalid bridge key format",
      errorCode: "INVALID_KEY_FORMAT",
    };
  }

  // Look up key by prefix
  const keyPrefix = getKeyPrefix(bridgeKey);
  const repo = getBridgeKeyRepository();

  try {
    const keyRecord = await repo.findByKeyPrefix(keyPrefix);

    if (!keyRecord) {
      return {
        valid: false,
        error: "Invalid bridge key",
        errorCode: "INVALID_KEY",
      };
    }

    // Verify hash
    let hashValid = false;
    if (isBcryptHash(keyRecord.keyHash)) {
      hashValid = await verifyKey(bridgeKey, keyRecord.keyHash);
    } else {
      // Legacy SHA-256 hash
      const computedHash = await legacySha256Hash(bridgeKey);
      hashValid = computedHash === keyRecord.keyHash;
    }

    if (!hashValid) {
      return {
        valid: false,
        error: "Invalid bridge key",
        errorCode: "INVALID_KEY",
      };
    }

    // Check status
    if (keyRecord.status !== "active") {
      return {
        valid: false,
        error: `Key is ${keyRecord.status}`,
        errorCode: "KEY_NOT_ACTIVE",
      };
    }

    // Check expiration
    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return {
        valid: false,
        error: "Key has expired",
        errorCode: "KEY_EXPIRED",
      };
    }

    // Check usage limit
    if (keyRecord.maxUses && keyRecord.currentUses >= keyRecord.maxUses) {
      return {
        valid: false,
        error: "Key usage limit reached",
        errorCode: "KEY_LIMIT_REACHED",
      };
    }

    return {
      valid: true,
      keyId: keyRecord.id,
      userId: keyRecord.userId,
    };
  } catch (error) {
    console.error("[BridgeKeyAuth] Error validating key:", error);
    return {
      valid: false,
      error: "Internal error",
      errorCode: "INTERNAL_ERROR",
    };
  }
}
