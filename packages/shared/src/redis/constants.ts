/**
 * Redis key patterns used in LivePort
 */
export const RedisKeys = {
  /** Tunnel heartbeat key (30s TTL) */
  tunnelHeartbeat: (tunnelId: string) => `tunnel:${tunnelId}:heartbeat`,

  /** Tunnel metrics hash */
  tunnelMetrics: (tunnelId: string) => `tunnel:${tunnelId}:metrics`,

  /** Rate limit key (60s TTL) */
  rateLimit: (keyId: string, minute: number) => `ratelimit:${keyId}:${minute}`,

  /** Cached bridge key validation (300s TTL) */
  bridgeKeyValidated: (prefix: string) => `bridge_key:${prefix}:validated`,

  /** Session cache (3600s TTL) */
  session: (token: string) => `session:${token}`,

  /** Set of active tunnel IDs */
  activeTunnels: "active_tunnels",
} as const;

/**
 * Redis TTL constants (in seconds)
 */
export const RedisTTL = {
  HEARTBEAT: 30,
  RATE_LIMIT: 60,
  BRIDGE_KEY_CACHE: 300,
  SESSION: 3600,
} as const;
