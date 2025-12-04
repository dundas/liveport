/**
 * WebSocket Handler
 *
 * Handles WebSocket connections from CLI clients.
 */

import type { WebSocket } from "ws";
import type {
  BaseMessage,
  ConnectedMessage,
  ErrorMessage,
  DisconnectMessage,
  HeartbeatMessage,
  HeartbeatAckMessage,
  HttpResponseMessage,
} from "./types";
import { CloseCodes, ErrorCodes } from "./types";
import { getConnectionManager } from "./connection-manager";
import { getKeyValidator } from "./key-validator";
import { finalizeTunnelMetrics } from "./metering";
import {
  createRedisClient,
  createRateLimiter,
  RateLimitPresets,
  type RateLimiter,
} from "@liveport/shared";

// Rate limiter instance (initialized lazily)
let rateLimiter: RateLimiter | null = null;

/**
 * Get or create the rate limiter instance
 */
async function getRateLimiter(): Promise<RateLimiter | null> {
  if (rateLimiter) {
    return rateLimiter;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("[RateLimiter] REDIS_URL not configured, rate limiting disabled");
    return null;
  }

  try {
    const redis = createRedisClient({ url: redisUrl });
    rateLimiter = createRateLimiter(redis, {
      ...RateLimitPresets.websocket,
      keyPrefix: "tunnel:ratelimit",
    });
    console.log("[RateLimiter] Initialized with Redis");
    return rateLimiter;
  } catch (error) {
    console.error("[RateLimiter] Failed to initialize:", error);
    return null;
  }
}

const DEFAULT_BASE_DOMAIN = process.env.BASE_DOMAIN || "liveport.online";

export interface WebSocketHandlerConfig {
  baseDomain: string;
  heartbeatTimeout: number;
  maxConnectionsPerKey: number;
}

const defaultConfig: WebSocketHandlerConfig = {
  baseDomain: DEFAULT_BASE_DOMAIN,
  heartbeatTimeout: 30000,
  maxConnectionsPerKey: 5,
};

/**
 * Send a message to a WebSocket
 */
function send(socket: WebSocket, message: BaseMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/**
 * Send error and optionally close the connection
 */
function sendError(
  socket: WebSocket,
  code: string,
  message: string,
  fatal: boolean,
  closeCode?: number
): void {
  const errorMessage: ErrorMessage = {
    type: "error",
    timestamp: Date.now(),
    payload: {
      code,
      message,
      fatal,
    },
  };

  send(socket, errorMessage);

  if (fatal && closeCode) {
    socket.close(closeCode, message);
  }
}

/**
 * Handle a new WebSocket connection
 */
export async function handleConnection(
  socket: WebSocket,
  bridgeKey: string,
  localPort: number,
  config: Partial<WebSocketHandlerConfig> = {}
): Promise<void> {
  const cfg = { ...defaultConfig, ...config };
  const connectionManager = getConnectionManager();
  const keyValidator = getKeyValidator();

  let subdomain: string | null = null;
  let tunnelId: string | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  console.log(`[WebSocket] New connection attempt (port=${localPort})`);

  // Rate limiting check (by IP or key prefix)
  const limiter = await getRateLimiter();
  if (limiter) {
    // Use key prefix as rate limit identifier (first 8 chars)
    const keyPrefix = bridgeKey.substring(0, 8);
    const rateLimitResult = await limiter.increment(keyPrefix);

    if (!rateLimitResult.allowed) {
      const retryAfterSecs = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      console.log(`[WebSocket] Rate limited: ${keyPrefix}... (retry after ${retryAfterSecs}s)`);
      sendError(
        socket,
        ErrorCodes.RATE_LIMITED,
        `Rate limit exceeded. Retry after ${retryAfterSecs} seconds.`,
        true,
        CloseCodes.RATE_LIMITED
      );
      return;
    }

    console.log(`[WebSocket] Rate limit check passed: ${rateLimitResult.remaining}/${rateLimitResult.limit} remaining`);
  }

  // Validate the bridge key
  const validation = await keyValidator.validate(bridgeKey, localPort);

  if (!validation.valid) {
    console.log(`[WebSocket] Key validation failed: ${validation.error}`);

    // Map error code to close code
    const closeCodeMap: Record<string, number> = {
      [ErrorCodes.INVALID_KEY]: CloseCodes.INVALID_KEY,
      [ErrorCodes.KEY_EXPIRED]: CloseCodes.KEY_EXPIRED,
      [ErrorCodes.KEY_REVOKED]: CloseCodes.KEY_REVOKED,
      [ErrorCodes.PORT_NOT_ALLOWED]: CloseCodes.PORT_NOT_ALLOWED,
      [ErrorCodes.RATE_LIMITED]: CloseCodes.RATE_LIMITED,
    };

    sendError(
      socket,
      validation.errorCode || ErrorCodes.INVALID_KEY,
      validation.error || "Invalid key",
      true,
      closeCodeMap[validation.errorCode || ""] || CloseCodes.INVALID_KEY
    );
    return;
  }

  // Check connection limit per key
  const currentConnections = connectionManager.getCountByKeyId(validation.keyId!);
  
  // Free tier users can only have 1 open tunnel at a time
  const maxConnections = validation.userTier === "free" ? 1 : cfg.maxConnectionsPerKey;
  
  if (currentConnections >= maxConnections) {
    const message = validation.userTier === "free" 
      ? "Free tier limited to 1 open tunnel at a time. Upgrade to a paid plan for multiple concurrent tunnels."
      : `Maximum ${cfg.maxConnectionsPerKey} connections per key`;
    
    console.log(
      `[WebSocket] Connection limit reached for ${validation.userTier} tier user ${validation.userId} (${currentConnections}/${maxConnections})`
    );
    sendError(
      socket,
      ErrorCodes.RATE_LIMITED,
      message,
      true,
      CloseCodes.RATE_LIMITED
    );
    return;
  }

  // Generate tunnel ID
  tunnelId = crypto.randomUUID();

  // Register the connection
  subdomain = connectionManager.register(
    socket,
    tunnelId,
    validation.keyId!,
    validation.userId!,
    localPort,
    validation.expiresAt!
  );

  if (!subdomain) {
    console.log("[WebSocket] Failed to generate subdomain");
    sendError(
      socket,
      ErrorCodes.SERVER_ERROR,
      "Failed to generate subdomain",
      true,
      CloseCodes.UNEXPECTED_CONDITION
    );
    return;
  }

  // Build public URL
  const url = `https://${subdomain}.${cfg.baseDomain}`;

  // Send connected message
  const connectedMessage: ConnectedMessage = {
    type: "connected",
    timestamp: Date.now(),
    payload: {
      tunnelId,
      subdomain,
      url,
      expiresAt: validation.expiresAt?.toISOString() || null,
    },
  };
  send(socket, connectedMessage);

  console.log(`[WebSocket] Connection established: ${subdomain} → localhost:${localPort}`);

  // Start heartbeat timeout checker
  const checkHeartbeat = () => {
    const connection = connectionManager.findBySubdomain(subdomain!);
    if (!connection) {
      return;
    }

    const timeSinceHeartbeat = Date.now() - connection.lastHeartbeat.getTime();
    if (timeSinceHeartbeat > cfg.heartbeatTimeout) {
      console.log(`[WebSocket] Heartbeat timeout for ${subdomain}`);
      connectionManager.updateState(subdomain!, "timeout");
      socket.close(CloseCodes.GOING_AWAY, "Heartbeat timeout");
    }
  };

  heartbeatTimer = setInterval(checkHeartbeat, cfg.heartbeatTimeout / 2);

  // Handle messages
  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString()) as BaseMessage;
      handleMessage(socket, subdomain!, message);
    } catch (err) {
      console.error("[WebSocket] Failed to parse message:", err);
    }
  });

  // Handle close
  socket.on("close", async (code, reason) => {
    console.log(
      `[WebSocket] Connection closed: ${subdomain} (code=${code}, reason=${reason.toString()})`
    );

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }

    if (subdomain && tunnelId) {
      const connection = connectionManager.findBySubdomain(subdomain);
      
      // Finalize metrics in database before unregistering
      // Pass full tunnel info for UPSERT in case record doesn't exist yet
      if (connection) {
        await finalizeTunnelMetrics(
          tunnelId,
          connection.requestCount,
          connection.bytesTransferred,
          {
            userId: connection.userId,
            keyId: connection.keyId,
            subdomain: connection.subdomain,
            localPort: connection.localPort,
            createdAt: connection.createdAt,
          }
        );
      }

      connectionManager.unregister(subdomain);
    }

    if (validation.keyId) {
      keyValidator.decrementUsage(validation.keyId);
    }
  });

  // Handle errors
  socket.on("error", (err) => {
    console.error(`[WebSocket] Error on ${subdomain}:`, err);
  });
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(
  socket: WebSocket,
  subdomain: string,
  message: BaseMessage
): void {
  const connectionManager = getConnectionManager();

  switch (message.type) {
    case "heartbeat": {
      const hb = message as HeartbeatMessage;
      connectionManager.updateHeartbeat(subdomain, hb.payload?.requestCount);

      const ack: HeartbeatAckMessage = {
        type: "heartbeat_ack",
        timestamp: Date.now(),
      };
      send(socket, ack);
      break;
    }

    case "http_response": {
      const response = message as HttpResponseMessage;
      if (!response.id) {
        console.warn("[WebSocket] Received http_response without ID");
        return;
      }

      const resolved = connectionManager.resolvePendingRequest(
        response.id,
        response.payload
      );

      if (!resolved) {
        console.warn(`[WebSocket] No pending request for ID: ${response.id}`);
      }
      break;
    }

    case "disconnect": {
      const dc = message as DisconnectMessage;
      console.log(`[WebSocket] Client disconnect: ${subdomain} - ${dc.payload?.reason}`);

      // Send disconnect acknowledgment
      const ackMessage: DisconnectMessage = {
        type: "disconnect",
        timestamp: Date.now(),
        payload: {
          reason: "Server acknowledged disconnect",
        },
      };
      send(socket, ackMessage);

      // Close the connection
      socket.close(CloseCodes.NORMAL, "Client requested disconnect");
      break;
    }

    default:
      console.warn(`[WebSocket] Unknown message type: ${message.type}`);
  }
}
