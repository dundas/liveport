import type { Redis } from "ioredis";
import { RedisKeys, RedisTTL } from "./constants";

/**
 * Tunnel heartbeat data
 */
export interface TunnelHeartbeat {
  tunnelId: string;
  timestamp: number;
  /** Whether the heartbeat is still valid (within TTL) */
  isAlive: boolean;
}

/**
 * Tunnel metrics data
 */
export interface TunnelMetrics {
  tunnelId: string;
  requestCount: number;
  bytesTransferred: number;
  lastUpdated?: number;
}

/**
 * Active tunnel info
 */
export interface ActiveTunnel {
  tunnelId: string;
  isActive: boolean;
}

/**
 * Tunnel state manager for Redis
 * Handles heartbeats, active tunnel tracking, and metrics
 */
export class TunnelStateManager {
  constructor(private redis: Redis) {}

  // ==========================================
  // Heartbeat Management
  // ==========================================

  /**
   * Set a tunnel heartbeat with TTL
   * @param tunnelId - Tunnel identifier
   * @param ttlSeconds - Time-to-live in seconds (default: 30)
   */
  async setHeartbeat(
    tunnelId: string,
    ttlSeconds: number = RedisTTL.HEARTBEAT
  ): Promise<void> {
    const key = RedisKeys.tunnelHeartbeat(tunnelId);
    const timestamp = Date.now();
    await this.redis.setex(key, ttlSeconds, timestamp.toString());
  }

  /**
   * Get a tunnel heartbeat
   * @param tunnelId - Tunnel identifier
   * @returns Heartbeat data or null if not found
   */
  async getHeartbeat(tunnelId: string): Promise<TunnelHeartbeat | null> {
    const key = RedisKeys.tunnelHeartbeat(tunnelId);
    const timestampStr = await this.redis.get(key);

    if (!timestampStr) {
      return null;
    }

    const timestamp = parseInt(timestampStr, 10);
    const ttl = await this.redis.ttl(key);

    return {
      tunnelId,
      timestamp,
      isAlive: ttl > 0,
    };
  }

  /**
   * Check if a tunnel is alive (has valid heartbeat)
   * @param tunnelId - Tunnel identifier
   */
  async isTunnelAlive(tunnelId: string): Promise<boolean> {
    const key = RedisKeys.tunnelHeartbeat(tunnelId);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Remove a tunnel heartbeat
   * @param tunnelId - Tunnel identifier
   */
  async removeHeartbeat(tunnelId: string): Promise<void> {
    const key = RedisKeys.tunnelHeartbeat(tunnelId);
    await this.redis.del(key);
  }

  // ==========================================
  // Active Tunnels Set Management
  // ==========================================

  /**
   * Add a tunnel to the active tunnels set
   * @param tunnelId - Tunnel identifier
   */
  async addActiveTunnel(tunnelId: string): Promise<void> {
    await this.redis.sadd(RedisKeys.activeTunnels, tunnelId);
  }

  /**
   * Remove a tunnel from the active tunnels set
   * @param tunnelId - Tunnel identifier
   */
  async removeActiveTunnel(tunnelId: string): Promise<void> {
    await this.redis.srem(RedisKeys.activeTunnels, tunnelId);
  }

  /**
   * Check if a tunnel is in the active tunnels set
   * @param tunnelId - Tunnel identifier
   */
  async isActiveTunnel(tunnelId: string): Promise<boolean> {
    const result = await this.redis.sismember(RedisKeys.activeTunnels, tunnelId);
    return result === 1;
  }

  /**
   * Get all active tunnel IDs
   */
  async getActiveTunnels(): Promise<string[]> {
    return this.redis.smembers(RedisKeys.activeTunnels);
  }

  /**
   * Get count of active tunnels
   */
  async getActiveTunnelCount(): Promise<number> {
    return this.redis.scard(RedisKeys.activeTunnels);
  }

  /**
   * Clean up stale tunnels that are in active set but have no heartbeat
   * @returns Array of removed tunnel IDs
   */
  async cleanupStaleTunnels(): Promise<string[]> {
    const activeTunnels = await this.getActiveTunnels();
    const staleTunnels: string[] = [];

    for (const tunnelId of activeTunnels) {
      const isAlive = await this.isTunnelAlive(tunnelId);
      if (!isAlive) {
        await this.removeActiveTunnel(tunnelId);
        staleTunnels.push(tunnelId);
      }
    }

    return staleTunnels;
  }

  // ==========================================
  // Tunnel Metrics Management
  // ==========================================

  /**
   * Increment tunnel request count
   * @param tunnelId - Tunnel identifier
   * @param count - Number to increment by (default: 1)
   */
  async incrementRequestCount(tunnelId: string, count: number = 1): Promise<number> {
    const key = RedisKeys.tunnelMetrics(tunnelId);
    const newCount = await this.redis.hincrby(key, "request_count", count);
    await this.redis.hset(key, "last_updated", Date.now().toString());
    return newCount;
  }

  /**
   * Increment bytes transferred for a tunnel
   * @param tunnelId - Tunnel identifier
   * @param bytes - Number of bytes to add
   */
  async incrementBytesTransferred(tunnelId: string, bytes: number): Promise<number> {
    const key = RedisKeys.tunnelMetrics(tunnelId);
    const newTotal = await this.redis.hincrby(key, "bytes_transferred", bytes);
    await this.redis.hset(key, "last_updated", Date.now().toString());
    return newTotal;
  }

  /**
   * Update multiple metrics at once
   * @param tunnelId - Tunnel identifier
   * @param metrics - Metrics to update
   */
  async updateMetrics(
    tunnelId: string,
    metrics: { requestCount?: number; bytesTransferred?: number }
  ): Promise<void> {
    const key = RedisKeys.tunnelMetrics(tunnelId);
    const pipeline = this.redis.multi();

    if (metrics.requestCount !== undefined) {
      pipeline.hincrby(key, "request_count", metrics.requestCount);
    }
    if (metrics.bytesTransferred !== undefined) {
      pipeline.hincrby(key, "bytes_transferred", metrics.bytesTransferred);
    }
    pipeline.hset(key, "last_updated", Date.now().toString());

    await pipeline.exec();
  }

  /**
   * Get tunnel metrics
   * @param tunnelId - Tunnel identifier
   */
  async getMetrics(tunnelId: string): Promise<TunnelMetrics> {
    const key = RedisKeys.tunnelMetrics(tunnelId);
    const data = await this.redis.hgetall(key);

    return {
      tunnelId,
      requestCount: parseInt(data.request_count || "0", 10),
      bytesTransferred: parseInt(data.bytes_transferred || "0", 10),
      lastUpdated: data.last_updated ? parseInt(data.last_updated, 10) : undefined,
    };
  }

  /**
   * Reset tunnel metrics
   * @param tunnelId - Tunnel identifier
   */
  async resetMetrics(tunnelId: string): Promise<void> {
    const key = RedisKeys.tunnelMetrics(tunnelId);
    await this.redis.del(key);
  }

  // ==========================================
  // Combined Operations
  // ==========================================

  /**
   * Register a new tunnel (add to active set and set initial heartbeat)
   * @param tunnelId - Tunnel identifier
   */
  async registerTunnel(tunnelId: string): Promise<void> {
    const pipeline = this.redis.multi();
    pipeline.sadd(RedisKeys.activeTunnels, tunnelId);
    pipeline.setex(
      RedisKeys.tunnelHeartbeat(tunnelId),
      RedisTTL.HEARTBEAT,
      Date.now().toString()
    );
    await pipeline.exec();
  }

  /**
   * Unregister a tunnel (remove from active set, heartbeat, and optionally metrics)
   * @param tunnelId - Tunnel identifier
   * @param keepMetrics - Whether to preserve metrics (default: true)
   */
  async unregisterTunnel(tunnelId: string, keepMetrics: boolean = true): Promise<void> {
    const pipeline = this.redis.multi();
    pipeline.srem(RedisKeys.activeTunnels, tunnelId);
    pipeline.del(RedisKeys.tunnelHeartbeat(tunnelId));

    if (!keepMetrics) {
      pipeline.del(RedisKeys.tunnelMetrics(tunnelId));
    }

    await pipeline.exec();
  }

  /**
   * Get full tunnel state
   * @param tunnelId - Tunnel identifier
   */
  async getTunnelState(tunnelId: string): Promise<{
    isActive: boolean;
    heartbeat: TunnelHeartbeat | null;
    metrics: TunnelMetrics;
  }> {
    const [isActive, heartbeat, metrics] = await Promise.all([
      this.isActiveTunnel(tunnelId),
      this.getHeartbeat(tunnelId),
      this.getMetrics(tunnelId),
    ]);

    return { isActive, heartbeat, metrics };
  }
}

/**
 * Create a tunnel state manager
 * @param redis - Redis client instance
 */
export function createTunnelStateManager(redis: Redis): TunnelStateManager {
  return new TunnelStateManager(redis);
}
