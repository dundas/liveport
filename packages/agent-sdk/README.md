# @liveport/agent-sdk

> TypeScript SDK for AI agents to discover and access LivePort tunnels

Enable AI agents and automated testing frameworks to seamlessly access localhost applications through secure LivePort tunnels. Perfect for E2E testing, AI-powered development tools, and automated workflows.

[![npm version](https://img.shields.io/npm/v/@liveport/agent-sdk.svg)](https://www.npmjs.com/package/@liveport/agent-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **🔍 Auto-Discovery** - Wait for tunnels to become available automatically
- **🤖 AI-First Design** - Built specifically for AI agents and automation
- **⏱️ Configurable Timeouts** - Fine-tune waiting and polling behavior
- **🔐 Secure Authentication** - Bridge key-based authentication
- **📊 Multiple Tunnels** - List and manage multiple active tunnels
- **🧪 Testing Ready** - Perfect for CI/CD and automated testing
- **TypeScript Native** - Full type safety and IntelliSense support

## Installation

```bash
npm install @liveport/agent-sdk
# or
pnpm add @liveport/agent-sdk
# or
yarn add @liveport/agent-sdk
```

## Quick Start

```typescript
import { LivePortAgent } from '@liveport/agent-sdk';

// Create agent instance
const agent = new LivePortAgent({
  key: process.env.LIVEPORT_KEY!
});

// Wait for tunnel to become available
const tunnel = await agent.waitForTunnel({ timeout: 30000 });
console.log(`Testing at: ${tunnel.url}`);

// Run your tests against tunnel.url
const response = await fetch(`${tunnel.url}/api/health`);
console.log(await response.json());

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

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `key` | string | ✅ | - | Bridge key for authentication |
| `apiUrl` | string | ❌ | `https://app.liveport.dev` | API base URL |
| `timeout` | number | ❌ | `30000` | Default timeout in milliseconds |

**Example:**

```typescript
const agent = new LivePortAgent({
  key: 'lpk_abc123...',
  apiUrl: 'https://app.liveport.dev',
  timeout: 60000
});
```

---

#### `waitForTunnel(options?)`

Wait for a tunnel to become available. Long-polls the API until a tunnel is ready or timeout is reached.

```typescript
async waitForTunnel(options?: WaitForTunnelOptions): Promise<AgentTunnel>
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | number | `30000` | Maximum wait time in milliseconds |
| `pollInterval` | number | `1000` | Poll interval in milliseconds |

**Returns:** `Promise<AgentTunnel>`

**Throws:**
- `TunnelTimeoutError` - If no tunnel becomes available within timeout
- `ApiError` - If the API request fails

**Example:**

```typescript
try {
  const tunnel = await agent.waitForTunnel({
    timeout: 60000,      // Wait up to 60 seconds
    pollInterval: 2000   // Check every 2 seconds
  });

  console.log(`Tunnel available at: ${tunnel.url}`);
} catch (error) {
  if (error instanceof TunnelTimeoutError) {
    console.log('No tunnel available yet');
  }
}
```

---

#### `listTunnels()`

List all active tunnels for this bridge key.

```typescript
async listTunnels(): Promise<AgentTunnel[]>
```

**Returns:** `Promise<AgentTunnel[]>` - Array of active tunnels

**Throws:** `ApiError` - If the API request fails

**Example:**

```typescript
const tunnels = await agent.listTunnels();

for (const tunnel of tunnels) {
  console.log(`${tunnel.subdomain}: ${tunnel.url} (port ${tunnel.localPort})`);
}

// Find specific tunnel by port
const apiTunnel = tunnels.find(t => t.localPort === 3000);
if (apiTunnel) {
  console.log(`API server at: ${apiTunnel.url}`);
}
```

---

#### `disconnect()`

Disconnect and clean up. Cancels any pending `waitForTunnel` calls.

```typescript
async disconnect(): Promise<void>
```

**Example:**

```typescript
// Always clean up in a finally block
try {
  const tunnel = await agent.waitForTunnel();
  // Use tunnel...
} finally {
  await agent.disconnect();
}
```

---

### Types

#### `AgentTunnel`

Represents a tunnel connection.

```typescript
interface AgentTunnel {
  tunnelId: string;      // Unique tunnel identifier
  subdomain: string;     // Subdomain (e.g., "swift-fox-a7x2")
  url: string;           // Full public URL
  localPort: number;     // Local port being tunneled
  createdAt: Date;       // When tunnel was created
  expiresAt: Date;       // When tunnel will expire
}
```

#### `TunnelTimeoutError`

Thrown when `waitForTunnel` times out.

```typescript
class TunnelTimeoutError extends Error {
  constructor(timeout: number);
}
```

#### `ApiError`

Thrown when an API request fails.

```typescript
class ApiError extends Error {
  statusCode: number;     // HTTP status code
  code: string;           // Error code (e.g., "INVALID_KEY")

  constructor(statusCode: number, code: string, message: string);
}
```

**Error Codes:**
- `INVALID_KEY` - Bridge key is invalid
- `EXPIRED_KEY` - Bridge key has expired
- `REVOKED_KEY` - Bridge key was revoked
- `USAGE_LIMIT_EXCEEDED` - Key usage limit reached
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `TIMEOUT` - Server timeout
- `TUNNEL_SERVER_ERROR` - Tunnel server error
- `INTERNAL_ERROR` - Internal server error

---

## Use Cases

### 1. Automated Testing

```typescript
import { LivePortAgent } from '@liveport/agent-sdk';
import { test, expect } from 'vitest';

let tunnelUrl: string;

beforeAll(async () => {
  const agent = new LivePortAgent({ key: process.env.LIVEPORT_KEY! });
  const tunnel = await agent.waitForTunnel({ timeout: 60000 });
  tunnelUrl = tunnel.url;
});

test('API returns healthy status', async () => {
  const response = await fetch(`${tunnelUrl}/api/health`);
  expect(response.ok).toBe(true);

  const data = await response.json();
  expect(data.status).toBe('healthy');
});
```

### 2. AI Agent Workflow

```typescript
import { LivePortAgent } from '@liveport/agent-sdk';

async function runAITests(bridgeKey: string) {
  const agent = new LivePortAgent({ key: bridgeKey, timeout: 120000 });

  console.log('Waiting for developer to start tunnel...');
  const tunnel = await agent.waitForTunnel();

  console.log(`Connected to ${tunnel.url}`);

  // AI agent can now interact with the local application
  await discoverEndpoints(tunnel.url);
  await runPerformanceTests(tunnel.url);
  await analyzeAPIs(tunnel.url);
  await generateDocumentation(tunnel.url);

  await agent.disconnect();
}
```

### 3. CI/CD Integration

```typescript
// tests/setup.ts
import { LivePortAgent } from '@liveport/agent-sdk';

export async function setupTunnel() {
  const agent = new LivePortAgent({
    key: process.env.CI_LIVEPORT_KEY!,
    timeout: 60000
  });

  // Wait for tunnel (developer must start it before running tests)
  const tunnel = await agent.waitForTunnel();

  // Make tunnel URL available to tests
  process.env.TEST_BASE_URL = tunnel.url;

  return { agent, tunnel };
}

export async function teardownTunnel(agent: LivePortAgent) {
  await agent.disconnect();
}
```

### 4. Multi-Service Testing

```typescript
import { LivePortAgent } from '@liveport/agent-sdk';

async function testMicroservices() {
  const agent = new LivePortAgent({ key: process.env.LIVEPORT_KEY! });

  // List all available tunnels
  const tunnels = await agent.listTunnels();

  // Find specific services by port
  const api = tunnels.find(t => t.localPort === 3000);
  const web = tunnels.find(t => t.localPort === 3001);
  const db = tunnels.find(t => t.localPort === 5432);

  if (!api || !web) {
    throw new Error('Required services not available');
  }

  // Test API
  const apiHealth = await fetch(`${api.url}/health`);
  console.log(`API: ${apiHealth.status}`);

  // Test Web
  const webHome = await fetch(web.url);
  console.log(`Web: ${webHome.status}`);

  await agent.disconnect();
}
```

### 5. Webhook Testing

```typescript
import { LivePortAgent } from '@liveport/agent-sdk';

async function testWebhooks() {
  const agent = new LivePortAgent({ key: process.env.LIVEPORT_KEY! });
  const tunnel = await agent.waitForTunnel();

  // Register webhook with external service
  await registerWebhook(`${tunnel.url}/webhooks/stripe`);

  // Trigger webhook event
  await triggerTestEvent();

  // Verify webhook was received
  const response = await fetch(`${tunnel.url}/webhooks/verify`);
  const result = await response.json();

  expect(result.received).toBe(true);

  await agent.disconnect();
}
```

---

## Error Handling

### Handling Timeouts

```typescript
import { LivePortAgent, TunnelTimeoutError } from '@liveport/agent-sdk';

try {
  const tunnel = await agent.waitForTunnel({ timeout: 30000 });
} catch (error) {
  if (error instanceof TunnelTimeoutError) {
    console.error('No tunnel available. Did you forget to run:');
    console.error('  liveport connect <port>');
    process.exit(1);
  }
  throw error;
}
```

### Handling API Errors

```typescript
import { ApiError } from '@liveport/agent-sdk';

try {
  const tunnels = await agent.listTunnels();
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`API Error [${error.code}]: ${error.message}`);
    console.error(`Status: ${error.statusCode}`);

    if (error.code === 'INVALID_KEY') {
      console.error('Get a new key at: https://liveport.dev/keys');
    }
  }
  throw error;
}
```

### Robust Error Handling Pattern

```typescript
async function robustTunnelAccess() {
  const agent = new LivePortAgent({ key: process.env.LIVEPORT_KEY! });

  try {
    const tunnel = await agent.waitForTunnel({ timeout: 60000 });

    // Your logic here
    await runTests(tunnel.url);

  } catch (error) {
    if (error instanceof TunnelTimeoutError) {
      console.error('Timeout waiting for tunnel');
      process.exit(1);
    } else if (error instanceof ApiError) {
      console.error(`API Error: ${error.message}`);
      process.exit(1);
    } else {
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  } finally {
    await agent.disconnect();
  }
}
```

---

## Examples

Comprehensive examples are available in the [`examples/`](./examples/) directory:

- **[01-basic-usage.ts](./examples/01-basic-usage.ts)** - Simple tunnel connection
- **[02-testing-integration.ts](./examples/02-testing-integration.ts)** - Vitest integration
- **[03-ai-agent-workflow.ts](./examples/03-ai-agent-workflow.ts)** - AI agent implementation
- **[04-multiple-tunnels.ts](./examples/04-multiple-tunnels.ts)** - Multi-service testing
- **[05-error-handling.ts](./examples/05-error-handling.ts)** - Robust error handling

Run examples:

```bash
# Set your bridge key
export LIVEPORT_KEY=lpk_your_key_here

# Start a tunnel in another terminal
liveport connect 3000

# Run an example
npx tsx examples/01-basic-usage.ts
```

---

## Best Practices

### ✅ Do's

1. **Set reasonable timeouts**
   ```typescript
   // Good: 60 second timeout for CI
   const tunnel = await agent.waitForTunnel({ timeout: 60000 });
   ```

2. **Always clean up**
   ```typescript
   try {
     const tunnel = await agent.waitForTunnel();
     // Use tunnel...
   } finally {
     await agent.disconnect(); // Always cleanup
   }
   ```

3. **Handle specific errors**
   ```typescript
   try {
     const tunnel = await agent.waitForTunnel();
   } catch (error) {
     if (error instanceof TunnelTimeoutError) {
       // Provide helpful message
     }
   }
   ```

4. **Use environment variables**
   ```typescript
   // Good
   const agent = new LivePortAgent({
     key: process.env.LIVEPORT_KEY!
   });

   // Bad - never hardcode keys
   const agent = new LivePortAgent({ key: 'lpk_...' });
   ```

5. **Configure appropriate timeouts**
   ```typescript
   // Local development: short timeout
   const tunnel = await agent.waitForTunnel({ timeout: 10000 });

   // CI/CD: longer timeout
   const tunnel = await agent.waitForTunnel({ timeout: 120000 });
   ```

### ❌ Don'ts

1. **Don't commit bridge keys**
   ```bash
   # Use .env.local (git-ignored)
   LIVEPORT_KEY=lpk_your_key_here
   ```

2. **Don't forget to disconnect**
   ```typescript
   // Bad - missing cleanup
   const tunnel = await agent.waitForTunnel();
   // ... tests ...
   // Missing: await agent.disconnect()
   ```

3. **Don't ignore errors**
   ```typescript
   // Bad - swallowing errors
   try {
     const tunnel = await agent.waitForTunnel();
   } catch (error) {
     // Silent failure
   }
   ```

4. **Don't use production keys in tests**
   ```bash
   # Separate keys for different environments
   LIVEPORT_DEV_KEY=lpk_dev_...
   LIVEPORT_CI_KEY=lpk_ci_...
   LIVEPORT_PROD_KEY=lpk_prod_...
   ```

---

## TypeScript Support

This package is written in TypeScript and includes full type definitions.

```typescript
import type {
  LivePortAgent,
  LivePortAgentConfig,
  AgentTunnel,
  WaitForTunnelOptions,
  TunnelTimeoutError,
  ApiError
} from '@liveport/agent-sdk';

// Full IntelliSense support
const config: LivePortAgentConfig = {
  key: 'lpk_...',
  timeout: 30000
};

const agent: LivePortAgent = new LivePortAgent(config);
const tunnel: AgentTunnel = await agent.waitForTunnel();
```

---

## Testing

The SDK includes comprehensive tests. Run them with:

```bash
pnpm test
```

---

## Related Packages

- **[@liveport/cli](https://www.npmjs.com/package/@liveport/cli)** - CLI for creating tunnels
- **[Dashboard](https://liveport.dev/dashboard)** - Web interface for managing keys and tunnels

---

## Resources

- **Documentation**: [liveport.dev/docs](https://liveport.dev/docs)
- **API Reference**: [liveport.dev/docs](https://liveport.dev/docs)
- **Dashboard**: [liveport.dev/dashboard](https://liveport.dev/dashboard)
- **Examples**: [examples/](./examples/)
- **Support**: [GitHub Issues](https://github.com/dundas/liveport/issues)
- **Website**: [liveport.dev](https://liveport.dev)

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](../../CONTRIBUTING.md) first.

---

## License

MIT © LivePort

---

**Built with ❤️ for AI agents and developers**
