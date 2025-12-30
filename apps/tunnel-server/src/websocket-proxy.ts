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
  WebSocketDataMessage,
} from "./types";

// Singleton WebSocketServer instance for handling upgrades
// Using noServer mode to handle upgrades manually via HTTP server's 'upgrade' event
// Disable perMessageDeflate to avoid RSV1 bit corruption during raw byte relay
const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
});

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

    // Access underlying TCP socket for raw byte piping
    // This allows us to relay raw bytes instead of parsing WebSocket frames,
    // which preserves all frame metadata (RSV bits, masking, extensions)
    const underlyingSocket = (publicWs as any)._socket;

    // Set up event listeners for raw byte relay

    // Handle raw bytes from underlying TCP socket
    // This preserves all WebSocket frame metadata (RSV bits, masking, extensions)
    underlyingSocket.on("data", (chunk: Buffer) => {
      // Check chunk size limit (10MB)
      const bytes = chunk.length;
      if (bytes > MAX_FRAME_SIZE) {
        console.warn(`[WebSocketProxy] Byte chunk too large: ${bytes} bytes (max ${MAX_FRAME_SIZE})`);
        publicWs.close(1009, "Message too big");
        connectionManager.unregisterProxiedWebSocket(wsId);
        return;
      }

      // Build WebSocket data message with raw bytes encoded as base64
      const dataMessage: WebSocketDataMessage = {
        type: "websocket_data",
        id: wsId,
        timestamp: Date.now(),
        payload: {
          data: chunk.toString("base64"),
        },
      };

      // Send to CLI tunnel
      try {
        connection.socket.send(JSON.stringify(dataMessage));
      } catch (error) {
        console.error(`[WebSocketProxy] Failed to relay bytes to CLI: ${(error as Error).message}`);
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
  });
}
