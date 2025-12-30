/**
 * WebSocket Proxy
 *
 * Handles HTTP upgrade events and relays WebSocket frames between
 * public clients and CLI tunnels.
 */

import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer } from "ws";
import type { RawData } from "ws";
import { nanoid } from "nanoid";
import type { ConnectionManager } from "./connection-manager";
import { extractSubdomain } from "./http-handler";
import { MAX_WEBSOCKETS_PER_TUNNEL, MAX_FRAME_SIZE } from "./types";
import type {
  WebSocketFrameMessage,
  WebSocketCloseMessage,
} from "./types";

// Singleton WebSocketServer instance for handling upgrades
// Using noServer mode to handle upgrades manually via HTTP server's 'upgrade' event
const wss = new WebSocketServer({ noServer: true });

/**
 * Handle WebSocket upgrade event from HTTP server
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
    socket.destroy();
    return;
  }

  // Find tunnel connection
  const connection = connectionManager.findBySubdomain(subdomain);
  if (!connection) {
    socket.destroy();
    return;
  }

  // Check if tunnel is active
  if (connection.state !== "active") {
    socket.destroy();
    return;
  }

  // Check WebSocket connection limit
  const wsCount = connectionManager.getWebSocketCount(subdomain);
  if (wsCount >= MAX_WEBSOCKETS_PER_TUNNEL) {
    socket.destroy();
    return;
  }

  // Validation passed - perform WebSocket handshake using singleton
  // Perform WebSocket upgrade handshake
  wss.handleUpgrade(req, socket, head, (publicWs) => {
    // Generate WebSocket connection ID
    const wsId = `${subdomain}:ws:${nanoid(10)}`;

    // Register WebSocket in ConnectionManager
    connectionManager.registerProxiedWebSocket(wsId, subdomain, publicWs);

    // Set up event listeners for frame relay

    // Handle incoming messages from public client
    publicWs.on("message", (data: RawData, isBinary: boolean) => {
      // Check frame size limit (10MB)
      const bytes = Buffer.byteLength(data as Buffer);
      if (bytes > MAX_FRAME_SIZE) {
        console.warn(`[WebSocketProxy] Frame too large: ${bytes} bytes (max ${MAX_FRAME_SIZE})`);
        publicWs.close(1009, "Message too big");
        connectionManager.unregisterProxiedWebSocket(wsId);
        return;
      }

      // Build WebSocket frame message
      const frameMessage: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: wsId,
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: isBinary ? 2 : 1,
          data: isBinary ? Buffer.from(data as Buffer).toString("base64") : data.toString(),
          final: true,
        },
      };

      // Send to CLI tunnel
      try {
        connection.socket.send(JSON.stringify(frameMessage));
      } catch (error) {
        console.error(`[WebSocketProxy] Failed to relay frame to CLI: ${(error as Error).message}`);
        publicWs.close(1011, "Tunnel connection error");
        connectionManager.unregisterProxiedWebSocket(wsId);
        return;
      }

      // Track bytes transferred
      connectionManager.trackWebSocketFrame(wsId, bytes);
    });

    // Handle close event
    publicWs.on("close", (code: number, reason: Buffer) => {
      // Re-fetch connection to get current state (avoid stale closure)
      const currentConnection = connectionManager.findBySubdomain(subdomain);

      // Only send close message if tunnel is still active
      if (currentConnection && currentConnection.socket.readyState === currentConnection.socket.OPEN) {
        const closeMessage: WebSocketCloseMessage = {
          type: "websocket_close",
          id: wsId,
          timestamp: Date.now(),
          payload: {
            code,
            reason: reason.toString(),
            initiator: "client",
          },
        };

        // Send to CLI tunnel
        try {
          currentConnection.socket.send(JSON.stringify(closeMessage));
        } catch (error) {
          console.error(`[WebSocketProxy] Failed to send close message to CLI: ${(error as Error).message}`);
          // Continue with cleanup even if send fails
        }
      }

      // Unregister WebSocket
      connectionManager.unregisterProxiedWebSocket(wsId);
    });

    // Handle error event
    publicWs.on("error", (error: Error) => {
      console.error(`[WebSocketProxy] Error on ${wsId}:`, error.message);

      // Notify CLI if connection still active
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
          // Ignore error - tunnel connection might be broken
        }
      }

      publicWs.close(1011, "Unexpected error");
      connectionManager.unregisterProxiedWebSocket(wsId);
    });

    // Handle ping event
    publicWs.on("ping", (data: Buffer) => {
      const frameMessage: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: wsId,
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 9,
          data: data.toString("base64"),
          final: true,
        },
      };

      try {
        connection.socket.send(JSON.stringify(frameMessage));
      } catch (error) {
        console.error(`[WebSocketProxy] Failed to relay ping to CLI: ${(error as Error).message}`);
        publicWs.close(1011, "Tunnel connection error");
        connectionManager.unregisterProxiedWebSocket(wsId);
        return;
      }
      connectionManager.trackWebSocketFrame(wsId, data.length);
    });

    // Handle pong event
    publicWs.on("pong", (data: Buffer) => {
      const frameMessage: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: wsId,
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 10,
          data: data.toString("base64"),
          final: true,
        },
      };

      try {
        connection.socket.send(JSON.stringify(frameMessage));
      } catch (error) {
        console.error(`[WebSocketProxy] Failed to relay pong to CLI: ${(error as Error).message}`);
        publicWs.close(1011, "Tunnel connection error");
        connectionManager.unregisterProxiedWebSocket(wsId);
        return;
      }
      connectionManager.trackWebSocketFrame(wsId, data.length);
    });
  });
}
