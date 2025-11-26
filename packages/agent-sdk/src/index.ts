/**
 * LivePort Agent SDK
 *
 * TypeScript SDK for AI agents to wait for and access localhost tunnels.
 */

import type { Tunnel } from "@liveport/shared";

export interface LivePortAgentConfig {
  /** Bridge key for authentication */
  key: string;
  /** API base URL (default: https://app.liveport.dev) */
  apiUrl?: string;
  /** Default timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface WaitForTunnelOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Poll interval in milliseconds (default: 1000) */
  pollInterval?: number;
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

/**
 * LivePort Agent SDK
 *
 * Allows AI agents to wait for and access localhost tunnels.
 *
 * @example
 * ```typescript
 * import { LivePortAgent } from '@liveport/agent-sdk';
 *
 * const agent = new LivePortAgent({
 *   key: process.env.LIVEPORT_BRIDGE_KEY!
 * });
 *
 * // Wait for a tunnel to become available
 * const tunnel = await agent.waitForTunnel({ timeout: 30000 });
 * console.log(`Testing at: ${tunnel.url}`);
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

  constructor(config: LivePortAgentConfig) {
    if (!config.key) {
      throw new Error("Bridge key is required");
    }

    this.config = {
      key: config.key,
      apiUrl: config.apiUrl || "https://app.liveport.dev",
      timeout: config.timeout || 30000,
    };
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
   * Cancels any pending waitForTunnel calls.
   */
  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
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

// Re-export types
export type { Tunnel } from "@liveport/shared";
