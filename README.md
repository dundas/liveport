# LivePort

> Secure localhost tunnels for AI agents

LivePort enables AI agents to test applications running on your localhost through secure, temporary tunnels with key-based authentication.

## Quick Start

### 1. Get a Bridge Key

Sign up at [app.liveport.dev](https://app.liveport.dev) and create a bridge key from the dashboard.

### 2. Install the CLI

```bash
npm install -g @liveport/cli
```

### 3. Create a Tunnel

```bash
# Start your local server (e.g., on port 3000)
npm run dev

# In another terminal, create a tunnel
liveport connect 3000 --key lpk_your_bridge_key

# You'll get a URL like: https://abc123.liveport.dev
```

### CLI Commands

```bash
# Connect to a local port
liveport connect <port> --key <bridge-key>

# Check tunnel status
liveport status

# Disconnect tunnel
liveport disconnect

# Show help
liveport --help
```

## For AI Agents

The Agent SDK allows AI coding assistants (like Claude, Cursor, etc.) to wait for and access localhost tunnels created by developers.

### Install

```bash
npm install @liveport/agent-sdk
```

### Usage

```typescript
import { LivePortAgent } from "@liveport/agent-sdk";

const agent = new LivePortAgent({
  key: process.env.LIVEPORT_BRIDGE_KEY!,
});

// Wait for tunnel to be ready (blocks until developer creates one)
const tunnel = await agent.waitForTunnel({ timeout: 30000 });

console.log(`Testing at: ${tunnel.url}`);

// Run your tests against tunnel.url
await runE2ETests(tunnel.url);

// Cleanup
await agent.disconnect();
```

### API Reference

```typescript
// List all active tunnels
const tunnels = await agent.listTunnels();

// Wait for a tunnel with custom options
const tunnel = await agent.waitForTunnel({
  timeout: 60000,      // Max wait time in ms
  pollInterval: 2000,  // How often to check
});

// Tunnel object
interface AgentTunnel {
  tunnelId: string;
  subdomain: string;
  url: string;         // Full URL: https://abc123.liveport.dev
  localPort: number;
  createdAt: Date;
  expiresAt: Date;
}
```

## Project Structure

```
liveport/
├── apps/
│   ├── dashboard/        # Next.js web dashboard
│   └── tunnel-server/    # Tunnel server (LocalTunnel fork)
├── packages/
│   ├── cli/              # @liveport/cli - CLI client
│   ├── agent-sdk/        # @liveport/agent-sdk - Agent SDK
│   └── shared/           # Shared utilities and types
├── tasks/                # PRD and task documentation
└── discovery/            # Research and architecture docs
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint
```

## Documentation

- [PRD](./tasks/001-prd-liveport-mvp.md) - Product requirements
- [Task List](./tasks/002-tasklist-liveport-mvp.md) - Implementation tasks
- [Roadmap](./tasks/003-roadmap-liveport-mvp.md) - Development timeline

## Tech Stack

- **Frontend**: Next.js 14 + Tailwind CSS
- **Backend**: Node.js + Better Auth
- **Database**: PostgreSQL (via mech-storage)
- **Cache**: Redis (Upstash)
- **Tunnel**: LocalTunnel fork (MIT)
- **Infrastructure**: Cloudflare + Fly.io

## License

MIT
