/**
 * Bridge Key Validator
 *
 * Validates bridge keys for tunnel connections.
 */

import { getKeyPrefix, isValidKeyFormat } from "@liveport/shared";

// Simple hash function (same as in dashboard API)
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface KeyValidationResult {
  valid: boolean;
  keyId?: string;
  userId?: string;
  expiresAt?: Date;
  maxUses?: number;
  currentUses?: number;
  allowedPort?: number | null;
  error?: string;
  errorCode?: string;
}

export interface BridgeKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  status: "active" | "revoked" | "expired";
  expiresAt: Date;
  maxUses: number | null;
  currentUses: number;
  allowedPort: number | null;
}

// For MVP, we'll use a mock validator that accepts any valid-format key
// In production, this should query the database
export class KeyValidator {
  private mockKeys: Map<string, BridgeKeyRecord> = new Map();

  /**
   * Validate key format
   */
  isValidFormat(key: string): boolean {
    return isValidKeyFormat(key);
  }

  /**
   * Add a key to the mock database (for testing)
   */
  async addMockKey(
    rawKey: string,
    userId: string,
    options: {
      expiresAt?: Date;
      maxUses?: number;
      allowedPort?: number;
    } = {}
  ): Promise<BridgeKeyRecord> {
    const keyHash = await hashKey(rawKey);
    const keyPrefix = getKeyPrefix(rawKey);

    const record: BridgeKeyRecord = {
      id: crypto.randomUUID(),
      userId,
      keyHash,
      keyPrefix,
      status: "active",
      expiresAt: options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
      maxUses: options.maxUses ?? null,
      currentUses: 0,
      allowedPort: options.allowedPort ?? null,
    };

    this.mockKeys.set(keyHash, record);
    return record;
  }

  /**
   * Validate a bridge key
   */
  async validate(
    key: string,
    requestedPort: number
  ): Promise<KeyValidationResult> {
    // Check format
    if (!this.isValidFormat(key)) {
      return {
        valid: false,
        error: "Invalid key format",
        errorCode: "INVALID_KEY",
      };
    }

    // Hash the key
    const keyHash = await hashKey(key);

    // Look up in mock database
    const record = this.mockKeys.get(keyHash);

    // For MVP development mode, accept any valid-format key
    // This allows testing without setting up full auth flow
    if (!record) {
      // In development, create a temporary "dev" key
      if (process.env.NODE_ENV !== "production") {
        console.log("[KeyValidator] Development mode: accepting unregistered key");
        return {
          valid: true,
          keyId: "dev-key",
          userId: "dev-user",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          maxUses: undefined,
          currentUses: 0,
          allowedPort: null,
        };
      }

      return {
        valid: false,
        error: "Key not found",
        errorCode: "INVALID_KEY",
      };
    }

    // Check status
    if (record.status === "revoked") {
      return {
        valid: false,
        error: "Key has been revoked",
        errorCode: "KEY_REVOKED",
      };
    }

    // Check expiration
    if (record.expiresAt < new Date()) {
      return {
        valid: false,
        error: "Key has expired",
        errorCode: "KEY_EXPIRED",
      };
    }

    // Check usage limit
    if (record.maxUses !== null && record.currentUses >= record.maxUses) {
      return {
        valid: false,
        error: "Key has reached maximum uses",
        errorCode: "RATE_LIMITED",
      };
    }

    // Check port restriction
    if (record.allowedPort !== null && record.allowedPort !== requestedPort) {
      return {
        valid: false,
        error: `Key only allows port ${record.allowedPort}`,
        errorCode: "PORT_NOT_ALLOWED",
      };
    }

    // Increment usage
    record.currentUses++;

    return {
      valid: true,
      keyId: record.id,
      userId: record.userId,
      expiresAt: record.expiresAt,
      maxUses: record.maxUses ?? undefined,
      currentUses: record.currentUses,
      allowedPort: record.allowedPort,
    };
  }

  /**
   * Decrement usage count (on disconnect)
   */
  async decrementUsage(keyId: string): Promise<void> {
    // Find by ID and decrement
    for (const record of this.mockKeys.values()) {
      if (record.id === keyId && record.currentUses > 0) {
        record.currentUses--;
        break;
      }
    }
  }
}

// Singleton instance
let validatorInstance: KeyValidator | null = null;

export function getKeyValidator(): KeyValidator {
  if (!validatorInstance) {
    validatorInstance = new KeyValidator();
  }
  return validatorInstance;
}
