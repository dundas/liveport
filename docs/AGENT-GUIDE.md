<!-- Generated: 2026-03-22 from docs-generator.json — do not edit manually -->
# LivePort Agent Integration Guide

This guide covers how AI agents can programmatically create and use localhost tunnels through LivePort.

## Authentication

All LivePort API and tunnel connections are authenticated with **bridge keys**.

- Bridge keys have the prefix `lpk_`
- Keys are created in the [LivePort Dashboard](https://liveport.dev/keys) or via the API
- Keys support expiration dates, max use limits, and port restrictions
- Rate limiting: 30 key validation requests per minute (per key prefix)

### Providing a Bridge Key

Set the `LIVEPORT_BRIDGE_KEY` (or `LIVEPORT_KEY`) environment variable, or pass directly to the SDK:

```typescript
const agent = new LivePortAgent({
  key: process.env.LIVEPORT_BRIDGE_KEY!
});
```

---

## Quick Start

### 1. Install the SDK

```bash
npm install @liveport/agent-sdk
```

### 2. Create a tunnel and wait for readiness

```typescript
import { LivePortAgent } from '@liveport/agent-sdk';

const agent = new LivePortAgent({
  key: process.env.LIVEPORT_BRIDGE_KEY!,
});

// Create a tunnel to local port 3000
const tunnel = await agent.connect(3000);
console.log(`Public URL: ${tunnel.url}`);
// => https://abc123.liveport.online

// Wait until the local server is reachable through the tunnel
await agent.waitForReady(tunnel, {
  timeout: 60000,       // 60 second timeout
  healthPath: '/health' // Check /health endpoint
});

// Now use tunnel.url for testing
const response = await fetch(`${tunnel.url}/api/data`);

// Clean up when done
await agent.disconnect();
```

---

## Creating Tunnels Programmatically

### Direct connection (Agent SDK)

Use `agent.connect(port)` to create a tunnel via WebSocket. The SDK handles the WebSocket connection, heartbeats, and HTTP request forwarding.

```typescript
const tunnel = await agent.connect(3000, {
  serverUrl: 'https://tunnel.liveport.online', // optional override
  timeout: 30000, // connection timeout in ms
});

// tunnel.tunnelId   — unique tunnel ID
// tunnel.subdomain  — e.g., "abc123"
// tunnel.url        — e.g., "https://abc123.liveport.online"
// tunnel.localPort  — 3000
// tunnel.createdAt  — Date
// tunnel.expiresAt  — Date
```

### Waiting for an existing tunnel

If the tunnel is created separately (e.g., via the CLI), use `waitForTunnel()` to long-poll the API:

```typescript
const tunnel = await agent.waitForTunnel({
  timeout: 60000,      // max wait time
  pollInterval: 2000,  // poll every 2 seconds
});
```

### Listing active tunnels

```typescript
const tunnels = await agent.listTunnels();
for (const t of tunnels) {
  console.log(`${t.subdomain}: ${t.url} -> localhost:${t.localPort}`);
}
```

---

## Access Tokens for Protected Tunnels

Tunnels created via `liveport share` are protected by access tokens. To access a protected tunnel, include the token in the `Authorization` header.

### How access tokens work

1. The `liveport share` command creates a temporary bridge key and connects a tunnel with `X-Require-Access-Token: true`
2. The tunnel server generates an access token with the `lpa_` prefix
3. The token is returned in the `connected` WebSocket message
4. All HTTP requests to the tunnel must include: `Authorization: Bearer lpa_...`
5. Tokens are validated using HMAC-based constant-time comparison (prevents timing attacks)

### Accessing a protected tunnel

```typescript
// The tunnel creator shares the URL and token
const tunnelUrl = 'https://abc123.liveport.online';
const accessToken = 'lpa_abc123def456...';

// Include the token in requests
const response = await fetch(tunnelUrl, {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});

// Without the token, you get a 401 Unauthorized response:
// { "error": "Unauthorized", "message": "Valid access token required" }
```

### curl example

```bash
curl https://abc123.liveport.online \
  -H "Authorization: Bearer lpa_abc123def456..."
```

### Regular tunnels (backward compatible)

Tunnels created with `liveport connect` (without `share`) do not require access tokens. They remain open and accessible without authentication.

---

## Temporary Bridge Keys (API)

Create short-lived bridge keys programmatically for one-off sharing.

### POST /api/agent/keys/temporary

```typescript
const response = await fetch('https://liveport.dev/api/agent/keys/temporary', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${parentBridgeKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    ttlSeconds: 3600,  // 1 hour
    maxUses: 5,        // max 5 connections (cap: 100)
  }),
});

const { key, id, expiresAt, maxUses, effectiveTtlSeconds } = await response.json();
```

---

## Error Handling

The SDK provides typed error classes for different failure modes:

### TunnelTimeoutError

Thrown when `waitForReady()` or `waitForTunnel()` exceeds the timeout.

```typescript
import { TunnelTimeoutError } from '@liveport/agent-sdk';

try {
  await agent.waitForReady(tunnel, { timeout: 10000 });
} catch (err) {
  if (err instanceof TunnelTimeoutError) {
    console.log('Local server not reachable through tunnel');
  }
}
```

### ApiError

Thrown when an API request returns a non-OK response.

```typescript
import { ApiError } from '@liveport/agent-sdk';

try {
  const tunnels = await agent.listTunnels();
} catch (err) {
  if (err instanceof ApiError) {
    console.log(`API error ${err.statusCode}: ${err.code} - ${err.message}`);
  }
}
```

### ConnectionError

Thrown when the WebSocket connection fails.

```typescript
import { ConnectionError } from '@liveport/agent-sdk';

try {
  const tunnel = await agent.connect(3000);
} catch (err) {
  if (err instanceof ConnectionError) {
    console.log(`Connection failed: ${err.message}`);
    // Common causes: invalid key, network error, rate limited
  }
}
```

---

## Tier Limits

| Feature | Free | Pro | Team | Enterprise |
|---------|------|-----|------|------------|
| Max tunnel TTL | 2 hours | 24 hours | 24 hours | 24 hours |
| Concurrent tunnels | 1 | 5 | 5 | 5 |
| Rate limit (key validation) | 30/min | 30/min | 30/min | 30/min |

---

## Best Practices

1. **Always call `disconnect()`** when done to clean up server resources
2. **Use `waitForReady()`** before making requests to ensure the tunnel is fully operational
3. **Handle errors** with try/catch - network issues and key problems are common in CI/CD
4. **Set appropriate TTLs** to avoid leaving tunnels open longer than needed
5. **Use temporary keys** (`liveport share` or the API) for one-off sharing instead of your main key
