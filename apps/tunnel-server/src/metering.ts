/**
 * Metering Service
 *
 * Periodically persists tunnel usage metrics (request count, bytes transferred)
 * to the database for billing purposes.
 */

import { getConnectionManager } from "./connection-manager";
import { getDatabase } from "@liveport/shared";

export interface MeteringConfig {
  syncIntervalMs: number; // How often to sync metrics to DB
  enabled: boolean;
}

const DEFAULT_CONFIG: MeteringConfig = {
  syncIntervalMs: 60000, // Sync every 60 seconds
  enabled: true,
};

let meteringTimer: NodeJS.Timeout | null = null;

/**
 * Start the metering service
 */
export function startMetering(config: Partial<MeteringConfig> = {}): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.enabled) {
    console.log("[Metering] Disabled");
    return;
  }

  console.log(`[Metering] Starting (sync interval: ${cfg.syncIntervalMs}ms)`);

  // Initial sync after 10 seconds
  setTimeout(() => {
    syncMetrics().catch((err) => {
      console.error("[Metering] Initial sync failed:", err);
    });
  }, 10000);

  // Periodic sync
  meteringTimer = setInterval(() => {
    syncMetrics().catch((err) => {
      console.error("[Metering] Sync failed:", err);
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
    console.log("[Metering] Stopped");
  }
}

/**
 * Sync metrics to database
 */
export async function syncMetrics(): Promise<void> {
  const connectionManager = getConnectionManager();
  const connections = connectionManager.getAll();

  if (connections.length === 0) {
    return;
  }

  console.log(`[Metering] Syncing metrics for ${connections.length} tunnels...`);

  try {
    const db = getDatabase();

    // Update each tunnel's metrics in the database
    for (const conn of connections) {
      try {
        // Check if tunnel record exists in DB
        const existing = await db.query(
          `SELECT id FROM tunnels WHERE id = $1`,
          [conn.id]
        );

        if (existing.rows.length === 0) {
          // Create tunnel record if it doesn't exist
          await db.query(
            `INSERT INTO tunnels (
              id, user_id, bridge_key_id, subdomain, local_port, 
              public_url, region, connected_at, request_count, bytes_transferred
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              conn.id,
              conn.userId,
              conn.keyId,
              conn.subdomain,
              conn.localPort,
              `https://${conn.subdomain}.${process.env.BASE_DOMAIN || "liveport.dev"}`,
              process.env.FLY_REGION || "us-east",
              conn.createdAt.toISOString(),
              conn.requestCount,
              conn.bytesTransferred,
            ]
          );
          console.log(`[Metering] Created tunnel record: ${conn.subdomain}`);
        } else {
          // Update existing record
          await db.query(
            `UPDATE tunnels 
             SET request_count = $1, bytes_transferred = $2, updated_at = NOW()
             WHERE id = $3`,
            [conn.requestCount, conn.bytesTransferred, conn.id]
          );
        }
      } catch (err) {
        console.error(`[Metering] Failed to sync tunnel ${conn.subdomain}:`, err);
      }
    }

    console.log(`[Metering] Sync complete`);
  } catch (err) {
    console.error("[Metering] Database error:", err);
    throw err;
  }
}

/**
 * Finalize metrics for a disconnected tunnel
 */
export async function finalizeTunnelMetrics(
  tunnelId: string,
  requestCount: number,
  bytesTransferred: number
): Promise<void> {
  try {
    const db = getDatabase();

    await db.query(
      `UPDATE tunnels 
       SET request_count = $1, 
           bytes_transferred = $2, 
           disconnected_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [requestCount, bytesTransferred, tunnelId]
    );

    console.log(`[Metering] Finalized metrics for tunnel ${tunnelId}`);
  } catch (err) {
    console.error(`[Metering] Failed to finalize tunnel ${tunnelId}:`, err);
  }
}

