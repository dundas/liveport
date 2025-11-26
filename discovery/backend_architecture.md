# Backend Architecture: mech-storage + Better Auth + Redis

## Overview

LivePort (Agent Bridge) will use **mech-storage** as the primary backend service, **Redis** for ephemeral/real-time data, and **Better Auth** for authentication and key management. This architecture is specifically designed for agent-to-localhost communication and testing workflows.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard (Next.js)  │  CLI Client  │  Agent SDK (TS/Python)   │
└──────────────┬──────────────┬──────────────┬────────────────────┘
               │              │              │
               ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Server (Node.js)                        │
│                        + Better Auth                             │
└──────────────┬──────────────────────────┬───────────────────────┘
               │                          │
       ┌───────▼────────┐        ┌────────▼────────┐
       │     Redis      │        │  mech-storage   │
       │  (Ephemeral)   │        │  (Persistent)   │
       └────────────────┘        └─────────────────┘
       • Heartbeats             • User accounts
       • Rate limiting          • Bridge keys
       • Active tunnels         • Tunnel history
       • Session cache          • Request logs
       • Pub/sub events         • Billing data
       • Metrics buffer         • Test results

       ┌────────────────────────────────────────┐
       │  Data Flow: Redis → mech-storage       │
       │  • Aggregate metrics every 5 min       │
       │  • Flush logs on disconnect            │
       │  • Cache validated keys for 5 min      │
       └────────────────────────────────────────┘
```

## Backend: mech-storage API

**Base URL**: `https://storage.mechdna.net/api`
**OpenAPI Spec**: `https://storage.mechdna.net/api/openapi.json`

### Core Capabilities

mech-storage provides four integrated data storage systems that perfectly align with our needs:

#### 1. File Storage (R2)
- Upload/retrieve files with presigned URLs
- Public sharing with expiration
- Multipart uploads for large files
- Base64 encoding for AI model integration
- **Use cases**:
  - Store tunnel configuration files
  - Agent test artifacts (screenshots, logs)
  - Dashboard assets

#### 2. NoSQL Documents
- MongoDB and Firestore format support
- Collection management with custom document keys
- Optional vector search indexing
- **Use cases**:
  - Store bridge key metadata
  - Active tunnel sessions
  - User preferences and settings
  - Agent test results

#### 3. PostgreSQL Tables
- Custom relational schemas
- Parameterized SQL queries
- CRUD operations on typed records
- **Use cases**:
  - Users table
  - Bridge keys with constraints
  - Tunnel history and analytics
  - Request logs
  - Billing and usage tracking

#### 4. Semantic Search
- Unified vector search across files, documents, and database records
- Similarity scoring and filtering
- **Use cases**:
  - Search tunnel logs by natural language
  - Find similar test scenarios
  - Agent behavior pattern matching

### Authentication

All mech-storage endpoints require:
```http
X-API-Key: <your-api-key>
X-App-ID: <application-identifier>
```

Schemas are automatically derived as `app_<sanitized_app_id>` unless explicitly provided.

---

## Redis: Ephemeral Data & Real-time State

**Purpose**: High-frequency, temporary data that doesn't need persistence

### Use Cases

#### 1. Tunnel Heartbeats & Health Checks
```typescript
// Store last heartbeat from CLI client
await redis.setex(
  `tunnel:${tunnelId}:heartbeat`,
  30, // 30 second TTL
  Date.now().toString()
)

// Check if tunnel is alive
const lastHeartbeat = await redis.get(`tunnel:${tunnelId}:heartbeat`)
const isAlive = lastHeartbeat && (Date.now() - parseInt(lastHeartbeat)) < 30000
```

#### 2. Rate Limiting
```typescript
// Per-key rate limiting
const key = `ratelimit:${bridgeKeyId}:${Math.floor(Date.now() / 60000)}`
const count = await redis.incr(key)
await redis.expire(key, 60) // 1 minute window

if (count > 1000) {
  throw new Error('Rate limit exceeded: 1000 requests/minute')
}
```

#### 3. Active Connection Tracking
```typescript
// Track which tunnels are currently active (in-memory state)
await redis.sadd('active_tunnels', tunnelId)
await redis.expire('active_tunnels', 300) // Refresh every 5 minutes

// Remove on disconnect
await redis.srem('active_tunnels', tunnelId)
```

#### 4. Real-time Dashboard Updates (Pub/Sub)
```typescript
// Publish tunnel events for real-time dashboard
await redis.publish('tunnel_events', JSON.stringify({
  event: 'tunnel.connected',
  tunnel_id: tunnelId,
  user_id: userId,
  timestamp: Date.now()
}))

// Dashboard subscribes to updates
redis.subscribe('tunnel_events', (message) => {
  const event = JSON.parse(message)
  updateDashboard(event)
})
```

#### 5. Request Metrics (High-Frequency Writes)
```typescript
// Increment request count in Redis (fast)
await redis.hincrby(`tunnel:${tunnelId}:metrics`, 'request_count', 1)
await redis.hincrby(`tunnel:${tunnelId}:metrics`, 'bytes_transferred', bytes)

// Periodically flush to mech-storage (every 5 minutes)
setInterval(async () => {
  const metrics = await redis.hgetall(`tunnel:${tunnelId}:metrics`)

  await mechStorage.postgres.update('tunnels', {
    request_count: metrics.request_count,
    bytes_transferred: metrics.bytes_transferred
  }, { id: tunnelId })

  await redis.del(`tunnel:${tunnelId}:metrics`)
}, 5 * 60 * 1000)
```

#### 6. Session Cache
```typescript
// Cache Better Auth sessions for fast lookup
await redis.setex(
  `session:${sessionToken}`,
  3600, // 1 hour TTL
  JSON.stringify(sessionData)
)
```

#### 7. Bridge Key Validation Cache
```typescript
// Cache validated bridge keys to reduce mech-storage queries
await redis.setex(
  `bridge_key:${keyPrefix}:validated`,
  300, // 5 minute cache
  JSON.stringify(keyRecord)
)
```

### Data Flow: Redis vs mech-storage

```
High-Frequency Operations (Redis):
- Tunnel heartbeats (every 5-10 seconds)
- Rate limiting checks (every request)
- Active connection state
- Real-time pub/sub events
- Request metrics aggregation
- Session cache

Persistent Operations (mech-storage):
- User account data
- Bridge key records
- Tunnel history
- Request logs (after aggregation)
- Billing/usage data
- Test results
```

### Redis Configuration

```typescript
import Redis from 'ioredis'

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  // Use Redis Cluster for production
  enableReadyCheck: true,
  lazyConnect: false
})

// Pub/Sub instance (separate connection)
export const redisPubSub = redis.duplicate()
```

### Hosting Options

- **Development**: Local Redis via Docker
- **Production**:
  - [Upstash Redis](https://upstash.com/) - Serverless, pay-per-request
  - [Railway Redis](https://railway.app/) - Simple, affordable
  - Fly.io Redis - Co-located with tunnel servers

---

## Authentication: Better Auth

**Library**: [Better Auth](https://www.better-auth.com/)
**Purpose**: Modern, type-safe authentication for the dashboard and CLI

### Features We'll Use

1. **Multi-provider Authentication**
   - Email/password
   - OAuth (GitHub, Google)
   - Magic links (passwordless)

2. **API Key Management**
   - Generate scoped API keys for developers
   - Key rotation and revocation
   - Per-key permissions

3. **Session Management**
   - Secure session tokens
   - Multi-device support
   - Session revocation

4. **Bridge Key Management** (Custom Implementation)
   - Generate time-limited bridge keys for agent testing
   - Key scoping (ports, IP allowlists, usage limits)
   - Key validation and tracking

### Better Auth Integration

```typescript
// Initialize Better Auth with mech-storage backend
import { betterAuth } from "better-auth"
import { mechStorageAdapter } from "./adapters/mech-storage"

export const auth = betterAuth({
  database: mechStorageAdapter({
    apiKey: process.env.MECH_STORAGE_API_KEY,
    appId: process.env.MECH_STORAGE_APP_ID
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    }
  }
})
```

---

## Agent API Endpoints

### Control Plane API (for Agents)

These endpoints allow AI agents to interact with the bridge:

#### 1. Wait for Tunnel
```http
GET /api/agent/tunnels/wait
Headers:
  Authorization: Bearer <BRIDGE_KEY>

Query:
  ?timeout=30000  # Milliseconds to wait for tunnel

Response:
{
  "tunnel": {
    "id": "tun_abc123",
    "url": "https://xyz789.liveport.dev",
    "status": "active",
    "port": 3000,
    "created_at": "2025-11-26T13:00:00Z"
  }
}
```

#### 2. List Active Tunnels
```http
GET /api/agent/tunnels
Headers:
  Authorization: Bearer <BRIDGE_KEY>

Response:
{
  "tunnels": [
    {
      "id": "tun_abc123",
      "url": "https://xyz789.liveport.dev",
      "status": "active",
      "port": 3000,
      "created_at": "2025-11-26T13:00:00Z",
      "bytes_transferred": 1048576,
      "request_count": 42
    }
  ]
}
```

#### 3. Report Test Results
```http
POST /api/agent/tunnels/:id/results
Headers:
  Authorization: Bearer <BRIDGE_KEY>

Body:
{
  "test_suite": "e2e-tests",
  "status": "passed",
  "duration_ms": 45000,
  "tests_run": 15,
  "tests_passed": 15,
  "tests_failed": 0,
  "artifacts": [
    {
      "type": "screenshot",
      "url": "https://storage.mechdna.net/..."
    }
  ]
}
```

#### 4. Get Tunnel Logs
```http
GET /api/agent/tunnels/:id/logs
Headers:
  Authorization: Bearer <BRIDGE_KEY>

Query:
  ?limit=100
  ?offset=0

Response:
{
  "logs": [
    {
      "id": "log_xyz",
      "timestamp": "2025-11-26T13:01:23Z",
      "method": "GET",
      "path": "/api/users",
      "status_code": 200,
      "duration_ms": 45
    }
  ]
}
```

---

## Bridge Key System

### Key Generation Flow

```typescript
// Dashboard generates a bridge key
async function generateBridgeKey(userId: string, config: KeyConfig) {
  const key = generateSecureToken(32) // abk_...

  // Store in mech-storage PostgreSQL
  await mechStorage.postgres.insert('bridge_keys', {
    id: generateUUID(),
    user_id: userId,
    key_hash: await bcrypt.hash(key),
    key_prefix: key.substring(0, 8), // For display
    expires_at: config.expiresAt,
    max_uses: config.maxUses,
    allowed_ports: config.allowedPorts,
    ip_allowlist: config.ipAllowlist,
    webhook_url: config.webhookUrl,
    created_at: new Date()
  })

  return key // Show only once
}
```

### Key Validation Flow

```typescript
// Agent connects with bridge key
async function validateBridgeKey(key: string, context: ConnectionContext) {
  const keyRecord = await mechStorage.postgres.query(
    'SELECT * FROM bridge_keys WHERE key_prefix = $1',
    [key.substring(0, 8)]
  )

  // Verify hash
  const isValid = await bcrypt.compare(key, keyRecord.key_hash)
  if (!isValid) throw new Error('Invalid key')

  // Check expiration
  if (new Date() > keyRecord.expires_at) {
    throw new Error('Key expired')
  }

  // Check usage limit
  if (keyRecord.current_uses >= keyRecord.max_uses) {
    throw new Error('Key usage limit exceeded')
  }

  // Check port allowlist
  if (keyRecord.allowed_ports && !keyRecord.allowed_ports.includes(context.port)) {
    throw new Error('Port not allowed')
  }

  // Check IP allowlist
  if (keyRecord.ip_allowlist && !keyRecord.ip_allowlist.includes(context.clientIp)) {
    throw new Error('IP not allowed')
  }

  // Increment usage
  await mechStorage.postgres.update('bridge_keys', {
    current_uses: keyRecord.current_uses + 1
  }, { id: keyRecord.id })

  // Trigger webhook if configured
  if (keyRecord.webhook_url) {
    await fetch(keyRecord.webhook_url, {
      method: 'POST',
      body: JSON.stringify({
        event: 'tunnel.connected',
        key_id: keyRecord.id,
        timestamp: new Date()
      })
    })
  }

  return keyRecord
}
```

---

## Database Schema (PostgreSQL via mech-storage)

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  auth_provider VARCHAR(50),
  tier VARCHAR(20) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Bridge Keys Table
```sql
CREATE TABLE bridge_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  key_hash VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(20) NOT NULL,
  expires_at TIMESTAMP,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  allowed_ports INTEGER[],
  ip_allowlist VARCHAR(45)[],
  webhook_url VARCHAR(500),
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bridge_keys_user_id ON bridge_keys(user_id);
CREATE INDEX idx_bridge_keys_key_prefix ON bridge_keys(key_prefix);
```

### Active Tunnels Table
```sql
CREATE TABLE tunnels (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  bridge_key_id UUID REFERENCES bridge_keys(id),
  subdomain VARCHAR(100) UNIQUE,
  local_port INTEGER,
  public_url VARCHAR(255),
  region VARCHAR(50),
  connected_at TIMESTAMP DEFAULT NOW(),
  disconnected_at TIMESTAMP,
  bytes_transferred BIGINT DEFAULT 0,
  request_count INTEGER DEFAULT 0
);

CREATE INDEX idx_tunnels_user_id ON tunnels(user_id);
CREATE INDEX idx_tunnels_bridge_key_id ON tunnels(bridge_key_id);
```

### Request Logs Table
```sql
CREATE TABLE request_logs (
  id UUID PRIMARY KEY,
  tunnel_id UUID REFERENCES tunnels(id),
  method VARCHAR(10),
  path TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_request_logs_tunnel_id ON request_logs(tunnel_id);
CREATE INDEX idx_request_logs_timestamp ON request_logs(timestamp);
```

### Usage Tracking Table
```sql
CREATE TABLE usage_metrics (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  period_start DATE,
  period_end DATE,
  domain_days INTEGER DEFAULT 0,
  total_gb DECIMAL(10,2) DEFAULT 0,
  amount_usd DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_usage_metrics_user_id ON usage_metrics(user_id);
CREATE INDEX idx_usage_metrics_period ON usage_metrics(period_start, period_end);
```

---

## Agent SDK Architecture

### TypeScript/JavaScript SDK

```typescript
import { LivePortAgent } from '@liveport/agent-sdk'

// Initialize with bridge key
const agent = new LivePortAgent({
  key: process.env.LIVEPORT_BRIDGE_KEY,
  apiUrl: 'https://api.liveport.dev'
})

// Wait for tunnel to be ready
const tunnel = await agent.waitForTunnel({
  timeout: 30000 // 30 seconds
})

console.log(`Testing at: ${tunnel.url}`)

// Run your tests
await runE2ETests(tunnel.url)

// Report results
await agent.reportResults(tunnel.id, {
  status: 'passed',
  duration_ms: 45000,
  tests_run: 15,
  tests_passed: 15
})

// Cleanup
await agent.disconnect()
```

### Python SDK

```python
from liveport import LivePortAgent

agent = LivePortAgent(key=os.environ['LIVEPORT_BRIDGE_KEY'])

# Wait for tunnel
tunnel = agent.wait_for_tunnel(timeout=30)
print(f"Testing at: {tunnel.url}")

# Run tests
run_tests(tunnel.url)

# Report results
agent.report_results(tunnel.id, {
    'status': 'passed',
    'duration_ms': 45000,
    'tests_run': 15
})

# Cleanup
agent.disconnect()
```

---

## Security Considerations

### 1. Key Security
- Bridge keys hashed with bcrypt in database
- Keys shown only once at generation
- Automatic key rotation notifications
- Rate limiting on validation attempts
- Revocation on suspicious activity

### 2. API Security
- All traffic over TLS 1.3
- Better Auth handles session security
- API keys scoped to specific resources
- IP allowlisting per bridge key
- Request signature validation

### 3. Data Privacy
- Request logs encrypted at rest in mech-storage
- Automatic log deletion per retention policy
- No payload logging by default (headers only)
- GDPR-compliant data deletion via mech-storage

### 4. mech-storage Security
- API keys rotated regularly
- X-App-ID isolation between environments
- Database-level encryption
- Automatic backups

---

## Implementation Priorities

### Phase 1: Core Backend (Week 1-2)
- [ ] Set up mech-storage account and API keys
- [ ] Set up Redis (Upstash or Railway for production, Docker for local)
- [ ] Create PostgreSQL schema via mech-storage API
- [ ] Implement Better Auth with email/password
- [ ] Basic bridge key generation endpoint
- [ ] Redis rate limiting middleware

### Phase 2: Agent API (Week 3-4)
- [ ] Implement `/api/agent/tunnels/wait` endpoint
- [ ] Implement bridge key validation middleware with Redis caching
- [ ] Build TypeScript SDK for agents
- [ ] Test with sample agent workflow
- [ ] Implement tunnel heartbeat system with Redis

### Phase 3: Advanced Features (Week 5-6)
- [ ] Add webhook notifications
- [ ] Implement request logging to mech-storage
- [ ] Add usage tracking and analytics
- [ ] Build Python SDK
- [ ] Real-time dashboard updates via Redis pub/sub
- [ ] Metrics aggregation with Redis → mech-storage flush

---

## Configuration

### Environment Variables

```bash
# mech-storage
MECH_STORAGE_API_KEY=<your-api-key>
MECH_STORAGE_APP_ID=liveport-prod

# Redis
REDIS_HOST=<redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>
REDIS_URL=redis://:<password>@<host>:6379  # Alternative format

# Better Auth
BETTER_AUTH_SECRET=<random-secret>
BETTER_AUTH_URL=https://liveport.dev

# OAuth Providers
GITHUB_CLIENT_ID=<github-client-id>
GITHUB_CLIENT_SECRET=<github-client-secret>
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>

# Tunnel Server
TUNNEL_SERVER_URL=https://tunnel.liveport.dev
TUNNEL_REGION=us-east

# Stripe (for billing)
STRIPE_SECRET_KEY=<stripe-secret>
STRIPE_WEBHOOK_SECRET=<webhook-secret>
```

---

## Benefits of This Architecture

1. **Managed Backend**: mech-storage handles all database operations, backups, and scaling
2. **Agent-Optimized**: Built specifically for agent-to-service communication patterns
3. **Type-Safe Auth**: Better Auth provides modern, secure authentication
4. **Flexible Storage**: File, NoSQL, SQL, and semantic search in one API
5. **High-Performance Ephemeral Layer**: Redis handles real-time state, heartbeats, and rate limiting
6. **Cost-Effective**: Pay only for storage and API calls, no server management
7. **Quick to Market**: Leverage existing services instead of building from scratch
8. **Optimal Data Flow**: Redis for hot data, mech-storage for persistent data

---

## Next Steps

1. Review mech-storage OpenAPI spec for detailed endpoint documentation
2. Set up Better Auth in the Next.js dashboard
3. Create mech-storage adapter for Better Auth database operations
4. Build bridge key management UI
5. Implement agent SDK with TypeScript
