/**
 * WebSocket Handler
 *
 * Handles WebSocket connections to local servers and relays frames
 * bidirectionally between tunnel server and local WebSocket server.
 */

import WebSocket from "ws";
import type {
  WebSocketUpgradeMessage,
  WebSocketUpgradeResponseMessage,
  WebSocketFrameMessage,
  WebSocketCloseMessage,
} from "./types";

const MAX_FRAME_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Local WebSocket connection
 */
interface LocalWebSocketConnection {
  id: string;
  localSocket: WebSocket;
  createdAt: Date;
  frameCount: number;
  bytesTransferred: number;
}

/**
 * WebSocket Handler
 *
 * Manages WebSocket connections to local servers
 */
export class WebSocketHandler {
  private connections: Map<string, LocalWebSocketConnection> = new Map();
  private sendToTunnel: (message: unknown) => void;
  private localPort: number;

  constructor(sendToTunnel: (message: unknown) => void, localPort: number) {
    this.sendToTunnel = sendToTunnel;
    this.localPort = localPort;
  }

  /**
   * Handle WebSocket upgrade request from tunnel server
   */
  async handleUpgrade(message: WebSocketUpgradeMessage): Promise<void> {
    const { id, payload } = message;
    const { path, headers, subprotocol } = payload;

    // Build local WebSocket URL
    const localUrl = `ws://localhost:${this.localPort}${path}`;

    try {
      // Connect to local WebSocket server
      const localSocket = new WebSocket(localUrl, {
        headers: headers as Record<string, string>,
        protocol: subprotocol,
      });

      // Wait for connection to open or error
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 5000);

        localSocket.on("open", () => {
          clearTimeout(timeout);
          resolve();
        });

        localSocket.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // Connection successful - register it
      this.connections.set(id, {
        id,
        localSocket,
        createdAt: new Date(),
        frameCount: 0,
        bytesTransferred: 0,
      });

      // Set up event handlers
      this.setupLocalSocketHandlers(id, localSocket);

      // Send success response to tunnel server
      const response: WebSocketUpgradeResponseMessage = {
        type: "websocket_upgrade_response",
        id,
        timestamp: Date.now(),
        payload: {
          accepted: true,
          statusCode: 101,
          headers: {},
        },
      };

      this.sendToTunnel(response);
    } catch (err) {
      // Connection failed - send error response
      const response: WebSocketUpgradeResponseMessage = {
        type: "websocket_upgrade_response",
        id,
        timestamp: Date.now(),
        payload: {
          accepted: false,
          statusCode: 502,
          reason: `Failed to connect to local server: ${(err as Error).message}`,
        },
      };

      this.sendToTunnel(response);
    }
  }

  /**
   * Set up event handlers for local WebSocket
   */
  private setupLocalSocketHandlers(id: string, localSocket: WebSocket): void {
    // Handle messages from local server → tunnel
    localSocket.on("message", (data, isBinary) => {
      this.handleLocalMessage(id, data, isBinary);
    });

    // Handle close from local server
    localSocket.on("close", (code, reason) => {
      this.handleLocalClose(id, code, reason.toString());
    });

    // Handle error from local server
    localSocket.on("error", (err) => {
      console.error(`[WebSocketHandler] Error on ${id}:`, err.message);
      // Close will be triggered automatically
    });

    // Handle ping from local server
    localSocket.on("ping", (data) => {
      this.handleLocalFrame(id, 9, data, true);
    });

    // Handle pong from local server
    localSocket.on("pong", (data) => {
      this.handleLocalFrame(id, 10, data, true);
    });
  }

  /**
   * Handle message from local server
   */
  private handleLocalMessage(id: string, data: Buffer | string, isBinary: boolean): void {
    const connection = this.connections.get(id);
    if (!connection) {
      return;
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    // Check frame size
    if (buffer.length > MAX_FRAME_SIZE) {
      console.error(`[WebSocketHandler] Frame too large: ${buffer.length} bytes`);
      connection.localSocket.close(1009, "Message too big");
      this.connections.delete(id);
      return;
    }

    const opcode = isBinary ? 2 : 1;
    this.handleLocalFrame(id, opcode, buffer, true);
  }

  /**
   * Handle frame from local server (generic)
   */
  private handleLocalFrame(id: string, opcode: number, data: Buffer, final: boolean): void {
    const connection = this.connections.get(id);
    if (!connection) {
      return;
    }

    // Build frame message
    const frameMessage: WebSocketFrameMessage = {
      type: "websocket_frame",
      id,
      direction: "server_to_client",
      timestamp: Date.now(),
      payload: {
        opcode,
        data: opcode === 1 ? data.toString() : data.toString("base64"),
        final,
      },
    };

    // Update stats
    connection.frameCount++;
    connection.bytesTransferred += data.length;

    // Send to tunnel
    this.sendToTunnel(frameMessage);
  }

  /**
   * Handle close from local server
   */
  private handleLocalClose(id: string, code: number, reason: string): void {
    const connection = this.connections.get(id);
    if (!connection) {
      return;
    }

    // Build close message
    const closeMessage: WebSocketCloseMessage = {
      type: "websocket_close",
      id,
      timestamp: Date.now(),
      payload: {
        code,
        reason,
        initiator: "server",
      },
    };

    // Send to tunnel
    this.sendToTunnel(closeMessage);

    // Cleanup
    this.connections.delete(id);
  }

  /**
   * Handle frame from tunnel (public client → local server)
   */
  handleFrame(message: WebSocketFrameMessage): void {
    const { id, payload } = message;
    const { opcode, data, final } = payload;

    const connection = this.connections.get(id);
    if (!connection) {
      console.warn(`[WebSocketHandler] No connection found for ${id}`);
      return;
    }

    const { localSocket } = connection;

    // Check if socket is still open
    if (localSocket.readyState !== WebSocket.OPEN) {
      console.warn(`[WebSocketHandler] Local socket ${id} not open (state: ${localSocket.readyState})`);
      return;
    }

    // Decode and send based on opcode
    if (opcode === 1) {
      // Text frame
      localSocket.send(data, { binary: false, fin: final });
    } else if (opcode === 2) {
      // Binary frame (decode from base64)
      const buffer = Buffer.from(data, "base64");
      localSocket.send(buffer, { binary: true, fin: final });
    } else if (opcode === 9) {
      // Ping frame
      const buffer = Buffer.from(data, "base64");
      localSocket.ping(buffer);
    } else if (opcode === 10) {
      // Pong frame
      const buffer = Buffer.from(data, "base64");
      localSocket.pong(buffer);
    } else {
      console.warn(`[WebSocketHandler] Unsupported opcode ${opcode} for frame relay`);
    }

    // Update stats
    connection.frameCount++;
    connection.bytesTransferred += Buffer.byteLength(data);
  }

  /**
   * Handle close from tunnel (public client closed)
   */
  handleClose(message: WebSocketCloseMessage): void {
    const { id, payload } = message;
    const { code, reason } = payload;

    const connection = this.connections.get(id);
    if (!connection) {
      console.warn(`[WebSocketHandler] No connection found for ${id}`);
      return;
    }

    const { localSocket } = connection;

    // Close local socket
    if (localSocket.readyState === WebSocket.OPEN || localSocket.readyState === WebSocket.CONNECTING) {
      localSocket.close(code, reason);
    }

    // Cleanup
    this.connections.delete(id);
  }

  /**
   * Close all WebSocket connections
   */
  closeAll(code: number, reason: string): void {
    for (const [id, connection] of this.connections.entries()) {
      const { localSocket } = connection;
      if (localSocket.readyState === WebSocket.OPEN || localSocket.readyState === WebSocket.CONNECTING) {
        localSocket.close(code, reason);
      }
      this.connections.delete(id);
    }
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get stats
   */
  getStats(): { connectionCount: number; totalFrames: number; totalBytes: number } {
    let totalFrames = 0;
    let totalBytes = 0;

    for (const connection of this.connections.values()) {
      totalFrames += connection.frameCount;
      totalBytes += connection.bytesTransferred;
    }

    return {
      connectionCount: this.connections.size,
      totalFrames,
      totalBytes,
    };
  }
}
