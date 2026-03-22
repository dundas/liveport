/**
 * Tunnel Client
 *
 * WebSocket client for connecting to the LivePort tunnel server.
 * Handles connection, reconnection, heartbeats, and HTTP proxying.
 */

import WebSocket from "ws";
import http from "http";
import type {
  TunnelClientConfig,
  TunnelInfo,
  ConnectionState,
  Message,
  ConnectedMessage,
  ErrorMessage,
  HeartbeatMessage,
  HttpRequestMessage,
  HttpResponsePayload,
  WebSocketUpgradeMessage,
  WebSocketFrameMessage,
  WebSocketCloseMessage,
  WebSocketDataMessage,
} from "./types";
import { WebSocketHandler } from "./websocket-handler";

const DEFAULT_HEARTBEAT_INTERVAL = 10000; // 10 seconds
const DEFAULT_RECONNECT_MAX_ATTEMPTS = 5;
const DEFAULT_RECONNECT_BASE_DELAY = 1000; // 1 second

export class TunnelClient {
  private config: TunnelClientConfig & {
    heartbeatInterval: number;
    reconnectMaxAttempts: number;
    reconnectBaseDelay: number;
  };
  private socket: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private tunnelInfo: TunnelInfo | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private requestCount = 0;
  private shouldReconnect = true;
  private wsHandler: WebSocketHandler;

  // Event handlers
  private onConnected: ((info: TunnelInfo) => void) | null = null;
  private onDisconnected: ((reason: string) => void) | null = null;
  private onReconnecting: ((attempt: number, max: number) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;
  private onRequest: ((method: string, path: string) => void) | null = null;

  constructor(config: TunnelClientConfig) {
    this.config = {
      ...config,
      heartbeatInterval: config.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL,
      reconnectMaxAttempts: config.reconnectMaxAttempts ?? DEFAULT_RECONNECT_MAX_ATTEMPTS,
      reconnectBaseDelay: config.reconnectBaseDelay ?? DEFAULT_RECONNECT_BASE_DELAY,
    };

    // Initialize WebSocket handler
    this.wsHandler = new WebSocketHandler(
      (message) => this.send(message),
      config.localPort
    );
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get tunnel info (only available when connected)
   */
  getTunnelInfo(): TunnelInfo | null {
    return this.tunnelInfo;
  }

  /**
   * Register event handlers
   */
  on<E extends keyof TunnelClientEventHandlers>(
    event: E,
    handler: TunnelClientEventHandlers[E]
  ): this {
    switch (event) {
      case "connected":
        this.onConnected = handler as (info: TunnelInfo) => void;
        break;
      case "disconnected":
        this.onDisconnected = handler as (reason: string) => void;
        break;
      case "reconnecting":
        this.onReconnecting = handler as (attempt: number, max: number) => void;
        break;
      case "error":
        this.onError = handler as (error: Error) => void;
        break;
      case "request":
        this.onRequest = handler as (method: string, path: string) => void;
        break;
    }
    return this;
  }

  /**
   * Connect to the tunnel server
   */
  async connect(): Promise<TunnelInfo> {
    return new Promise((resolve, reject) => {
      if (this.state === "connected" || this.state === "connecting") {
        reject(new Error("Already connected or connecting"));
        return;
      }

      this.state = "connecting";
      this.shouldReconnect = true;

      const wsUrl = this.buildWebSocketUrl();
      const headers: Record<string, string> = {
        "X-Bridge-Key": this.config.bridgeKey,
        "X-Local-Port": String(this.config.localPort),
      };
      
      // Add tunnel name if provided
      if (this.config.tunnelName) {
        headers["X-Tunnel-Name"] = this.config.tunnelName;
      }

      // Add TTL if provided
      if (this.config.ttlSeconds) {
        headers["X-Tunnel-TTL"] = String(this.config.ttlSeconds);
      }
      
      this.socket = new WebSocket(wsUrl, {
        headers,
        // Disable compression on control channel to avoid RSV1 bit issues during relay
        perMessageDeflate: false,
      });

      // Connection timeout
      const connectTimeout = setTimeout(() => {
        if (this.state === "connecting") {
          this.socket?.close();
          reject(new Error("Connection timeout"));
        }
      }, 30000);

      this.socket.on("open", () => {
        // Connection open, waiting for "connected" message from server
      });

      this.socket.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString()) as Message;
          this.handleMessage(message, resolve, reject, connectTimeout);
        } catch (err) {
          // Log parse errors at debug level - malformed messages from server
          if (process.env.DEBUG) {
            console.error("[tunnel-client] Failed to parse message:", err);
          }
        }
      });

      this.socket.on("close", (code, reason) => {
        clearTimeout(connectTimeout);
        this.handleClose(code, reason.toString());
      });

      this.socket.on("error", (err) => {
        clearTimeout(connectTimeout);
        if (this.state === "connecting") {
          reject(err);
        }
        this.onError?.(err);
      });
    });
  }

  /**
   * Disconnect from the tunnel server
   */
  disconnect(reason: string = "Client disconnect"): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    this.stopReconnectTimer();

    // Close all WebSocket connections
    this.wsHandler.closeAll(1000, reason);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Send disconnect message
      this.send({
        type: "disconnect",
        timestamp: Date.now(),
        payload: { reason },
      });

      this.socket.close(1000, reason);
    }

    this.state = "disconnected";
    this.tunnelInfo = null;
    this.socket = null;
  }

  /**
   * Build WebSocket URL
   */
  private buildWebSocketUrl(): string {
    const url = new URL(this.config.serverUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/connect";
    return url.toString();
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(
    message: Message,
    resolve: (info: TunnelInfo) => void,
    reject: (error: Error) => void,
    connectTimeout: NodeJS.Timeout
  ): void {
    switch (message.type) {
      case "connected": {
        clearTimeout(connectTimeout);
        const connMsg = message as ConnectedMessage;
        this.tunnelInfo = {
          tunnelId: connMsg.payload.tunnelId,
          subdomain: connMsg.payload.subdomain,
          url: connMsg.payload.url,
          localPort: this.config.localPort,
          expiresAt: new Date(connMsg.payload.expiresAt),
        };
        this.state = "connected";
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.onConnected?.(this.tunnelInfo);
        resolve(this.tunnelInfo);
        break;
      }

      case "error": {
        const errMsg = message as ErrorMessage;
        const error = new Error(errMsg.payload.message);
        (error as Error & { code: string }).code = errMsg.payload.code;

        if (errMsg.payload.fatal) {
          clearTimeout(connectTimeout);
          this.shouldReconnect = false;
          if (this.state === "connecting") {
            reject(error);
          }
          this.onError?.(error);
        } else {
          this.onError?.(error);
        }
        break;
      }

      case "heartbeat_ack": {
        // Heartbeat acknowledged - connection is alive
        break;
      }

      case "http_request": {
        const reqMsg = message as HttpRequestMessage;
        this.handleHttpRequest(reqMsg);
        break;
      }

      case "disconnect": {
        // Server requested disconnect
        this.shouldReconnect = false;
        break;
      }

      case "websocket_upgrade": {
        const upgradeMsg = message as WebSocketUpgradeMessage;
        this.wsHandler.handleUpgrade(upgradeMsg);
        break;
      }

      case "websocket_data": {
        const dataMsg = message as WebSocketDataMessage;
        this.wsHandler.handleData(dataMsg);
        break;
      }

      case "websocket_frame": {
        const frameMsg = message as WebSocketFrameMessage;
        this.wsHandler.handleFrame(frameMsg);
        break;
      }

      case "websocket_close": {
        const closeMsg = message as WebSocketCloseMessage;
        this.wsHandler.handleClose(closeMsg);
        break;
      }
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(code: number, reason: string): void {
    this.stopHeartbeat();
    const wasConnected = this.state === "connected";
    this.state = "disconnected";
    this.tunnelInfo = null;
    this.socket = null;

    // Check if we should reconnect
    if (this.shouldReconnect && wasConnected) {
      this.attemptReconnect();
    } else {
      this.onDisconnected?.(reason || `Closed with code ${code}`);
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.reconnectMaxAttempts) {
      this.state = "failed";
      this.onDisconnected?.("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    this.state = "reconnecting";
    this.onReconnecting?.(this.reconnectAttempts, this.config.reconnectMaxAttempts);

    // Exponential backoff
    const delay = this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1);

    // Store timer reference so we can cancel if disconnect() is called
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      // Check if disconnect was called during the delay
      if (!this.shouldReconnect) {
        return;
      }
      try {
        await this.connect();
      } catch {
        // Will trigger handleClose which will retry
      }
    }, delay);
  }

  /**
   * Stop reconnect timer
   */
  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat message
   */
  private sendHeartbeat(): void {
    const heartbeat: HeartbeatMessage = {
      type: "heartbeat",
      timestamp: Date.now(),
      payload: {
        requestCount: this.requestCount,
      },
    };
    this.send(heartbeat);
  }

  /**
   * Handle HTTP request from tunnel server
   */
  private handleHttpRequest(message: HttpRequestMessage): void {
    const { method, path, headers, body } = message.payload;
    this.requestCount++;
    this.onRequest?.(method, path);

    // Make request to local server
    const options: http.RequestOptions = {
      hostname: "localhost",
      port: this.config.localPort,
      path: path,
      method: method,
      headers: headers,
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on("data", (chunk) => chunks.push(chunk));

      res.on("end", () => {
        const responseBody = Buffer.concat(chunks);
        const response: HttpResponsePayload = {
          status: res.statusCode || 500,
          headers: res.headers as Record<string, string>,
          body: responseBody.length > 0 ? responseBody.toString("base64") : undefined,
        };

        this.send({
          type: "http_response",
          id: message.id,
          timestamp: Date.now(),
          payload: response,
        });
      });
    });

    req.on("error", (err) => {
      // Send error response
      const response: HttpResponsePayload = {
        status: 502,
        headers: { "Content-Type": "text/plain" },
        body: Buffer.from(`Error connecting to local server: ${err.message}`).toString("base64"),
      };

      this.send({
        type: "http_response",
        id: message.id,
        timestamp: Date.now(),
        payload: response,
      });
    });

    // Send request body if present
    if (body) {
      req.write(Buffer.from(body, "base64"));
    }
    req.end();
  }

  /**
   * Send message to server
   */
  private send(message: Message | { type: string; timestamp: number; payload?: unknown; id?: string }): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}

// Event handler types
interface TunnelClientEventHandlers {
  connected: (info: TunnelInfo) => void;
  disconnected: (reason: string) => void;
  reconnecting: (attempt: number, max: number) => void;
  error: (error: Error) => void;
  request: (method: string, path: string) => void;
}
