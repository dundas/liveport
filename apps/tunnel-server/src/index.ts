/**
 * LivePort Tunnel Server
 *
 * A WebSocket-based reverse proxy that enables secure HTTP tunneling
 * from local development servers to public URLs.
 */

import { serve } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket as NetSocket } from "node:net";
import { fileURLToPath } from "url";
import { createHttpHandler } from "./http-handler";
import { handleConnection } from "./websocket-handler";
import { getConnectionManager } from "./connection-manager";
import { startMetering, stopMetering, syncMetrics } from "./metering";
import { initializeSchema, getDatabase } from "@liveport/shared";
import { createLogger } from "@liveport/shared/logging";
import type { TunnelServerConfig } from "./types";
import { createProxyConnectHandler, createProxyRequestInterceptor } from "./proxy-gateway";
import { validateTunnelServerSecrets } from "./validate-secrets";
import { handleWebSocketUpgradeEvent } from "./websocket-proxy";

const logger = createLogger({ service: "tunnel-server" });

// Default configuration
const defaultConfig: TunnelServerConfig = {
  port: parseInt(process.env.PORT || "8080", 10),
  host: process.env.HOST || "0.0.0.0",
  baseDomain: process.env.BASE_DOMAIN || "liveport.online",
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
 * Start the tunnel server with dual HTTP/WebSocket servers
 *
 * Uses two separate servers to avoid middleware interference:
 * - WebSocket server (port 8080): Handles ONLY WebSocket upgrade requests
 * - HTTP server (port 8081): Handles regular HTTP requests via Hono
 *
 * This architecture prevents the "RSV1 must be clear" error caused by
 * HTTP middleware writing responses to WebSocket connections.
 */
export async function startServer(config: Partial<TunnelServerConfig> = {}): Promise<void> {
  const cfg = { ...defaultConfig, ...config };

  console.log("=".repeat(50));
  console.log("LivePort Tunnel Server");
  console.log("=".repeat(50));

  // Validate secrets before proceeding
  try {
    console.log("🔐 Validating secrets...");
    validateTunnelServerSecrets();
    console.log("✅ All secrets validated successfully");
  } catch (error) {
    console.error("❌ Secret validation failed:");
    console.error(error instanceof Error ? error.message : String(error));
    console.error("\nTunnel server will not start until secrets are properly configured.");
    process.exit(1);
  }

  // Initialize database schema
  try {
    console.log("Initializing database schema...");
    // Initialize database with config from environment
    const db = getDatabase({
      appId: process.env.MECH_APPS_APP_ID!,
      apiKey: process.env.MECH_APPS_API_KEY!,
      baseUrl: process.env.MECH_APPS_URL || "https://storage.mechdna.net",
    });
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

  const proxyEnabled = process.env.PROXY_GATEWAY_ENABLED === "true";
  const proxyTokenSecret = process.env.PROXY_TOKEN_SECRET || "";

  // Validate proxy allowlist when proxy is enabled
  if (proxyEnabled) {
    // Require proxy allowlist (default-open is a security vulnerability)
    const hasAllowedHosts = !!process.env.PROXY_ALLOWED_HOSTS;
    const hasAllowedDomains = !!process.env.PROXY_ALLOWED_DOMAINS;

    if (!hasAllowedHosts && !hasAllowedDomains) {
      console.error("❌ PROXY_ALLOWED_HOSTS or PROXY_ALLOWED_DOMAINS must be set when PROXY_GATEWAY_ENABLED=true");
      console.error("   Refusing to start with default-open proxy (SSRF vulnerability risk)");
      console.error("   Set allowlist with one of:");
      console.error("   - PROXY_ALLOWED_HOSTS=api.openai.com,api.anthropic.com");
      console.error("   - PROXY_ALLOWED_DOMAINS=.openai.com,.anthropic.com");
      process.exit(1);
    }
  }

  const proxyConfig = {
    enabled: proxyEnabled,
    tokenSecret: proxyTokenSecret,
    requestTimeoutMs: parseInt(process.env.PROXY_GATEWAY_TIMEOUT_MS || "30000", 10),
  };

  const proxyInterceptor = createProxyRequestInterceptor(proxyConfig);
  const proxyConnectHandler = createProxyConnectHandler(proxyConfig);
  const connectionManager = getConnectionManager();
  const expiryTimer = connectionManager.startExpiryChecker();

  // =========================================================================
  // WEBSOCKET SERVER (Port 8080) - Handles WebSocket + proxies HTTP to 8081
  // =========================================================================
  // This dedicated server prevents HTTP middleware interference with WebSocket upgrades
  // For production (Fly.io/Cloudflare), this is the single entry point that routes:
  // - WebSocket upgrades → handled directly by this server
  // - Regular HTTP requests → proxied to port 8081 (Hono server)
  const wsServer = http.createServer((req, res) => {
    // Proxy regular HTTP requests to the HTTP server on port 8081
    const proxyReq = http.request(
      {
        hostname: 'localhost',
        port: cfg.port + 1, // 8081
        path: req.url,
        method: req.method,
        headers: req.headers,
        timeout: 30000, // 30 second timeout
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);

        // Handle response errors
        proxyRes.on('error', (err) => {
          console.error('[WebSocket Server] Response error:', err);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Bad Gateway');
          }
        });
      }
    );

    proxyReq.on('timeout', () => {
      console.error('[WebSocket Server] Proxy timeout to port 8081');
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'text/plain' });
        res.end('Gateway Timeout');
      }
    });

    proxyReq.on('error', (err) => {
      console.error('[WebSocket Server] Proxy error:', err);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
      }
    });

    req.pipe(proxyReq);
  });

  // Handle HTTPS CONNECT proxy requests (for AI agent API proxying)
  wsServer.on("connect", (req, socket, head) => {
    proxyConnectHandler(req, socket as unknown as NetSocket, head).catch(() => {
      (socket as unknown as NetSocket).destroy();
    });
  });

  // Create WebSocket server for CLI control connections (/connect path)
  const controlWss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false, // Disable compression on control channel
  });

  // Handle WebSocket upgrades
  wsServer.on("upgrade", (req, socket, head) => {
    const connectionManager = getConnectionManager();

    if (req.url === "/connect" || req.url?.startsWith("/connect?")) {
      // CLI control connections
      controlWss.handleUpgrade(req, socket, head, (ws) => {
        controlWss.emit('connection', ws, req);
      });
    } else {
      // Public client WebSocket connections (tunneled traffic)
      handleWebSocketUpgradeEvent(
        req,
        socket as unknown as NetSocket,
        head,
        connectionManager,
        cfg.baseDomain
      );
    }
  });

  wsServer.listen(cfg.port, cfg.host, () => {
    console.log(`WebSocket server listening on ws://${cfg.host}:${cfg.port}`);
  });

  // =========================================================================
  // HTTP SERVER (Port 8081) - Handles regular HTTP/HTTPS requests via Hono
  // =========================================================================
  const httpPort = cfg.port + 1; // Use port 8081 for HTTP

  serve(
    {
      fetch: httpApp.fetch,
      port: httpPort,
      hostname: cfg.host,
    },
    (info) => {
      console.log(`HTTP server listening on http://${cfg.host}:${info.port}`);
    }
  );

  // =========================================================================
  // CONTROL WEBSOCKET HANDLER - /connect path for CLI tunnels
  // =========================================================================
  controlWss.on("connection", (socket: WebSocket, request) => {
    // Extract headers
    const bridgeKey = request.headers["x-bridge-key"] as string;
    const localPort = parseInt(request.headers["x-local-port"] as string, 10);
    let tunnelName = request.headers["x-tunnel-name"] as string | undefined;
    const clientTtlHeader = request.headers["x-tunnel-ttl"] as string | undefined;
    const clientTtlSeconds = clientTtlHeader && /^\d+$/.test(clientTtlHeader)
      ? parseInt(clientTtlHeader, 10)
      : undefined;
    const requireAccessToken = request.headers["x-require-access-token"] === "true";

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

    // Validate tunnel name if provided
    if (tunnelName) {
      // Trim whitespace
      tunnelName = tunnelName.trim();
      
      // Check length (max 100 characters)
      if (tunnelName.length > 100) {
        console.log("[WS] Connection rejected: tunnel name exceeds 100 characters");
        socket.close(1008, "Tunnel name exceeds 100 characters");
        return;
      }
      
      // Check for empty string after trim
      if (tunnelName.length === 0) {
        console.log("[WS] Connection rejected: tunnel name cannot be empty or whitespace-only");
        socket.close(1008, "Tunnel name cannot be empty or whitespace-only");
        return;
      }
      
      // Basic sanitization: allow alphanumeric, spaces, hyphens, underscores, dots
      if (!/^[a-zA-Z0-9\s\-_.]+$/.test(tunnelName)) {
        console.log("[WS] Connection rejected: tunnel name contains invalid characters");
        socket.close(1008, "Tunnel name can only contain letters, numbers, spaces, hyphens, underscores, and dots");
        return;
      }
    }

    // Handle the connection
    handleConnection(socket, bridgeKey, localPort, {
      baseDomain: cfg.baseDomain,
      heartbeatTimeout: cfg.heartbeatTimeout,
      maxConnectionsPerKey: cfg.maxConnectionsPerKey,
      tunnelName,
      clientTtlSeconds: clientTtlSeconds && !isNaN(clientTtlSeconds) ? clientTtlSeconds : undefined,
      requireAccessToken,
    }).catch((err) => {
      console.error("[WS] Error handling connection:", err);
      socket.close(1011, "Server error");
    });
  });

  controlWss.on("error", (err: Error) => {
    console.error("[WSS] Control WebSocket server error:", err);
  });

  // Start metering service
  const meteringInterval = parseInt(process.env.METERING_SYNC_INTERVAL_MS || "30000", 10);
  startMetering({
    syncIntervalMs: meteringInterval,
    enabled: process.env.METERING_ENABLED !== "false",
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");

    // Stop expiry checker and metering service
    clearInterval(expiryTimer);
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

    // Close WebSocket servers
    controlWss.close(() => {
      console.log("Control WebSocket server closed");
    });

    // Close main WebSocket server
    wsServer.close(() => {
      console.log("WebSocket server closed");
      process.exit(0);
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
