// Main exports for @liveport/shared

// Types
export * from "./types";

// Errors
export * from "./errors";

// Keys
export * from "./keys";

// Auth
export { mechStorageAdapter } from "./auth";
export type { Adapter } from "./auth";

// Re-export specific modules for direct imports
export { getDatabase, initDatabase, MechStorageClient, DatabaseError } from "./db";
export type { DatabaseConfig } from "./db";

export {
  createRedisClient,
  getRedisClient,
  initRedis,
  closeRedis,
  checkRedisHealth,
  createRateLimiter,
  enforceRateLimit,
  RateLimitPresets,
  createTunnelStateManager,
  TunnelStateManager,
  createCache,
  RedisCache,
  createBridgeKeyCache,
  createBridgeKeyCacheHelper,
  BridgeKeyCache,
  createSessionCache,
  SessionCache,
  RedisKeys,
  RedisTTL,
} from "./redis";
export type {
  RedisConfig,
  RedisHealthCheck,
  Redis,
  RateLimiter,
  RateLimiterOptions,
  RateLimitResult,
  TunnelHeartbeat,
  TunnelMetrics,
  ActiveTunnel,
  CacheOptions,
  CachedValue,
  BridgeKeyCacheRecord,
  SessionData,
} from "./redis";
