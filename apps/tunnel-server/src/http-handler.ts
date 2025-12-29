/**
 * HTTP Handler
 *
 * Handles incoming HTTP requests to tunnel subdomains and forwards them
 * through WebSocket connections to CLI clients.
 */

import { Hono } from "hono";
import { nanoid } from "nanoid";
import { getConnectionManager } from "./connection-manager";
import { getMeteringHealth } from "./metering";
import { createLogger } from "@liveport/shared/logging";
import { BridgeKeyRepository, getDatabase } from "@liveport/shared";
import { signProxyToken, type ProxyProviderId } from "./proxy-token";
import type { HttpRequestMessage, HttpResponsePayload } from "./types";

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
function extractSubdomain(host: string, baseDomain: string): string | null {
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
