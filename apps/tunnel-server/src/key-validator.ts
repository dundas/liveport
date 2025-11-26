/**
 * Bridge Key Validator
 *
 * Validates bridge keys for tunnel connections using the mech-storage database.
 */

import {
  getKeyPrefix,
  isValidKeyFormat,
  MechStorageClient,
  BridgeKeyRepository,
  verifyKey,
  isBcryptHash,
  legacySha256Hash,
  type BridgeKey,
} from "@liveport/shared";

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

export interface KeyValidatorConfig {
  appId: string;
  apiKey: string;
  baseUrl?: string;
}

/**
 * Bridge Key Validator with real database lookups
 */
export class KeyValidator {
  private db: MechStorageClient;
  private repo: BridgeKeyRepository;
  private initialized: boolean = false;

  constructor(config?: KeyValidatorConfig) {
    // Initialize database client if config provided
    if (config) {
      this.db = new MechStorageClient({
        appId: config.appId,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
      this.repo = new BridgeKeyRepository(this.db);
      this.initialized = true;
    } else {
      // Try to initialize from environment variables
      const appId = process.env.MECH_APPS_APP_ID;
      const apiKey = process.env.MECH_APPS_API_KEY;

      if (appId && apiKey) {
        this.db = new MechStorageClient({
          appId,
          apiKey,
          baseUrl: process.env.MECH_APPS_BASE_URL,
        });
        this.repo = new BridgeKeyRepository(this.db);
        this.initialized = true;
      } else {
        // Create placeholder - will fail if validate() called
        this.db = null as unknown as MechStorageClient;
        this.repo = null as unknown as BridgeKeyRepository;
        console.warn(
          "[KeyValidator] Database not configured. Set MECH_APPS_APP_ID and MECH_APPS_API_KEY."
        );
      }
    }
  }

  /**
   * Check if validator is properly initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Validate key format
   */
  isValidFormat(key: string): boolean {
    return isValidKeyFormat(key);
  }

  /**
   * Validate a bridge key against the database
   */
  async validate(
    key: string,
    requestedPort: number
  ): Promise<KeyValidationResult> {
    // Check format first
    if (!this.isValidFormat(key)) {
      return {
        valid: false,
        error: "Invalid key format",
        errorCode: "INVALID_KEY",
      };
    }

    // Check if database is initialized
    if (!this.initialized) {
      // Development fallback - only if explicitly allowed
      if (process.env.ALLOW_DEV_KEYS === "true" && process.env.NODE_ENV !== "production") {
        console.warn("[KeyValidator] Development mode: accepting unregistered key (ALLOW_DEV_KEYS=true)");
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
        error: "Key validation service unavailable",
        errorCode: "SERVICE_UNAVAILABLE",
      };
    }

    // Extract key prefix for lookup
    const keyPrefix = getKeyPrefix(key);

    // Look up in database by prefix
    let record: BridgeKey | null;
    try {
      record = await this.repo.findByKeyPrefix(keyPrefix);
    } catch (error) {
      console.error("[KeyValidator] Database lookup failed:", error);
      return {
        valid: false,
        error: "Key validation failed",
        errorCode: "VALIDATION_ERROR",
      };
    }

    // Key not found
    if (!record) {
      console.log(`[KeyValidator] Key not found: ${keyPrefix}...`);
      return {
        valid: false,
        error: "Invalid key",
        errorCode: "INVALID_KEY",
      };
    }

    // Verify the key against the stored hash
    // Supports both bcrypt ($2 prefix) and legacy SHA-256 hashes
    let keyValid: boolean;
    try {
      if (isBcryptHash(record.keyHash)) {
        keyValid = await verifyKey(key, record.keyHash);
      } else {
        // Legacy SHA-256 hash comparison
        const computedHash = await legacySha256Hash(key);
        keyValid = computedHash === record.keyHash;
      }
    } catch (error) {
      console.error("[KeyValidator] Hash verification failed:", error);
      return {
        valid: false,
        error: "Key validation failed",
        errorCode: "VALIDATION_ERROR",
      };
    }

    if (!keyValid) {
      console.log(`[KeyValidator] Key hash mismatch: ${keyPrefix}...`);
      return {
        valid: false,
        error: "Invalid key",
        errorCode: "INVALID_KEY",
      };
    }

    // Check status
    if (record.status === "revoked") {
      console.log(`[KeyValidator] Key revoked: ${record.keyPrefix}`);
      return {
        valid: false,
        error: "Key has been revoked",
        errorCode: "KEY_REVOKED",
      };
    }

    if (record.status === "expired") {
      console.log(`[KeyValidator] Key expired: ${record.keyPrefix}`);
      return {
        valid: false,
        error: "Key has expired",
        errorCode: "KEY_EXPIRED",
      };
    }

    // Check expiration date
    if (record.expiresAt && record.expiresAt < new Date()) {
      console.log(`[KeyValidator] Key past expiration: ${record.keyPrefix}`);
      // Update status in database
      try {
        await this.repo.update(record.id, { status: "expired" });
      } catch (e) {
        console.error("[KeyValidator] Failed to update key status:", e);
      }
      return {
        valid: false,
        error: "Key has expired",
        errorCode: "KEY_EXPIRED",
      };
    }

    // Check usage limit
    if (record.maxUses !== undefined && record.currentUses >= record.maxUses) {
      console.log(`[KeyValidator] Key max uses reached: ${record.keyPrefix}`);
      return {
        valid: false,
        error: "Key has reached maximum uses",
        errorCode: "RATE_LIMITED",
      };
    }

    // Check port restriction
    if (record.allowedPort !== undefined && record.allowedPort !== requestedPort) {
      console.log(`[KeyValidator] Port mismatch: ${record.keyPrefix} allows ${record.allowedPort}, requested ${requestedPort}`);
      return {
        valid: false,
        error: `Key only allows port ${record.allowedPort}`,
        errorCode: "PORT_NOT_ALLOWED",
      };
    }

    // Increment usage count and update last used
    try {
      await this.repo.incrementUseCount(record.id);
      await this.repo.updateLastUsed(record.id);
    } catch (e) {
      console.error("[KeyValidator] Failed to update usage count:", e);
      // Don't fail validation for this
    }

    console.log(`[KeyValidator] Key validated: ${record.keyPrefix} (user: ${record.userId})`);

    return {
      valid: true,
      keyId: record.id,
      userId: record.userId,
      expiresAt: record.expiresAt,
      maxUses: record.maxUses,
      currentUses: record.currentUses + 1,
      allowedPort: record.allowedPort ?? null,
    };
  }

  /**
   * Decrement usage count (on disconnect)
   */
  async decrementUsage(keyId: string): Promise<void> {
    if (!this.initialized || keyId === "dev-key") {
      return;
    }

    try {
      const record = await this.repo.findById(keyId);
      if (record && record.currentUses > 0) {
        await this.repo.update(keyId, {
          currentUses: record.currentUses - 1,
        });
      }
    } catch (e) {
      console.error("[KeyValidator] Failed to decrement usage:", e);
    }
  }
}

// Singleton instance
let validatorInstance: KeyValidator | null = null;

export function getKeyValidator(config?: KeyValidatorConfig): KeyValidator {
  if (!validatorInstance) {
    validatorInstance = new KeyValidator(config);
  }
  return validatorInstance;
}

/**
 * Reset the validator instance (useful for testing)
 */
export function resetKeyValidator(): void {
  validatorInstance = null;
}
