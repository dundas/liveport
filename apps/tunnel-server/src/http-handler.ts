/**
 * HTTP Handler
 *
 * Handles incoming HTTP requests to tunnel subdomains and forwards them
 * through WebSocket connections to CLI clients.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { nanoid } from "nanoid";
import { getConnectionManager } from "./connection-manager";
import { getMeteringHealth } from "./metering";
import { createLogger } from "@liveport/shared/logging";
import { BridgeKeyRepository, getDatabase } from "@liveport/shared";
import { signProxyToken, type ProxyProviderId } from "./proxy-token";
import type {
  HttpRequestMessage,
  HttpResponsePayload,
  WebSocketUpgradeMessage,
} from "./types";
import { MAX_WEBSOCKETS_PER_TUNNEL } from "./types";

const logger = createLogger({ service: "tunnel-server:http" });

const DEFAULT_BASE_DOMAIN = process.env.BASE_DOMAIN || "liveport.online";
const DEFAULT_REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB max body size

export interface HttpHandlerConfig {
  baseDomain: string;
  requestTimeout: number;
}

const defaultConfig: HttpHandlerConfig = {
  baseDomain: DEFAULT_BASE_DOMAIN,
  requestTimeout: DEFAULT_REQUEST_TIMEOUT,
};

/**
 * Extract subdomain from Host header
 */
export function extractSubdomain(host: string, baseDomain: string): string | null {
  // Remove port if present
  const hostWithoutPort = host.split(":")[0];

  // Check if it's a subdomain of our base domain
  if (!hostWithoutPort.endsWith(`.${baseDomain}`)) {
    return null;
  }

  // Extract subdomain
  const subdomain = hostWithoutPort.slice(0, -(baseDomain.length + 1));

  // Validate - should not be empty and should not contain dots
  if (!subdomain || subdomain.includes(".")) {
    return null;
  }

  return subdomain;
}

/**
 * Convert Headers to plain object
 */
function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });

  return result;
}

/**
 * Check if request is a WebSocket upgrade request
 */
export function isWebSocketUpgrade(request: Request): boolean {
  const upgrade = request.headers.get("upgrade");
  const connection = request.headers.get("connection");

  if (!upgrade || !connection) {
    return false;
  }

  // Check if upgrade header is "websocket" (case-insensitive)
  if (upgrade.toLowerCase() !== "websocket") {
    return false;
  }

  // Check if connection header contains "upgrade" (case-insensitive)
  // Connection header can contain multiple values separated by commas
  const connectionValues = connection.toLowerCase().split(",").map((v) => v.trim());
  if (!connectionValues.includes("upgrade")) {
    return false;
  }

  return true;
}

/**
 * Handle WebSocket upgrade request
 */
async function handleWebSocketUpgrade(
  c: Context,
  cfg: HttpHandlerConfig
): Promise<Response> {
  const connectionManager = getConnectionManager();
  const host = c.req.header("host") || "";
  const subdomain = extractSubdomain(host, cfg.baseDomain);

  // If not a tunnel subdomain, return 404
  if (!subdomain) {
    return c.text("Invalid tunnel URL", 404);
  }

  // Find the tunnel connection
  const connection = connectionManager.findBySubdomain(subdomain);

  if (!connection) {
    return c.text("Tunnel not found or inactive", 502);
  }

  if (connection.state !== "active") {
    return c.text(`Tunnel is ${connection.state}`, 502);
  }

  // Check WebSocket connection limit
  const wsCount = connectionManager.getWebSocketCount(subdomain);
  if (wsCount >= MAX_WEBSOCKETS_PER_TUNNEL) {
    return c.text(
      `Maximum WebSocket connections exceeded (${MAX_WEBSOCKETS_PER_TUNNEL})`,
      503
    );
  }

  // Generate WebSocket connection ID
  const wsConnId = `${subdomain}:ws:${nanoid(10)}`;

  // Build upgrade message
  const url = new URL(c.req.url);
  const path = url.pathname + url.search;
  const headers = headersToObject(c.req.raw.headers);

  // Extract subprotocol if present
  const subprotocol = c.req.header("sec-websocket-protocol");

  const upgradeMessage: WebSocketUpgradeMessage = {
    type: "websocket_upgrade",
    id: wsConnId,
    timestamp: Date.now(),
    payload: {
      path,
      headers,
      subprotocol,
    },
  };

  // Check connection state before proceeding
  if (connection.socket.readyState !== connection.socket.OPEN) {
    return c.text("Tunnel connection lost", 502);
  }

  // Register listener BEFORE sending message to avoid race condition
  // (CLI could respond very quickly, before waitForWebSocketUpgrade is called)
  const upgradePromise = connectionManager.waitForWebSocketUpgrade(wsConnId, 5000);

  // Send upgrade message to CLI
  connection.socket.send(JSON.stringify(upgradeMessage));

  // Wait for CLI response (5 second timeout)
  try {
    const response = await upgradePromise;

    if (!response.payload.accepted) {
      // CLI rejected the upgrade
      const reason = response.payload.reason || "Upgrade rejected";
      // Validate status code (must be 100-599) and coerce to safe value
      const statusCode =
        response.payload.statusCode >= 100 && response.payload.statusCode < 600
          ? response.payload.statusCode
          : 502; // Default to Bad Gateway if invalid
      return c.text(reason, statusCode as any);
    }

    // CLI accepted - actual upgrade will happen at HTTP server level (Task 4.0)
    // Return 501 (Not Implemented) to signal that actual WebSocket upgrade
    // will be handled by the Node.js HTTP server 'upgrade' event (Task 4.0).
    // Hono cannot handle raw socket upgrades, so we delegate to server-level handler.
    return c.text("Upgrade will be handled at HTTP server level", 501);
  } catch (err) {
    const error = err as Error;
    if (error.message === "WebSocket upgrade timeout") {
      return c.text("WebSocket upgrade timeout", 504);
    }

    // Log unexpected errors and return generic 500
    logger.error({ err, wsConnId }, "WebSocket upgrade failed");
    return c.text("Internal server error", 500);
  }
}

/**
 * Create the HTTP handler app
 */
export function createHttpHandler(config: Partial<HttpHandlerConfig> = {}): Hono {
  const cfg = { ...defaultConfig, ...config };
  const connectionManager = getConnectionManager();
  const app = new Hono();

  // Health check endpoint
  app.get("/health", (c) => {
    const metering = getMeteringHealth();
    return c.json({
      status: metering.status === "healthy" ? "healthy" : "degraded",
      connections: connectionManager.getCount(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      metering,
    });
  });

  // List active tunnels (for internal use / debugging)
  app.get("/_internal/tunnels", (c) => {
    // In production, this should be protected
    if (process.env.NODE_ENV === "production") {
      return c.json({ error: "Not available in production" }, 403);
    }

    return c.json({
      tunnels: connectionManager.getSummary(),
      count: connectionManager.getCount(),
    });
  });

  // Metering health endpoint (for monitoring)
  app.get("/_internal/metering/health", (c) => {
    const health = getMeteringHealth();
    return c.json(health);
  });

  // API endpoint: Get tunnels by key ID (for Agent SDK)
  app.get("/api/tunnels/by-key/:keyId", (c) => {
    const keyId = c.req.param("keyId");
    const apiSecret = c.req.header("x-api-secret");

    // Validate internal API secret
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    if (!expectedSecret) {
      return c.json({ error: "Internal server error: INTERNAL_API_SECRET not configured" }, 500);
    }
    if (apiSecret !== expectedSecret) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const tunnels = connectionManager.findByKeyId(keyId);
    const baseDomain = cfg.baseDomain;

    return c.json({
      tunnels: tunnels.map((t) => ({
        tunnelId: t.id,
        subdomain: t.subdomain,
        url: `https://${t.subdomain}.${baseDomain}`,
        localPort: t.localPort,
        state: t.state,
        createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt?.toISOString() || null,
        requestCount: t.requestCount,
      })),
    });
  });

  app.post("/api/proxy/token", async (c) => {
    const apiSecret = c.req.header("x-api-secret");

    const expectedSecret = process.env.INTERNAL_API_SECRET;
    if (!expectedSecret) {
      return c.json({ error: "Internal server error: INTERNAL_API_SECRET not configured" }, 500);
    }
    if (apiSecret !== expectedSecret) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const secret = process.env.PROXY_TOKEN_SECRET;
    if (!secret) {
      return c.json({ error: "Proxy token secret not configured" }, 500);
    }

    const body = (await c.req.json().catch(() => null)) as
      | {
          keyId?: string;
          provider?: ProxyProviderId;
          providerOptions?: Record<string, unknown>;
          ttlSeconds?: number;
        }
      | null;

    if (!body?.keyId) {
      return c.json({ error: "Missing keyId" }, 400);
    }

    // Token expiration time (in seconds)
    // Default: 600 seconds (10 minutes)
    // Min: 30 seconds
    // Max: 3600 seconds (1 hour)
    const ttlSecondsRaw = body.ttlSeconds;
    const ttlSeconds = Math.min(
      Math.max(typeof ttlSecondsRaw === "number" ? Math.floor(ttlSecondsRaw) : 600, 30),
      3600
    );

    const provider = body.provider || ((process.env.PROXY_DEFAULT_PROVIDER || "oxylabs") as ProxyProviderId);
    const providerOptions = body.providerOptions || {};

    try {
      const db = getDatabase();
      const repo = new BridgeKeyRepository(db);
      const key = await repo.findById(body.keyId);

      if (!key) {
        return c.json({ error: "Key not found" }, 404);
      }

      if (key.status !== "active") {
        return c.json({ error: `Key is ${key.status}` }, 403);
      }

      if (key.expiresAt && key.expiresAt < new Date()) {
        return c.json({ error: "Key expired" }, 403);
      }

      const now = Date.now();
      const exp = now + ttlSeconds * 1000;
      const token = await signProxyToken(
        {
          keyId: key.id,
          userId: key.userId,
          iat: now,
          exp,
          provider,
          providerOptions,
        },
        secret
      );

      return c.json({
        token,
        expiresAt: new Date(exp).toISOString(),
        provider,
      });
    } catch (err) {
      logger.error({ err }, "Failed to mint proxy token");
      return c.json({ error: "Failed to mint proxy token" }, 500);
    }
  });

  // WebSocket upgrade detection middleware (before catch-all handler)
  app.all("*", async (c, next) => {
    // Check if this is a WebSocket upgrade request
    if (isWebSocketUpgrade(c.req.raw)) {
      return handleWebSocketUpgrade(c, cfg);
    }

    // Not a WebSocket upgrade, continue to regular HTTP handler
    return next();
  });

  // Catch-all handler for proxied requests
  app.all("*", async (c) => {
    const host = c.req.header("host") || "";
    const subdomain = extractSubdomain(host, cfg.baseDomain);

    // If not a tunnel subdomain, return 404
    if (!subdomain) {
      return c.json(
        {
          error: "Not Found",
          message: "Invalid tunnel URL",
        },
        404
      );
    }

    // Find the tunnel connection
    const connection = connectionManager.findBySubdomain(subdomain);

    if (!connection) {
      return c.json(
        {
          error: "Bad Gateway",
          message: "Tunnel not found or inactive",
        },
        502
      );
    }

    if (connection.state !== "active") {
      return c.json(
        {
          error: "Bad Gateway",
          message: `Tunnel is ${connection.state}`,
        },
        502
      );
    }

    // Generate request ID
    const requestId = `${subdomain}:${nanoid(10)}`;

    // Build request payload
    const method = c.req.method;
    const url = new URL(c.req.url);
    const path = url.pathname + url.search;

    // Get headers
    const headers = headersToObject(c.req.raw.headers);

    // Add forwarding headers
    headers["x-forwarded-for"] = c.req.header("x-forwarded-for") || c.req.header("cf-connecting-ip") || "unknown";
    headers["x-forwarded-proto"] = "https";
    headers["x-forwarded-host"] = host;
    headers["x-request-id"] = requestId;

    // Rewrite host to localhost
    headers["host"] = `localhost:${connection.localPort}`;

    // Get body if present (with size limit)
    let body: string | undefined;
    let requestBodySize = 0;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      try {
        const bodyBytes = await c.req.arrayBuffer();
        if (bodyBytes.byteLength > MAX_BODY_SIZE) {
          logger.warn(
            { requestId, size: bodyBytes.byteLength, maxSize: MAX_BODY_SIZE },
            "Request body too large"
          );
          return c.json(
            {
              error: "Payload Too Large",
              message: `Request body exceeds ${MAX_BODY_SIZE / 1024 / 1024}MB limit`,
            },
            413
          );
        }
        if (bodyBytes.byteLength > 0) {
          requestBodySize = bodyBytes.byteLength;
          body = Buffer.from(bodyBytes).toString("base64");
        }
      } catch (err) {
        logger.warn({ err, requestId }, "Failed to parse request body");
      }
    }

    // Create request message
    const requestMessage: HttpRequestMessage = {
      type: "http_request",
      id: requestId,
      timestamp: Date.now(),
      payload: {
        method,
        path,
        headers,
        body,
      },
    };

    // Send to tunnel client
    if (connection.socket.readyState !== connection.socket.OPEN) {
      return c.json(
        {
          error: "Bad Gateway",
          message: "Tunnel connection lost",
        },
        502
      );
    }

    connection.socket.send(JSON.stringify(requestMessage));
    connectionManager.incrementRequestCount(subdomain);

    // Wait for response
    try {
      const response = await connectionManager.registerPendingRequest(
        requestId,
        cfg.requestTimeout
      );

      // Build response
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(response.headers || {})) {
        // Skip hop-by-hop headers
        if (
          ![
            "transfer-encoding",
            "connection",
            "keep-alive",
            "upgrade",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailer",
          ].includes(key.toLowerCase())
        ) {
          responseHeaders.set(key, value);
        }
      }

      // Decode body if present
      let responseBody: Uint8Array | null = null;
      let responseBodySize = 0;
      if (response.body) {
        responseBody = new Uint8Array(Buffer.from(response.body, "base64"));
        responseBodySize = responseBody.byteLength;
      }

      // Track bytes transferred for metering (request + response)
      const totalBytes = requestBodySize + responseBodySize;
      connectionManager.addBytesTransferred(subdomain, totalBytes);

      return new Response(responseBody, {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (err) {
      const error = err as Error;

      if (error.message === "Request timeout") {
        return c.json(
          {
            error: "Gateway Timeout",
            message: "Request to local server timed out",
          },
          504
        );
      }

      if (error.message === "Tunnel disconnected") {
        return c.json(
          {
            error: "Bad Gateway",
            message: "Tunnel disconnected during request",
          },
          502
        );
      }

      console.error(`[HTTP] Error proxying request: ${error.message}`);
      return c.json(
        {
          error: "Bad Gateway",
          message: "Error proxying request",
        },
        502
      );
    }
  });

  return app;
}
