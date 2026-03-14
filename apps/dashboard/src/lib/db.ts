/**
 * Database client singleton for the dashboard
 * 
 * Provides access to the mech-storage client and repositories.
 */

import { MechStorageClient, BridgeKeyRepository, TunnelRepository } from "@liveport/shared";

// Singleton instance
let dbClient: MechStorageClient | null = null;

/**
 * Get the database client instance
 */
export function getDbClient(): MechStorageClient {
  if (!dbClient) {
    dbClient = new MechStorageClient({
      appId: process.env.MECH_APPS_APP_ID!,
      apiKey: process.env.MECH_APPS_API_KEY!,
      baseUrl: process.env.MECH_APPS_URL || "https://storage.mechdna.net",
    });
  }
  return dbClient;
}

/**
 * Get the bridge key repository
 */
export function getBridgeKeyRepository(): BridgeKeyRepository {
  return new BridgeKeyRepository(getDbClient());
}

/**
 * Get the tunnel repository
 */
export function getTunnelRepository(): TunnelRepository {
  return new TunnelRepository(getDbClient());
}
