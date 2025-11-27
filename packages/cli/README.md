# @liveport/cli

Command-line interface for creating secure localhost tunnels with LivePort.

## Installation

```bash
npm install -g @liveport/cli
# or
pnpm add -g @liveport/cli
```

## Quick Start

```bash
# Connect a local port (e.g., a dev server on port 3000)
liveport connect 3000 --key YOUR_BRIDGE_KEY

# Check tunnel status
liveport status

# Disconnect
liveport disconnect
```

## Commands

### `liveport connect <port>`

Create a tunnel to expose a local port.

**Options:**
- `-k, --key <key>` - Bridge key for authentication
- `-s, --server <url>` - Tunnel server URL
- `-r, --region <region>` - Server region

**Example:**
```bash
liveport connect 3000 --key bk_abc123
```

### `liveport status`

Show current tunnel status including URL and connection details.

### `liveport disconnect`

Disconnect active tunnel.

**Options:**
- `-a, --all` - Disconnect all tunnels

### `liveport config`

Manage CLI configuration.

```bash
# Set default bridge key
liveport config set key bk_abc123

# Set default server
liveport config set server https://tunnel.liveport.dev

# View config
liveport config list

# Get specific value
liveport config get key

# Delete config value
liveport config delete key
```

## Environment Variables

- `LIVEPORT_KEY` - Default bridge key
- `LIVEPORT_SERVER` - Default tunnel server URL

## How It Works

1. Run `liveport connect <port>` to establish a WebSocket connection to the LivePort tunnel server
2. The server assigns a unique subdomain (e.g., `abc123.tunnel.liveport.dev`)
3. Incoming requests to that URL are proxied through the tunnel to your local port
4. AI agents can discover your tunnel using the `@liveport/agent-sdk`

## License

MIT
