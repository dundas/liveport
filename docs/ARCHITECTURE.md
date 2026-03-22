<!-- Generated: 2026-03-22 from docs-generator.json — do not edit manually -->
# LivePort Architecture

## Overview

LivePort is a secure localhost tunneling service designed for AI agents. It exposes local development servers to the internet through authenticated WebSocket tunnels with HTTP proxying.

## Component Diagram

```mermaid
graph TB
    subgraph "Client Side"
        CLI["@liveport/cli<br/>CLI Client"]
        SDK["@liveport/agent-sdk<br/>Agent SDK"]
        LOCAL["Local Server<br/>localhost:PORT"]
    end

    subgraph "LivePort Infrastructure"
        subgraph "Tunnel Server (Hetzner/Fly.io)"
            WS_SERVER["WebSocket Server<br/>Port 8080"]
            HTTP_SERVER["HTTP Server (Hono)<br/>Port 8081"]
            CONN_MGR["Connection Manager<br/>Tunnel Registry"]
            KEY_VAL["Key Validator<br/>Bridge Key Auth"]
            TTL["TTL Engine<br/>Expiry Enforcement"]
            METER["Metering Service<br/>Usage Tracking"]
        end

        subgraph "Dashboard (Vercel)"
            DASH["Next.js 16 Dashboard<br/>liveport.dev"]
            AUTH["ClearAuth<br/>GitHub + Google OAuth"]
            API["Agent API<br/>/api/agent/*"]
        end

        subgraph "Data Layer"
            MECH["mech-storage<br/>PostgreSQL API"]
            REDIS["Upstash Redis<br/>Rate Limiting + State"]
        end
    end

    subgraph "Public Internet"
        PUBLIC["Public Client<br/>Browser / Agent / curl"]
    end

    CLI -->|"WebSocket (wss://)"| WS_SERVER
    SDK -->|"WebSocket (wss://)"| WS_SERVER
    CLI -->|"HTTP (localhost)"| LOCAL
    SDK -->|"HTTP (localhost)"| LOCAL
    WS_SERVER -->|"Route HTTP"| HTTP_SERVER
    WS_SERVER --> CONN_MGR
    HTTP_SERVER --> CONN_MGR
    CONN_MGR --> KEY_VAL
    CONN_MGR --> TTL
    CONN_MGR --> METER
    KEY_VAL --> MECH
    KEY_VAL --> REDIS
    METER --> MECH
    DASH --> AUTH
    DASH --> MECH
    API --> MECH
    PUBLIC -->|"HTTPS"| HTTP_SERVER
```

## Data Flow: Tunnel Connection

```mermaid
sequenceDiagram
    participant CLI as CLI / Agent SDK
    participant WS as WebSocket Server<br/>(Port 8080)
    participant KV as Key Validator
    participant RL as Rate Limiter (Redis)
    participant CM as Connection Manager
    participant DB as mech-storage

    CLI->>WS: WebSocket UPGRADE /connect<br/>X-Bridge-Key: lpk_...<br/>X-Local-Port: 3000<br/>X-Tunnel-TTL: 7200
    WS->>RL: Check rate limit (key prefix)
    RL-->>WS: Allowed (29/30 remaining)
    WS->>KV: validate(key, port)
    KV->>DB: Find key by prefix
    DB-->>KV: Key record
    KV->>KV: Verify bcrypt hash
    KV->>KV: Check expiry, status, port, maxUses
    KV->>DB: Atomic increment currentUses
    KV-->>WS: Valid (keyId, userId, tier)
    WS->>CM: register(socket, tunnelId, keyId, ...)
    CM->>CM: Generate subdomain
    CM->>CM: Compute effective TTL<br/>min(keyExpiry, clientTTL, tierMax)
    CM-->>WS: subdomain
    WS-->>CLI: {"type":"connected",<br/>"payload":{"tunnelId","subdomain","url","expiresAt"}}
```

## Data Flow: HTTP Proxy with Access Token

```mermaid
sequenceDiagram
    participant Client as Public Client
    participant HTTP as HTTP Server<br/>(Hono, Port 8081)
    participant CM as Connection Manager
    participant CLI as CLI Client
    participant Local as Local Server

    Client->>HTTP: GET https://abc123.liveport.online/api/data<br/>Authorization: Bearer lpa_...
    HTTP->>HTTP: Extract subdomain from Host header
    HTTP->>CM: findBySubdomain("abc123")
    CM-->>HTTP: TunnelConnection (with accessToken)
    HTTP->>CM: validateAccessToken("abc123", "lpa_...")<br/>(HMAC constant-time comparison)
    CM-->>HTTP: Valid
    HTTP->>HTTP: Build HttpRequestMessage<br/>(add X-Forwarded-* headers)
    HTTP->>CLI: WebSocket: {"type":"http_request", ...}
    CLI->>Local: HTTP GET localhost:3000/api/data
    Local-->>CLI: 200 OK (JSON body)
    CLI->>HTTP: WebSocket: {"type":"http_response", ...}<br/>(base64-encoded body)
    HTTP-->>Client: 200 OK (JSON body)
```

## Access Token Auth Flow

```mermaid
flowchart TD
    REQ["Incoming HTTP Request"] --> SUBDOMAIN["Extract subdomain<br/>from Host header"]
    SUBDOMAIN --> FIND["Find tunnel connection"]
    FIND -->|Not found| E502["502 Bad Gateway"]
    FIND -->|Found| CHECK_TOKEN{"Connection has<br/>accessToken?"}
    CHECK_TOKEN -->|No| FORWARD["Forward to CLI<br/>(open tunnel)"]
    CHECK_TOKEN -->|Yes| EXTRACT["Extract token from<br/>Authorization: Bearer header"]
    EXTRACT --> VALIDATE{"HMAC constant-time<br/>comparison"}
    VALIDATE -->|Match| FORWARD
    VALIDATE -->|No match / missing| E401["401 Unauthorized"]
    FORWARD --> PROXY["Proxy HTTP to localhost"]
```

## Dual-Server Architecture

The tunnel server runs two servers to prevent middleware interference with WebSocket connections:

| Server | Port | Responsibility |
|--------|------|----------------|
| WebSocket Server | 8080 | WebSocket upgrades (`/connect` for CLI, other paths for proxied WebSockets). Proxies non-WebSocket HTTP to port 8081. |
| HTTP Server (Hono) | 8081 | HTTP request proxying, health checks, API endpoints, TLS certificate validation. |

**Why two servers?** Hono middleware (and Node.js HTTP frameworks in general) can interfere with WebSocket upgrade requests by writing headers or response bodies before the upgrade completes, causing "RSV1 must be clear" errors. The dedicated WebSocket server handles upgrades directly, bypassing all middleware.

## Security Architecture

### Bridge Key Validation
- Keys use the `lpk_` prefix format
- Stored as bcrypt hashes (with legacy SHA-256 fallback)
- Lookup by key prefix, then hash verification
- Rate limited: 30 validations/minute per key prefix (Redis sliding window)

### Atomic maxUses Enforcement
- Uses conditional SQL: `UPDATE ... SET currentUses = currentUses + 1 WHERE currentUses < maxUses`
- Returns null if at limit, preventing race conditions
- Usage decremented on disconnect

### Tunnel Expiry
- Expiry checker runs every 30 seconds
- Closes expired tunnels with `KEY_EXPIRED` error message and WebSocket close code 4002
- Effective expiry = `min(keyExpiresAt, now + clientTTL, now + tierMaxTTL)`

### Access Token Security
- Tokens prefixed with `lpa_` (32 random characters via nanoid)
- HMAC-based constant-time comparison prevents timing attacks
- Only generated for `liveport share` tunnels (regular `connect` tunnels stay open)

### Dev Key Bypass
- Only active when **both** `NODE_ENV=development` AND `ALLOW_DEV_KEYS=true`
- Returns a temporary free-tier key with 24h expiry
- Never available in production

### Request Security
- Hop-by-hop header stripping (Connection, Transfer-Encoding, etc.)
- 10MB max request body size
- Path sanitization (prevents path traversal)
- X-Forwarded-* headers added for proper origin tracking

## Database Schema

Tables stored via mech-storage (PostgreSQL API):

| Table | Purpose |
|-------|---------|
| `user` | User accounts (id, email, name, tier) |
| `session` | Auth sessions |
| `account` | OAuth provider accounts |
| `verification` | Email verification tokens |
| `bridge_keys` | Bridge key records (hash, prefix, expiry, maxUses, status) |
| `tunnels` | Tunnel connection records (metrics, timestamps) |

## Environment Variables

### Tunnel Server
| Variable | Description |
|----------|-------------|
| `PORT` | WebSocket server port (default: 8080) |
| `BASE_DOMAIN` | Base domain for tunnel subdomains (default: liveport.online) |
| `MECH_APPS_APP_ID` | mech-storage application ID |
| `MECH_APPS_API_KEY` | mech-storage API key |
| `MECH_APPS_URL` | mech-storage base URL |
| `REDIS_URL` | Redis connection string (for rate limiting) |
| `INTERNAL_API_SECRET` | Secret for internal API endpoints |
| `ALLOW_DEV_KEYS` | Enable dev key bypass (requires NODE_ENV=development) |
| `METERING_ENABLED` | Enable/disable usage metering |
| `PROXY_GATEWAY_ENABLED` | Enable HTTPS CONNECT proxy |
| `PROXY_TOKEN_SECRET` | Secret for proxy token signing |
| `PROXY_ALLOWED_HOSTS` | Allowlist for proxy gateway (required if proxy enabled) |

### Dashboard
| Variable | Description |
|----------|-------------|
| `MECH_APPS_APP_ID` | mech-storage application ID |
| `MECH_APPS_API_KEY` | mech-storage API key |
| `REDIS_URL` | Redis connection string |
| `AUTH_SECRET` | ClearAuth secret (32+ characters) |

## Deployment

- **Dashboard**: Deployed on Vercel (Next.js 16)
- **Tunnel Server**: Deployed on Hetzner (with Fly.io as alternative)
- **TLS**: Caddy reverse proxy with on-demand TLS for `*.liveport.online`
- **DNS**: Wildcard CNAME for `*.liveport.online` pointing to tunnel server
