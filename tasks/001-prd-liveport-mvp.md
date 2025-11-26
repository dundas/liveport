# PRD: LivePort MVP

## Document Info
- **Version**: 1.0
- **Created**: 2025-11-26
- **Status**: Draft
- **Author**: Discovery Research + PRD Generation

---

## 1. Problem Statement

### The Problem
AI coding agents (Claude, GPT-4, Cursor, etc.) cannot access applications running on a developer's localhost. When an agent needs to test, validate, or interact with a locally-running application, there's no secure, simple way to bridge this gap.

### Current Workarounds
1. **Deploy to staging** - Slow, expensive, breaks dev workflow
2. **Use ngrok manually** - Requires developer to stay active, no agent-specific features
3. **Publicly expose ports** - Security nightmare, not practical
4. **Screen sharing/screenshots** - Lose interactivity, clunky for automated testing

### The Opportunity
Developers increasingly use AI agents for testing, code review, and validation. These agents need ephemeral, secure access to localhost applications. No solution exists that is:
- **Agent-first** (designed for programmatic access)
- **Key-scoped** (time-limited, usage-limited, port-restricted)
- **Developer-controlled** (dashboard to manage and monitor)
- **SDK-enabled** (easy integration into agent workflows)

---

## 2. Target Users

### Primary User: The Developer
- Uses AI agents for testing and development
- Runs applications locally (React, Next.js, Django, Rails, etc.)
- Needs to give agents temporary access without security risks
- Values simplicity and CLI-first workflows

### Secondary User: The AI Agent
- Needs programmatic access to localhost via SDK
- Waits for tunnel availability
- Runs tests against the exposed endpoint
- Reports results back to developer

### User Personas

**Solo Developer (Emma)**
- Building a SaaS product
- Uses Cursor/Claude for pair programming
- Wants agents to validate UI changes before committing
- Budget-conscious, pays for what she uses

**Agency Developer (Marcus)**
- Works on multiple client projects
- Needs to demo local work to clients and agents
- Requires multiple concurrent tunnels
- Team collaboration features important

**AI Tool Builder (Priya)**
- Building AI testing pipelines
- Integrates agent testing into CI/CD
- Needs programmatic SDK access
- High volume, needs reliable uptime

---

## 3. Product Vision

**One-liner**: LivePort gives AI agents secure access to your localhost.

**Value Proposition**: Generate a bridge key, run the CLI, and any AI agent with that key can reach your local app. No deployment. No security risks. Pay only for what you use.

### Core User Flow

```
1. Developer logs into LivePort dashboard
2. Generates a bridge key (scoped: 6 hours, port 3000, 10 uses max)
3. Copies key: `lpk_a1b2c3d4e5f6...`
4. Runs CLI: `liveport connect 3000 --key lpk_a1b2c3d4e5f6`
5. CLI outputs: `✓ Tunnel active at https://xyz789.liveport.dev`
6. Shares key with AI agent (env var, config, or API)
7. Agent SDK waits for tunnel, receives URL
8. Agent runs tests against the URL
9. Developer sees requests in dashboard
10. Key expires or developer revokes → tunnel closes
```

---

## 4. MVP Scope

### In Scope (Must Have)

#### Dashboard (Web App)
- [ ] User authentication (email/password + GitHub OAuth)
- [ ] Bridge key generation with basic scoping:
  - Expiration time (1h, 6h, 24h)
  - Max uses (1, 10, 100, unlimited)
  - Port restriction (single port)
- [ ] Active tunnels list with:
  - Public URL
  - Local port
  - Connection time
  - Request count
- [ ] Key management (list, revoke)
- [ ] Basic usage display (requests, bandwidth)

#### CLI Client
- [ ] `liveport connect <port>` - Create tunnel
- [ ] `liveport connect <port> --key <key>` - Use specific bridge key
- [ ] `liveport status` - Show active tunnels
- [ ] `liveport disconnect` - Close tunnel
- [ ] Auto-reconnect on network drops
- [ ] Colored terminal output with connection status

#### Tunnel Server
- [ ] WebSocket connection from CLI
- [ ] HTTP/HTTPS proxy to localhost
- [ ] Bridge key validation
- [ ] Subdomain generation (random: `xyz789.liveport.dev`)
- [ ] TLS termination (Let's Encrypt via Cloudflare)
- [ ] Basic rate limiting (1000 req/min per key)

#### Agent SDK (TypeScript)
- [ ] `waitForTunnel({ timeout })` - Poll until tunnel ready
- [ ] `listTunnels()` - Get active tunnels for key
- [ ] `disconnect()` - Clean up connection
- [ ] Error handling with retries

#### Infrastructure
- [ ] Domain: `liveport.dev` (or similar)
- [ ] DNS via Cloudflare (wildcard `*.liveport.dev`)
- [ ] Tunnel server on Fly.io (single region: us-east)
- [ ] Database via mech-storage (PostgreSQL)
- [ ] Redis for rate limiting and heartbeats (Upstash)

### Out of Scope (Post-MVP)

- ❌ Python SDK (Phase 2)
- ❌ Custom subdomains (`myapp.liveport.dev`)
- ❌ Multi-region support
- ❌ Webhook notifications
- ❌ Request logging/inspection
- ❌ Team management
- ❌ Billing/payments (free during beta)
- ❌ IP allowlisting
- ❌ SSO/SAML
- ❌ Request replay
- ❌ Audit logs

---

## 5. User Stories

### Authentication

**US-1**: As a developer, I can sign up with my email and password so I can start using LivePort.
- Acceptance Criteria:
  - Email validation
  - Password minimum 8 characters
  - Email verification sent
  - Redirect to dashboard after verification

**US-2**: As a developer, I can sign up with GitHub OAuth so I can get started quickly.
- Acceptance Criteria:
  - "Continue with GitHub" button
  - GitHub OAuth flow
  - Automatic account creation
  - Redirect to dashboard

**US-3**: As a developer, I can log in and out of my account.
- Acceptance Criteria:
  - Email/password login
  - GitHub OAuth login
  - "Remember me" option
  - Logout clears session

### Bridge Key Management

**US-4**: As a developer, I can generate a bridge key so that agents can access my localhost.
- Acceptance Criteria:
  - Form with expiration dropdown (1h, 6h, 24h)
  - Form with max uses dropdown (1, 10, 100, unlimited)
  - Port restriction input (default: any)
  - Generate button creates key
  - Key displayed once with copy button
  - Warning: "This key will only be shown once"

**US-5**: As a developer, I can see all my bridge keys so I can manage them.
- Acceptance Criteria:
  - Table showing: key prefix (`lpk_a1b2...`), created date, expires, uses, status
  - Filter: active, expired, revoked
  - Sort by date

**US-6**: As a developer, I can revoke a bridge key immediately.
- Acceptance Criteria:
  - Revoke button on each key
  - Confirmation dialog
  - Key status changes to "revoked"
  - Any active tunnels using that key disconnect

### Tunnel Management

**US-7**: As a developer, I can see my active tunnels in the dashboard.
- Acceptance Criteria:
  - Real-time list of open tunnels
  - Show: public URL, local port, connected time, request count
  - Refresh every 5 seconds

**US-8**: As a developer, I can manually disconnect a tunnel from the dashboard.
- Acceptance Criteria:
  - Disconnect button on each tunnel
  - Confirmation dialog
  - Tunnel closes immediately
  - CLI client notified

### CLI Client

**US-9**: As a developer, I can install the LivePort CLI.
- Acceptance Criteria:
  - `npm install -g @liveport/cli`
  - Binary available as `liveport`
  - `liveport --version` shows version
  - `liveport --help` shows usage

**US-10**: As a developer, I can connect my localhost port to a public URL.
- Acceptance Criteria:
  - `liveport connect 3000 --key lpk_xxx`
  - Output: "✓ Tunnel active at https://xyz789.liveport.dev"
  - Tunnel stays open until Ctrl+C
  - Graceful shutdown on SIGTERM

**US-11**: As a developer, I see connection status in my terminal.
- Acceptance Criteria:
  - "Connecting..." spinner
  - "✓ Connected" success message
  - "⚠ Reconnecting..." on network drop
  - "✗ Disconnected" on close

**US-12**: As a developer, my tunnel auto-reconnects if my network drops.
- Acceptance Criteria:
  - Detect WebSocket disconnect
  - Retry with exponential backoff (1s, 2s, 4s, 8s, max 30s)
  - Resume same subdomain if possible
  - Show status in terminal

### Agent SDK

**US-13**: As an agent developer, I can wait for a tunnel to become available.
- Acceptance Criteria:
  - `await agent.waitForTunnel({ timeout: 30000 })`
  - Returns tunnel object with `url` property
  - Throws if timeout exceeded
  - Polls every 2 seconds

**US-14**: As an agent developer, I can list all active tunnels for my key.
- Acceptance Criteria:
  - `await agent.listTunnels()`
  - Returns array of tunnel objects
  - Each tunnel has: id, url, port, connectedAt

**US-15**: As an agent developer, I can disconnect and clean up.
- Acceptance Criteria:
  - `await agent.disconnect()`
  - Closes any open connections
  - Safe to call multiple times

---

## 6. Technical Requirements

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Dashboard | Next.js 14+ (App Router) | Modern React, SSR, great DX |
| Styling | Tailwind CSS | Rapid development, consistent |
| CLI | Node.js + Commander | Same language as SDK, cross-platform |
| Agent SDK | TypeScript | Type safety, good DX |
| Backend API | Node.js + TypeScript | Unified stack |
| Auth | Better Auth | Modern, type-safe, OAuth support |
| Database | PostgreSQL (via mech-storage) | Relational data, managed |
| Cache | Redis (Upstash) | Rate limiting, heartbeats |
| Tunnel Base | LocalTunnel fork (MIT) | Open source, permissive license |
| Hosting | Fly.io | WebSocket-friendly, global |
| DNS/CDN | Cloudflare | Free DDoS, wildcard DNS, SSL |

### Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                      Cloudflare                             │
│  DNS: *.liveport.dev → Fly.io                              │
│  SSL termination, DDoS protection, caching                  │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                      Fly.io                                 │
├────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Dashboard   │  │  API Server  │  │Tunnel Server │     │
│  │  (Next.js)   │  │  (Node.js)   │  │ (Node.js)    │     │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘     │
│                           │                  │             │
└───────────────────────────┼──────────────────┼─────────────┘
                            │                  │
                ┌───────────┴───────────┐      │
                │                       │      │
                ▼                       ▼      │
        ┌──────────────┐        ┌────────────┐ │
        │ mech-storage │        │   Redis    │ │
        │ (PostgreSQL) │        │  (Upstash) │ │
        └──────────────┘        └────────────┘ │
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │   CLI Client     │
                                    │ (Developer's PC) │
                                    └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │ Localhost:3000   │
                                    │ (Developer's App)│
                                    └──────────────────┘
```

### Database Schema (MVP)

```sql
-- Users (managed by Better Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bridge Keys
CREATE TABLE bridge_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(12) NOT NULL,  -- "lpk_a1b2c3d4"
  expires_at TIMESTAMP NOT NULL,
  max_uses INTEGER,  -- NULL = unlimited
  current_uses INTEGER DEFAULT 0,
  allowed_port INTEGER,  -- NULL = any
  status VARCHAR(20) DEFAULT 'active',  -- active, revoked, expired
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tunnels (active connections)
CREATE TABLE tunnels (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  bridge_key_id UUID REFERENCES bridge_keys(id) ON DELETE SET NULL,
  subdomain VARCHAR(20) UNIQUE NOT NULL,
  local_port INTEGER NOT NULL,
  public_url VARCHAR(255) NOT NULL,
  connected_at TIMESTAMP DEFAULT NOW(),
  disconnected_at TIMESTAMP,
  request_count INTEGER DEFAULT 0,
  bytes_transferred BIGINT DEFAULT 0
);
```

### API Endpoints

#### Auth (Better Auth handles these)
- `POST /api/auth/signup` - Email signup
- `POST /api/auth/login` - Email login
- `GET /api/auth/github` - GitHub OAuth
- `POST /api/auth/logout` - Logout

#### Dashboard API
- `GET /api/keys` - List user's bridge keys
- `POST /api/keys` - Generate new bridge key
- `DELETE /api/keys/:id` - Revoke bridge key
- `GET /api/tunnels` - List active tunnels
- `DELETE /api/tunnels/:id` - Disconnect tunnel

#### Agent API
- `GET /api/agent/tunnels/wait` - Wait for tunnel (long poll)
- `GET /api/agent/tunnels` - List tunnels for key

#### Tunnel Server
- `WS /tunnel/connect` - WebSocket connection from CLI

### Security Requirements

1. **Bridge Keys**
   - Generated with cryptographically secure random bytes (32 bytes)
   - Stored hashed (bcrypt, cost 12)
   - Shown only once at generation
   - Prefix `lpk_` for identification

2. **Rate Limiting**
   - 1000 requests/minute per bridge key
   - 10 key generation requests/hour per user
   - 5 login attempts per minute per IP

3. **TLS**
   - All traffic over HTTPS
   - TLS 1.2+ required
   - Auto-renewed via Cloudflare

4. **Authentication**
   - Sessions expire after 7 days
   - Secure, httpOnly cookies
   - CSRF protection

---

## 7. Success Metrics

### MVP Launch Goals (First 30 days)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Registered users | 100 | Database count |
| Active bridge keys created | 500 | Database count |
| Successful tunnel connections | 1,000 | Tunnel server logs |
| CLI downloads | 200 | npm download stats |
| Agent SDK downloads | 50 | npm download stats |
| Uptime | 99% | Monitoring alerts |

### Key Health Metrics

- **Time to First Tunnel**: < 5 minutes from signup
- **Tunnel Connection Success Rate**: > 99%
- **Average Tunnel Latency**: < 100ms
- **Dashboard Load Time**: < 2 seconds

---

## 8. Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| LocalTunnel fork has bugs | High | Medium | Start with minimal modifications, test thoroughly |
| Cloudflare rate limits | Medium | Low | Monitor usage, upgrade plan if needed |
| mech-storage API downtime | High | Low | Cache critical data in Redis, retry logic |
| DDoS attacks on tunnel endpoints | High | Medium | Cloudflare protection, per-key rate limits |
| Key leakage/abuse | High | Medium | Short expiration defaults, easy revocation, monitoring |
| WebSocket scaling issues | Medium | Medium | Start with single region, load test before launch |

---

## 9. Open Questions

1. **Pricing Model**: Should MVP be completely free, or introduce usage limits?
   - **Recommendation**: Free beta with soft limits (10 tunnels, 1GB bandwidth)

2. **Subdomain Persistence**: Should the same CLI instance get the same subdomain?
   - **Recommendation**: Random subdomains for MVP, custom subdomains post-MVP

3. **Key Format**: What prefix? `lpk_` vs `liveport_` vs `lb_`?
   - **Recommendation**: `lpk_` (short, memorable, easy to type)

4. **Request Logging**: Should MVP log any request data?
   - **Recommendation**: Count only (no headers/body), full logging post-MVP

5. **CLI Auth**: Should CLI require login, or only use bridge keys?
   - **Recommendation**: Bridge keys only for MVP, CLI login post-MVP

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Set up monorepo structure
- [ ] Configure mech-storage account and schema
- [ ] Set up Upstash Redis
- [ ] Implement Better Auth in Next.js
- [ ] Create basic dashboard layout

### Phase 2: Core Features (Week 2)
- [ ] Bridge key generation and management UI
- [ ] Key validation API endpoint
- [ ] Fork LocalTunnel, add key validation
- [ ] Deploy tunnel server to Fly.io
- [ ] Configure Cloudflare DNS

### Phase 3: CLI & SDK (Week 3)
- [ ] Build CLI with Commander
- [ ] Implement `connect`, `status`, `disconnect` commands
- [ ] Build TypeScript Agent SDK
- [ ] Publish to npm (`@liveport/cli`, `@liveport/agent-sdk`)

### Phase 4: Polish & Launch (Week 4)
- [ ] Active tunnels dashboard view
- [ ] Rate limiting implementation
- [ ] Auto-reconnect in CLI
- [ ] Error handling and edge cases
- [ ] Documentation and README
- [ ] Beta launch!

---

## Appendix A: Competitive Analysis

| Feature | LivePort (MVP) | ngrok | LocalTunnel | Cloudflare Tunnel |
|---------|---------------|-------|-------------|-------------------|
| Agent SDK | ✅ | ❌ | ❌ | ❌ |
| Scoped keys | ✅ | ⚠️ (limited) | ❌ | ⚠️ (tokens) |
| Usage-based pricing | ✅ | ⚠️ (plans) | Free | Free |
| Self-hostable | ⚠️ (post-MVP) | ❌ | ✅ | ❌ |
| Custom subdomains | ⚠️ (post-MVP) | ✅ ($8/mo) | ❌ | ✅ |
| Open source | ⚠️ (partial) | ❌ | ✅ | ❌ |

---

## Appendix B: Pricing Strategy (Post-MVP)

Based on discovery research, recommended pricing:

| Tier | Price | Includes |
|------|-------|----------|
| Free | $0 | 2 concurrent tunnels, 1GB/month |
| Usage | Pay-as-you-go | $1.50/domain + $0.05/GB |
| Pro | $19/month | 10 tunnels, 50GB, custom subdomains |
| Team | $99/month | Unlimited, team management, SSO |

---

## Appendix C: Key Terminology

- **Bridge Key**: A scoped, time-limited token that grants tunnel access
- **Tunnel**: An active connection between localhost and a public URL
- **Agent**: An AI system (Claude, GPT-4, etc.) that programmatically tests applications
- **CLI**: Command-line interface installed by developers
- **SDK**: Software development kit used by AI agents

---

*End of PRD*
