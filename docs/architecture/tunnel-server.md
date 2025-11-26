# Tunnel Server Architecture

## Overview

The LivePort tunnel server is a WebSocket-based reverse proxy that enables secure HTTP tunneling from local development servers to public URLs. It is designed to handle multiple concurrent connections with minimal latency while ensuring security through bridge key authentication.

## System Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Internet                                    │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cloudflare (DNS + SSL)                            │
│                   *.liveport.dev → Fly.io (anycast)                     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────────┐
│     HTTP Requests              │   │      WebSocket Connections         │
│  (subdomain.liveport.dev)     │   │   (tunnel.liveport.dev/connect)   │
└───────────────────┬───────────┘   └───────────────────┬───────────────┘
                    │                                   │
                    ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Tunnel Server (Fly.io)                           │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  HTTP Handler   │  │  WebSocket      │  │  Connection Manager     │  │
│  │  (Hono)         │◄─┤  Handler        │◄─┤  - Active tunnels       │  │
│  │                 │  │  (ws)           │  │  - Subdomain mapping    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
│           │                    │                        │               │
│           └────────────────────┴────────────────────────┘               │
│                                │                                         │
│                    ┌───────────┴───────────┐                            │
│                    ▼                       ▼                            │
│           ┌─────────────────┐    ┌─────────────────┐                    │
│           │  Key Validator  │    │  Rate Limiter   │                    │
│           └────────┬────────┘    └────────┬────────┘                    │
│                    │                      │                             │
└────────────────────┼──────────────────────┼─────────────────────────────┘
                     │                      │
                     ▼                      ▼
             ┌───────────────┐      ┌───────────────┐
             │  mech-storage │      │  Redis        │
             │  (PostgreSQL) │      │  (Upstash)    │
             └───────────────┘      └───────────────┘
```

## Core Components

### 1. HTTP Handler (Hono)

The HTTP handler receives incoming requests to tunnel subdomains and routes them to the appropriate WebSocket connection.

**Responsibilities:**
- Parse subdomain from `Host` header
- Look up active tunnel connection for subdomain
- Forward HTTP request through WebSocket
- Return response to client
- Handle request timeout (30s default)

**Request Flow:**
```
HTTP Request → Extract Subdomain → Find Tunnel → Forward via WS → Return Response
```

### 2. WebSocket Handler

Manages persistent connections from CLI clients.

**Responsibilities:**
- Authenticate connections using bridge keys
- Assign unique subdomains
- Maintain connection state
- Handle bidirectional message passing
- Implement heartbeat protocol

### 3. Connection Manager

Centralized state management for all active tunnels.

**Data Structures:**
```typescript
interface TunnelConnection {
  id: string;               // Unique connection ID (UUID)
  subdomain: string;        // Assigned subdomain
  keyId: string;            // Bridge key ID
  userId: string;           // Owner user ID
  localPort: number;        // Client's local port
  socket: WebSocket;        // WebSocket connection
  createdAt: Date;          // Connection start time
  lastHeartbeat: Date;      // Last heartbeat received
  requestCount: number;     // Total requests served
}
```

**Operations:**
- `register(socket, keyId, port)` → subdomain
- `unregister(subdomain)`
- `findBySubdomain(subdomain)` → TunnelConnection | null
- `findByKeyId(keyId)` → TunnelConnection[]
- `getAll()` → TunnelConnection[]

### 4. Key Validator

Validates bridge keys on connection.

**Validation Steps:**
1. Check key format (must start with `lpk_`)
2. Hash incoming key with SHA-256
3. Query database for matching hash
4. Verify key is not revoked
5. Verify key is not expired
6. Verify usage count < maxUses (if set)
7. Verify port matches allowedPort (if set)
8. Increment usage count on success

### 5. Rate Limiter

Redis-based rate limiting per bridge key.

**Limits:**
| Resource | Limit | Window |
|----------|-------|--------|
| Connections per key | 5 | concurrent |
| Requests per tunnel | 1000 | per minute |
| Bytes per tunnel | 100 MB | per hour |

## Data Flow

### Tunnel Establishment

```
┌─────┐     ┌──────────────┐     ┌────────────┐     ┌───────┐     ┌───────┐
│ CLI │     │ Tunnel Server│     │ Validator  │     │  DB   │     │ Redis │
└──┬──┘     └──────┬───────┘     └─────┬──────┘     └───┬───┘     └───┬───┘
   │               │                   │               │             │
   │ WS Connect    │                   │               │             │
   │──────────────►│                   │               │             │
   │               │                   │               │             │
   │               │ Validate Key      │               │             │
   │               │──────────────────►│               │             │
   │               │                   │               │             │
   │               │                   │ Query Key     │             │
   │               │                   │──────────────►│             │
   │               │                   │               │             │
   │               │                   │◄──────────────│             │
   │               │                   │ Key Data      │             │
   │               │◄──────────────────│               │             │
   │               │ Key Valid         │               │             │
   │               │                   │               │             │
   │               │ Check Rate Limit  │               │             │
   │               │────────────────────────────────────────────────►│
   │               │                   │               │             │
   │               │◄────────────────────────────────────────────────│
   │               │ Under Limit       │               │             │
   │               │                   │               │             │
   │               │ Generate Subdomain│               │             │
   │               │────────────────────────────────────────────────►│
   │               │ (Check collision) │               │             │
   │               │                   │               │             │
   │               │ Register Tunnel   │               │             │
   │               │──────────────────►│               │             │
   │               │                   │──────────────►│             │
   │               │                   │ Insert Tunnel │             │
   │               │                   │               │             │
   │◄──────────────│                   │               │             │
   │ Connected!    │                   │               │             │
   │ subdomain: x  │                   │               │             │
```

### HTTP Request Proxying

```
┌────────┐     ┌──────────────┐     ┌─────────────────┐     ┌─────┐
│ Client │     │ Tunnel Server│     │ Tunnel (CLI WS) │     │ App │
└───┬────┘     └──────┬───────┘     └────────┬────────┘     └──┬──┘
    │                 │                      │                 │
    │ GET /api/data   │                      │                 │
    │ Host: abc.lp.dev│                      │                 │
    │────────────────►│                      │                 │
    │                 │                      │                 │
    │                 │ Find tunnel for abc  │                 │
    │                 │────────────────────► │                 │
    │                 │                      │                 │
    │                 │ WS: Forward Request  │                 │
    │                 │─────────────────────►│                 │
    │                 │                      │                 │
    │                 │                      │ HTTP /api/data  │
    │                 │                      │────────────────►│
    │                 │                      │                 │
    │                 │                      │◄────────────────│
    │                 │                      │ Response        │
    │                 │                      │                 │
    │                 │◄─────────────────────│                 │
    │                 │ WS: Forward Response │                 │
    │                 │                      │                 │
    │◄────────────────│                      │                 │
    │ Response        │                      │                 │
```

## State Management

### In-Memory State

Active tunnel connections are stored in-memory for fast lookup:

```typescript
// Primary index: subdomain → connection
const tunnelsBySubdomain = new Map<string, TunnelConnection>();

// Secondary index: keyId → connections (for listing)
const tunnelsByKeyId = new Map<string, Set<string>>();

// Pending requests: requestId → resolver
const pendingRequests = new Map<string, RequestResolver>();
```

### Redis State

Redis stores ephemeral state for:
- **Subdomain reservations**: Prevent collision during assignment
- **Heartbeat tracking**: Detect stale connections across instances
- **Rate limiting**: Request/connection counters
- **Active tunnel list**: For dashboard queries

```
Keys:
  liveport:subdomain:{subdomain} → TTL 30s (reservation)
  liveport:tunnel:{tunnelId}:heartbeat → TTL 30s (last heartbeat)
  liveport:key:{keyId}:connections → Count (rate limit)
  liveport:key:{keyId}:requests → Count per minute
  liveport:tunnels:active → Set of active tunnel IDs
```

### Database State

PostgreSQL stores persistent tunnel records:
- Used for billing/usage tracking
- Historical data for debugging
- User's tunnel history

## Subdomain Generation

### Strategy: Adjective-Noun + Random

Format: `{adjective}-{noun}-{4-char-hex}`

**Examples:**
- `brave-panda-7f3a`
- `swift-falcon-2b9c`
- `calm-river-e4f1`

**Word Lists:**
- 100 adjectives (positive, memorable)
- 100 nouns (animals, nature, objects)
- 4 hex characters (65,536 combinations)

**Total combinations:** 100 × 100 × 65,536 = 655,360,000

### Collision Handling

1. Generate candidate subdomain
2. Check Redis for active reservation
3. If collision, regenerate (max 5 attempts)
4. Reserve in Redis with 30s TTL
5. On successful connection, extend TTL to connection lifetime

### Reserved Subdomains

Block certain patterns:
- `www`, `api`, `app`, `admin`, `dashboard`
- Offensive words (blocklist)
- Single characters
- Numbers only

## Connection Lifecycle

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Connection States                              │
└────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────┐
  │ CONNECTING  │────►│ VALIDATING  │────►│   ACTIVE    │────►│ CLOSING │
  └─────────────┘     └─────────────┘     └─────────────┘     └─────────┘
         │                   │                   │                  │
         │                   │                   │                  │
         ▼                   ▼                   ▼                  ▼
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────┐
  │   FAILED    │     │  REJECTED   │     │  TIMEOUT    │     │ CLOSED  │
  │ (WS error)  │     │(invalid key)│     │(no heartbeat│     │         │
  └─────────────┘     └─────────────┘     └─────────────┘     └─────────┘
```

### State Transitions

| From | To | Trigger |
|------|-----|---------|
| CONNECTING | VALIDATING | WebSocket `open` event |
| CONNECTING | FAILED | WebSocket `error` event |
| VALIDATING | ACTIVE | Key validated successfully |
| VALIDATING | REJECTED | Key validation failed |
| ACTIVE | TIMEOUT | No heartbeat for 30s |
| ACTIVE | CLOSING | Client sends `disconnect` |
| ACTIVE | CLOSING | Server initiates shutdown |
| CLOSING | CLOSED | Cleanup complete |

### Heartbeat Protocol

- Client sends `heartbeat` message every 10s
- Server responds with `heartbeat_ack`
- If no heartbeat for 30s, connection closed
- Heartbeat includes: `timestamp`, `requestCount`

## Error Handling

### Connection Errors

| Error | HTTP Code | WS Close Code | Action |
|-------|-----------|---------------|--------|
| Invalid key format | - | 4001 | Close immediately |
| Key not found | - | 4001 | Close immediately |
| Key expired | - | 4002 | Close immediately |
| Key revoked | - | 4003 | Close immediately |
| Rate limit exceeded | - | 4029 | Close with retry-after |
| Port not allowed | - | 4004 | Close immediately |
| Server error | - | 1011 | Close, log error |

### Request Errors

| Error | HTTP Code | Description |
|-------|-----------|-------------|
| Tunnel not found | 502 | No active tunnel for subdomain |
| Request timeout | 504 | Client didn't respond in 30s |
| Connection lost | 502 | WebSocket closed during request |
| Invalid response | 502 | Client sent malformed response |

## Scaling Considerations

### Single Instance (MVP)

For MVP, run a single instance with:
- All state in memory
- Redis for rate limiting only
- Simple subdomain assignment

### Multi-Instance (Future)

For horizontal scaling:
- Sticky sessions via Fly.io regions
- Redis for shared subdomain registry
- Request routing via subdomain → instance mapping
- Consistent hashing for load distribution

## Security

### Key Security
- Keys hashed with SHA-256 before storage
- Keys transmitted over TLS only
- Keys can be revoked instantly
- Keys have configurable expiration

### Request Security
- All traffic over HTTPS (Cloudflare)
- No request logging (privacy)
- Request size limits (10MB default)
- Timeout enforcement

### Rate Limiting
- Per-key connection limits
- Per-tunnel request limits
- Global limits for abuse prevention

## Monitoring

### Metrics (Future)
- Active connections count
- Requests per second
- Latency percentiles (p50, p95, p99)
- Error rates by type

### Health Check

`GET /health` returns:
```json
{
  "status": "healthy",
  "connections": 42,
  "uptime": 3600,
  "redis": "connected",
  "database": "connected"
}
```

## Configuration

```typescript
interface TunnelServerConfig {
  // Server
  port: number;                    // Default: 3001
  host: string;                    // Default: "0.0.0.0"

  // Timeouts
  connectionTimeout: number;       // Default: 30000 (30s)
  requestTimeout: number;          // Default: 30000 (30s)
  heartbeatInterval: number;       // Default: 10000 (10s)
  heartbeatTimeout: number;        // Default: 30000 (30s)

  // Limits
  maxConnectionsPerKey: number;    // Default: 5
  maxRequestsPerMinute: number;    // Default: 1000
  maxRequestSize: number;          // Default: 10MB

  // Subdomain
  baseDomain: string;              // e.g., "liveport.dev"
  reservedSubdomains: string[];    // Blocklist
}
```
