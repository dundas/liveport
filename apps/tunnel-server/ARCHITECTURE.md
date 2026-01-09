# Tunnel Server Architecture

## Overview

The LivePort tunnel server uses a **dual-server architecture** to separate WebSocket upgrade handling from HTTP middleware processing. This prevents the "Invalid WebSocket frame: RSV1 must be clear" error that occurs when HTTP middleware interferes with WebSocket connections.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     External Traffic                         │
│                  (HTTP/HTTPS on port 80/443)                 │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Fly.io Edge Proxy / Caddy (TLS)                │
│                    Routes to port 8080                       │
└────────────────────────────┬────────────────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │                                         │
        ▼ (WebSocket Upgrade)                    ▼ (Regular HTTP)
┌───────────────────────┐                 ┌──────────────────┐
│  WEBSOCKET SERVER     │                 │   Proxies to:    │
│     (Port 8080)       │─────────────────▶   Port 8081      │
│                       │    (internal)    └──────────────────┘
│ - /connect endpoint   │                          │
│ - Public WS upgrades  │                          ▼
│ - No Hono middleware  │                 ┌──────────────────┐
└───────────────────────┘                 │  HTTP SERVER     │
        │                                  │   (Port 8081)    │
        │                                  │                  │
        │                                  │ - Hono app       │
        │                                  │ - /_health       │
        │                                  │ - API endpoints  │
        ▼                                  └──────────────────┘
┌───────────────────────┐
│  ConnectionManager    │
│  - Track tunnels      │
│  - Route by subdomain │
│  - Relay WS frames    │
└───────────────────────┘
```

## Why Two Servers?

### The Problem

When using a single HTTP server with both WebSocket upgrades and HTTP middleware (like Hono):

1. Client sends `Upgrade: websocket` request
2. **Node.js HTTP server emits 'upgrade' event** → sends "101 Switching Protocols"
3. **BUT Hono middleware also processes the request** → sends "HTTP/1.1 400 Bad Request"
4. Both responses are written to the same socket
5. The HTTP text bytes get interpreted as WebSocket frames
6. The 'H' character (0x48 = 01001000 binary) has RSV1=1 bit set
7. **Result**: `Invalid WebSocket frame: RSV1 must be clear`

### The Solution

**Dual-Server Architecture**:
- **Port 8080 (WebSocket Server)**: Handles only WebSocket upgrades, never calls Hono
- **Port 8081 (HTTP Server)**: Runs Hono for API endpoints, never sees upgrade requests
- Port 8080 internally proxies regular HTTP requests to port 8081

This completely isolates WebSocket handling from HTTP middleware, preventing any interference.

## Server Responsibilities

### WebSocket Server (Port 8080)

**File**: `apps/tunnel-server/src/index.ts:74-120`

**Handles**:
- CLI tunnel connections (`/connect` endpoint)
- Public WebSocket upgrades (subdomain-based routing)
- Proxies regular HTTP requests to port 8081

**Key Code**:
```typescript
const wsServer = http.createServer((req, res) => {
  // Proxy HTTP to port 8081
  const proxyReq = http.request({
    hostname: 'localhost',
    port: cfg.port + 1, // 8081
    path: req.url,
    method: req.method,
    headers: req.headers,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });
  req.pipe(proxyReq);
});

wsServer.on("upgrade", (req, socket, head) => {
  if (req.url === "/connect" || req.url?.startsWith("/connect?")) {
    // CLI tunnel connections
    controlWss.handleUpgrade(req, socket, head, (ws) => {
      controlWss.emit('connection', ws, req);
    });
  } else {
    // Public WebSocket upgrades
    handleWebSocketUpgradeEvent(req, socket, head, connectionManager, cfg.baseDomain);
  }
});
```

**Why It Works**: The `upgrade` event is handled BEFORE the HTTP handler, and since there's no middleware, only the upgrade handler runs.

### HTTP Server (Port 8081)

**File**: `apps/tunnel-server/src/index.ts:124-128`

**Handles**:
- `/_health` endpoint for health checks
- Future API endpoints (dashboard, metrics, etc.)

**Key Code**:
```typescript
serve({
  fetch: httpApp.fetch,
  port: httpPort, // 8081
  hostname: cfg.host,
});
```

**Why It Works**: This server never receives WebSocket upgrade requests, so Hono middleware can't interfere.

## Multi-Tenant Isolation

The dual-server architecture **does not change** how tunnels are isolated between users. Multi-tenancy is handled by:

### 1. Subdomain-Based Routing

Each tunnel gets a unique subdomain (e.g., `happy-whale-wmua.liveport.online`). The `extractSubdomain()` function ensures requests are routed to the correct tunnel.

**Code**: `apps/tunnel-server/src/http-handler.ts:21-35`

### 2. Bridge Key Authentication

Each CLI client authenticates with a unique bridge key scoped to their `userId`. Invalid keys are rejected.

**Code**: `apps/tunnel-server/src/websocket-handler.ts:47-73`

### 3. ConnectionManager Isolation

The `ConnectionManager` maintains separate mappings for:
- `subdomain → TunnelConnection` (routing)
- `keyId → TunnelConnection` (authentication)
- `userId → TunnelConnection[]` (ownership)

**Code**: `apps/tunnel-server/src/connection-manager.ts`

### 4. WebSocket Connection Tracking

Each public WebSocket gets a unique ID like `subdomain:ws:abc123` and is associated with exactly one tunnel.

**Code**: `apps/tunnel-server/src/websocket-proxy.ts:104-113`

### Example Multi-Tenant Flow

**Alice's Tunnel**:
1. Authenticates → gets `alice-tunnel.liveport.online`
2. Public client connects to `wss://alice-tunnel.liveport.online`
3. Port 8080 → `extractSubdomain()` finds "alice-tunnel" → routes to Alice's CLI
4. Data flows: Public Client ↔ Port 8080 ↔ Alice's CLI ↔ Alice's localhost:3000

**Bob's Tunnel**:
1. Authenticates → gets `bob-tunnel.liveport.online`
2. Public client connects to `wss://bob-tunnel.liveport.online`
3. Port 8080 → `extractSubdomain()` finds "bob-tunnel" → routes to Bob's CLI
4. Data flows: Public Client ↔ Port 8080 ↔ Bob's CLI ↔ Bob's localhost:4000

**Isolation Guarantee**: Alice and Bob's traffic never crosses because subdomain routing ensures each request is matched to the correct tunnel.

## Deployment Configurations

### Fly.io Deployment

**File**: `apps/tunnel-server/fly.toml`

```toml
[[services]]
  internal_port = 8080  # WebSocket server (proxies HTTP to 8081)
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = "10s"
    timeout = "5s"
    method = "get"
    path = "/health"  # Proxied to port 8081
```

**Deployment**:
```bash
fly deploy --config apps/tunnel-server/fly.toml
```

### Hetzner/VPS Deployment with Caddy

**Caddy Configuration** (`/etc/caddy/Caddyfile`):

```caddyfile
:443 {
    tls {
        on_demand
    }

    # Match WebSocket upgrade requests
    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }

    # Route WebSocket to port 8080
    reverse_proxy @websocket localhost:8080

    # Route HTTP to port 8081
    reverse_proxy localhost:8081
}

:80 {
    # ACME HTTP-01 challenge (Let's Encrypt)
    reverse_proxy localhost:8081
}
```

**Systemd Service** (`/etc/systemd/system/liveport-tunnel.service`):

```ini
[Unit]
Description=LivePort Tunnel Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/liveport-tunnel
Environment="NODE_ENV=production"
Environment="PORT=8080"
Environment="BASE_DOMAIN=liveport.online"
ExecStart=/usr/bin/node dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

**Start Services**:
```bash
systemctl enable --now liveport-tunnel
systemctl enable --now caddy
```

## Production Verification

### Test WebSocket Connections

**Script**: `test-ws-client.mjs`

```bash
# Test over WSS
node test-ws-client.mjs wss://YOUR_SUBDOMAIN.liveport.online

# Expected output:
# ✅ Test 1 passed: Received welcome message
# ✅ Test 2 passed: Text echo works
# ✅ Test 3 passed: Binary echo works
# ✅ Test 4 passed: Large message works
```

### Test HTTP Health Endpoint

```bash
curl https://tunnel.liveport.online/_health

# Expected:
# {"status":"ok","uptime":123,"connections":0}
```

### Verify Dual-Server Architecture

```bash
# On the server, check both ports are listening
lsof -i :8080  # WebSocket server
lsof -i :8081  # HTTP server

# Expected:
# node <PID> ... TCP *:8080 (LISTEN)
# node <PID> ... TCP *:8081 (LISTEN)
```

## Troubleshooting

### RSV1 Error Still Occurs

**Symptoms**: `Invalid WebSocket frame: RSV1 must be clear`

**Check**:
1. Verify two separate servers are running on ports 8080 and 8081
2. Ensure WebSocket server (8080) doesn't call Hono middleware
3. Check no reverse proxy is applying compression (disable in Caddy/Nginx)

### HTTP Requests Return 502

**Symptoms**: Health check fails, API endpoints return 502

**Check**:
1. Verify HTTP server (8081) is running
2. Check WebSocket server (8080) proxy is forwarding to 8081
3. Review logs for proxy errors

### WebSocket Connections Timeout

**Symptoms**: Upgrade request hangs, no response

**Check**:
1. Verify subdomain exists in ConnectionManager
2. Check CLI tunnel is connected and active
3. Review WebSocket upgrade logs for errors

## References

- [WebSocket Protocol (RFC 6455)](https://tools.ietf.org/html/rfc6455)
- [ws library docs](https://github.com/websockets/ws)
- [Node.js HTTP Upgrade Events](https://nodejs.org/api/http.html#event-upgrade)
- [Express WebSocket Best Practices](https://github.com/websockets/ws#multiple-servers-sharing-a-single-https-server)

---

**Generated**: 2025-12-30
**For**: Dual-Server Architecture (RSV1 Error Fix)
