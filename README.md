# LivePort

> Secure localhost tunnels for AI agents

LivePort enables AI agents to test applications running on your localhost through secure, temporary tunnels with key-based authentication.

## Quick Start

```bash
# Install the CLI
npm install -g @liveport/cli

# Create a tunnel (with bridge key from dashboard)
liveport connect 3000 --key lpk_your_bridge_key
```

## For AI Agents

```typescript
import { LivePortAgent } from "@liveport/agent-sdk";

const agent = new LivePortAgent({
  key: process.env.LIVEPORT_BRIDGE_KEY!,
});

// Wait for tunnel to be ready
const tunnel = await agent.waitForTunnel({ timeout: 30000 });

console.log(`Testing at: ${tunnel.url}`);

// Run your tests against tunnel.url
await runE2ETests(tunnel.url);

// Cleanup
await agent.disconnect();
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
