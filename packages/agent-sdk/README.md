# @liveport/agent-sdk

TypeScript SDK for AI agents to wait for and access localhost tunnels via LivePort.

## Installation

```bash
npm install @liveport/agent-sdk
# or
pnpm add @liveport/agent-sdk
```

## Quick Start

```typescript
import { LivePortAgent } from '@liveport/agent-sdk';

const agent = new LivePortAgent({
  key: process.env.LIVEPORT_BRIDGE_KEY!
});

// Wait for a tunnel to become available
const tunnel = await agent.waitForTunnel({ timeout: 30000 });
console.log(`Testing at: ${tunnel.url}`);

// Run your tests against tunnel.url
const response = await fetch(`${tunnel.url}/api/health`);

// Clean up when done
await agent.disconnect();
```

## API Reference

### `LivePortAgent`

Main SDK class for interacting with LivePort tunnels.

#### Constructor

```typescript
new LivePortAgent(config: LivePortAgentConfig)
```

**Config options:**
- `key` (required) - Bridge key for authentication
- `apiUrl` (optional) - API base URL (default: `https://app.liveport.dev`)
- `timeout` (optional) - Default timeout in milliseconds (default: `30000`)

#### `waitForTunnel(options?)`

Wait for a tunnel to become available. Long-polls the API until a tunnel is ready.

```typescript
const tunnel = await agent.waitForTunnel({
  timeout: 60000,      // Max wait time (ms)
  pollInterval: 1000   // Poll interval (ms)
});
```

**Returns:** `Promise<AgentTunnel>`

**Throws:**
- `TunnelTimeoutError` - If no tunnel becomes available within timeout
- `ApiError` - If the API request fails

#### `listTunnels()`

List all active tunnels for this bridge key.

```typescript
const tunnels = await agent.listTunnels();
for (const tunnel of tunnels) {
  console.log(`${tunnel.subdomain}: ${tunnel.url}`);
}
```

**Returns:** `Promise<AgentTunnel[]>`

#### `disconnect()`

Disconnect and clean up. Cancels any pending `waitForTunnel` calls.

```typescript
await agent.disconnect();
```

### Types

#### `AgentTunnel`

```typescript
interface AgentTunnel {
  tunnelId: string;
  subdomain: string;
  url: string;
  localPort: number;
  createdAt: Date;
  expiresAt: Date;
}
```

#### `TunnelTimeoutError`

Thrown when `waitForTunnel` times out.

```typescript
try {
  await agent.waitForTunnel({ timeout: 5000 });
} catch (err) {
  if (err instanceof TunnelTimeoutError) {
    console.log('No tunnel available');
  }
}
```

#### `ApiError`

Thrown when an API request fails.

```typescript
try {
  await agent.listTunnels();
} catch (err) {
  if (err instanceof ApiError) {
    console.log(`Error ${err.statusCode}: ${err.message}`);
  }
}
```

## Use Cases

### Automated Testing

```typescript
import { LivePortAgent } from '@liveport/agent-sdk';
import { test, expect } from 'vitest';

test('integration test via tunnel', async () => {
  const agent = new LivePortAgent({ key: process.env.LIVEPORT_KEY! });

  const tunnel = await agent.waitForTunnel({ timeout: 30000 });

  const response = await fetch(`${tunnel.url}/api/users`);
  expect(response.ok).toBe(true);

  await agent.disconnect();
});
```

### AI Agent Workflow

```typescript
// In your AI agent code
const agent = new LivePortAgent({ key: bridgeKey });

// Wait for developer to start their local server
const tunnel = await agent.waitForTunnel({ timeout: 120000 });

// Now interact with the local application
await runTests(tunnel.url);
await takeScreenshot(tunnel.url);
await analyzeAPI(tunnel.url);
```

## License

MIT
