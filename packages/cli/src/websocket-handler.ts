/**
 * WebSocket Handler
 *
 * Handles WebSocket connections to local servers and relays messages
 * bidirectionally between tunnel server and local WebSocket server.
 *
 * Uses the 'ws' library for proper WebSocket protocol handling.
 */

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
 * Local WebSocket connection using ws library
 */
interface LocalWebSocketConnection {
  id: string;
  localWs: WebSocket;
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
   * Uses the ws library to connect to the local WebSocket server.
   * Messages are relayed using the WebSocket API instead of raw bytes.
   */
  async handleUpgrade(message: WebSocketUpgradeMessage): Promise<void> {
    const { id, payload } = message;
    const { path, headers, subprotocol } = payload;

    try {
      // Build WebSocket URL
      const wsUrl = `ws://localhost:${this.localPort}${path}`;

      // Build headers for the local connection
      // Skip WebSocket-specific headers as the ws library handles those
      const localHeaders: Record<string, string> = {};
      for (const [name, value] of Object.entries(headers)) {
        if (
          name.toLowerCase() !== "host" &&
          name.toLowerCase() !== "upgrade" &&
          name.toLowerCase() !== "connection" &&
          !name.toLowerCase().startsWith("sec-websocket-")
        ) {
          localHeaders[name] = value;
        }
      }

      // Create WebSocket connection to local server
      // Disable compression to avoid RSV1 issues
      const localWs = new WebSocket(wsUrl, subprotocol ? [subprotocol] : [], {
        headers: localHeaders,
        perMessageDeflate: false,
      });

      // Wait for connection to establish
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          localWs.terminate();
          reject(new Error("Connection timeout"));
        }, 5000);

        localWs.on("open", () => {
          clearTimeout(timeout);
          resolve();
        });

        localWs.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      console.log(`[WebSocketHandler] Connected to local server for ${id}`);

      // Connection successful - register it
      this.connections.set(id, {
        id,
        localWs,
        createdAt: new Date(),
        frameCount: 0,
        bytesTransferred: 0,
      });

      // Set up event handlers for message relay
      this.setupLocalWsHandlers(id, localWs);

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
   * Set up event handlers for local WebSocket connection
   *
   * Relays messages from the local WebSocket server to the tunnel.
   */
  private setupLocalWsHandlers(id: string, localWs: WebSocket): void {
    // Handle messages from local server → tunnel
    localWs.on("message", (data: Buffer | ArrayBuffer | Buffer[] | string, isBinary: boolean) => {
      const connection = this.connections.get(id);
      if (!connection) {
        return;
      }

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
        console.error(`[WebSocketHandler] Unexpected data type: ${typeof data}`);
        return;
      }

      // Check size limit (10MB)
      if (buffer.length > MAX_FRAME_SIZE) {
        console.error(`[WebSocketHandler] Message too large: ${buffer.length} bytes (max ${MAX_FRAME_SIZE})`);
        localWs.terminate();
        this.connections.delete(id);
        return;
      }

      // Build WebSocket data message
      const dataMessage: WebSocketDataMessage = {
        type: "websocket_data",
        id,
        timestamp: Date.now(),
        payload: {
          data: buffer.toString("base64"),
          binary: isBinary,
        },
      };

      // Update stats
      connection.frameCount++;
      connection.bytesTransferred += buffer.length;

      // Send to tunnel
      this.sendToTunnel(dataMessage);
    });

    // Handle close from local server
    localWs.on("close", (code: number, reason: Buffer) => {
      this.handleLocalClose(id, code, reason.toString() || "Connection closed");
    });

    // Handle error from local server
    localWs.on("error", (err) => {
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
   * Handle data from tunnel (public client → local server)
   *
   * Receives message data from the tunnel server and sends to the local
   * WebSocket server using the ws library.
   */
  handleData(message: WebSocketDataMessage): void {
    const { id, payload } = message;
    const { data, binary } = payload;

    const connection = this.connections.get(id);
    if (!connection) {
      console.warn(`[WebSocketHandler] No connection found for ${id}`);
      return;
    }

    const { localWs } = connection;

    // Check if WebSocket is still open
    if (localWs.readyState !== WebSocket.OPEN) {
      console.warn(`[WebSocketHandler] Local WebSocket ${id} not open (state: ${localWs.readyState})`);
      return;
    }

    // Decode base64 data
    const buffer = Buffer.from(data, "base64");

    // Send via WebSocket API
    try {
      localWs.send(buffer, { binary: binary ?? false, compress: false });
    } catch (error) {
      console.error(`[WebSocketHandler] Failed to send to local server:`, (error as Error).message);
      return;
    }

    // Update stats
    connection.frameCount++;
    connection.bytesTransferred += buffer.length;
  }

  /**
   * Handle frame from tunnel (public client → local server)
   * @deprecated Use handleData() instead
   */
  handleFrame(message: WebSocketFrameMessage): void {
    const { id, payload } = message;
    const { opcode, data } = payload;

    const connection = this.connections.get(id);
    if (!connection) {
      console.warn(`[WebSocketHandler] No connection found for ${id}`);
      return;
    }

    const { localWs } = connection;

    // Check if WebSocket is still open
    if (localWs.readyState !== WebSocket.OPEN) {
      console.warn(`[WebSocketHandler] Local WebSocket ${id} not open`);
      return;
    }

    // Send based on opcode
    try {
      if (opcode === 1) {
        // Text frame
        localWs.send(data, { binary: false, compress: false });
      } else if (opcode === 2) {
        // Binary frame (decode from base64)
        const buffer = Buffer.from(data, "base64");
        localWs.send(buffer, { binary: true, compress: false });
      } else if (opcode === 9) {
        // Ping
        localWs.ping(Buffer.from(data, "base64"));
      } else if (opcode === 10) {
        // Pong
        localWs.pong(Buffer.from(data, "base64"));
      } else {
        console.warn(`[WebSocketHandler] Unsupported opcode ${opcode}`);
      }
    } catch (error) {
      console.error(`[WebSocketHandler] Failed to send frame:`, (error as Error).message);
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

    const { localWs } = connection;

    // Close local WebSocket
    if (localWs.readyState === WebSocket.OPEN || localWs.readyState === WebSocket.CONNECTING) {
      localWs.close(code, reason);
    }

    // Cleanup
    this.connections.delete(id);
  }

  /**
   * Close all WebSocket connections
   */
  closeAll(code: number, reason: string): void {
    for (const [id, connection] of this.connections.entries()) {
      const { localWs } = connection;
      if (localWs.readyState === WebSocket.OPEN || localWs.readyState === WebSocket.CONNECTING) {
        localWs.close(code, reason);
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
