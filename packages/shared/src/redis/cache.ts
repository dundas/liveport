import type { Redis } from "ioredis";
import { RedisKeys, RedisTTL } from "./constants";

/**
 * Cache options
 */
export interface CacheOptions {
  /** Time-to-live in seconds */
  ttlSeconds: number;
  /** Key prefix for cache keys */
  keyPrefix?: string;
}

/**
 * Cached value wrapper with metadata
 */
export interface CachedValue<T> {
  value: T;
  cachedAt: number;
  ttl: number;
}

/**
 * Generic cache utility for Redis
 */
export class RedisCache<T> {
  private redis: Redis;
  private ttlSeconds: number;
  private keyPrefix: string;

  constructor(redis: Redis, options: CacheOptions) {
    this.redis = redis;
    this.ttlSeconds = options.ttlSeconds;
    this.keyPrefix = options.keyPrefix ?? "cache";
  }

  /**
   * Build the full cache key
   */
  private buildKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  /**
   * Get a cached value
   * @param key - Cache key
   * @returns Cached value or null if not found
   */
  async get(key: string): Promise<T | null> {
    const fullKey = this.buildKey(key);
    const data = await this.redis.get(fullKey);

    if (!data) {
      return null;
    }

    try {
      const parsed = JSON.parse(data) as CachedValue<T>;
      return parsed.value;
    } catch {
      // Invalid JSON, delete the key
      await this.redis.del(fullKey);
      return null;
    }
  }

  /**
   * Get a cached value with metadata
   * @param key - Cache key
   * @returns Cached value with metadata or null if not found
   */
  async getWithMeta(key: string): Promise<CachedValue<T> | null> {
    const fullKey = this.buildKey(key);
    const data = await this.redis.get(fullKey);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as CachedValue<T>;
    } catch {
      await this.redis.del(fullKey);
      return null;
    }
  }

  /**
   * Set a cached value
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlSeconds - Optional TTL override
   */
  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const fullKey = this.buildKey(key);
    const ttl = ttlSeconds ?? this.ttlSeconds;

    const cached: CachedValue<T> = {
      value,
      cachedAt: Date.now(),
      ttl,
    };

    await this.redis.setex(fullKey, ttl, JSON.stringify(cached));
  }

  /**
   * Delete a cached value
   * @param key - Cache key
   */
  async delete(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const result = await this.redis.del(fullKey);
    return result === 1;
  }

  /**
   * Check if a key exists in cache
   * @param key - Cache key
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const result = await this.redis.exists(fullKey);
    return result === 1;
  }

  /**
   * Get remaining TTL for a key
   * @param key - Cache key
   * @returns TTL in seconds, -1 if no TTL, -2 if key doesn't exist
   */
  async ttl(key: string): Promise<number> {
    const fullKey = this.buildKey(key);
    return this.redis.ttl(fullKey);
  }

  /**
   * Get or set a cached value (cache-aside pattern)
   * @param key - Cache key
   * @param fetcher - Function to fetch value if not cached
   * @param ttlSeconds - Optional TTL override
   */
  async getOrSet(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const cached = await this.get(key);

    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Invalidate multiple keys by pattern
   * Warning: This uses SCAN and may be slow for large datasets
   * @param pattern - Glob pattern to match (e.g., "user:*")
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const fullPattern = this.buildKey(pattern);
    let cursor = "0";
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        fullPattern,
        "COUNT",
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const result = await this.redis.del(...keys);
        deletedCount += result;
      }
    } while (cursor !== "0");

    return deletedCount;
  }
}

/**
 * Create a generic cache
 */
export function createCache<T>(redis: Redis, options: CacheOptions): RedisCache<T> {
  return new RedisCache<T>(redis, options);
}

// ==========================================
// Specialized Cache Helpers
// ==========================================

/**
 * Bridge key validation cache record
 */
export interface BridgeKeyCacheRecord {
  keyPrefix: string;
  userId: string;
  isValid: boolean;
  allowedPort?: number;
  maxUses?: number;
  currentUses: number;
  expiresAt: string;
}

/**
 * Create a bridge key validation cache
 * Uses 300 second (5 minute) TTL
 */
export function createBridgeKeyCache(redis: Redis): RedisCache<BridgeKeyCacheRecord> {
  return new RedisCache<BridgeKeyCacheRecord>(redis, {
    ttlSeconds: RedisTTL.BRIDGE_KEY_CACHE,
    keyPrefix: "bridge_key",
  });
}

/**
 * Bridge key cache helper with convenience methods
 */
export class BridgeKeyCache {
  private cache: RedisCache<BridgeKeyCacheRecord>;

  constructor(redis: Redis) {
    this.cache = createBridgeKeyCache(redis);
  }

  /**
   * Get cached validation for a bridge key
   * @param keyPrefix - The bridge key prefix (first 12 chars)
   */
  async getValidation(keyPrefix: string): Promise<BridgeKeyCacheRecord | null> {
    return this.cache.get(`${keyPrefix}:validated`);
  }

  /**
   * Cache a bridge key validation result
   * @param keyPrefix - The bridge key prefix
   * @param record - Validation record to cache
   */
  async setValidation(
    keyPrefix: string,
    record: BridgeKeyCacheRecord
  ): Promise<void> {
    await this.cache.set(`${keyPrefix}:validated`, record);
  }

  /**
   * Invalidate a cached bridge key validation
   * @param keyPrefix - The bridge key prefix
   */
  async invalidate(keyPrefix: string): Promise<void> {
    await this.cache.delete(`${keyPrefix}:validated`);
  }
}

/**
 * Create a bridge key cache helper
 */
export function createBridgeKeyCacheHelper(redis: Redis): BridgeKeyCache {
  return new BridgeKeyCache(redis);
}

// ==========================================
// Session Cache
// ==========================================

/**
 * Session data structure
 */
export interface SessionData {
  userId: string;
  email?: string;
  tier?: string;
  createdAt: number;
  expiresAt: number;
  [key: string]: unknown;
}

/**
 * Session cache helper
 */
export class SessionCache {
  private redis: Redis;
  private ttlSeconds: number;

  constructor(redis: Redis, ttlSeconds: number = RedisTTL.SESSION) {
    this.redis = redis;
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Get session data
   * @param token - Session token
   */
  async get(token: string): Promise<SessionData | null> {
    const key = RedisKeys.session(token);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as SessionData;
    } catch {
      await this.redis.del(key);
      return null;
    }
  }

  /**
   * Set session data
   * @param token - Session token
   * @param data - Session data
   * @param ttlSeconds - Optional TTL override
   */
  async set(
    token: string,
    data: SessionData,
    ttlSeconds?: number
  ): Promise<void> {
    const key = RedisKeys.session(token);
    const ttl = ttlSeconds ?? this.ttlSeconds;

    // Ensure expiresAt is set
    const sessionData: SessionData = {
      ...data,
      expiresAt: data.expiresAt ?? Date.now() + ttl * 1000,
    };

    await this.redis.setex(key, ttl, JSON.stringify(sessionData));
  }

  /**
   * Delete a session
   * @param token - Session token
   */
  async delete(token: string): Promise<boolean> {
    const key = RedisKeys.session(token);
    const result = await this.redis.del(key);
    return result === 1;
  }

  /**
   * Refresh session TTL
   * @param token - Session token
   * @param ttlSeconds - New TTL in seconds
   */
  async refresh(token: string, ttlSeconds?: number): Promise<boolean> {
    const key = RedisKeys.session(token);
    const ttl = ttlSeconds ?? this.ttlSeconds;

    // Get current data, update expiresAt, and reset TTL
    const data = await this.get(token);
    if (!data) {
      return false;
    }

    data.expiresAt = Date.now() + ttl * 1000;
    await this.set(token, data, ttl);
    return true;
  }

  /**
   * Check if a session exists
   * @param token - Session token
   */
  async exists(token: string): Promise<boolean> {
    const key = RedisKeys.session(token);
    const result = await this.redis.exists(key);
    return result === 1;
  }
}

/**
 * Create a session cache helper
 */
export function createSessionCache(
  redis: Redis,
  ttlSeconds?: number
): SessionCache {
  return new SessionCache(redis, ttlSeconds);
}
