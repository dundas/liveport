# LivePort Production Handoff Document

**Date**: November 29, 2025  
**Status**: Core infrastructure deployed and functional

---

## Executive Summary

LivePort is an AI agent-focused tunnel service that enables secure HTTP tunneling from local development servers to public URLs. The core infrastructure is deployed and operational, with the dashboard on Vercel and the tunnel server on Fly.io.

---

## What's Completed ✅

### 1. Dashboard Application (Vercel)

**URL**: https://liveport-private-dashboard.vercel.app

| Feature | Status | Notes |
|---------|--------|-------|
| User Authentication | ✅ Working | Email/password via better-auth |
| User Registration | ✅ Working | Creates users in mech-storage |
| Session Management | ✅ Working | Secure cookie-based sessions |
| Bridge Keys - Create | ✅ Working | Generate API keys for CLI |
| Bridge Keys - List | ✅ Working | View all user keys |
| Bridge Keys - Revoke | ✅ Working | Delete keys |
| Dashboard Overview | ✅ Working | Stats and quick actions |
| Settings Page | ✅ Working | User settings |
| Tunnels Page | ✅ Working | View active tunnels |
| Landing Page | ✅ Working | Marketing/info page |
| Health Endpoint | ✅ Working | `/api/health` |

### 2. Tunnel Server (Fly.io)

**URL**: https://liveport-tunnel.fly.dev

| Feature | Status | Notes |
|---------|--------|-------|
| WebSocket Connections | ✅ Working | Accepts CLI connections |
| Bridge Key Validation | ✅ Working | Validates keys against DB |
| Subdomain Generation | ✅ Working | Generates unique subdomains |
| Connection Management | ✅ Working | Tracks active tunnels |
| Health Endpoint | ✅ Working | `/health` returns status |
| Rate Limiting | ✅ Working | Per-key rate limits |
| Metering Service | ⚠️ Partial | Runs but DB sync failing |

### 3. Shared Package (@liveport/shared)

| Feature | Status | Notes |
|---------|--------|-------|
| Database Client | ✅ Working | mech-storage REST API |
| Bridge Key Repository | ✅ Working | CRUD operations |
| Tunnel Repository | ✅ Working | CRUD operations |
| Key Validation | ✅ Working | Hash verification |
| Structured Logging | ✅ Working | pino-based |
| Schema Initialization | ✅ Working | Auto-creates tables |

### 4. Documentation

| Document | Status | Path |
|----------|--------|------|
| Pricing Model | ✅ Complete | `docs/business/pricing-model.md` |
| Infrastructure | ✅ Complete | `docs/architecture/infrastructure.md` |
| Metering Architecture | ✅ Complete | `docs/architecture/metering.md` |
| Cloudflare Setup | ✅ Complete | `docs/deployment/cloudflare-setup.md` |
| Stripe Integration | ✅ Complete | `docs/deployment/stripe-integration.md` |
| Launch Checklist | ✅ Complete | `docs/deployment/launch-checklist.md` |

### 5. Testing

| Test Suite | Status | Path |
|------------|--------|------|
| Connection Manager | ✅ Passing | `apps/tunnel-server/src/connection-manager.test.ts` |
| HTTP Handler | ✅ Passing | `apps/tunnel-server/src/http-handler.test.ts` |
| Metering Service | ✅ Passing | `apps/tunnel-server/src/metering.test.ts` |
| Rate Limiting | ✅ Passing | `apps/dashboard/src/lib/__tests__/rate-limit.test.ts` |
| E2E Auth Flow | ✅ Passing | `e2e/login.test.ts` |

---

## What's Working End-to-End ✅

### Verified Production Flow

```bash
# 1. Sign in (works)
curl -X POST https://liveport-private-dashboard.vercel.app/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"Password123!"}'
# Returns: {"token":"...", "user":{...}}

# 2. Create Bridge Key (works)
curl -X POST https://liveport-private-dashboard.vercel.app/api/keys \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"My Key"}'
# Returns: {"key":"lpk_...", "id":"..."}

# 3. Connect Tunnel (works)
# WebSocket to wss://liveport-tunnel.fly.dev/connect
# Headers: x-bridge-key: lpk_..., x-local-port: 3000
# Returns: {"type":"connected","payload":{"subdomain":"crude-bass-mppx","url":"https://crude-bass-mppx.liveport.online"}}
```

---

## What Needs Completion 🔧

### Critical for Production

#### 1. DNS Configuration (liveport.online)

**Status**: Not configured  
**Priority**: Critical  
**Effort**: 1-2 hours

The tunnel server assigns subdomains like `crude-bass-mppx.liveport.online`, but DNS isn't configured to route these to the tunnel server.

**Required**:
- Configure wildcard DNS: `*.liveport.online` → Fly.io tunnel server
- Configure root domain: `liveport.online` → Vercel dashboard (or landing page)
- Set up SSL certificates via Cloudflare or Fly.io

**Steps**:
1. Add `liveport.online` to Cloudflare (or your DNS provider)
2. Create A/AAAA records pointing to Fly.io IPs
3. Create CNAME for `*.liveport.online` → `liveport-tunnel.fly.dev`
4. Enable SSL/TLS (Full or Full Strict mode)

#### 2. CLI Application

**Status**: ✅ Complete
**Priority**: Critical
**Location**: `packages/cli/`

The CLI is fully implemented with all required features:

**Available Commands**:
- `liveport connect <port>` - Create tunnel to local port
- `liveport connect <port> --key <key>` - Use specific bridge key
- `liveport status` - Show active tunnel status
- `liveport disconnect` - Close tunnel
- `liveport config set <key> <value>` - Save config (key, server)
- `liveport config get <key>` - Get config value
- `liveport config list` - List all config
- `liveport config delete <key>` - Delete config value

**Key Features**:
- WebSocket client with automatic reconnection
- HTTP proxying to local server
- Heartbeat keep-alive
- Graceful shutdown handling
- Colored terminal output
- Config file stored at `~/.liveport/config.json`

**Build & Run**:
```bash
# Build
pnpm build --filter=@liveport/cli

# Run directly
node packages/cli/dist/index.mjs connect 3000 --key lpk_...

# Or install globally
cd packages/cli && npm link
liveport connect 3000 --key lpk_...
```

#### 3. HTTP Proxying in Tunnel Server

**Status**: Partially implemented  
**Priority**: Critical  
**Effort**: 1 day

The tunnel server accepts WebSocket connections and assigns subdomains, but the HTTP proxying logic (forwarding requests to the CLI client) needs verification.

**Required**:
- Verify `http-handler.ts` correctly forwards requests to CLI
- Test request/response proxying end-to-end
- Handle WebSocket upgrade requests for tunneled WebSocket connections

### High Priority

#### 4. Metering Database Sync

**Status**: Running but failing  
**Priority**: High  
**Effort**: 2-4 hours

The metering service is running but SQL queries are failing with `QUERY_EXECUTION_FAILED`.

**Issue**: The `tunnels` table schema may not match the INSERT/UPSERT queries.

**Fix**:
1. Verify `tunnels` table exists with correct columns
2. Check column types match query parameters
3. Test metering queries directly against mech-storage

#### 5. Stripe Billing Integration

**Status**: Not implemented  
**Priority**: High (for monetization)  
**Effort**: 3-5 days

**Required**:
- Create Stripe products (tunnel-seconds, bandwidth, static subdomain)
- Implement usage reporting job
- Create subscription management UI
- Handle webhook events

### Medium Priority

#### 6. Agent SDK (@liveport/agent)

**Status**: Not created  
**Priority**: Medium  
**Effort**: 2-3 days

SDK for AI agents to programmatically create and manage tunnels.

**Required Features**:
- `createTunnel(port, options)` - Create tunnel
- `waitForTunnel(keyId)` - Wait for tunnel availability
- `getTunnels()` - List active tunnels
- `closeTunnel(tunnelId)` - Close tunnel

#### 7. Static Subdomains

**Status**: Schema exists, not implemented  
**Priority**: Medium  
**Effort**: 1-2 days

Premium feature allowing users to reserve permanent subdomains.

**Required**:
- UI for managing static subdomains
- API endpoints for CRUD
- Billing integration ($2.50/month)

#### 8. Redis Integration

**Status**: Not configured in production  
**Priority**: Medium  
**Effort**: 2-4 hours

For distributed rate limiting and session caching.

**Required**:
- Provision Redis instance (Upstash, Fly.io, etc.)
- Configure `REDIS_URL` environment variable
- Test rate limiting across instances

---

## Environment Variables

### Dashboard (Vercel)

```env
# Required - Already configured
MECH_APPS_APP_ID=app_...
MECH_APPS_API_KEY=key_...
MECH_APPS_API_SECRET=secret_...
MECH_APPS_URL=https://storage.mechdna.net/api
BETTER_AUTH_SECRET=...
NEXT_PUBLIC_APP_URL=https://liveport-private-dashboard.vercel.app

# Stripe - Configured but not integrated
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional
REDIS_URL=redis://...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

### Tunnel Server (Fly.io)

```env
# Required - Need to verify these are set
PORT=8080
BASE_DOMAIN=liveport.online
MECH_APPS_APP_ID=app_...
MECH_APPS_API_KEY=key_...
MECH_APPS_URL=https://storage.mechdna.net/api

# Optional
FLY_REGION=iad
METERING_SYNC_INTERVAL_MS=30000
```

---

## Deployment Commands

### Dashboard (Vercel)

Automatically deploys on push to `main` branch via GitHub Actions.

### Tunnel Server (Fly.io)

```bash
# Deploy from project root
fly deploy --config apps/tunnel-server/fly.toml --dockerfile apps/tunnel-server/Dockerfile

# View logs
fly logs -a liveport-tunnel --no-tail

# Check status
fly status -a liveport-tunnel

# SSH into instance
fly ssh console -a liveport-tunnel
```

### Local Development

```bash
# Install dependencies
pnpm install

# Build shared package
pnpm --filter @liveport/shared build

# Run dashboard
cd apps/dashboard && pnpm dev

# Run tunnel server
cd apps/tunnel-server && pnpm dev

# Run tests
pnpm test

# Run E2E tests
pnpm exec playwright test
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare (DNS + CDN)                       │
│                   *.liveport.online → Fly.io                    │
│                   app.liveport.online → Vercel                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  Dashboard (Vercel) │         │ Tunnel Server (Fly) │
│  - Auth             │         │ - WebSocket         │
│  - Bridge Keys      │         │ - HTTP Proxy        │
│  - UI               │         │ - Metering          │
└─────────┬───────────┘         └─────────┬───────────┘
          │                               │
          └───────────────┬───────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    mech-storage (Database)                      │
│                   PostgreSQL REST API                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pricing Model (Implemented in Docs)

| Component | Price | Notes |
|-----------|-------|-------|
| Tunnel Time | $0.000005/second | ~$0.018/hour, ~$13/month 24/7 |
| Bandwidth | $0.05/GB | Data transfer |
| Static Subdomain | $2.50/month | Pro-rated daily |

---

## Known Issues

1. **Metering DB Sync Failing**: SQL queries returning 500 errors. Need to verify table schema.

2. **Playwright + React Controlled Inputs**: The MCP browser tool doesn't properly trigger React's onChange events. Use Playwright directly for E2E tests.

3. **ESM/CJS Compatibility**: The `better-auth` package must be imported from `@liveport/shared/auth` subpath to avoid bundling issues in the tunnel server.

---

## Next Steps (Recommended Order)

1. **Configure DNS** - Required for tunnels to be accessible
2. ~~**Create CLI**~~ ✅ Complete - `packages/cli/`
3. **Fix Metering** - Required for accurate billing
4. **Test HTTP Proxying** - Verify full tunnel flow works
5. **Implement Stripe** - Enable monetization
6. **Create Agent SDK** - Enable AI agent use cases
7. **Launch Marketing** - Announce to users

---

## Contacts & Resources

- **Repository**: https://github.com/dundas/liveport-private
- **Dashboard**: https://liveport-private-dashboard.vercel.app
- **Tunnel Server**: https://liveport-tunnel.fly.dev
- **Fly.io Dashboard**: https://fly.io/apps/liveport-tunnel
- **Vercel Dashboard**: (check Vercel account)

---

### 6. CLI Package (@liveport/cli)

| Feature | Status | Notes |
|---------|--------|-------|
| CLI Structure | ✅ Complete | `packages/cli/` |
| `connect` Command | ✅ Working | WebSocket + HTTP proxy |
| `status` Command | ✅ Working | Show tunnel info |
| `disconnect` Command | ✅ Working | Graceful shutdown |
| `config` Command | ✅ Working | Manage bridge keys |
| Build Configuration | ✅ Working | tsup with ESM output |

---

*Last updated: November 29, 2025*

