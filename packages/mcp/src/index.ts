/**
 * @liveport/mcp — MCP server for LivePort tunnels
 *
 * Exposes localhost ports to the internet from inside an AI agent session.
 * Install once, use from any Claude Code session.
 *
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "liveport": {
 *       "command": "npx",
 *       "args": ["-y", "@liveport/mcp"],
 *       "env": { "LIVEPORT_BRIDGE_KEY": "lpk_..." }
 *     }
 *   }
 * }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LivePortAgent, AgentTunnel, ConnectionError, ApiError } from "@liveport/agent-sdk";

// Active tunnels keyed by localPort
const activeTunnels = new Map<number, { agent: LivePortAgent; tunnel: AgentTunnel }>();

function getKey(): string {
  const key = process.env.LIVEPORT_BRIDGE_KEY;
  if (!key) {
    throw new Error(
      "LIVEPORT_BRIDGE_KEY environment variable is required. " +
      "Get a key at https://liveport.dev/dashboard/keys"
    );
  }
  return key;
}

function formatTunnel(tunnel: AgentTunnel): string {
  const expiresIn = Math.round((tunnel.expiresAt.getTime() - Date.now()) / 60000);
  return [
    `🔗 Port ${tunnel.localPort} → ${tunnel.url}`,
    `   Tunnel ID: ${tunnel.tunnelId}`,
    `   Subdomain: ${tunnel.subdomain}`,
    `   Expires: ${expiresIn > 0 ? `in ${expiresIn} min` : "expired"}`,
  ].join("\n");
}

const server = new McpServer({
  name: "liveport",
  version: "0.1.0",
});

// ─── Tool: liveport_connect ───────────────────────────────────────────────────

server.tool(
  "liveport_connect",
  "Create a secure tunnel from a local port to a public URL. Returns the public URL that can be shared with external services, webhooks, or other agents.",
  {
    port: z.number().int().min(1).max(65535).describe("Local port to expose (e.g. 3000)"),
    timeout: z.number().int().min(1000).max(120000).optional().describe("Connection timeout in ms (default: 30000)"),
  },
  async ({ port, timeout }) => {
    // Reuse existing tunnel for this port if still connected
    const existing = activeTunnels.get(port);
    if (existing && existing.tunnel.expiresAt > new Date()) {
      return {
        content: [
          {
            type: "text",
            text: `Tunnel already active for port ${port}:\n${formatTunnel(existing.tunnel)}`,
          },
        ],
      };
    }

    // Clean up expired entry if present
    if (existing) {
      await existing.agent.disconnect().catch(() => {});
      activeTunnels.delete(port);
    }

    try {
      const agent = new LivePortAgent({ key: getKey() });
      const tunnel = await agent.connect(port, { timeout });
      activeTunnels.set(port, { agent, tunnel });

      return {
        content: [
          {
            type: "text",
            text: `✅ Tunnel created!\n${formatTunnel(tunnel)}\n\nPublic URL: ${tunnel.url}`,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof ConnectionError || err instanceof ApiError
        ? err.message
        : String(err);
      return {
        content: [{ type: "text", text: `❌ Failed to create tunnel: ${message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: liveport_list_tunnels ──────────────────────────────────────────────

server.tool(
  "liveport_list_tunnels",
  "List all active tunnels for the current bridge key, including tunnels created in other sessions.",
  {},
  async () => {
    try {
      const agent = new LivePortAgent({ key: getKey() });
      const tunnels = await agent.listTunnels();

      if (tunnels.length === 0) {
        return {
          content: [{ type: "text", text: "No active tunnels found." }],
        };
      }

      const lines = [`Found ${tunnels.length} active tunnel(s):\n`];
      for (const tunnel of tunnels) {
        lines.push(formatTunnel(tunnel));
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      return {
        content: [{ type: "text", text: `❌ Failed to list tunnels: ${message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: liveport_get_tunnel_url ────────────────────────────────────────────

server.tool(
  "liveport_get_tunnel_url",
  "Get the public URL for a tunnel by local port number. Returns the URL if a tunnel exists for that port.",
  {
    port: z.number().int().min(1).max(65535).describe("Local port to look up"),
  },
  async ({ port }) => {
    // Check local session first
    const local = activeTunnels.get(port);
    if (local && local.tunnel.expiresAt > new Date()) {
      return {
        content: [
          {
            type: "text",
            text: `Tunnel URL for port ${port}: ${local.tunnel.url}`,
          },
        ],
      };
    }

    // Fall back to API
    try {
      const agent = new LivePortAgent({ key: getKey() });
      const tunnels = await agent.listTunnels();
      const match = tunnels.find((t) => t.localPort === port);

      if (!match) {
        return {
          content: [
            {
              type: "text",
              text: `No active tunnel for port ${port}. Use liveport_connect to create one.`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: `Tunnel URL for port ${port}: ${match.url}` }],
      };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      return {
        content: [{ type: "text", text: `❌ Failed to get tunnel URL: ${message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: liveport_disconnect ────────────────────────────────────────────────

server.tool(
  "liveport_disconnect",
  "Disconnect a tunnel by local port or tunnel ID. Frees resources when done.",
  {
    port: z.number().int().min(1).max(65535).optional().describe("Local port of the tunnel to disconnect"),
    tunnelId: z.string().optional().describe("Tunnel ID to disconnect (alternative to port)"),
  },
  async ({ port, tunnelId }) => {
    if (!port && !tunnelId) {
      return {
        content: [{ type: "text", text: "Provide either port or tunnelId." }],
        isError: true,
      };
    }

    // Find by port in local session
    if (port) {
      const entry = activeTunnels.get(port);
      if (entry) {
        await entry.agent.disconnect().catch(() => {});
        activeTunnels.delete(port);
        return {
          content: [{ type: "text", text: `✅ Disconnected tunnel for port ${port}.` }],
        };
      }
    }

    // Find by tunnelId in local session
    if (tunnelId) {
      for (const [p, entry] of activeTunnels.entries()) {
        if (entry.tunnel.tunnelId === tunnelId) {
          await entry.agent.disconnect().catch(() => {});
          activeTunnels.delete(p);
          return {
            content: [{ type: "text", text: `✅ Disconnected tunnel ${tunnelId} (port ${p}).` }],
          };
        }
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `No active tunnel found for ${port ? `port ${port}` : `ID ${tunnelId}`} in this session.`,
        },
      ],
    };
  }
);

// ─── Tool: liveport_status ────────────────────────────────────────────────────

server.tool(
  "liveport_status",
  "Show the status of the LivePort MCP server — active tunnels in this session and bridge key validity.",
  {},
  async () => {
    const lines: string[] = ["LivePort MCP Server Status\n"];

    // Key presence (never log the key itself)
    const key = process.env.LIVEPORT_BRIDGE_KEY;
    lines.push(`Bridge key: ${key ? `configured (${key.substring(0, 8)}...)` : "❌ NOT SET"}`);
    lines.push("");

    if (activeTunnels.size === 0) {
      lines.push("Active tunnels: none");
    } else {
      lines.push(`Active tunnels (${activeTunnels.size}):`);
      for (const [, { tunnel }] of activeTunnels) {
        lines.push(formatTunnel(tunnel));
        lines.push("");
      }
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// ─── Start server ─────────────────────────────────────────────────────────────

async function main() {
  // Clean up all tunnels on exit
  process.on("exit", () => {
    for (const { agent } of activeTunnels.values()) {
      agent.disconnect().catch(() => {});
    }
  });
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("LivePort MCP server error:", err);
  process.exit(1);
});
