# @liveport/mcp

MCP server for [LivePort](https://liveport.dev) — expose localhost ports to AI agents with one tool call.

Secure, authenticated tunnels that agents can create, inspect, and tear down entirely from within a Claude Code session. No terminal. No config. Just a tool call.

## Install

```bash
npx @liveport/mcp
```

Or globally:

```bash
npm install -g @liveport/mcp
```

## Setup

### 1. Get a bridge key

Sign in at [liveport.dev/dashboard](https://liveport.dev/dashboard) → **Keys** → **Create Key**.

### 2. Add to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "liveport": {
      "command": "npx",
      "args": ["-y", "@liveport/mcp"],
      "env": {
        "LIVEPORT_BRIDGE_KEY": "lpk_your_key_here"
      }
    }
  }
}
```

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### 3. Restart Claude Desktop

The LivePort tools will appear automatically.

## Tools

### `liveport_connect`

Create a tunnel from a local port to a public URL.

```text
liveport_connect(port: number, timeout?: number)
```

Returns the public HTTPS URL. Reuses existing tunnel if already active for that port.

### `liveport_list_tunnels`

List all active tunnels for the current bridge key, including tunnels from other sessions.

```text
liveport_list_tunnels()
```

### `liveport_get_tunnel_url`

Get the public URL for a tunnel by local port number.

```text
liveport_get_tunnel_url(port: number)
```

### `liveport_disconnect`

Disconnect a tunnel when done. Only disconnects tunnels created in this session.

```text
liveport_disconnect(port?: number, tunnelId?: string)
```

### `liveport_status`

Show active tunnels in the current session and bridge key status.

```text
liveport_status()
```

## Example agent workflow

```text
User: "Start a tunnel to my dev server on port 3000"

Agent uses liveport_connect(3000)
→ ✅ Tunnel created!
→ 🔗 Port 3000 → https://abc123.tunnel.liveport.online
→ Public URL: https://abc123.tunnel.liveport.online

User: "Send this URL to the webhook tester"
Agent: "Done — the webhook is at https://abc123.tunnel.liveport.online/webhook"

User: "OK done, close the tunnel"
Agent uses liveport_disconnect(3000)
→ ✅ Disconnected tunnel for port 3000.
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVEPORT_BRIDGE_KEY` | Yes | Bridge key from liveport.dev/dashboard |

## Security

Bridge keys are scoped to your account. Create short-lived keys for CI, long-lived keys for your local setup. Rotate from the dashboard at any time.

Never-expiring keys show a warning in the dashboard. Treat them like passwords.

## Links

- [Dashboard](https://liveport.dev/dashboard)
- [Docs](https://liveport.dev/docs)
- [npm](https://npmjs.com/package/@liveport/mcp)
- [GitHub](https://github.com/dundas/liveport)
