// Main exports for @liveport/shared

// Types
export * from "./types";

// Errors
export * from "./errors";

// Keys
export * from "./keys";

// Crypto
export { hashKey, verifyKey, legacySha256Hash, isBcryptHash } from "./crypto";

// Auth is exported separately via @liveport/shared/auth
// to avoid bundling better-auth in tunnel-server builds
// Use: import { mechStorageAdapter } from "@liveport/shared/auth"

// Logging is exported separately via @liveport/shared/logging
// to avoid bundling pino in Next.js builds
// Use: import { createLogger } from "@liveport/shared/logging"

// Re-export specific modules for direct imports
export { getDatabase, initDatabase, MechStorageClient, DatabaseError } from "./db";
export { BridgeKeyRepository, TunnelRepository, UserRepository, createRepositories } from "./db";
export {
  TABLE_NAMES,
  initializeSchema,
  checkTablesExist,
  createAllTables,
  createAuthTables,
  createBridgeKeysTable,
  createTunnelsTable,
} from "./db";
export type { DatabaseConfig, CreateBridgeKeyInput, UpdateBridgeKeyInput, CreateTunnelInput, UpdateTunnelInput } from "./db";

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
