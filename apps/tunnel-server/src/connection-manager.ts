/**
 * Connection Manager
 *
 * Manages active tunnel connections and provides lookup functionality.
 */

import type { WebSocket } from "ws";
import type {
  TunnelConnection,
  ConnectionState,
  PendingRequest,
  HttpResponsePayload,
} from "./types";
import { generateUniqueSubdomain } from "./subdomain";

export class ConnectionManager {
  // Primary index: subdomain → connection
  private tunnelsBySubdomain = new Map<string, TunnelConnection>();

  // Secondary index: keyId → subdomains
  private tunnelsByKeyId = new Map<string, Set<string>>();

  // Secondary index: tunnelId → subdomain
  private tunnelsById = new Map<string, string>();

  // Pending HTTP requests: requestId → resolver
  private pendingRequests = new Map<string, PendingRequest>();

  /**
   * Register a new tunnel connection
   */
  register(
    socket: WebSocket,
    tunnelId: string,
    keyId: string,
    userId: string,
    localPort: number,
    expiresAt: Date
  ): string | null {
    // Get existing subdomains to check for collisions
    const existingSubdomains = new Set(this.tunnelsBySubdomain.keys());

    // Generate unique subdomain
    const subdomain = generateUniqueSubdomain(existingSubdomains);
    if (!subdomain) {
      console.error("[ConnectionManager] Failed to generate unique subdomain");
      return null;
    }

    // Create connection record
    const connection: TunnelConnection = {
      id: tunnelId,
      subdomain,
      keyId,
      userId,
      localPort,
      socket,
      state: "active",
      createdAt: new Date(),
      lastHeartbeat: new Date(),
      requestCount: 0,
      expiresAt,
    };

    // Store in indexes
    this.tunnelsBySubdomain.set(subdomain, connection);
    this.tunnelsById.set(tunnelId, subdomain);

    // Add to key's tunnel set
    if (!this.tunnelsByKeyId.has(keyId)) {
      this.tunnelsByKeyId.set(keyId, new Set());
    }
    this.tunnelsByKeyId.get(keyId)!.add(subdomain);

    console.log(
      `[ConnectionManager] Registered tunnel: ${subdomain} (keyId=${keyId}, port=${localPort})`
    );

    return subdomain;
  }

  /**
   * Unregister a tunnel connection
   */
  unregister(subdomain: string): void {
    const connection = this.tunnelsBySubdomain.get(subdomain);
    if (!connection) {
      return;
    }

    // Remove from primary index
    this.tunnelsBySubdomain.delete(subdomain);
    this.tunnelsById.delete(connection.id);

    // Remove from key's tunnel set
    const keyTunnels = this.tunnelsByKeyId.get(connection.keyId);
    if (keyTunnels) {
      keyTunnels.delete(subdomain);
      if (keyTunnels.size === 0) {
        this.tunnelsByKeyId.delete(connection.keyId);
      }
    }

    // Reject any pending requests for this tunnel
    for (const [requestId, pending] of this.pendingRequests) {
      if (requestId.startsWith(`${subdomain}:`)) {
        pending.reject(new Error("Tunnel disconnected"));
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
      }
    }

    console.log(`[ConnectionManager] Unregistered tunnel: ${subdomain}`);
  }

  /**
   * Find tunnel by subdomain
   */
  findBySubdomain(subdomain: string): TunnelConnection | null {
    return this.tunnelsBySubdomain.get(subdomain) || null;
  }

  /**
   * Find tunnel by ID
   */
  findById(tunnelId: string): TunnelConnection | null {
    const subdomain = this.tunnelsById.get(tunnelId);
    if (!subdomain) {
      return null;
    }
    return this.tunnelsBySubdomain.get(subdomain) || null;
  }

  /**
   * Find all tunnels for a key
   */
  findByKeyId(keyId: string): TunnelConnection[] {
    const subdomains = this.tunnelsByKeyId.get(keyId);
    if (!subdomains) {
      return [];
    }

    const tunnels: TunnelConnection[] = [];
    for (const subdomain of subdomains) {
      const tunnel = this.tunnelsBySubdomain.get(subdomain);
      if (tunnel) {
        tunnels.push(tunnel);
      }
    }
    return tunnels;
  }

  /**
   * Get all active tunnels
   */
  getAll(): TunnelConnection[] {
    return Array.from(this.tunnelsBySubdomain.values());
  }

  /**
   * Get count of active tunnels
   */
  getCount(): number {
    return this.tunnelsBySubdomain.size;
  }

  /**
   * Get count of tunnels for a specific key
   */
  getCountByKeyId(keyId: string): number {
    return this.tunnelsByKeyId.get(keyId)?.size || 0;
  }

  /**
   * Update tunnel state
   */
  updateState(subdomain: string, state: ConnectionState): void {
    const connection = this.tunnelsBySubdomain.get(subdomain);
    if (connection) {
      connection.state = state;
    }
  }

  /**
   * Update last heartbeat time
   */
  updateHeartbeat(subdomain: string, requestCount?: number): void {
    const connection = this.tunnelsBySubdomain.get(subdomain);
    if (connection) {
      connection.lastHeartbeat = new Date();
      if (requestCount !== undefined) {
        connection.requestCount = requestCount;
      }
    }
  }

  /**
   * Increment request count
   */
  incrementRequestCount(subdomain: string): void {
    const connection = this.tunnelsBySubdomain.get(subdomain);
    if (connection) {
      connection.requestCount++;
    }
  }

  /**
   * Register a pending HTTP request
   */
  registerPendingRequest(
    requestId: string,
    timeoutMs: number
  ): Promise<HttpResponsePayload> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error("Request timeout"));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
    });
  }

  /**
   * Resolve a pending HTTP request
   */
  resolvePendingRequest(requestId: string, response: HttpResponsePayload): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeout);
    pending.resolve(response);
    this.pendingRequests.delete(requestId);
    return true;
  }

  /**
   * Find stale connections (no heartbeat in timeout period)
   */
  findStaleConnections(timeoutMs: number): TunnelConnection[] {
    const now = Date.now();
    const stale: TunnelConnection[] = [];

    for (const connection of this.tunnelsBySubdomain.values()) {
      if (now - connection.lastHeartbeat.getTime() > timeoutMs) {
        stale.push(connection);
      }
    }

    return stale;
  }

  /**
   * Get summary of all connections (for dashboard/API)
   */
  getSummary(): Array<{
    id: string;
    subdomain: string;
    keyId: string;
    userId: string;
    localPort: number;
    state: ConnectionState;
    createdAt: string;
    lastHeartbeat: string;
    requestCount: number;
    expiresAt: string;
  }> {
    return Array.from(this.tunnelsBySubdomain.values()).map((conn) => ({
      id: conn.id,
      subdomain: conn.subdomain,
      keyId: conn.keyId,
      userId: conn.userId,
      localPort: conn.localPort,
      state: conn.state,
      createdAt: conn.createdAt.toISOString(),
      lastHeartbeat: conn.lastHeartbeat.toISOString(),
      requestCount: conn.requestCount,
      expiresAt: conn.expiresAt.toISOString(),
    }));
  }
}

// Singleton instance
let managerInstance: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!managerInstance) {
    managerInstance = new ConnectionManager();
  }
  return managerInstance;
}
