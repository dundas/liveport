/**
 * Metering Service
 *
 * Periodically persists tunnel usage metrics (request count, bytes transferred)
 * to the database for billing purposes.
 *
 * Key features:
 * - Periodic sync (every 30s by default) to reduce DB load
 * - UPSERT pattern to avoid race conditions
 * - Snapshot connections before iterating to prevent data loss
 * - Finalization on disconnect for accurate billing
 */

import { getConnectionManager } from "./connection-manager";
import { getDatabase } from "@liveport/shared";
import { createLogger } from "@liveport/shared/logging";
import type { TunnelConnection } from "./types";

const logger = createLogger({ service: "tunnel-server:metering" });

export interface MeteringConfig {
  syncIntervalMs: number; // How often to sync metrics to DB
  enabled: boolean;
}

const DEFAULT_CONFIG: MeteringConfig = {
  syncIntervalMs: 30000, // Sync every 30 seconds (reduced from 60s for better accuracy)
  enabled: true,
};

let meteringTimer: NodeJS.Timeout | null = null;
let lastSyncTime: Date | null = null;
let syncErrorCount = 0;

/**
 * Start the metering service
 */
export function startMetering(config: Partial<MeteringConfig> = {}): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.enabled) {
    logger.info("Metering disabled");
    return;
  }

  logger.info({ syncIntervalMs: cfg.syncIntervalMs }, "Starting metering service");

  // Initial sync after 10 seconds
  setTimeout(() => {
    syncMetrics().catch((err) => {
      logger.error({ err }, "Initial sync failed");
    });
  }, 10000);

  // Periodic sync
  meteringTimer = setInterval(() => {
    syncMetrics().catch((err) => {
      logger.error({ err }, "Sync failed");
    });
  }, cfg.syncIntervalMs);
}

/**
 * Stop the metering service
 */
export function stopMetering(): void {
  if (meteringTimer) {
    clearInterval(meteringTimer);
    meteringTimer = null;
    logger.info("Metering service stopped");
  }
}

/**
 * Get metering service health status
 */
export function getMeteringHealth(): {
  status: "healthy" | "degraded" | "unhealthy";
  lastSyncAt: string | null;
  syncErrorCount: number;
} {
  const status = syncErrorCount === 0 ? "healthy" : syncErrorCount < 3 ? "degraded" : "unhealthy";
  return {
    status,
    lastSyncAt: lastSyncTime?.toISOString() || null,
    syncErrorCount,
  };
}

/**
 * Sync metrics to database using UPSERT pattern
 * Takes a snapshot of connections to avoid race conditions
 */
export async function syncMetrics(): Promise<void> {
  const connectionManager = getConnectionManager();
  
  // Take snapshot to avoid race conditions during iteration
  // This prevents issues if connections disconnect while we're syncing
  const connections: TunnelConnection[] = [...connectionManager.getAll()];

  if (connections.length === 0) {
    return;
  }

  logger.info({ tunnelCount: connections.length }, "Syncing metrics");
  const startTime = Date.now();

  try {
    const db = getDatabase();
    let successCount = 0;
    let errorCount = 0;

    // Update each tunnel's metrics using UPSERT
    for (const conn of connections) {
      try {
        // Use UPSERT pattern to avoid race conditions
        // ON CONFLICT handles the case where record already exists
        await db.query(
          `INSERT INTO tunnels (
            id, user_id, bridge_key_id, subdomain, name, local_port,
            public_url, region, connected_at, request_count, bytes_transferred
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            request_count = EXCLUDED.request_count,
            bytes_transferred = EXCLUDED.bytes_transferred
          WHERE tunnels.disconnected_at IS NULL`,
          [
            conn.id,
            conn.userId,
            conn.keyId,
            conn.subdomain,
            conn.name || null,
            conn.localPort,
            `https://${conn.subdomain}.${process.env.BASE_DOMAIN || "liveport.online"}`,
            process.env.FLY_REGION || "us-east",
            conn.createdAt.toISOString(),
            conn.requestCount,
            conn.bytesTransferred,
          ]
        );
        successCount++;
      } catch (err) {
        errorCount++;
        logger.error(
          { err, tunnelId: conn.id, subdomain: conn.subdomain },
          "Failed to sync tunnel metrics"
        );
      }
    }

    const duration = Date.now() - startTime;
    lastSyncTime = new Date();
    
    if (errorCount === 0) {
      syncErrorCount = 0; // Reset error count on successful sync
    } else {
      syncErrorCount++;
    }

    logger.info(
      { successCount, errorCount, durationMs: duration },
      "Sync complete"
    );
  } catch (err) {
    syncErrorCount++;
    logger.error({ err }, "Database error during sync");
    throw err;
  }
}

/**
 * Finalize metrics for a disconnected tunnel
 * Uses UPSERT to ensure the record exists before updating
 */
export async function finalizeTunnelMetrics(
  tunnelId: string,
  requestCount: number,
  bytesTransferred: number,
  tunnelInfo?: {
    userId: string;
    keyId: string;
    subdomain: string;
    name?: string;
    localPort: number;
    createdAt: Date;
  }
): Promise<void> {
  try {
    const db = getDatabase();

    if (tunnelInfo) {
      // Use UPSERT to ensure record exists and update with final metrics
      await db.query(
        `INSERT INTO tunnels (
          id, user_id, bridge_key_id, subdomain, name, local_port, 
          public_url, region, connected_at, request_count, bytes_transferred, disconnected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          request_count = EXCLUDED.request_count,
          bytes_transferred = EXCLUDED.bytes_transferred,
          disconnected_at = NOW()`,
        [
          tunnelId,
          tunnelInfo.userId,
          tunnelInfo.keyId,
          tunnelInfo.subdomain,
          tunnelInfo.name || null,
          tunnelInfo.localPort,
          `https://${tunnelInfo.subdomain}.${process.env.BASE_DOMAIN || "liveport.online"}`,
          process.env.FLY_REGION || "us-east",
          tunnelInfo.createdAt.toISOString(),
          requestCount,
          bytesTransferred,
        ]
      );
    } else {
      // Fallback: just update if record exists
      await db.query(
        `UPDATE tunnels 
         SET request_count = $1, 
             bytes_transferred = $2, 
             disconnected_at = NOW()
         WHERE id = $3`,
        [requestCount, bytesTransferred, tunnelId]
      );
    }

    logger.info(
      { tunnelId, requestCount, bytesTransferred },
      "Finalized tunnel metrics"
    );
  } catch (err) {
    logger.error({ err, tunnelId }, "Failed to finalize tunnel metrics");
  }
}

