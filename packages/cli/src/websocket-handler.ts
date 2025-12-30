/**
 * WebSocket Handler
 *
 * Handles WebSocket connections to local servers and relays raw bytes
 * bidirectionally between tunnel server and local WebSocket server.
 */

import net from "net";
import WebSocket from "ws";
import type {
  WebSocketUpgradeMessage,
  WebSocketUpgradeResponseMessage,
  WebSocketFrameMessage,
  WebSocketCloseMessage,
  WebSocketDataMessage,
} from "./types";

const MAX_FRAME_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Local WebSocket connection via TCP socket
 *
 * Uses raw TCP socket instead of WebSocket client to preserve all
 * WebSocket frame metadata (RSV bits, masking, extensions) during relay.
 */
interface LocalWebSocketConnection {
  id: string;
  localSocket: net.Socket;
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
   *
   * Creates a raw TCP connection to the local server and manually performs
   * the WebSocket upgrade handshake. This allows us to relay raw bytes
   * instead of parsing WebSocket frames, preserving all frame metadata.
   */
  async handleUpgrade(message: WebSocketUpgradeMessage): Promise<void> {
    const { id, payload } = message;
    const { path, headers, subprotocol } = payload;

    try {
      // Create TCP connection to local server
      const localSocket = net.connect({
        host: "localhost",
        port: this.localPort,
      });

      // Wait for connection to establish
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          localSocket.destroy();
          reject(new Error("Connection timeout"));
        }, 5000);

        localSocket.on("connect", () => {
          clearTimeout(timeout);
          resolve();
        });

        localSocket.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // Generate WebSocket handshake key
      const key = Buffer.from(Math.random().toString(36).substring(2, 18)).toString("base64");

      // Build WebSocket upgrade request
      let upgradeRequest = `GET ${path} HTTP/1.1\r\n`;
      upgradeRequest += `Host: localhost:${this.localPort}\r\n`;
      upgradeRequest += `Upgrade: websocket\r\n`;
      upgradeRequest += `Connection: Upgrade\r\n`;
      upgradeRequest += `Sec-WebSocket-Key: ${key}\r\n`;
      upgradeRequest += `Sec-WebSocket-Version: 13\r\n`;

      // Add custom headers
      for (const [name, value] of Object.entries(headers)) {
        // Skip headers that are part of the upgrade protocol
        if (
          name.toLowerCase() !== "host" &&
          name.toLowerCase() !== "upgrade" &&
          name.toLowerCase() !== "connection" &&
          !name.toLowerCase().startsWith("sec-websocket-")
        ) {
          upgradeRequest += `${name}: ${value}\r\n`;
        }
      }

      // Add subprotocol if specified
      if (subprotocol) {
        upgradeRequest += `Sec-WebSocket-Protocol: ${subprotocol}\r\n`;
      }

      upgradeRequest += `\r\n`;

      // Send upgrade request
      localSocket.write(upgradeRequest);

      // Wait for upgrade response
      const upgradeResponse = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          localSocket.destroy();
          reject(new Error("Upgrade response timeout"));
        }, 5000);

        let buffer = "";
        const onData = (chunk: Buffer) => {
          buffer += chunk.toString();

          // Check if we have received the full HTTP response headers
          const headersEndIndex = buffer.indexOf("\r\n\r\n");
          if (headersEndIndex !== -1) {
            clearTimeout(timeout);
            localSocket.off("data", onData);
            resolve(buffer.substring(0, headersEndIndex));
          }
        };

        localSocket.on("data", onData);

        localSocket.on("error", (err) => {
          clearTimeout(timeout);
          localSocket.off("data", onData);
          reject(err);
        });
      });

      // Parse upgrade response
      const lines = upgradeResponse.split("\r\n");
      const statusLine = lines[0];
      const statusMatch = statusLine.match(/HTTP\/1\.1 (\d+)/);

      if (!statusMatch) {
        throw new Error("Invalid HTTP response");
      }

      const statusCode = parseInt(statusMatch[1]);

      if (statusCode !== 101) {
        throw new Error(`Upgrade failed with status ${statusCode}`);
      }

      // Connection and upgrade successful - register it
      this.connections.set(id, {
        id,
        localSocket,
        createdAt: new Date(),
        frameCount: 0,
        bytesTransferred: 0,
      });

      // Set up event handlers for raw byte relay
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
   * Set up event handlers for local TCP socket
   *
   * Relays raw bytes from the local WebSocket server to the tunnel,
   * preserving all WebSocket frame metadata (RSV bits, masking, extensions).
   */
  private setupLocalSocketHandlers(id: string, localSocket: net.Socket): void {
    // Handle raw bytes from local server → tunnel
    localSocket.on("data", (chunk: Buffer) => {
      const connection = this.connections.get(id);
      if (!connection) {
        return;
      }

      // Check chunk size limit (10MB)
      const bytes = chunk.length;
      if (bytes > MAX_FRAME_SIZE) {
        console.error(`[WebSocketHandler] Byte chunk too large: ${bytes} bytes (max ${MAX_FRAME_SIZE})`);
        localSocket.destroy();
        this.connections.delete(id);
        return;
      }

      // Build WebSocket data message with raw bytes encoded as base64
      const dataMessage: WebSocketDataMessage = {
        type: "websocket_data",
        id,
        timestamp: Date.now(),
        payload: {
          data: chunk.toString("base64"),
        },
      };

      // Update stats
      connection.frameCount++;
      connection.bytesTransferred += bytes;

      // Send to tunnel
      this.sendToTunnel(dataMessage);
    });

    // Handle close from local server
    localSocket.on("close", () => {
      this.handleLocalClose(id, 1000, "Connection closed");
    });

    // Handle end from local server
    localSocket.on("end", () => {
      this.handleLocalClose(id, 1000, "Connection ended");
    });

    // Handle error from local server
    localSocket.on("error", (err) => {
      console.error(`[WebSocketHandler] Error on ${id}:`, err.message);
      this.handleLocalClose(id, 1011, err.message);
    });
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
   * Handle raw byte data from tunnel (public client → local server)
   *
   * Receives raw bytes from the tunnel server and writes them directly to
   * the local TCP socket, preserving all WebSocket frame metadata.
   */
  handleData(message: WebSocketDataMessage): void {
    const { id, payload } = message;
    const { data } = payload;

    const connection = this.connections.get(id);
    if (!connection) {
      console.warn(`[WebSocketHandler] No connection found for ${id}`);
      return;
    }

    const { localSocket } = connection;

    // Check if socket is still writable
    if (localSocket.destroyed || !localSocket.writable) {
      console.warn(`[WebSocketHandler] Local socket ${id} not writable`);
      return;
    }

    // Decode base64 data to raw bytes
    const rawBytes = Buffer.from(data, "base64");

    // Write raw bytes directly to socket
    // This preserves all WebSocket frame metadata (RSV bits, masking, extensions)
    localSocket.write(rawBytes);

    // Update stats
    connection.frameCount++;
    connection.bytesTransferred += rawBytes.length;
  }

  /**
   * Handle frame from tunnel (public client → local server)
   * @deprecated Use handleData() for raw byte relay instead
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

    // Check if socket is still writable
    if (localSocket.destroyed || !localSocket.writable) {
      console.warn(`[WebSocketHandler] Local socket ${id} not writable`);
      return;
    }

    // For backwards compatibility: decode and send based on opcode
    // Note: This is deprecated - use handleData() for raw byte relay
    if (opcode === 1) {
      // Text frame
      const buffer = Buffer.from(data);
      localSocket.write(buffer);
    } else if (opcode === 2) {
      // Binary frame (decode from base64)
      const buffer = Buffer.from(data, "base64");
      localSocket.write(buffer);
    } else if (opcode === 9 || opcode === 10) {
      // Ping/pong frames - ignore in raw byte mode
      console.warn(`[WebSocketHandler] Received ping/pong frame (opcode ${opcode}) - should use raw byte relay`);
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
