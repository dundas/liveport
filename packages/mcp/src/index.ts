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
import { LivePortAgent } from "@liveport/agent-sdk";
import type { AgentTunnel } from "@liveport/agent-sdk";
import { formatTunnel, getKey, maskKey, extractMessage } from "./helpers.js";

// Active tunnels keyed by localPort
const activeTunnels = new Map<number, { agent: LivePortAgent; tunnel: AgentTunnel }>();

// In-flight connect guards — prevents concurrent connects to the same port
const inFlightConnects = new Map<number, { agent: LivePortAgent; promise: Promise<AgentTunnel> }>();

async function pruneExpiredTunnels(): Promise<void> {
  const now = new Date();
  const stalePorts: number[] = [];
  for (const [port, entry] of activeTunnels.entries()) {
    if (entry.tunnel.expiresAt <= now) {
      stalePorts.push(port);
    }
  }
  await Promise.allSettled(
    stalePorts.map(async (port) => {
      const entry = activeTunnels.get(port);
      if (!entry) return;
      await entry.agent.disconnect().catch(() => {});
      if (activeTunnels.get(port) === entry) {
        activeTunnels.delete(port);
      }
    })
  );
}

async function findInFlightByTunnelId(
  tunnelId: string
): Promise<{ port: number; entry: { agent: LivePortAgent; promise: Promise<AgentTunnel> } } | null> {
  // Best-effort: probe in-flight connects briefly so tunnelId-only disconnect
  // can cancel a connection that just finished assigning an ID.
  const probes = [...inFlightConnects.entries()].map(async ([port, entry]) => {
    try {
      const tunnel = await Promise.race<AgentTunnel | null>([
        entry.promise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 25)),
      ]);
      if (tunnel && tunnel.tunnelId === tunnelId) {
        return { port, entry };
      }
    } catch {
      // Ignore failed in-flight connects while searching
    }
    return null;
  });

  const results = await Promise.all(probes);
  return results.find((match) => match !== null) ?? null;
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
    await pruneExpiredTunnels();

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
      if (activeTunnels.get(port) === existing) {
        activeTunnels.delete(port);
      }
    }

    // Deduplicate concurrent connect calls for the same port
    const inFlight = inFlightConnects.get(port);
    if (inFlight) {
      try {
        const tunnel = await inFlight.promise;
        return {
          content: [
            {
              type: "text",
              text: `✅ Tunnel created (shared with concurrent request)\n${formatTunnel(tunnel)}\n\nPublic URL: ${tunnel.url}`,
            },
          ],
        };
      } catch {
        // First connect failed — fall through to a fresh attempt
      }
    }

    try {
      const agent = new LivePortAgent({ key: getKey() });
      const connectPromise = agent
        .connect(port, { timeout })
        .then(async (tunnel) => {
          if (shutdownInProgress) {
            await agent.disconnect().catch(() => {});
            throw new Error("Server shutting down");
          }
          activeTunnels.set(port, { agent, tunnel });
          return tunnel;
        })
        .catch(async (err) => {
          await agent.disconnect().catch(() => {});
          throw err;
        })
        .finally(() => {
          const current = inFlightConnects.get(port);
          if (current?.promise === connectPromise) {
            inFlightConnects.delete(port);
          }
        });
      inFlightConnects.set(port, { agent, promise: connectPromise });
      const tunnel = await connectPromise;

      return {
        content: [
          {
            type: "text",
            text: `✅ Tunnel created!\n${formatTunnel(tunnel)}\n\nPublic URL: ${tunnel.url}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `❌ Failed to create tunnel: ${extractMessage(err)}` }],
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
    await pruneExpiredTunnels();
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
      const message = extractMessage(err);
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
    await pruneExpiredTunnels();

    // Check local session first
    const local = activeTunnels.get(port);
    if (local) {
      if (local.tunnel.expiresAt > new Date()) {
        return {
          content: [{ type: "text", text: `Tunnel URL for port ${port}: ${local.tunnel.url}` }],
        };
      }
      // Stale entry — clean up before falling back to API
      await local.agent.disconnect().catch(() => {});
      if (activeTunnels.get(port) === local) {
        activeTunnels.delete(port);
      }
    }

    // Fall back to API
    try {
      const agent = new LivePortAgent({ key: getKey() });
      const tunnels = await agent.listTunnels();
      const matches = tunnels.filter((t) => t.localPort === port);

      if (matches.length > 1) {
        return {
          content: [
            {
              type: "text",
              text: `Multiple active tunnels use port ${port}. Use liveport_list_tunnels to choose the correct tunnel.`,
            },
          ],
          isError: true,
        };
      }
      const [match] = matches;

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
      const message = extractMessage(err);
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
  "Disconnect a tunnel by local port or tunnel ID. Only disconnects tunnels created in this session. Use liveport_list_tunnels to inspect tunnels from other sessions.",
  {
    port: z.number().int().min(1).max(65535).optional().describe("Local port of the tunnel to disconnect"),
    tunnelId: z.string().optional().describe("Tunnel ID to disconnect (alternative to port)"),
  },
  async ({ port, tunnelId }) => {
    await pruneExpiredTunnels();

    if (!port && !tunnelId) {
      return {
        content: [{ type: "text", text: "Provide either port or tunnelId." }],
        isError: true,
      };
    }

    // Find by port in local session
    if (port !== undefined) {
      const entry = activeTunnels.get(port);
      if (entry) {
        if (tunnelId && entry.tunnel.tunnelId !== tunnelId) {
          return {
            content: [
              {
                type: "text",
                text: `Port ${port} is active, but tunnelId ${tunnelId} does not match (found ${entry.tunnel.tunnelId}).`,
              },
            ],
            isError: true,
          };
        }
        await entry.agent.disconnect().catch(() => {});
        if (activeTunnels.get(port) === entry) {
          activeTunnels.delete(port);
        }
        return {
          content: [{ type: "text", text: `✅ Disconnected tunnel for port ${port}.` }],
        };
      }

      const inFlight = inFlightConnects.get(port);
      if (inFlight) {
        await inFlight.agent.disconnect().catch(() => {});
        if (inFlightConnects.get(port)?.promise === inFlight.promise) {
          inFlightConnects.delete(port);
        }
        return {
          content: [{ type: "text", text: `✅ Disconnected pending tunnel connection for port ${port}.` }],
        };
      }

      if (tunnelId) {
        return {
          content: [
            {
              type: "text",
              text: `No active tunnel found for port ${port} and tunnelId ${tunnelId} in this session.`,
            },
          ],
          isError: true,
        };
      }
    }

    // Find by tunnelId in local session
    if (tunnelId && port === undefined) {
      for (const [p, entry] of activeTunnels.entries()) {
        if (entry.tunnel.tunnelId === tunnelId) {
          await entry.agent.disconnect().catch(() => {});
          if (activeTunnels.get(p) === entry) {
            activeTunnels.delete(p);
          }
          return {
            content: [{ type: "text", text: `✅ Disconnected tunnel ${tunnelId} (port ${p}).` }],
          };
        }
      }

      const inFlightMatch = await findInFlightByTunnelId(tunnelId);
      if (inFlightMatch) {
        await inFlightMatch.entry.agent.disconnect().catch(() => {});
        const current = inFlightConnects.get(inFlightMatch.port);
        if (current?.promise === inFlightMatch.entry.promise) {
          inFlightConnects.delete(inFlightMatch.port);
        }
        return {
          content: [
            {
              type: "text",
              text: `✅ Disconnected pending tunnel ${tunnelId} (port ${inFlightMatch.port}).`,
            },
          ],
        };
      }
    }

    return {
      content: [
        {
          type: "text",
          text:
            port && tunnelId
              ? `No active tunnel found for port ${port} and tunnelId ${tunnelId} in this session.`
              : `No active tunnel found for ${port ? `port ${port}` : `ID ${tunnelId}`} in this session.`,
        },
      ],
      isError: true,
    };
  }
);

// ─── Tool: liveport_status ────────────────────────────────────────────────────

server.tool(
  "liveport_status",
  "Show the status of the LivePort MCP server — active tunnels in this session and bridge key validity.",
  {},
  async () => {
    await pruneExpiredTunnels();

    const lines: string[] = ["LivePort MCP Server Status\n"];

    // Key presence (never log the key itself)
    try {
      const key = getKey();
      lines.push(`Bridge key: configured (${maskKey(key)})`);
    } catch {
      lines.push("Bridge key: ❌ NOT SET");
    }
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

let shutdownInProgress = false;

async function shutdown() {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  const agents = new Set<LivePortAgent>();
  for (const { agent } of inFlightConnects.values()) {
    agents.add(agent);
  }
  for (const { agent } of activeTunnels.values()) {
    agents.add(agent);
  }

  await Promise.allSettled([...agents].map((agent) => agent.disconnect().catch(() => {})));
  process.exit(0);
}

async function main() {
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("LivePort MCP server error:", err);
  process.exit(1);
});
