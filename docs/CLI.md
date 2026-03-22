<!-- Generated: 2026-03-22 from docs-generator.json — do not edit manually -->
# LivePort CLI Reference

The LivePort CLI creates secure localhost tunnels for AI agents and developers.

## Installation

```bash
npm install -g @liveport/cli
```

## Authentication

The CLI requires a bridge key for authentication. You can provide it in three ways (highest priority first):

1. **CLI flag**: `--key lpk_...`
2. **Environment variable**: `LIVEPORT_KEY=lpk_...`
3. **Config file**: `liveport config set key lpk_...`

Get a bridge key at [https://liveport.dev/keys](https://liveport.dev/keys).

---

## Commands

### `liveport connect <port>`

Create a persistent tunnel to expose a local port to the internet.

```bash
liveport connect 3000
liveport connect 8080 --key lpk_abc123 --ttl 2h --name "my-app"
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-k, --key <key>` | Bridge key for authentication | `$LIVEPORT_KEY` or config |
| `-s, --server <url>` | Tunnel server URL | `https://tunnel.liveport.online` |
| `-r, --region <region>` | Server region | Auto |
| `--ttl <duration>` | Time-to-live for the tunnel | Tier max (free=2h, paid=24h) |
| `--name <name>` | Human-readable tunnel name | None |

**TTL Duration Format:**

| Format | Example | Meaning |
|--------|---------|---------|
| `<n>s` | `30s` | 30 seconds |
| `<n>m` | `5m` | 5 minutes |
| `<n>h` | `2h` | 2 hours |
| `<n>d` | `1d` | 1 day |

**TTL Enforcement:**

The effective tunnel TTL is the minimum of:
- Client-requested TTL (`--ttl` flag)
- Bridge key expiration date
- Tier maximum: free = 2 hours, pro/team/enterprise = 24 hours

**Behavior:**
- Opens a WebSocket connection to the tunnel server
- Authenticates with the bridge key
- Receives a public URL (`https://<subdomain>.liveport.online`)
- Forwards incoming HTTP requests to `localhost:<port>`
- Supports WebSocket proxying
- Sends heartbeats every 10 seconds
- Auto-reconnects on disconnect (up to 5 attempts with exponential backoff)

---

### `liveport share <port>`

Create a temporary bridge key and tunnel for quick sharing. The tunnel is protected by an access token.

```bash
liveport share 3000
liveport share 8080 --ttl 30m --max-uses 5
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-k, --key <key>` | Parent bridge key for authentication | `$LIVEPORT_KEY` or config |
| `-s, --server <url>` | Tunnel server URL | `https://tunnel.liveport.online` |
| `--ttl <duration>` | Time-to-live for the temporary key | `2h` |
| `--max-uses <number>` | Maximum uses for the temporary key | `1` |

**How it works:**

1. Creates a temporary bridge key via `POST /api/agent/keys/temporary` (authenticated with your parent key)
2. Connects a tunnel using the temporary key
3. Requests an access token for the tunnel (prefixed `lpa_`)
4. Displays the URL and access token for sharing

**Temporary key limits:**
- Maximum `maxUses`: 100
- Keys appear in the dashboard with a `[temporary]` badge
- Keys are named "Temporary (liveport share)"

**Access tokens:**
- Required for all HTTP requests to the tunnel: `Authorization: Bearer lpa_...`
- Validated with HMAC-based constant-time comparison
- Example: `curl https://abc123.liveport.online -H "Authorization: Bearer lpa_..."`

---

### `liveport status`

Show the status of the currently active tunnel.

```bash
liveport status
```

Displays: public URL, local port, uptime, request count, and expiration time.

---

### `liveport disconnect`

Disconnect the active tunnel.

```bash
liveport disconnect
liveport disconnect --all
```

**Options:**

| Flag | Description |
|------|-------------|
| `-a, --all` | Disconnect all active tunnels |

---

### `liveport config`

Manage CLI configuration stored on disk.

#### `liveport config set <key> <value>`

Set a configuration value.

```bash
liveport config set key lpk_your_bridge_key_here
liveport config set server https://tunnel.liveport.online
```

**Supported keys:** `key`, `server`

#### `liveport config get <key>`

Get a configuration value.

```bash
liveport config get key
```

#### `liveport config list`

List all configuration values.

```bash
liveport config list
```

#### `liveport config delete <key>`

Delete a configuration value.

```bash
liveport config delete key
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LIVEPORT_KEY` | Default bridge key | None |
| `LIVEPORT_SERVER_URL` | Tunnel server URL | `https://tunnel.liveport.online` |
| `LIVEPORT_API_URL` | Dashboard API URL (for `share` command) | `https://liveport.dev` |

---

## Error Codes

| Code | Meaning |
|------|---------|
| `INVALID_KEY` | Bridge key format invalid or not found |
| `KEY_EXPIRED` | Bridge key has expired |
| `KEY_REVOKED` | Bridge key has been revoked |
| `PORT_NOT_ALLOWED` | Key is restricted to a different port |
| `RATE_LIMITED` | Rate limit exceeded (30 req/min) or max uses reached |
| `SERVICE_UNAVAILABLE` | Key validation service unavailable |

---

## Examples

### Basic tunnel

```bash
liveport connect 3000
# => https://abc123.liveport.online -> localhost:3000
```

### Tunnel with TTL

```bash
liveport connect 3000 --ttl 30m
# Tunnel auto-closes after 30 minutes
```

### Quick share with access token

```bash
liveport share 8080 --ttl 1h --max-uses 3
# => URL:   https://xyz789.liveport.online
# => Token: lpa_abc123...
# => curl https://xyz789.liveport.online -H "Authorization: Bearer lpa_abc123..."
```
