/**
 * LivePort Agent SDK
 *
 * TypeScript SDK for AI agents to wait for and access localhost tunnels.
 */

import WebSocket from "ws";

/**
 * Tunnel record as stored in the database.
 *
 * TODO: Remove this duplicate once @liveport/shared is published to npm
 * and agent-sdk can depend on it directly. Until then, keep in sync with
 * the Tunnel type in packages/shared/src/types/index.ts.
 */
export interface Tunnel {
  id: string;
  userId: string;
  bridgeKeyId?: string;
  subdomain: string;
  name?: string;
  localPort: number;
  publicUrl: string;
  region: string;
  connectedAt: Date;
  disconnectedAt?: Date;
  requestCount: number;
  bytesTransferred: number;
}

export interface LivePortAgentConfig {
  /** Bridge key for authentication */
  key: string;
  /** API base URL (default: https://liveport.dev) */
  apiUrl?: string;
  /** Tunnel server URL for connect() (default: https://tunnel.liveport.online) */
  tunnelUrl?: string;
  /** Default timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface WaitForTunnelOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Poll interval in milliseconds (default: 1000) */
  pollInterval?: number;
}

export interface ConnectOptions {
  /** Tunnel server URL (overrides tunnelUrl from config) */
  serverUrl?: string;
  /** Connection timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/** @internal Extended connect options with injectable WebSocket class for testing */
interface InternalConnectOptions extends ConnectOptions {
  _WebSocketClass?: typeof WebSocket;
}

export interface WaitForReadyOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Poll interval in milliseconds (default: 1000) */
  pollInterval?: number;
  /** Health check path (default: "/") */
  healthPath?: string;
}

export interface AgentTunnel {
  tunnelId: string;
  subdomain: string;
  url: string;
  localPort: number;
  createdAt: Date;
  expiresAt: Date;
}

/** Error thrown when tunnel wait times out */
export class TunnelTimeoutError extends Error {
  constructor(timeout: number) {
    super(`Tunnel not available within ${timeout}ms timeout`);
    this.name = "TunnelTimeoutError";
  }
}

/** Error thrown when API request fails */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Error thrown when WebSocket connection fails */
export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

/**
 * LivePort Agent SDK
 *
 * Allows AI agents to wait for, connect to, and access localhost tunnels.
 *
 * @example
 * ```typescript
 * import { LivePortAgent } from '@liveport/agent-sdk';
 *
 * const agent = new LivePortAgent({
 *   key: process.env.LIVEPORT_BRIDGE_KEY!
 * });
 *
 * // Create a tunnel to local port 3000
 * const tunnel = await agent.connect(3000);
 * console.log(`Tunnel URL: ${tunnel.url}`);
 *
 * // Wait for the local server to be reachable through the tunnel
 * await agent.waitForReady(tunnel);
 *
 * // Run your tests against tunnel.url
 *
 * // Clean up when done
 * await agent.disconnect();
 * ```
 */
export class LivePortAgent {
  private config: Required<LivePortAgentConfig>;
  private abortController: AbortController | null = null;
  private wsConnection: WebSocket | null = null;

  constructor(config: LivePortAgentConfig) {
    if (!config.key) {
      throw new Error("Bridge key is required");
    }

    this.config = {
      key: config.key,
      apiUrl: config.apiUrl || "https://liveport.dev",
      tunnelUrl: config.tunnelUrl || "https://tunnel.liveport.online",
      timeout: config.timeout || 30000,
    };
  }

  /**
   * Connect to the tunnel server and create a tunnel for the given local port.
   *
   * Opens a WebSocket to the tunnel server, authenticates with the bridge key,
   * and waits for a tunnel assignment. Incoming HTTP requests from the tunnel
   * are forwarded to localhost:<port>.
   *
   * @param port - The local port to tunnel
   * @param options - Connection options
   * @returns The tunnel info once connected
   * @throws ConnectionError if the connection fails or times out
   */
  async connect(port: number, options?: ConnectOptions): Promise<AgentTunnel> {
    if (this.wsConnection) {
      throw new ConnectionError("Already connected — call disconnect() first");
    }

    const serverUrl = options?.serverUrl || this.config.tunnelUrl;
    const timeout = options?.timeout ?? this.config.timeout;
    const WS = (options as InternalConnectOptions)?._WebSocketClass ?? WebSocket;

    return new Promise<AgentTunnel>((resolve, reject) => {
      const wsUrl = this.buildWebSocketUrl(serverUrl);

      const headers: Record<string, string> = {
        "X-Bridge-Key": this.config.key,
        "X-Local-Port": String(port),
      };

      const socket = new WS(wsUrl, {
        headers,
        perMessageDeflate: false,
      });

      this.wsConnection = socket;

      let settled = false;

      const connectTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.close();
          reject(new ConnectionError("Connection timeout"));
        }
      }, timeout);

      socket.on("open", () => {
        // Waiting for "connected" message from server
      });

      socket.on("message", (data: Buffer | string) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWsMessage(message, port, socket);

          if (message.type === "connected" && !settled) {
            clearTimeout(connectTimeout);
            settled = true;
            const tunnel: AgentTunnel = {
              tunnelId: message.payload.tunnelId,
              subdomain: message.payload.subdomain,
              url: message.payload.url,
              localPort: port,
              createdAt: new Date(),
              expiresAt: new Date(message.payload.expiresAt),
            };
            resolve(tunnel);
          } else if (message.type === "error" && message.payload?.fatal && !settled) {
            clearTimeout(connectTimeout);
            settled = true;
            reject(new ConnectionError(message.payload.message));
          }
        } catch {
          // Non-JSON messages (e.g. binary frames, malformed data) are
          // silently dropped. The connect timeout will fire if the
          // "connected" message never arrives.
        }
      });

      socket.on("close", () => {
        clearTimeout(connectTimeout);
        if (!settled) {
          settled = true;
          reject(new ConnectionError("Connection closed before tunnel was established"));
        }
        // Only null wsConnection if it's still this socket (avoid clobbering
        // a new connection created after disconnect() + connect())
        if (this.wsConnection === socket) {
          this.wsConnection = null;
        }
      });

      socket.on("error", (err: Error) => {
        clearTimeout(connectTimeout);
        if (!settled) {
          settled = true;
          // Clear wsConnection on error so a new connect() call can proceed
          if (this.wsConnection === socket) {
            this.wsConnection = null;
          }
          reject(new ConnectionError(err.message));
        }
      });
    });
  }

  /**
   * Wait for the tunnel's public URL to become reachable.
   *
   * Polls the tunnel's public URL (not localhost) with HTTP GET requests
   * until a 2xx response is received, or the timeout is exceeded. This
   * validates the full tunnel path end-to-end.
   *
   * @param tunnel - The tunnel to check
   * @param options - Wait options
   * @throws TunnelTimeoutError if the tunnel is not ready within timeout
   */
  async waitForReady(tunnel: AgentTunnel, options?: WaitForReadyOptions): Promise<void> {
    const timeout = options?.timeout ?? this.config.timeout;
    const pollInterval = options?.pollInterval ?? 1000;
    const healthPath = options?.healthPath ?? "/";

    const url = tunnel.url + healthPath;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(Math.max(1, Math.min(5000, timeout - (Date.now() - startTime)))),
        });
        if (response.ok) {
          return;
        }
      } catch {
        // Network error or timeout, continue polling
      }

      const remaining = timeout - (Date.now() - startTime);
      if (remaining <= 0) break;
      await this.sleep(Math.min(pollInterval, remaining));
    }

    throw new TunnelTimeoutError(timeout);
  }

  /**
   * Wait for a tunnel to become available
   *
   * Long-polls the API until a tunnel is ready or timeout is reached.
   *
   * @param options - Wait options
   * @returns The tunnel info once available
   * @throws TunnelTimeoutError if no tunnel becomes available within timeout
   * @throws ApiError if the API request fails
   */
  async waitForTunnel(options?: WaitForTunnelOptions): Promise<AgentTunnel> {
    const timeout = options?.timeout ?? this.config.timeout;
    const pollInterval = options?.pollInterval ?? 1000;

    this.abortController = new AbortController();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await this.makeRequest(
          `/api/agent/tunnels/wait?timeout=${Math.min(pollInterval * 5, timeout - (Date.now() - startTime))}`,
          { signal: this.abortController.signal }
        );

        if (response.ok) {
          const data = await response.json() as { tunnel?: Record<string, unknown> };
          if (data.tunnel) {
            return this.parseTunnel(data.tunnel);
          }
        } else if (response.status === 408) {
          // Timeout from server, continue polling
        } else {
          const error = await response.json().catch(() => ({ code: "UNKNOWN", message: "Request failed" })) as { code: string; message: string };
          throw new ApiError(response.status, error.code, error.message);
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        if ((err as Error).name === "AbortError") {
          throw new Error("Wait cancelled");
        }
        // Network error, wait and retry
      }

      // Wait before next poll
      await this.sleep(pollInterval);
    }

    throw new TunnelTimeoutError(timeout);
  }

  /**
   * List all active tunnels for this bridge key
   *
   * @returns Array of active tunnels
   * @throws ApiError if the API request fails
   */
  async listTunnels(): Promise<AgentTunnel[]> {
    const response = await this.makeRequest("/api/agent/tunnels");

    if (!response.ok) {
      const error = await response.json().catch(() => ({ code: "UNKNOWN", message: "Request failed" })) as { code: string; message: string };
      throw new ApiError(response.status, error.code, error.message);
    }

    const data = await response.json() as { tunnels?: Record<string, unknown>[] };
    return (data.tunnels || []).map((t) => this.parseTunnel(t));
  }

  /**
   * Disconnect and clean up
   *
   * Cancels any pending waitForTunnel calls and closes any WebSocket
   * connection created by connect().
   */
  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.wsConnection) {
      const ws = this.wsConnection;
      this.wsConnection = null; // Clear reference first so connect() can be called after

      // Use numeric constants (OPEN=1, CONNECTING=0) to avoid coupling to
      // the imported WebSocket class, which may differ from the injected one
      if (ws.readyState === 1 || ws.readyState === 0) {
        ws.close(1000, "Agent disconnect");
      }
    }
  }

  /**
   * Build WebSocket URL from server URL
   */
  private buildWebSocketUrl(serverUrl: string): string {
    const url = new URL(serverUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/connect";
    return url.toString();
  }

  /**
   * Handle incoming WebSocket messages from the tunnel server
   */
  private handleWsMessage(
    message: { type: string; id?: string; payload?: Record<string, unknown> },
    localPort: number,
    socket: WebSocket
  ): void {
    switch (message.type) {
      case "http_request":
        void this.handleHttpRequest(message, localPort, socket).catch(() => {
          // Errors are handled inside handleHttpRequest (sends 502 response)
        });
        break;

      case "heartbeat":
        // Respond with heartbeat_ack
        if (socket.readyState === 1 /* OPEN */) {
          socket.send(JSON.stringify({
            type: "heartbeat_ack",
            timestamp: Date.now(),
          }));
        }
        break;

      // connected and error are handled in the connect() promise
      // Other message types can be extended in the future
    }
  }

  /**
   * Forward an HTTP request from the tunnel server to localhost
   */
  private async handleHttpRequest(
    message: { type: string; id?: string; payload?: Record<string, unknown> },
    localPort: number,
    socket: WebSocket
  ): Promise<void> {
    const payload = message.payload as {
      method: string;
      path: string;
      headers: Record<string, string>;
      body?: string;
    };

    try {
      // Validate path to prevent injection (e.g. path traversal or host override)
      const safePath = payload.path?.startsWith("/") ? payload.path : `/${payload.path || ""}`;
      const url = `http://localhost:${localPort}${safePath}`;

      // Strip hop-by-hop headers that could cause request smuggling or
      // confuse the local server when forwarded from the tunnel
      const HOP_BY_HOP = new Set([
        "host", "connection", "transfer-encoding", "te", "trailer",
        "upgrade", "keep-alive", "proxy-authenticate", "proxy-authorization",
      ]);
      const safeHeaders = Object.fromEntries(
        Object.entries(payload.headers || {}).filter(([k]) => !HOP_BY_HOP.has(k.toLowerCase()))
      );

      const requestInit: RequestInit = {
        method: payload.method,
        headers: safeHeaders,
      };

      if (payload.body) {
        requestInit.body = Buffer.from(payload.body, "base64");
      }

      const response = await fetch(url, requestInit);
      const responseBody = await response.arrayBuffer();

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const responseMessage = {
        type: "http_response",
        id: message.id,
        timestamp: Date.now(),
        payload: {
          status: response.status,
          headers: responseHeaders,
          body: responseBody.byteLength > 0
            ? Buffer.from(responseBody).toString("base64")
            : undefined,
        },
      };

      if (socket.readyState === 1 /* OPEN */) {
        socket.send(JSON.stringify(responseMessage));
      }
    } catch (err) {
      const errorResponse = {
        type: "http_response",
        id: message.id,
        timestamp: Date.now(),
        payload: {
          status: 502,
          headers: { "Content-Type": "text/plain" },
          body: Buffer.from(
            `Error connecting to local server: ${(err as Error).message}`
          ).toString("base64"),
        },
      };

      if (socket.readyState === 1 /* OPEN */) {
        socket.send(JSON.stringify(errorResponse));
      }
    }
  }

  /**
   * Make an authenticated API request
   */
  private async makeRequest(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.config.apiUrl}${path}`;

    return fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.config.key}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  /**
   * Parse tunnel response into AgentTunnel
   */
  private parseTunnel(data: Record<string, unknown>): AgentTunnel {
    return {
      tunnelId: data.tunnelId as string || data.id as string,
      subdomain: data.subdomain as string,
      url: data.url as string,
      localPort: data.localPort as number,
      createdAt: new Date(data.createdAt as string),
      expiresAt: new Date(data.expiresAt as string),
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
