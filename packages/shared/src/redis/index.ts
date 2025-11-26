import Redis, { RedisOptions } from "ioredis";

/**
 * Configuration for Redis client
 * Supports both URL-based (Upstash) and host/port/password config
 */
export interface RedisConfig {
  /** Redis URL (e.g., redis://user:pass@host:port or rediss:// for TLS) */
  url?: string;
  /** Redis host */
  host?: string;
  /** Redis port */
  port?: number;
  /** Redis password */
  password?: string;
  /** Enable TLS (default: true if url starts with rediss://) */
  tls?: boolean;
  /** Connection name for debugging */
  connectionName?: string;
  /** Max retries on connection failure */
  maxRetries?: number;
}

/**
 * Redis connection health check result
 */
export interface RedisHealthCheck {
  connected: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Singleton Redis client instance
 */
let redisInstance: Redis | null = null;

/**
 * Create a Redis client with the given configuration
 * Uses connection pooling via ioredis built-in mechanisms
 */
export function createRedisClient(config: RedisConfig): Redis {
  const options: RedisOptions = {
    maxRetriesPerRequest: config.maxRetries ?? 3,
    retryStrategy: (times: number) => {
      const maxRetries = config.maxRetries ?? 3;
      if (times > maxRetries) {
        return null; // Stop retrying
      }
      // Exponential backoff with max 3 seconds
      return Math.min(times * 200, 3000);
    },
    connectionName: config.connectionName ?? "liveport",
    lazyConnect: true,
    enableReadyCheck: true,
  };

  if (config.url) {
    // URL-based configuration (e.g., Upstash)
    const client = new Redis(config.url, options);
    setupErrorHandlers(client);
    return client;
  }

  // Host/port/password configuration
  if (!config.host) {
    throw new Error("Redis configuration requires either url or host");
  }

  const hostOptions: RedisOptions = {
    ...options,
    host: config.host,
    port: config.port ?? 6379,
    password: config.password,
  };

  // Enable TLS if explicitly set or if using default Upstash setup
  if (config.tls) {
    hostOptions.tls = {};
  }

  const client = new Redis(hostOptions);
  setupErrorHandlers(client);
  return client;
}

/**
 * Setup error handlers for Redis client
 */
function setupErrorHandlers(client: Redis): void {
  client.on("error", (error: Error) => {
    console.error("[Redis] Connection error:", error.message);
  });

  client.on("connect", () => {
    console.log("[Redis] Connected successfully");
  });

  client.on("reconnecting", () => {
    console.log("[Redis] Reconnecting...");
  });

  client.on("close", () => {
    console.log("[Redis] Connection closed");
  });
}

/**
 * Get or create the singleton Redis client
 */
export function getRedisClient(config?: RedisConfig): Redis {
  if (!redisInstance) {
    if (!config) {
      throw new Error("Redis not initialized. Call initRedis first.");
    }
    redisInstance = createRedisClient(config);
  }
  return redisInstance;
}

/**
 * Initialize the singleton Redis client
 */
export function initRedis(config: RedisConfig): Redis {
  if (redisInstance) {
    // Close existing connection before creating a new one
    redisInstance.disconnect();
  }
  redisInstance = createRedisClient(config);
  return redisInstance;
}

/**
 * Close the singleton Redis client connection
 */
export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}

/**
 * Check Redis connection health
 */
export async function checkRedisHealth(client: Redis): Promise<RedisHealthCheck> {
  const startTime = Date.now();

  try {
    await client.ping();
    return {
      connected: true,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Re-export Redis type for convenience
export type { Redis };

// Re-export constants
export { RedisKeys, RedisTTL } from "./constants";

// Export sub-modules
export * from "./rate-limiter";
export * from "./tunnel-state";
export * from "./cache";
