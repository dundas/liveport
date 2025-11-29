/**
 * LivePort Tunnel Server
 *
 * A WebSocket-based reverse proxy that enables secure HTTP tunneling
 * from local development servers to public URLs.
 */

import { serve } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "url";
import { createHttpHandler } from "./http-handler";
import { handleConnection } from "./websocket-handler";
import { getConnectionManager } from "./connection-manager";
import { startMetering, stopMetering, syncMetrics } from "./metering";
import { initializeSchema, getDatabase } from "@liveport/shared";
import { createLogger } from "@liveport/shared/logging";
import type { TunnelServerConfig } from "./types";

const logger = createLogger({ service: "tunnel-server" });

// Default configuration
const defaultConfig: TunnelServerConfig = {
  port: parseInt(process.env.PORT || "8080", 10),
  host: process.env.HOST || "0.0.0.0",
  baseDomain: process.env.BASE_DOMAIN || "liveport.dev",
  connectionTimeout: 30000,
  requestTimeout: 30000,
  heartbeatInterval: 10000,
  heartbeatTimeout: 30000,
  maxConnectionsPerKey: 5,
  maxRequestsPerMinute: 1000,
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  reservedSubdomains: [],
};

/**
 * Start the tunnel server
 */
export async function startServer(config: Partial<TunnelServerConfig> = {}): Promise<void> {
  const cfg = { ...defaultConfig, ...config };

  console.log("=".repeat(50));
  console.log("LivePort Tunnel Server");
  console.log("=".repeat(50));
  
  // Initialize database schema
  try {
    console.log("Initializing database schema...");
    const db = getDatabase();
    const schemaResult = await initializeSchema(db);
    console.log("Schema initialization complete:", schemaResult);
  } catch (err) {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  }

  console.log(`Port: ${cfg.port}`);
  console.log(`Host: ${cfg.host}`);
  console.log(`Base Domain: ${cfg.baseDomain}`);
  console.log(`Max Connections/Key: ${cfg.maxConnectionsPerKey}`);
  console.log("=".repeat(50));

  // Create HTTP handler
  const httpApp = createHttpHandler({
    baseDomain: cfg.baseDomain,
    requestTimeout: cfg.requestTimeout,
  });

  // Start HTTP server
  const server = serve(
    {
      fetch: httpApp.fetch,
      port: cfg.port,
      hostname: cfg.host,
    },
    (info) => {
      console.log(`HTTP server listening on http://${cfg.host}:${info.port}`);
    }
  );

  // Create WebSocket server on /connect path
  const wss = new WebSocketServer({
    server: server as unknown as import("http").Server,
    path: "/connect",
  });

  wss.on("connection", (socket: WebSocket, request) => {
    // Extract headers
    const bridgeKey = request.headers["x-bridge-key"] as string;
    const localPort = parseInt(request.headers["x-local-port"] as string, 10);

    if (!bridgeKey) {
      console.log("[WS] Connection rejected: missing X-Bridge-Key header");
      socket.close(4001, "Missing X-Bridge-Key header");
      return;
    }

    if (!localPort || isNaN(localPort)) {
      console.log("[WS] Connection rejected: missing or invalid X-Local-Port header");
      socket.close(4001, "Missing or invalid X-Local-Port header");
      return;
    }

    // Handle the connection
    handleConnection(socket, bridgeKey, localPort, {
      baseDomain: cfg.baseDomain,
      heartbeatTimeout: cfg.heartbeatTimeout,
      maxConnectionsPerKey: cfg.maxConnectionsPerKey,
    }).catch((err) => {
      console.error("[WS] Error handling connection:", err);
      socket.close(1011, "Server error");
    });
  });

  wss.on("error", (err) => {
    console.error("[WSS] WebSocket server error:", err);
  });

  console.log(`WebSocket server listening on ws://${cfg.host}:${cfg.port}/connect`);

  // Start metering service
  const meteringInterval = parseInt(process.env.METERING_SYNC_INTERVAL_MS || "30000", 10);
  startMetering({
    syncIntervalMs: meteringInterval,
    enabled: process.env.METERING_ENABLED !== "false",
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");

    // Stop metering service
    stopMetering();

    const connectionManager = getConnectionManager();
    const connections = connectionManager.getAll();

    console.log(`Closing ${connections.length} active connections...`);

    // Sync final metrics before closing
    if (connections.length > 0) {
      console.log("Syncing final metrics...");
      try {
        await syncMetrics();
        console.log("Final metrics synced");
      } catch (err) {
        console.error("Failed to sync final metrics:", err);
      }
    }

    // Close all WebSocket connections
    for (const conn of connections) {
      conn.socket.close(1001, "Server shutting down");
    }

    // Close WebSocket server
    wss.close(() => {
      console.log("WebSocket server closed");

      // Close HTTP server
      server.close(() => {
        console.log("HTTP server closed");
        process.exit(0);
      });
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.log("Forcing exit...");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// Start server if running directly (ESM compatible)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startServer().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

// Export for testing
export { createHttpHandler } from "./http-handler";
export { handleConnection } from "./websocket-handler";
export { getConnectionManager } from "./connection-manager";
export { getKeyValidator } from "./key-validator";
export { generateSubdomain, generateUniqueSubdomain } from "./subdomain";
export { startMetering, stopMetering, syncMetrics } from "./metering";
export * from "./types";
