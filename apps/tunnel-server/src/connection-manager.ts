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
  ProxiedWebSocket,
  WebSocketUpgradeResponseMessage,
} from "./types";
import { generateUniqueSubdomain } from "./subdomain";

export class ConnectionManager {
  // DoS protection: Maximum number of pending WebSocket upgrades allowed globally
  private static readonly MAX_PENDING_UPGRADES = 1000;

  // Primary index: subdomain → connection
  private tunnelsBySubdomain = new Map<string, TunnelConnection>();

  // Secondary index: keyId → subdomains
  private tunnelsByKeyId = new Map<string, Set<string>>();

  // Secondary index: tunnelId → subdomain
  private tunnelsById = new Map<string, string>();

  // Pending HTTP requests: requestId → resolver
  private pendingRequests = new Map<string, PendingRequest>();

  // WebSocket connections: wsId → connection
  private proxiedWebSockets = new Map<string, ProxiedWebSocket>();

  // WebSocket count by subdomain (for O(1) limit checks)
  private wsCountBySubdomain = new Map<string, number>();

  // Pending WebSocket upgrades: wsId → resolver
  private wsUpgradePending = new Map<
    string,
    {
      resolve: (response: WebSocketUpgradeResponseMessage) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  /**
   * Register a new tunnel connection
   */
  register(
    socket: WebSocket,
    tunnelId: string,
    keyId: string,
    userId: string,
    localPort: number,
    expiresAt: Date | null,
    tunnelName?: string
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
      name: tunnelName,
      keyId,
      userId,
      localPort,
      socket,
      state: "active",
      createdAt: new Date(),
      lastHeartbeat: new Date(),
      requestCount: 0,
      bytesTransferred: 0,
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

    // Close all WebSocket connections for this tunnel
    this.closeWebSocketsForTunnel(subdomain);

    // Reject any pending WebSocket upgrades for this tunnel
    for (const [wsId, pending] of this.wsUpgradePending) {
      if (wsId.startsWith(`${subdomain}:`)) {
        pending.reject(new Error("Tunnel disconnected"));
        clearTimeout(pending.timeout);
        this.wsUpgradePending.delete(wsId);
      }
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

    // Reject any pending HTTP requests for this tunnel
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
   * Add bytes transferred for metering
   */
  addBytesTransferred(subdomain: string, bytes: number): void {
    const connection = this.tunnelsBySubdomain.get(subdomain);
    if (connection) {
      connection.bytesTransferred += bytes;
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
    bytesTransferred: number;
    expiresAt: string | null;
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
      bytesTransferred: conn.bytesTransferred,
      expiresAt: conn.expiresAt?.toISOString() || null,
    }));
  }

  /**
   * Register a proxied WebSocket connection
   * @param id - Unique WebSocket connection ID (format: ${subdomain}:ws:${nanoid})
   * @param subdomain - Tunnel subdomain this WebSocket belongs to
   * @param publicSocket - The public-facing WebSocket connection
   */
  registerProxiedWebSocket(
    id: string,
    subdomain: string,
    publicSocket: WebSocket
  ): void {
    const ws: ProxiedWebSocket = {
      id,
      subdomain,
      publicSocket,
      createdAt: new Date(),
      frameCount: 0,
      bytesTransferred: 0,
    };

    this.proxiedWebSockets.set(id, ws);

    // Update count index for O(1) limit checks
    const currentCount = this.wsCountBySubdomain.get(subdomain) || 0;
    this.wsCountBySubdomain.set(subdomain, currentCount + 1);

    console.log(
      `[ConnectionManager] Registered WebSocket: ${id} (subdomain=${subdomain})`
    );
  }

  /**
   * Unregister a proxied WebSocket connection
   * @param id - WebSocket connection ID to unregister
   */
  unregisterProxiedWebSocket(id: string): void {
    const ws = this.proxiedWebSockets.get(id);
    if (!ws) {
      return;
    }

    this.proxiedWebSockets.delete(id);

    // Update count index
    const currentCount = this.wsCountBySubdomain.get(ws.subdomain) || 0;
    if (currentCount <= 1) {
      this.wsCountBySubdomain.delete(ws.subdomain);
    } else {
      this.wsCountBySubdomain.set(ws.subdomain, currentCount - 1);
    }

    console.log(
      `[ConnectionManager] Unregistered WebSocket: ${id} (frames=${ws.frameCount}, bytes=${ws.bytesTransferred})`
    );
  }

  /**
   * Track a WebSocket frame
   * @param id - WebSocket connection ID
   * @param bytes - Number of bytes in the frame
   */
  trackWebSocketFrame(id: string, bytes: number): void {
    // Input validation
    if (bytes < 0 || !Number.isFinite(bytes)) {
      console.error(
        `[ConnectionManager] Invalid byte count: ${bytes} for WebSocket: ${id}`
      );
      return;
    }

    const ws = this.proxiedWebSockets.get(id);
    if (!ws) {
      return;
    }

    ws.frameCount++;
    ws.bytesTransferred += bytes;

    // Also track bytes in the tunnel metering
    this.addBytesTransferred(ws.subdomain, bytes);
  }

  /**
   * Get WebSocket connection count for a subdomain
   * @param subdomain - Tunnel subdomain to count connections for
   * @returns Number of active WebSocket connections for this subdomain
   */
  getWebSocketCount(subdomain: string): number {
    return this.wsCountBySubdomain.get(subdomain) || 0;
  }

  /**
   * Wait for WebSocket upgrade response from CLI
   * @param id - WebSocket connection ID to wait for
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise that resolves with upgrade response or rejects on timeout
   */
  waitForWebSocketUpgrade(
    id: string,
    timeoutMs: number
  ): Promise<WebSocketUpgradeResponseMessage> {
    // DoS protection: Reject if too many pending upgrades
    if (this.wsUpgradePending.size >= ConnectionManager.MAX_PENDING_UPGRADES) {
      return Promise.reject(
        new Error("Too many pending WebSocket upgrades")
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.wsUpgradePending.delete(id);
        reject(new Error("WebSocket upgrade timeout"));
      }, timeoutMs);

      this.wsUpgradePending.set(id, { resolve, reject, timeout });
    });
  }

  /**
   * Resolve a pending WebSocket upgrade
   * @param id - WebSocket connection ID to resolve
   * @param response - Upgrade response from CLI
   */
  resolveWebSocketUpgrade(
    id: string,
    response: WebSocketUpgradeResponseMessage
  ): void {
    const pending = this.wsUpgradePending.get(id);
    if (!pending) {
      console.warn(
        `[ConnectionManager] Attempted to resolve non-existent WebSocket upgrade: ${id}`
      );
      return;
    }

    clearTimeout(pending.timeout);
    pending.resolve(response);
    this.wsUpgradePending.delete(id);
  }

  /**
   * Check if WebSocket connection limit is exceeded for a subdomain
   * @param subdomain - Tunnel subdomain to check
   * @param limit - Maximum number of WebSocket connections allowed
   * @returns true if at or above limit, false otherwise
   */
  isWebSocketLimitExceeded(subdomain: string, limit: number): boolean {
    return this.getWebSocketCount(subdomain) >= limit;
  }

  /**
   * Close all WebSocket connections for a tunnel
   * @param subdomain - Tunnel subdomain to close WebSockets for
   */
  closeWebSocketsForTunnel(subdomain: string): void {
    const wsToClose: string[] = [];

    // Find all WebSockets for this subdomain
    for (const [id, ws] of this.proxiedWebSockets) {
      if (ws.subdomain === subdomain) {
        wsToClose.push(id);
      }
    }

    // Close and unregister each WebSocket
    for (const id of wsToClose) {
      const ws = this.proxiedWebSockets.get(id);
      if (ws) {
        ws.publicSocket.close(1001, "Tunnel closed");
        this.unregisterProxiedWebSocket(id);
      }
    }

    console.log(
      `[ConnectionManager] Closed ${wsToClose.length} WebSocket(s) for tunnel: ${subdomain}`
    );
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
