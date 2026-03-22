<!-- Generated: 2026-03-22 from docs-generator.json — do not edit manually -->
# LivePort Agent SDK Reference

`@liveport/agent-sdk` - TypeScript SDK for AI agents to create, wait for, and access localhost tunnels.

## Installation

```bash
npm install @liveport/agent-sdk
```

---

## LivePortAgent

Main class for interacting with LivePort tunnels.

### Constructor

```typescript
new LivePortAgent(config: LivePortAgentConfig)
```

**LivePortAgentConfig:**

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `key` | `string` | Yes | - | Bridge key for authentication (lpk_ prefix) |
| `apiUrl` | `string` | No | `https://liveport.dev` | Dashboard API base URL |
| `tunnelUrl` | `string` | No | `https://tunnel.liveport.online` | Tunnel server URL for `connect()` |
| `timeout` | `number` | No | `30000` | Default timeout in milliseconds |

**Example:**

```typescript
import { LivePortAgent } from '@liveport/agent-sdk';

const agent = new LivePortAgent({
  key: process.env.LIVEPORT_BRIDGE_KEY!,
  timeout: 60000,
});
```

---

### connect(port, options?)

Connect to the tunnel server and create a tunnel for a local port. Opens a WebSocket, authenticates with the bridge key, and forwards incoming HTTP requests to `localhost:<port>`.

```typescript
async connect(port: number, options?: ConnectOptions): Promise<AgentTunnel>
```

**ConnectOptions:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `serverUrl` | `string` | `tunnelUrl` from config | Override tunnel server URL |
| `timeout` | `number` | Config timeout | Connection timeout in ms |

**Returns:** `AgentTunnel`

**Throws:** `ConnectionError` if the connection fails or times out.

**Notes:**
- Only one connection at a time - call `disconnect()` first to reconnect
- Sends `X-Bridge-Key` and `X-Local-Port` headers on the WebSocket handshake
- Handles heartbeat responses automatically

---

### waitForReady(tunnel, options?)

Poll the tunnel's public URL until it returns a 2xx HTTP response. Validates the full tunnel path end-to-end.

```typescript
async waitForReady(tunnel: AgentTunnel, options?: WaitForReadyOptions): Promise<void>
```

**WaitForReadyOptions:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `timeout` | `number` | Config timeout | Max wait time in ms |
| `pollInterval` | `number` | `1000` | Time between polls in ms |
| `healthPath` | `string` | `"/"` | HTTP path to check |

**Throws:** `TunnelTimeoutError` if not ready within timeout.

---

### waitForTunnel(options?)

Long-poll the API until a tunnel becomes available for this bridge key. Useful when the tunnel is created separately (e.g., via the CLI).

```typescript
async waitForTunnel(options?: WaitForTunnelOptions): Promise<AgentTunnel>
```

**WaitForTunnelOptions:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `timeout` | `number` | Config timeout | Max wait time in ms |
| `pollInterval` | `number` | `1000` | Time between polls in ms |

**Throws:** `TunnelTimeoutError` if no tunnel available within timeout.

---

### listTunnels()

List all active tunnels for this bridge key.

```typescript
async listTunnels(): Promise<AgentTunnel[]>
```

**Throws:** `ApiError` if the API request fails.

---

### disconnect()

Disconnect and clean up. Cancels pending `waitForTunnel()` calls and closes any WebSocket connection.

```typescript
async disconnect(): Promise<void>
```

---

## Types

### AgentTunnel

```typescript
interface AgentTunnel {
  tunnelId: string;     // Unique tunnel ID
  subdomain: string;    // e.g., "abc123"
  url: string;          // e.g., "https://abc123.liveport.online"
  localPort: number;    // The local port being tunneled
  createdAt: Date;      // When the tunnel was created
  expiresAt: Date;      // When the tunnel will expire
}
```

### Tunnel (database record)

```typescript
interface Tunnel {
  id: string;
  userId: string;
  bridgeKeyId?: string;
  subdomain: string;
  name?: string;
  localPort: number;
  publicUrl: string;
  region: string;
  connectedAt: Date;
  disconnectedAt?: Date;
  requestCount: number;
  bytesTransferred: number;
}
```

---

## Error Classes

### TunnelTimeoutError

Thrown when `waitForReady()` or `waitForTunnel()` times out.

```typescript
class TunnelTimeoutError extends Error {
  name: "TunnelTimeoutError";
}
```

### ApiError

Thrown when an API request returns a non-OK response.

```typescript
class ApiError extends Error {
  name: "ApiError";
  statusCode: number;  // HTTP status code
  code: string;        // Error code (e.g., "INVALID_KEY")
}
```

### ConnectionError

Thrown when the WebSocket connection fails.

```typescript
class ConnectionError extends Error {
  name: "ConnectionError";
}
```

---

## Full Example

```typescript
import { LivePortAgent, TunnelTimeoutError, ConnectionError } from '@liveport/agent-sdk';

async function main() {
  const agent = new LivePortAgent({
    key: process.env.LIVEPORT_BRIDGE_KEY!,
  });

  try {
    // Create tunnel
    const tunnel = await agent.connect(3000);
    console.log(`Tunnel: ${tunnel.url}`);
    console.log(`Expires: ${tunnel.expiresAt.toISOString()}`);

    // Wait for local server
    await agent.waitForReady(tunnel, {
      timeout: 30000,
      healthPath: '/health',
    });

    // Make requests through the tunnel
    const res = await fetch(`${tunnel.url}/api/data`);
    console.log(`Response: ${res.status}`);

  } catch (err) {
    if (err instanceof ConnectionError) {
      console.error('Connection failed:', err.message);
    } else if (err instanceof TunnelTimeoutError) {
      console.error('Tunnel not ready in time');
    } else {
      throw err;
    }
  } finally {
    await agent.disconnect();
  }
}

main();
```

---

## WebSocket Protocol

The SDK communicates with the tunnel server over WebSocket using JSON messages. Key message types:

| Type | Direction | Description |
|------|-----------|-------------|
| `connected` | Server -> Client | Tunnel established, includes URL and tunnel ID |
| `error` | Server -> Client | Error with code, message, and fatal flag |
| `heartbeat` | Client -> Server | Periodic keepalive with request count |
| `heartbeat_ack` | Server -> Client | Heartbeat acknowledgment |
| `http_request` | Server -> Client | Forward HTTP request to local server |
| `http_response` | Client -> Server | HTTP response from local server |
| `disconnect` | Both | Graceful disconnect request |

HTTP request/response bodies are base64-encoded. The SDK handles all protocol details internally.
