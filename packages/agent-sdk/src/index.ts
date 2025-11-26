// Agent SDK - will be implemented in TASK-015

import type { Tunnel } from "@liveport/shared";

export interface LivePortAgentConfig {
  key: string;
  apiUrl?: string;
  timeout?: number;
}

export interface WaitForTunnelOptions {
  timeout?: number;
  pollInterval?: number;
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
 * const tunnel = await agent.waitForTunnel({ timeout: 30000 });
 * console.log(`Testing at: ${tunnel.url}`);
 *
 * // Run your tests against tunnel.url
 *
 * await agent.disconnect();
 * ```
 */
export class LivePortAgent {
  private config: Required<LivePortAgentConfig>;

  constructor(config: LivePortAgentConfig) {
    this.config = {
      key: config.key,
      apiUrl: config.apiUrl || "https://api.liveport.dev",
      timeout: config.timeout || 30000,
    };
  }

  /**
   * Wait for a tunnel to become available
   */
  async waitForTunnel(_options?: WaitForTunnelOptions): Promise<Tunnel> {
    // Will be implemented in TASK-015
    throw new Error("Not implemented - see TASK-015");
  }

  /**
   * List all active tunnels for this bridge key
   */
  async listTunnels(): Promise<Tunnel[]> {
    // Will be implemented in TASK-015
    throw new Error("Not implemented - see TASK-015");
  }

  /**
   * Disconnect and clean up
   */
  async disconnect(): Promise<void> {
    // Will be implemented in TASK-015
    throw new Error("Not implemented - see TASK-015");
  }
}

// Re-export types
export type { Tunnel } from "@liveport/shared";
