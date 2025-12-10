# @liveport/cli

> Secure localhost tunnels for AI agents

Command-line interface for creating secure, temporary tunnels to expose your localhost to the internet. Built specifically for AI agents and developers who need to test webhooks, share local demos, or enable AI agents to access local development servers.

[![npm version](https://img.shields.io/npm/v/@liveport/cli.svg)](https://www.npmjs.com/package/@liveport/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **🚀 Instant Tunnels** - Expose localhost with a single command
- **🔐 Secure by Default** - Bridge key authentication with expiration and rate limits
- **🤖 AI Agent Ready** - First-class support for AI agents via the Agent SDK
- **⚡ Zero Configuration** - Works out of the box, configure only what you need
- **🌍 Global Edge Network** - Low-latency tunnels from anywhere
- **📊 Real-time Logs** - See incoming requests as they happen
- **💾 Persistent Config** - Save your bridge key for quick access

## Installation

### npm

```bash
npm install -g @liveport/cli
```

### pnpm

```bash
pnpm add -g @liveport/cli
```

### npx (no installation)

```bash
npx @liveport/cli connect 3000
```

### Requirements

- Node.js 18.0.0 or higher
- A LivePort account ([Sign up free](https://liveport.dev/signup))

## Quick Start

### 1. Get Your Bridge Key

Visit [liveport.dev/keys](https://liveport.dev/keys) to create a bridge key. You'll see something like:

```
lpk_abc123def456ghi789jkl012mno345
```

**⚠️ Important:** Copy this key immediately - it's only shown once!

### 2. Save Your Key (Recommended)

```bash
liveport config set key lpk_abc123def456ghi789jkl012mno345
```

### 3. Start a Tunnel

```bash
# Expose your local server on port 3000
liveport connect 3000
```

You'll see:

```
  ╦  ╦╦  ╦╔═╗╔═╗╔═╗╦═╗╔╦╗
  ║  ║╚╗╔╝║╣ ╠═╝║ ║╠╦╝ ║
  ╩═╝╩ ╚╝ ╚═╝╩  ╚═╝╩╚═ ╩

  Secure localhost tunnels for AI agents

✓ Tunnel established!

Public URL: https://swift-fox-a7x2.liveport.online
Forwarding: → http://localhost:3000

Press Ctrl+C to disconnect
```

Your local server is now accessible at the public URL! 🎉

## Commands

### `liveport connect <port>`

Create a tunnel to expose a local port to the internet.

**Arguments:**
- `<port>` - Local port to expose (1-65535)

**Options:**
- `-k, --key <key>` - Bridge key for authentication
- `-s, --server <url>` - Tunnel server URL (default: https://tunnel.liveport.dev)
- `-r, --region <region>` - Server region (coming soon)
- `--name <name>` - Custom tunnel name (coming soon)

**Examples:**

```bash
# Basic usage (requires saved config)
liveport connect 3000

# With explicit key
liveport connect 8080 --key lpk_abc123...

# Custom server
liveport connect 3000 --server https://custom.tunnel.server

# Using environment variable
LIVEPORT_KEY=lpk_abc123... liveport connect 3000
```

**What it does:**
1. Establishes a secure WebSocket connection to the tunnel server
2. Receives a unique public URL (e.g., `https://swift-fox-a7x2.liveport.online`)
3. Proxies all incoming HTTP requests to your local port
4. Displays real-time request logs
5. Maintains connection with automatic reconnection

### `liveport status`

Show current tunnel status and connection details.

**Output:**

```bash
liveport status
```

```
Tunnel Status
──────────────────────────────
  Status: Connected
  Public URL: https://swift-fox-a7x2.liveport.online
  Local Port: 3000
  Requests: 42
  Connected: 5 minutes ago
```

### `liveport disconnect`

Disconnect the active tunnel.

**Options:**
- `-a, --all` - Disconnect all tunnels (when multiple tunnels supported)

**Example:**

```bash
liveport disconnect
```

### `liveport config`

Manage CLI configuration stored at `~/.liveport/config.json`.

#### `config set <key> <value>`

Set a configuration value.

**Valid keys:**
- `key` - Your bridge key
- `server` - Default tunnel server URL

**Examples:**

```bash
# Set bridge key
liveport config set key lpk_abc123def456ghi789jkl012mno345

# Set custom server
liveport config set server https://tunnel.liveport.dev
```

#### `config get <key>`

Get a specific configuration value.

**Example:**

```bash
liveport config get key
# Output: key: lpk_abc12...mno345 (masked for security)
```

#### `config list`

List all configuration values.

**Example:**

```bash
liveport config list
```

```
Configuration
────────────────────────────────────────
  Config file: /Users/you/.liveport/config.json

  key: lpk_abc12...mno345
  server: https://tunnel.liveport.dev
```

#### `config delete <key>`

Delete a configuration value.

**Example:**

```bash
liveport config delete key
```

### `liveport --version`

Display the CLI version.

### `liveport --help`

Show help information for all commands.

## Authentication

LivePort uses bridge keys for authentication. Bridge keys are cryptographically secure tokens that:

- Authenticate your tunnels
- Control access and permissions
- Support expiration dates
- Can limit usage (max requests)
- Can restrict to specific ports

### Authentication Priority (highest to lowest):

1. **`--key` flag** - Passed directly to the command
2. **`LIVEPORT_KEY` environment variable** - Set in your shell
3. **Config file** - Saved via `liveport config set key`

### Get a Bridge Key

1. Visit [liveport.dev/keys](https://liveport.dev/keys)
2. Click "Create Bridge Key"
3. Configure:
   - **Name**: Describe where you'll use it (e.g., "Development", "CI/CD")
   - **Expires**: Optional expiration (e.g., 30 days)
   - **Max Uses**: Optional usage limit
4. Copy the key immediately (shown only once!)

### Managing Keys

You can have multiple bridge keys for different purposes:

- **Development** - Long-lived key for daily work
- **CI/CD** - Short-lived key with usage limits
- **Demos** - Single-use keys that expire quickly
- **AI Agents** - Dedicated keys per agent/project

## Configuration

### Config File Location

Configuration is stored in JSON format at:

- **macOS/Linux**: `~/.liveport/config.json`
- **Windows**: `%USERPROFILE%\.liveport\config.json`

### Config File Format

```json
{
  "key": "lpk_abc123def456ghi789jkl012mno345",
  "server": "https://tunnel.liveport.dev"
}
```

### Environment Variables

All configuration can be overridden with environment variables:

- `LIVEPORT_KEY` - Bridge key
- `LIVEPORT_SERVER_URL` - Tunnel server URL

**Example:**

```bash
export LIVEPORT_KEY=lpk_abc123def456ghi789jkl012mno345
liveport connect 3000
```

## Use Cases

### 1. Test Webhooks Locally

```bash
# Start your local webhook server
node webhook-server.js

# Expose it via LivePort
liveport connect 3000

# Use the public URL in your webhook provider
# https://swift-fox-a7x2.liveport.online/webhooks
```

### 2. Share Local Development

```bash
# Start your dev server
npm run dev

# Create a tunnel
liveport connect 5173

# Share the URL with your team
# https://swift-fox-a7x2.liveport.online
```

### 3. Enable AI Agents

```bash
# Start your local API
python manage.py runserver 8000

# Expose it for AI agents
liveport connect 8000

# AI agents can now discover and access your API
# using the LivePort Agent SDK
```

### 4. Test Mobile Apps

```bash
# Start your API server
rails server -p 3000

# Create tunnel
liveport connect 3000

# Configure mobile app to use public URL
# https://swift-fox-a7x2.liveport.online/api
```

### 5. CI/CD Integration

```yaml
# .github/workflows/e2e-tests.yml
- name: Install LivePort CLI
  run: npm install -g @liveport/cli

- name: Start local server
  run: npm run dev &

- name: Create tunnel
  run: liveport connect 3000 --key ${{ secrets.LIVEPORT_KEY }}

- name: Run E2E tests
  run: npm run test:e2e
```

## Troubleshooting

### "Bridge key required"

**Problem:** No bridge key provided.

**Solutions:**
1. Set via config: `liveport config set key lpk_...`
2. Use environment variable: `export LIVEPORT_KEY=lpk_...`
3. Pass via flag: `liveport connect 3000 --key lpk_...`

### "Connection failed"

**Problem:** Cannot connect to tunnel server.

**Check:**
1. Internet connection is working
2. Firewall allows WebSocket connections
3. Server URL is correct: `liveport config get server`

### "Port already in use"

**Problem:** Local port is not running or accessible.

**Solutions:**
1. Verify your local server is running on the specified port
2. Check `localhost:<port>` in your browser
3. Try a different port

### "Invalid bridge key"

**Problem:** Bridge key is incorrect, expired, or revoked.

**Solutions:**
1. Check the key format starts with `lpk_`
2. Verify key hasn't expired at [liveport.dev/keys](https://liveport.dev/keys)
3. Create a new bridge key if needed

### Tunnel disconnects frequently

**Problem:** Connection is unstable.

**Try:**
1. Check your network connection
2. Look for firewall/VPN interference
3. Contact support if issue persists

## Security Best Practices

### ✅ Do's

- **Rotate keys regularly** - Create new keys periodically
- **Use expiration dates** - Set keys to expire after a specific time
- **Limit key scope** - Create separate keys for different projects
- **Revoke unused keys** - Delete keys you no longer need
- **Use environment variables in CI/CD** - Never commit keys to git

### ❌ Don'ts

- **Don't commit keys to git** - Add `.env` to `.gitignore`
- **Don't share keys publicly** - Keep keys private
- **Don't use production keys in development** - Separate environments
- **Don't expose sensitive endpoints** - Only tunnel what's needed
- **Don't ignore expiration** - Set reasonable expiration dates

## Advanced Usage

### Multiple Tunnels (Coming Soon)

```bash
# Start multiple tunnels simultaneously
liveport connect 3000 --name api
liveport connect 3001 --name web
liveport connect 5432 --name database
```

### Custom Subdomains (Coming Soon)

```bash
# Request specific subdomain
liveport connect 3000 --subdomain my-app
# https://my-app.liveport.online
```

### Regional Servers (Coming Soon)

```bash
# Connect to regional server for lower latency
liveport connect 3000 --region us-west
```

## Programmatic Usage

While this is a CLI tool, you can also use it programmatically:

```javascript
import { TunnelClient } from '@liveport/cli';

const client = new TunnelClient({
  serverUrl: 'https://tunnel.liveport.dev',
  bridgeKey: 'lpk_abc123...',
  localPort: 3000,
});

client.on('connected', (info) => {
  console.log('Tunnel URL:', info.url);
});

client.on('request', (method, path) => {
  console.log(`${method} ${path}`);
});

await client.connect();
```

## Related Packages

- **[@liveport/agent-sdk](https://www.npmjs.com/package/@liveport/agent-sdk)** - SDK for AI agents to discover and use tunnels
- **[Dashboard](https://liveport.dev/dashboard)** - Web interface for managing keys and tunnels

## Resources

- **Documentation**: [liveport.dev/docs](https://liveport.dev/docs)
- **API Reference**: [liveport.dev/docs](https://liveport.dev/docs)
- **Dashboard**: [liveport.dev/dashboard](https://liveport.dev/dashboard)
- **Support**: [GitHub Issues](https://github.com/dundas/liveport/issues)
- **Website**: [liveport.dev](https://liveport.dev)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](../../CONTRIBUTING.md) first.

## License

MIT © LivePort

---

**Made with ❤️ for developers and AI agents**
