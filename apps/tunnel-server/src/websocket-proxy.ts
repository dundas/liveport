/**
 * WebSocket Proxy
 *
 * Handles WebSocket connections from public clients and relays data
 * to/from CLI tunnels.
 *
 * Key Change: Uses 'ws' library for proper WebSocket handling instead of
 * manual 101 handshakes. This ensures proper socket detachment from the
 * HTTP server and correct WebSocket protocol handling.
 */

import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocket, WebSocketServer } from "ws";
import { nanoid } from "nanoid";
import type { ConnectionManager } from "./connection-manager";
import { extractSubdomain } from "./http-handler";
import { MAX_WEBSOCKETS_PER_TUNNEL } from "./types";
import type {
  WebSocketUpgradeMessage,
  WebSocketDataMessage,
  WebSocketCloseMessage,
} from "./types";

// Global WebSocketServer for public client connections
let publicWss: WebSocketServer | null = null;

/**
 * Initialize the public WebSocket server
 * Must be called during server startup
 */
export function initPublicWebSocketServer(): WebSocketServer {
  if (publicWss) {
    return publicWss;
  }

  publicWss = new WebSocketServer({
    noServer: true,
    // Disable compression to avoid protocol conflicts during relay
    perMessageDeflate: false,
  });

  console.log("[WebSocketProxy] Public WebSocket server initialized (perMessageDeflate: false)");
  return publicWss;
}

/**
 * Handle WebSocket upgrade event from HTTP server
 *
 * Uses the 'ws' library to properly handle WebSocket upgrades. This ensures
 * the socket is correctly detached from HTTP processing.
 *
 * @param req - Incoming HTTP request
 * @param socket - TCP socket
 * @param head - First packet of upgraded stream
 * @param connectionManager - Connection manager instance
 * @param baseDomain - Base domain for subdomain extraction
 */
export function handleWebSocketUpgradeEvent(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  connectionManager: ConnectionManager,
  baseDomain: string
): void {
  // Extract subdomain from Host header
  const host = req.headers.host || "";
  const subdomain = extractSubdomain(host, baseDomain);

  // Validate subdomain
  if (!subdomain) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  // Find tunnel connection
  const connection = connectionManager.findBySubdomain(subdomain);
  if (!connection) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  // Check if tunnel is active
  if (connection.state !== "active") {
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.destroy();
    return;
  }

  // Check access token if required (Bearer header only — no query params
  // to prevent token exposure in server logs and Referer headers)
  if (connection.accessToken) {
    let token: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader) {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match) {
        token = match[1];
      }
    }

    if (!connectionManager.validateAccessToken(subdomain, token)) {
      const body = JSON.stringify({ error: "Unauthorized", message: "Valid access token required" });
      socket.write(
        `HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
      );
      socket.destroy();
      return;
    }
  }

  // Check WebSocket connection limit
  const wsCount = connectionManager.getWebSocketCount(subdomain);
  if (wsCount >= MAX_WEBSOCKETS_PER_TUNNEL) {
    socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
    socket.destroy();
    return;
  }

  // Initialize WebSocketServer if needed
  const wss = initPublicWebSocketServer();

  // Generate WebSocket connection ID
  const wsId = `${subdomain}:ws:${nanoid(10)}`;

  console.log(`[WebSocketProxy] Handling WebSocket upgrade for ${wsId}`);

  // Use ws library to handle the upgrade properly
  wss.handleUpgrade(req, socket, head, (publicWs: WebSocket) => {
    console.log(`[WebSocketProxy] WebSocket ${wsId} connected via ws library`);

    // Register WebSocket in ConnectionManager (store the ws object)
    connectionManager.registerProxiedWebSocket(wsId, subdomain, publicWs);

    // Send WebSocket upgrade notification to CLI
    // Filter out Sec-WebSocket-Extensions to prevent compression negotiation
    const filteredHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (name.toLowerCase() !== "sec-websocket-extensions" && typeof value === "string") {
        filteredHeaders[name] = value;
      }
    }

    const upgradeMessage: WebSocketUpgradeMessage = {
      type: "websocket_upgrade",
      id: wsId,
      timestamp: Date.now(),
      payload: {
        path: req.url || "/",
        headers: filteredHeaders,
        subprotocol: req.headers["sec-websocket-protocol"],
      },
    };

    try {
      connection.socket.send(JSON.stringify(upgradeMessage));
    } catch (error) {
      console.error(`[WebSocketProxy] Failed to send upgrade message to CLI: ${(error as Error).message}`);
      publicWs.close(1011, "Failed to notify tunnel");
      connectionManager.unregisterProxiedWebSocket(wsId);
      return;
    }

    // Wait for CLI to establish local connection and respond
    connectionManager
      .waitForWebSocketUpgrade(wsId, 10000)
      .then((upgradeResponse) => {
        // Check if CLI accepted the upgrade
        if (!upgradeResponse.payload.accepted) {
          console.log(`[WebSocketProxy] CLI rejected WebSocket upgrade: ${upgradeResponse.payload.reason}`);
          publicWs.close(1011, upgradeResponse.payload.reason || "Tunnel rejected connection");
          connectionManager.unregisterProxiedWebSocket(wsId);
          return;
        }

        console.log(`[WebSocketProxy] CLI accepted WebSocket upgrade for ${wsId}`);

        // Set up message relay from public client to CLI
        publicWs.on("message", (data: Buffer | ArrayBuffer | Buffer[] | string, isBinary: boolean) => {
          // Convert to Buffer (handle all RawData types from ws library)
          let buffer: Buffer;
          if (Buffer.isBuffer(data)) {
            buffer = data;
          } else if (typeof data === "string") {
            buffer = Buffer.from(data);
          } else if (data instanceof ArrayBuffer) {
            buffer = Buffer.from(data);
          } else if (Array.isArray(data)) {
            buffer = Buffer.concat(data);
          } else {
            console.error(`[WebSocketProxy] Unexpected data type: ${typeof data}`);
            return;
          }

          // Build WebSocket frame message
          // We send the raw message content (not the frame), and the CLI will
          // construct proper WebSocket frames for the local server
          const dataMessage: WebSocketDataMessage = {
            type: "websocket_data",
            id: wsId,
            timestamp: Date.now(),
            payload: {
              data: buffer.toString("base64"),
              binary: isBinary,
            },
          };

          // Send to CLI tunnel
          try {
            connection.socket.send(JSON.stringify(dataMessage));
            connectionManager.trackWebSocketFrame(wsId, buffer.length);
          } catch (error) {
            console.error(`[WebSocketProxy] Failed to relay message to CLI: ${(error as Error).message}`);
            publicWs.close(1011, "Tunnel error");
            connectionManager.unregisterProxiedWebSocket(wsId);
          }
        });

        // Handle close from public client
        publicWs.on("close", (code: number, reason: Buffer) => {
          console.log(`[WebSocketProxy] WebSocket ${wsId} closed (code: ${code}, reason: ${reason.toString()})`);

          // Notify CLI
          const currentConnection = connectionManager.findBySubdomain(subdomain);
          if (currentConnection && currentConnection.socket.readyState === currentConnection.socket.OPEN) {
            const closeMessage: WebSocketCloseMessage = {
              type: "websocket_close",
              id: wsId,
              timestamp: Date.now(),
              payload: {
                code,
                reason: reason.toString() || "Client closed",
                initiator: "client",
              },
            };
            try {
              currentConnection.socket.send(JSON.stringify(closeMessage));
            } catch (e) {
              // Ignore - tunnel might be closed
            }
          }

          // Clean up event listeners to prevent memory leaks
          publicWs.removeAllListeners();
          connectionManager.unregisterProxiedWebSocket(wsId);
        });

        // Handle error from public client
        publicWs.on("error", (error: Error) => {
          console.error(`[WebSocketProxy] Error on ${wsId}:`, error.message);

          // Notify CLI
          const currentConnection = connectionManager.findBySubdomain(subdomain);
          if (currentConnection && currentConnection.socket.readyState === currentConnection.socket.OPEN) {
            const closeMessage: WebSocketCloseMessage = {
              type: "websocket_close",
              id: wsId,
              timestamp: Date.now(),
              payload: {
                code: 1011,
                reason: error.message,
                initiator: "tunnel",
              },
            };
            try {
              currentConnection.socket.send(JSON.stringify(closeMessage));
            } catch (e) {
              // Ignore - tunnel might be closed
            }
          }

          // Clean up event listeners to prevent memory leaks
          publicWs.removeAllListeners();
          connectionManager.unregisterProxiedWebSocket(wsId);
        });
      })
      .catch((error: Error) => {
        console.error(`[WebSocketProxy] WebSocket upgrade failed for ${wsId}: ${error.message}`);
        publicWs.close(1011, "Upgrade timeout");
        connectionManager.unregisterProxiedWebSocket(wsId);
      });
  });
}
