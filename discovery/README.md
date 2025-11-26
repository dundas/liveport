# LivePort Discovery Documentation

This directory contains research and architectural decisions for LivePort (Agent Bridge) - a developer tool enabling remote AI agents to test applications running on localhost through secure, temporary tunnels.

## Documents

### 1. [ngrok_research.md](./ngrok_research.md)
Complete product specification and market research:
- **Product Vision**: Agent testing platform with key-based authentication
- **User Flows**: Developer setup and agent testing workflows
- **Technical Stack**: Cloudflare + Fly.io infrastructure
- **Open Source Options**: Analysis of LocalTunnel, Tunnelmole, Bore, Zrok
- **Licensing**: Recommendation to use LocalTunnel (MIT)
- **Infrastructure**: Cloudflare (DNS, SSL, DDoS) + Fly.io (compute, tunnels)

**Recommendation**: Fork LocalTunnel, build agent-specific features on top

### 2. [backend_architecture.md](./backend_architecture.md) ⭐ **Latest**
Backend architecture using modern managed services:

#### Data Layer
- **mech-storage** ([OpenAPI](https://storage.mechdna.net/api/openapi.json))
  - PostgreSQL: Users, bridge keys, tunnel history, billing
  - NoSQL: Flexible document storage
  - File Storage (R2): Test artifacts, screenshots
  - Semantic Search: Log analysis

- **Redis** (Ephemeral/Real-time)
  - Tunnel heartbeats (every 5-10 seconds)
  - Rate limiting (1000 req/min per key)
  - Active connection tracking
  - Real-time pub/sub events
  - Session caching
  - Metrics aggregation → flush to mech-storage every 5 min

#### Authentication
- **Better Auth**: Email/password + OAuth (GitHub, Google)
- **Bridge Keys**: Time-limited, scoped access for agents
- **API Keys**: Developer access to dashboard/API

#### Agent API Endpoints
```
GET  /api/agent/tunnels/wait       # Wait for tunnel to be ready
GET  /api/agent/tunnels            # List active tunnels
POST /api/agent/tunnels/:id/results # Report test results
GET  /api/agent/tunnels/:id/logs   # Get request logs
```

### 3. [model.md](./model.md)
Pricing and business model:
- **Usage-Based Pricing**: $1.50/domain + $0.05/GB
- **No Base Fee**: Pay only for what you use
- **Competitive Analysis**: 50% cheaper than ngrok
- **Margin Analysis**: 85%+ margin with no payroll
- **Financial Projections**: Year 1 growth scenarios

## Quick Start

### Backend Stack
```
Frontend:    Next.js 14+ (App Router) + Tailwind
CLI:         Node.js + commander + WebSocket
Backend API: Node.js (TypeScript) + Better Auth
Data:        mech-storage (PostgreSQL, NoSQL, Files)
Cache:       Redis (Upstash/Railway)
Auth:        Better Auth (email + OAuth)
Tunnel:      LocalTunnel fork (MIT licensed)
Infra:       Cloudflare (DNS, SSL, DDoS) + Fly.io (compute)
```

### Data Flow
```
High-frequency (Redis):
└─ Tunnel heartbeats, rate limiting, active state, pub/sub

Persistent (mech-storage):
└─ User accounts, bridge keys, history, logs, billing

Agent Testing Flow:
1. Developer generates bridge key in dashboard
2. CLI client connects with key, creates tunnel
3. Agent SDK waits for tunnel via /api/agent/tunnels/wait
4. Agent runs tests against tunnel URL
5. Agent reports results via /api/agent/tunnels/:id/results
6. Metrics aggregated in Redis, flushed to mech-storage
```

## Implementation Phases

### Phase 1: Core Backend (Week 1-2)
- Set up mech-storage + Redis
- Better Auth with email/password
- Bridge key generation
- PostgreSQL schema via mech-storage

### Phase 2: Agent API (Week 3-4)
- Agent API endpoints
- Bridge key validation with Redis caching
- TypeScript SDK
- Tunnel heartbeat system

### Phase 3: Advanced (Week 5-6)
- Webhook notifications
- Request logging
- Usage analytics
- Python SDK
- Real-time dashboard (Redis pub/sub)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Tunnel Base** | LocalTunnel (MIT) | Open source, permissive license, Node.js |
| **Backend** | mech-storage | Agent-optimized, managed, multi-modal storage |
| **Cache** | Redis | Real-time state, heartbeats, rate limiting |
| **Auth** | Better Auth | Modern, type-safe, OAuth support |
| **Infrastructure** | Cloudflare + Fly.io | Cost-effective, global, DDoS protection |
| **Pricing** | Usage-based | $1.50/domain + $0.05/GB, no base fee |

## Environment Setup

```bash
# mech-storage
MECH_STORAGE_API_KEY=<key>
MECH_STORAGE_APP_ID=liveport-prod

# Redis
REDIS_URL=redis://:<password>@<host>:6379

# Better Auth
BETTER_AUTH_SECRET=<secret>
BETTER_AUTH_URL=https://liveport.dev

# OAuth
GITHUB_CLIENT_ID=<id>
GITHUB_CLIENT_SECRET=<secret>
GOOGLE_CLIENT_ID=<id>
GOOGLE_CLIENT_SECRET=<secret>

# Stripe
STRIPE_SECRET_KEY=<key>
STRIPE_WEBHOOK_SECRET=<secret>
```

## Next Steps

1. ✅ Install agentbootup for project organization
2. ✅ Define backend architecture (mech-storage + Redis)
3. ⏭️ Set up mech-storage account and create schema
4. ⏭️ Set up Redis (Upstash for serverless)
5. ⏭️ Implement Better Auth in Next.js dashboard
6. ⏭️ Build bridge key management UI
7. ⏭️ Fork LocalTunnel and customize for agents
8. ⏭️ Build TypeScript Agent SDK

## Resources

- [mech-storage OpenAPI](https://storage.mechdna.net/api/openapi.json)
- [Better Auth Docs](https://www.better-auth.com/)
- [LocalTunnel GitHub](https://github.com/localtunnel/localtunnel)
- [Upstash Redis](https://upstash.com/)
- [Fly.io Docs](https://fly.io/docs/)
- [Cloudflare Docs](https://developers.cloudflare.com/)

---

**Last Updated**: 2025-11-26
**Status**: Architecture defined, ready for implementation
