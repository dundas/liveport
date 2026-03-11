/**
 * Pure helper functions for @liveport/mcp.
 * Extracted so tests can import the real implementations directly.
 */

import { AgentTunnel } from "@liveport/agent-sdk";

/**
 * Format a tunnel for display in tool responses.
 */
export function formatTunnel(tunnel: AgentTunnel): string {
  const msRemaining = tunnel.expiresAt.getTime() - Date.now();
  const expiresIn = Math.round(msRemaining / 60000);
  const expiresText = msRemaining <= 0 ? "expired" : expiresIn <= 0 ? "< 1 min" : `in ${expiresIn} min`;
  return [
    `🔗 Port ${tunnel.localPort} → ${tunnel.url}`,
    `   Tunnel ID: ${tunnel.tunnelId}`,
    `   Subdomain: ${tunnel.subdomain}`,
    `   Expires: ${expiresText}`,
  ].join("\n");
}

/**
 * Return the bridge key from the environment, throwing if absent.
 */
export function getKey(): string {
  const key = process.env.LIVEPORT_BRIDGE_KEY?.trim();
  if (!key) {
    throw new Error(
      "LIVEPORT_BRIDGE_KEY environment variable is required. " +
      "Get a key at https://liveport.dev/dashboard/keys"
    );
  }
  return key;
}

/**
 * Mask a bridge key for display — shows only the last 4 characters.
 */
export function maskKey(key: string): string {
  if (key.length <= 4) {
    return "****";
  }
  return `...${key.slice(-4)}`;
}

/**
 * Extract a human-readable message from any error, handling SDK error types.
 */
export function extractMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.stack) {
      console.error(err.stack);
    }
    return err.message;
  }
  console.error(err);
  return String(err);
}
