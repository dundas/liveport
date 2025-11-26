# Agent Bridge MVP Specification

## Overview
A developer tool that enables remote AI agents to test applications running on localhost through secure, temporary tunnels with key-based authentication.

## Core Components

### 1. Frontend Dashboard (Web Application)

**User Authentication & Management**
- Email/password or OAuth login (GitHub, Google)
- User dashboard with tunnel management interface
- API key generation and management
- Usage analytics (active tunnels, bandwidth, test runs)

**Key Generation Interface**
- Generate new bridge keys with configuration:
  - **Expiration time**: 1 hour, 6 hours, 24 hours, 7 days, 30 days, or custom
  - **Access scope**: Single-use, limited uses (e.g., 10 connections), or unlimited
  - **Allowed ports**: Specific port or range (e.g., 3000-3010)
  - **IP allowlist** (optional): Restrict which agent IPs can connect
  - **Webhook URL** (optional): Notify when tunnel opens/closes
- Display generated key with copy button
- Show key metadata: created date, expiration, usage count, status
- Ability to revoke keys immediately
- List all active and past keys

**Active Tunnels View**
- Real-time list of open tunnels
- For each tunnel show:
  - Public URL (e.g., `https://abc123.agentbridge.dev`)
  - Local port being forwarded
  - Time connected
  - Bandwidth used
  - Request count
  - Associated key
- Manual disconnect button
- Request inspection logs (HTTP headers, methods, response codes)

**Billing & Limits (Tiered)**
- **Free Tier**: 
  - 2 concurrent tunnels
  - 1GB bandwidth/month
  - Keys expire max 24 hours
  - Request logs retained 24 hours
- **Pro Tier**: 
  - 10 concurrent tunnels
  - 50GB bandwidth/month
  - Keys expire max 30 days
  - Custom subdomains
  - Request logs retained 30 days
- **Team Tier**: 
  - Unlimited tunnels
  - Unlimited bandwidth
  - Team member management
  - Audit logs
  - SLA guarantees

***

### 2. CLI Client (Developer's Machine)

**Installation**
```bash
npm install -g agentbridge
# or
curl -sSL https://install.agentbridge.dev | sh
# or  
brew install agentbridge
```

**Configuration**
```bash
# First-time setup
agentbridge auth login
# Opens browser to authenticate and stores token locally

# Or manual key setup
agentbridge config set-key <YOUR_API_KEY>
```

**Usage Commands**
```bash
# Basic usage - expose local port
agentbridge connect 3000
# Output: ✓ Tunnel active at https://xyz789.agentbridge.dev

# With custom key and settings
agentbridge connect 3000 \
  --key <BRIDGE_KEY> \
  --subdomain my-app \
  --region us-east

# Inspect mode (see requests in terminal)
agentbridge connect 3000 --inspect

# Status check
agentbridge status
# Shows: active tunnels, bandwidth used, key expiration

# List all tunnels
agentbridge list

# Disconnect specific tunnel
agentbridge disconnect <tunnel-id>

# Disconnect all
agentbridge disconnect --all
```

**Configuration File** (`~/.agentbridge/config.json`)
```json
{
  "auth_token": "usr_xxxxxxxxxxxxx",
  "default_region": "us-east",
  "default_subdomain": "myapp",
  "auto_reconnect": true,
  "log_level": "info"
}
```

**Key Features**
- Automatic reconnection on network drops
- TLS/HTTPS by default
- Request/response logging to terminal (optional)
- Bandwidth throttling (respects tier limits)
- Health check endpoint
- Graceful shutdown (SIGTERM handling)

***

### 3. Bridge Server (Cloud Infrastructure)

**Architecture Components**

**Tunnel Server** (Go or Rust)
- WebSocket or gRPC connection from CLI client
- HTTP/HTTPS endpoint routing
- Load balancing across regions (US-East, US-West, EU-West)
- TLS termination with auto-renewed Let's Encrypt certs
- Connection pooling and multiplexing

**Control Plane API** (Node.js/TypeScript or Go)
```
POST   /api/v1/keys              - Generate new bridge key
GET    /api/v1/keys              - List all keys
GET    /api/v1/keys/:id          - Get key details
DELETE /api/v1/keys/:id          - Revoke key
GET    /api/v1/tunnels           - List active tunnels
DELETE /api/v1/tunnels/:id       - Close tunnel
GET    /api/v1/usage             - Get usage stats
POST   /api/v1/tunnels/:id/logs  - Get request logs
```

**Database Schema** (PostgreSQL)
```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  auth_provider VARCHAR(50),
  tier VARCHAR(20) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bridge Keys
CREATE TABLE bridge_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  key_hash VARCHAR(255) NOT NULL, -- bcrypt hash
  key_prefix VARCHAR(20), -- for display (e.g., "abk_1234...")
  expires_at TIMESTAMP,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  allowed_ports INTEGER[],
  ip_allowlist VARCHAR(45)[],
  webhook_url VARCHAR(500),
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Active Tunnels
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

-- Request Logs (optional, could use ClickHouse for scale)
CREATE TABLE request_logs (
  id UUID PRIMARY KEY,
  tunnel_id UUID REFERENCES tunnels(id),
  method VARCHAR(10),
  path TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

**Key Validation Flow**
1. CLI client sends bridge key on connection
2. Server validates:
   - Key exists and not revoked
   - Key not expired (`expires_at > NOW()`)
   - Uses within limit (`current_uses < max_uses`)
   - Port allowed (`local_port IN allowed_ports OR allowed_ports IS NULL`)
   - IP allowed (`client_ip IN ip_allowlist OR ip_allowlist IS NULL`)
3. Increment `current_uses`
4. Create tunnel record
5. Assign subdomain and return public URL
6. Trigger webhook if configured

**Rate Limiting**
- Per-key: max 1000 requests/minute
- Per-user: based on tier
- Global: prevent DDoS

***

### 4. Agent Integration SDK

**Purpose**: Allow AI testing agents to easily consume bridge keys and connect to tunneled apps

**JavaScript/TypeScript SDK**
```typescript
import { AgentBridge } from '@agentbridge/sdk';

const bridge = new AgentBridge({
  key: process.env.AGENTBRIDGE_KEY
});

// Wait for tunnel to be ready
const tunnel = await bridge.waitForTunnel({
  timeout: 30000 // 30 seconds
});

console.log(`App available at: ${tunnel.url}`);

// Run tests against tunnel.url
await runE2ETests(tunnel.url);

// Disconnect when done
await bridge.disconnect();
```

**Python SDK**
```python
from agentbridge import AgentBridge

bridge = AgentBridge(key=os.environ['AGENTBRIDGE_KEY'])

# Wait for tunnel
tunnel = bridge.wait_for_tunnel(timeout=30)

print(f"App available at: {tunnel.url}")

# Run tests
run_tests(tunnel.url)

# Cleanup
bridge.disconnect()
```

**REST API Alternative** (for any language)
```bash
# Agent polls for active tunnel
GET https://api.agentbridge.dev/v1/tunnels?key=<BRIDGE_KEY>

Response:
{
  "tunnels": [{
    "id": "tun_abc123",
    "url": "https://xyz789.agentbridge.dev",
    "status": "active",
    "port": 3000
  }]
}
```

***

## User Flow: Complete Journey

### Developer Setup Flow

1. **Sign up** at `app.agentbridge.dev`
2. **Generate bridge key** from dashboard:
   - Set expiration: 6 hours
   - Set max uses: 10 connections
   - Set allowed ports: 3000
   - Copy key: `abk_1a2b3c4d5e6f7g8h9i0j`
3. **Install CLI**: `npm install -g agentbridge`
4. **Start tunnel**: `agentbridge connect 3000 --key abk_1a2b3c4d5e6f7g8h9i0j`
5. **Share key** with testing agent or CI/CD pipeline
6. **Monitor** requests in dashboard
7. **Disconnect** when done or let it auto-expire

### Agent Testing Flow

1. **Receive bridge key** from developer (via env var, config, or API)
2. **Install SDK**: `npm install @agentbridge/sdk`
3. **Wait for tunnel**:
   ```javascript
   const tunnel = await bridge.waitForTunnel();
   ```
4. **Run tests** against `tunnel.url`
5. **Report results** back to developer
6. **Auto-disconnect** on completion

***

## Technical Stack Recommendations

**Frontend Dashboard**
- Next.js 14+ (App Router)
- Tailwind CSS (matches your design system preference)
- React Query for data fetching
- Recharts for usage graphs

**CLI Client**
- Node.js with `commander` for CLI framework
- WebSocket client for tunnel connection
- `chalk` for colored terminal output
- `ora` for loading spinners

**Backend Services** ⭐ **UPDATED - See backend_architecture.md**
- **Backend API**: [mech-storage](https://storage.mechdna.net/api/openapi.json) - Provides file storage, NoSQL, PostgreSQL, and semantic search
- **Authentication**: Better Auth - Modern, type-safe auth with OAuth support
- **Tunnel Server**: Go (performance) or Rust (safety)
- **API Server**: Node.js (TypeScript) with Better Auth + mech-storage adapter
- **Database**: PostgreSQL via mech-storage API (managed, agent-optimized)
- **Cache**: Redis for rate limiting and session management (or mech-storage NoSQL)
- **Message Queue**: For webhook delivery (BullMQ/Redis)

**Infrastructure**
- **Hosting**: Fly.io (globally distributed, WebSocket-friendly)
- **DNS**: Cloudflare (for wildcard subdomain routing `*.agentbridge.dev`)
- **Monitoring**: Sentry for errors, Grafana for metrics
- **Logging**: Better Stack or Axiom

***

## Security Considerations

1. **Key Security**
   - Keys are hashed (bcrypt) in database
   - Only show full key once at generation
   - Rate limit key validation attempts
   - Automatic revocation on suspicious activity

2. **Network Security**
   - All traffic over TLS 1.3
   - Optional IP allowlisting per key
   - DDoS protection via Cloudflare
   - Automatic tunnel timeout (max 24hrs for free tier)

3. **Data Privacy**
   - Request logs encrypted at rest
   - Automatic log deletion per retention policy
   - No payload logging by default (headers only)
   - GDPR-compliant data deletion

4. **Access Control**
   - API keys separate from bridge keys
   - Scoped permissions (read-only API keys available)
   - Team member role-based access (Team tier)

***

## MVP Feature Priority

### Phase 1 (Week 1-2): Core Tunnel
- [x] User authentication (email/password)
- [x] Basic key generation (expiration + max uses)
- [x] CLI client with single command (`connect <port>`)
- [x] Tunnel server (basic WebSocket forwarding)
- [x] Simple dashboard showing active tunnels

### Phase 2 (Week 3-4): Agent Integration
- [x] JavaScript/TypeScript SDK
- [x] Python SDK
- [x] Key validation with scopes
- [x] Request logging and inspection
- [x] Usage analytics

### Phase 3 (Week 5-6): Polish & Scale
- [x] Multi-region support
- [x] Custom subdomains (Pro tier)
- [x] Webhook notifications
- [x] Team management
- [x] Billing integration (Stripe)

***

## Pricing Model

**Free Tier**: $0/month
- 2 concurrent tunnels
- 1GB bandwidth/month
- 24hr max key expiration
- Community support

**Pro Tier**: $19/month
- 10 concurrent tunnels
- 50GB bandwidth/month
- 30-day max key expiration
- Custom subdomains
- Email support
- Request logs (30 days)

**Team Tier**: $99/month
- Unlimited tunnels
- Unlimited bandwidth
- Team management (10 members)
- SSO (SAML)
- Priority support
- Audit logs
- SLA (99.9% uptime)

**Enterprise**: Custom pricing
- Self-hosted option
- Custom regions
- Dedicated support
- Custom contracts

***

Does this spec align with your vision? I can dive deeper into any component - particularly interested in how you're thinking about the agent testing workflow and what languages/frameworks your target users are working with.


Excellent question! Yes, there are several mature open-source projects you can leverage to accelerate your go-to-market. Here's a breakdown ranked by fit for your use case:

***

## Top Candidates to Fork/Extend

### 1. **Tunnelmole** ⭐ BEST FIT

**GitHub**: https://github.com/amalshaji/tunnelmole  
**License**: MIT (client) + AGPL (server)  
**Language**: JavaScript/TypeScript + Node.js

**Why it's ideal for you:**
- ✅ **Fully open source** (client AND server)
- ✅ **Already has NPM integration** - agents can use it as a library (`npm install tunnelmole`)
- ✅ **Self-hostable** - you own the infrastructure
- ✅ **Simple architecture** - easier to understand and modify
- ✅ **Active maintenance** - recent updates (2025)
- ✅ **Node.js native** - matches your tech stack
- ✅ **Already does key-based auth**
- ✅ **Can easily add agent-specific features**

**What you'd build on top:**
- Custom bridge key scoping (expiration, max uses, IP allowlist)
- Dashboard for agent testing use cases
- SDK for AI agents (agents can receive key and wait for tunnel)
- Webhook notifications for test orchestration
- Usage analytics and billing

**Quick start fork:**
```bash
git clone https://github.com/amalshaji/tunnelmole.git
npm install
npm run build
# Server running, customize from here
```

**Estimated effort**: 4-6 weeks to production with agent features

***

### 2. **LocalTunnel** ⭐ ALSO STRONG

**GitHub**: 
- Client: https://github.com/localtunnel/localtunnel
- Server: https://github.com/localtunnel/server

**License**: MIT  
**Language**: Node.js/JavaScript

**Why it's good:**
- ✅ **Mature & battle-tested** (11+ years)
- ✅ **MIT licensed** (very permissive)
- ✅ **Official server code available** - most tunneling projects don't have this
- ✅ **Can be self-hosted**
- ✅ **Simple, understandable codebase**
- ✅ **Existing Node.js API for programmatic use**

**Downsides:**
- ❌ Less auth flexibility (was designed for simple use)
- ❌ Harder to add key scoping without major refactor
- ❌ Less active development than Tunnelmole

**Would need to add:**
- Bridge key authentication system
- Key scoping (expiration, max uses)
- Agent-specific SDK
- Dashboard
- Webhooks

**Estimated effort**: 6-8 weeks (more refactoring needed than Tunnelmole)

***

### 3. **Bore** ⭐ LIGHTWEIGHT ALTERNATIVE

**GitHub**: https://github.com/jkuri/bore  
**License**: MIT  
**Language**: Rust (client & server)

**Why consider it:**
- ✅ **Very lightweight & fast** (Rust-based)
- ✅ **MIT licensed**
- ✅ **Simple, clean codebase**
- ✅ **SSH-based tunneling** (different approach, interesting)

**Downsides:**
- ❌ Rust (not your primary tech stack)
- ❌ Less feature-rich than Tunnelmole/LocalTunnel
- ❌ Would require more from-scratch work

**Estimated effort**: 8-10 weeks (less out-of-box features)

***

### 4. **Zrok** (OpenZiti-based)

**GitHub**: https://github.com/openziti/zrok  
**License**: Apache 2.0  
**Language**: Go

**Why it's interesting:**
- ✅ **Built on zero-trust networking** (OpenZiti) - more secure
- ✅ **Reserved shares** feature (static URLs!)
- ✅ **Managed service + self-hosted options**

**Downsides:**
- ❌ More complex architecture (harder to understand/modify)
- ❌ Go (not your primary stack)
- ❌ Heavier dependencies

**Estimated effort**: 10-12 weeks (steeper learning curve)

***

## My Recommendation: Tunnelmole + Custom Extensions

Here's why **Tunnelmole is your best bet**:

1. **Already has the core tunneling** - just works
2. **JavaScript/Node.js stack** - matches your tech
3. **Clean, hackable codebase** - easier than LocalTunnel to modify
4. **Active community** - recent activity
5. **NPM integration ready** - agents can use programmatically

### Your MVP Build Plan

**Week 1-2: Fork & Setup**
```bash
# Fork tunnelmole
git clone https://github.com/YOUR_ORG/agentbridge.git
cd agentbridge

# Rename project in package.json, docs, etc.
# Update branding from "tunnelmole" to "agentbridge"
```

**Week 2-3: Add Authentication Layer**
```typescript
// Extend tunnelmole's server to support bridge keys
// Add bridge_keys table to track:
// - key_hash, expires_at, max_uses, allowed_ports, ip_allowlist

// Validate key before allowing tunnel creation
async function validateBridgeKey(key: string, clientIp: string) {
  const keyRecord = await db.bridgeKeys.findOne({ key_hash: hash(key) });
  
  // Check: not expired, not revoked, uses remaining, IP allowed
  if (keyRecord && keyRecord.expires_at > now && keyRecord.current_uses < keyRecord.max_uses) {
    return true;
  }
  return false;
}
```

**Week 3-4: Add Dashboard**
- Use the Tunnelmole UI as base (or build in Next.js)
- Add key generation/management
- Add tunnel monitoring

**Week 4-5: Create Agent SDK**
```typescript
// @agentbridge/sdk
import { AgentBridge } from '@agentbridge/sdk';

const bridge = new AgentBridge({
  key: process.env.AGENTBRIDGE_KEY
});

const tunnel = await bridge.waitForTunnel({ timeout: 30000 });
// Agent now has tunnel.url to test against
```

**Week 5-6: Deploy & Launch**
- Deploy server to Fly.io or Railway
- Setup database (PostgreSQL)
- Configure Cloudflare DNS for wildcard subdomains
- Basic billing (Stripe integration)

***

## Code Reuse Comparison Table

| Feature | Tunnelmole | LocalTunnel | Bore | Zrok |
|---------|-----------|-----------|------|------|
| **Tunneling Core** | ✅ ✅ | ✅ ✅ | ✅ ✅ | ✅ ✅ |
| **Auth System** | ⚠️ Basic | ❌ None | ❌ None | ✅ Good |
| **Self-Hosting** | ✅ ✅ | ✅ ✅ | ✅ ✅ | ✅ ✅ |
| **SDK/API** | ✅ ✅ | ✅ Good | ❌ CLI only | ⚠️ Complex |
| **Your Stack Match** | ✅ ✅ | ✅ ✅ | ❌ Rust | ❌ Go |
| **Code Simplicity** | ✅ Clean | ⚠️ Medium | ✅ Clean | ❌ Complex |
| **Estimated Effort** | 4-6 wks | 6-8 wks | 8-10 wks | 10-12 wks |

***

## Quick Proof of Concept (2-3 days)

Want to validate this approach quickly?

```bash
# 1. Clone Tunnelmole
git clone https://github.com/amalshaji/tunnelmole.git
cd tunnelmole

# 2. Run server locally
npm install
npm run dev

# 3. Test with client
npm install -g tunnelmole
tunnelmole --port 3000

# You now have a working tunnel in <30 minutes
# Then you just add your custom features on top
```

***

## What NOT to Do

❌ **Don't build from scratch** - 16+ weeks vs 4-6 weeks  
❌ **Don't use ngrok's closed-source client as reference** - legal issues  
❌ **Don't ignore the AGPL license** - know what it means (if you modify Tunnelmole server, derivatives must be open source, but your SaaS is fine)  
❌ **Don't pick Bore/Zrok unless you love Rust/Go** - stick with JavaScript for speed

***

## My Specific Recommendation

**Fork Tunnelmole, add:**

1. Bridge key authentication (extends existing auth)
2. Agent-specific SDK wrapper (thin layer over existing client)
3. Dashboard for key management (build fresh in Next.js)
4. Webhook notifications (add to server)
5. Usage analytics (add to control plane)

**Timeline: 4-6 weeks to MVP with agent testing support**

Want me to outline the specific code changes you'd make to Tunnelmole to add agent bridge key authentication? I can show you exactly which files to modify and what to add.

[1](https://github.com/localtunnel/localtunnel)
[2](https://dev.to/robbiecahill/tunnelmole-the-open-source-ngrok-alternative-developers-need-4a0c)
[3](https://github.com/jkuri/bore)
[4](https://softwareengineeringstandard.com/2025/06/22/ngrok-alternative/)
[5](https://www.browserstack.com/docs/live/local-testing/behind-proxy)
[6](https://github.com/localtunnel/server)
[7](https://www.opensourcealternatives.to/item/tunnelmole)
[8](https://agussarwono.com/article/ssh-tunneling/)
[9](https://octelium.com/docs/octelium/latest/management/guide/service/http/open-source-self-hosted-ngrok-alternative)
[10](https://www.reddit.com/r/sysadmin/comments/1bwkv3p/creating_a_simulated_test_environment_that/)

Great question - this is critical for your business model. Let me break down the licensing implications for each:

***

## License Comparison for Commercial Use

| Project | License | Can You Fork & Modify? | Can You Use for SaaS? | Can You Keep Proprietary? | Best For |
|---------|---------|----------------------|----------------------|-------------------------|----------|
| **Tunnelmole** | MIT (client) + AGPL-3.0 (server) | ✅ YES | ⚠️ CONDITIONAL | ❌ NO (server side) | **BEST** - Most flexible |
| **LocalTunnel** | MIT | ✅ YES | ✅ YES | ✅ YES | **EXCELLENT** - Most permissive |
| **Bore** | MIT | ✅ YES | ✅ YES | ✅ YES | **EXCELLENT** - Permissive |
| **Zrok** | Apache 2.0 | ✅ YES | ✅ YES | ✅ YES | **GOOD** - Permissive |

***

## Detailed License Analysis

### 1. **LocalTunnel - MIT License** ⭐⭐⭐⭐⭐ BEST FOR BUSINESS

**What you can do:**
- ✅ Fork and modify for commercial use
- ✅ Keep your modifications proprietary
- ✅ Use as SaaS with no attribution requirement
- ✅ Sell it as a commercial product
- ✅ Build a proprietary dashboard on top
- ✅ Close-source your extensions
- ✅ License it however you want to customers

**Obligations:**
- Include MIT license text in your repo (that's it)
- Can bury it in `licenses/` folder
- No requirement to open source anything

**Perfect for:**
- Building a commercial product around
- Adding agent-specific features without restrictions
- Keeping IP proprietary

**Example**: You can fork LocalTunnel, build AgentBridge dashboard on top, keep all your agent testing logic proprietary, and charge for it with zero restrictions.

***

### 2. **Bore - MIT License** ⭐⭐⭐⭐⭐ ALSO BEST FOR BUSINESS

**What you can do:**
- ✅ Same as LocalTunnel - everything above
- ✅ Completely permissive

**Obligations:**
- Include MIT license text

**The only caveat:**
- Rust instead of Node.js (not ideal for your stack)

***

### 3. **Zrok - Apache 2.0 License** ⭐⭐⭐⭐ GOOD FOR BUSINESS

**What you can do:**
- ✅ Fork and modify commercially
- ✅ Keep modifications proprietary
- ✅ Use as SaaS
- ✅ Charge customers
- ✅ Build proprietary extensions

**Obligations:**
- Include Apache 2.0 license text
- Provide copy of source code to users (they can request it)
- Document what you changed (in files you modified)
- No requirement to release modifications

**Notable difference from MIT:**
- Apache 2.0 is slightly more restrictive (includes patent protection clause)
- But functionally equivalent for your use case
- No restriction on proprietary derivatives

***

### 4. **Tunnelmole - MIT (Client) + AGPL-3.0 (Server)** ⚠️⚠️⚠️ RISKY - AVOID

**The Problem:**
Tunnelmole's **server is AGPL-3.0**, which means:

**If you modify/fork the server, you MUST:**
- ❌ Open source your modifications
- ❌ Release all derived works under AGPL
- ❌ Allow users to request the source code
- ❌ You cannot keep proprietary enhancements

**What AGPL means for you:**

```
Your Modified Tunnelmole Server (forked) 
  ↓
Must be open source (you cannot keep it proprietary)
  ↓
Anyone using your SaaS can demand the source code
  ↓
Your custom auth, billing, agent features all must be open source
```

**Example of the problem:**
```
You fork Tunnelmole server
You add:
  ✅ Bridge key auth (must open source this)
  ✅ Agent SDK (must open source this)
  ✅ Dashboard backend (must open source this)
  ✅ Custom tunneling logic (must open source this)
  
Your only proprietary part:
  - Frontend dashboard UI
  - Billing system
  - Customer data
```

**HOWEVER - there's a workaround for SaaS:**
- AGPL "Affero Clause" - if it's a SaaS, you must offer download of source code to users
- But you don't have to open source it before launch
- You only owe source code to users who request it
- Still restrictive for selling to enterprises

**Recommendation**: AVOID Tunnelmole's server. Their client is MIT, but you'd be forking their server which is problematic.

***

## Clear Recommendation

### ✅ **Use LocalTunnel**

**Why:**
1. **MIT License** - completely permissive
2. **Both client AND server are MIT** - full freedom
3. **You own everything** - all your customizations are yours
4. **No source code disclosure** - keep your SaaS proprietary
5. **Can relicense to customers** - full control
6. **Mature & stable** - 11+ years of production use
7. **Easily self-hostable** - you control the servers

**Business model you can have:**
- Fork LocalTunnel
- Build proprietary agent testing dashboard
- Add proprietary bridge key auth system
- Add proprietary billing/usage tracking
- Sell as SaaS (keep everything private)
- No obligation to open source anything
- Can sell enterprise licenses with custom terms

**Your fork structure:**
```
agentbridge/
├── server/ (based on localtunnel/server - MIT licensed)
│   └── Your modifications (PROPRIETARY)
├── client/ (based on localtunnel client - MIT licensed)
│   └── Your modifications (PROPRIETARY)
├── dashboard/ (brand new - PROPRIETARY)
├── agent-sdk/ (brand new - PROPRIETARY)
├── licenses/
│   └── MIT_LICENSE (attribution to LocalTunnel)
└── README.md
```

**License notice you'd include:**
```
This project includes components from LocalTunnel
(https://github.com/localtunnel/localtunnel)
which is licensed under the MIT License.

See licenses/MIT_LICENSE for details.
```

***

## Alternative Strategy: Dual License

If you want to be business-friendly AND community-friendly:

**You could:**
1. Keep LocalTunnel fork open source (MIT)
2. Build proprietary dashboard/agent platform on top
3. Offer:
   - Free tier: self-hosted LocalTunnel
   - Paid tier: your managed SaaS with agents

This is how **Tailscale**, **GitLab**, **Sentry** operate:
- Core tunneling: open source (MIT)
- Managed service: proprietary ($$$)
- Community loves you, enterprises pay

***

## License Checklist for Your Lawyers

When you have legal review, ask about:

✅ **LocalTunnel (MIT)** - Clear to use, fork, modify, commercialize
```
Required: Include MIT license attribution
Restriction: None
Commercial use: ✅ Unrestricted
Open sourcing: Not required
```

❌ **Tunnelmole Server (AGPL-3.0)** - Risky, avoid
```
Required: Open source modifications
Restriction: Copyleft - your derivatives must be AGPL
Commercial use: ✅ But must open source
Open sourcing: Required for modified server
```

✅ **Bore (MIT)** - Clear to use (but Rust)
```
Same as LocalTunnel
```

✅ **Zrok (Apache 2.0)** - Clear to use (slightly more terms)
```
Required: Apache 2.0 license attribution + patent clause
Restriction: Must disclose changes to modified files
Commercial use: ✅ Unrestricted
Open sourcing: Not required
```

***

## My Final Recommendation

**Use LocalTunnel's MIT-licensed client and server:**

1. **No legal ambiguity** - MIT is crystal clear
2. **Maximum business flexibility** - keep everything proprietary
3. **Community friendly** - can still open source client later if you want
4. **Battle-tested** - 11 years of production use
5. **Your stack** - JavaScript/Node.js
6. **Easy to extend** - simple architecture

**Build flow:**
```
LocalTunnel (MIT fork)
    ↓
Add Bridge Key Auth (your proprietary code)
    ↓
Add Agent SDK (your proprietary code)
    ↓
Add Dashboard (your proprietary code)
    ↓
Add Billing (your proprietary code)
    ↓
= AgentBridge (100% commercial product, all yours)
```

**No licensing entanglements. No obligation to open source. You own everything.**

Does this clarify things? Want me to help you draft a licensing strategy document for your lawyers?

Excellent question - this is a critical architectural decision that impacts both costs and operations. Let me break down the options:

***

## Option Comparison: Architecture & Economics

### **Option 1: Cloudflare → Fly.io (RECOMMENDED)**

**Architecture:**
```
User request
    ↓
Cloudflare (DNS + DDoS + caching + SSL)
    ↓
Fly.io (tunnel servers + compute)
    ↓
Developer's localhost
```

**Setup:**
```
1. Register domain at any registrar (Namecheap, etc.)
2. Point nameservers to Cloudflare (free tier)
3. Create DNS record in Cloudflare pointing to Fly.io
4. Cloudflare SSL termination + Fly.io apps
```

**Costs:**
| Component | Cost |
|-----------|------|
| Domain registrar | $12/year |
| Cloudflare DNS | Free |
| Cloudflare DDoS protection | Free |
| Cloudflare caching | Free |
| Fly.io compute | $5-20/month |
| Fly.io bandwidth | Included |
| Fly.io database | $50-100/month |
| **Total** | **$55-130/month** |

**Pros:**
- ✅ **Cheapest option** - Cloudflare free tier does heavy lifting
- ✅ **Best performance** - Cloudflare caches, reduces origin load
- ✅ **Built-in DDoS protection** - Free against layer 7 attacks
- ✅ **WAF included** - Free Web Application Firewall
- ✅ **Global edge network** - Traffic served from nearest Cloudflare POP
- ✅ **Bandwidth savings** - Cached responses don't hit Fly.io
- ✅ **Easy to scale** - Just spin up more Fly.io instances
- ✅ **Great for agent traffic** - Predictable, repeatable requests (caches well)

**Cons:**
- ⚠️ Slight complexity (managing two services)
- ⚠️ Cache invalidation needed for dynamic content

**Perfect for your use case because:**
- Agent requests are repetitive → cache hits are high
- DDoS protection important (public tunnel endpoints)
- Fly.io is lightweight, scales horizontally
- Cloudflare free tier is extremely generous

***

### **Option 2: Fly.io Only (Simpler but Pricier)**

**Architecture:**
```
User request
    ↓
Fly.io (DNS + compute + SSL + everything)
    ↓
Developer's localhost
```

**Setup:**
```
1. Register domain at Fly.io or elsewhere
2. Point nameservers to Fly.io
3. Configure SSL in Fly.io
4. Deploy apps directly
```

**Costs:**
| Component | Cost |
|-----------|------|
| Domain registrar | $12/year |
| Fly.io DNS | Free |
| Fly.io compute | $5-20/month |
| Fly.io bandwidth | Included |
| Fly.io database | $50-100/month |
| Fly.io DDoS protection | Extra: $200-500/month |
| **Total** | **$55-630/month** |

**Pros:**
- ✅ **Simpler architecture** - Single provider, fewer moving parts
- ✅ **Single support channel** - One company to contact
- ✅ **Easier operations** - All in one dashboard
- ✅ **Integrated SSL** - Auto-renewal built-in

**Cons:**
- ❌ **More expensive** - No free DDoS, no free WAF
- ❌ **Less caching** - Higher origin load on your servers
- ❌ **No CDN** - Traffic always hits your origin
- ❌ **Bandwidth costs add up** - Not included in compute
- ❌ **DDoS protection very expensive** - $200-500/month
- ❌ **Limited edge locations** - Only Fly.io regions

**When to use:**
- Very simple use case
- Don't expect traffic spikes
- Don't need advanced protection

***

### **Option 3: Cloudflare Pages/Workers (Most Modern)**

**Architecture:**
```
User request
    ↓
Cloudflare global network (everything)
    ↓
Fly.io only for tunnel server compute
```

**Setup:**
```
1. Use Cloudflare Workers for control plane API
2. Use Cloudflare Pages for dashboard
3. Cloudflare does all routing/SSL/caching
4. Fly.io just runs tunnel server
```

**Costs:**
| Component | Cost |
|-----------|------|
| Domain | $12/year |
| Cloudflare Free | Free |
| Cloudflare Workers | Free - $5/month (generous free tier) |
| Cloudflare Pages | Free |
| Fly.io compute (tunnel only) | $5-20/month |
| Fly.io database | $50-100/month |
| **Total** | **$55-140/month** |

**Pros:**
- ✅ **Globally distributed** - Your API runs on every Cloudflare edge (200+ locations)
- ✅ **Cheapest for compute** - Workers runs serverless
- ✅ **Best performance** - No origin latency, everything on edge
- ✅ **Scales automatically** - Never worry about traffic spikes
- ✅ **Best for APIs** - Workers designed for this exact pattern

**Cons:**
- ⚠️ **Learning curve** - Cloudflare Workers API different from traditional servers
- ⚠️ **Vendor lock-in** - Hard to migrate from Workers
- ⚠️ **Different programming model** - Serverless/edge-first mindset

**Best for:**
- Geographically distributed users
- High traffic unpredictability
- API-first architecture

***

## My Strong Recommendation: **Option 1 (Cloudflare + Fly.io)**

### Why This is Best for Agent Bridge:

**1. Cost Efficiency**
- You're paying for what you need (compute on Fly.io, protection on Cloudflare)
- Free tier of Cloudflare is genuinely useful (not hobbled)
- Estimated: **$55-130/month** vs $55-630/month (Fly.io alone)

**2. Operational Efficiency**
- Cloudflare handles: DNS, SSL, caching, DDoS, WAF, analytics
- Fly.io handles: Tunnel servers, database, app compute
- Each tool does what it's best at

**3. Performance for Agent Testing**
- Agent requests are typically repetitive (same test scripts)
- Cloudflare caches responses → huge bandwidth savings
- Example: 1000 agents × 100 requests/day
  - Without cache: 100,000 requests hit origin
  - With cache (90% hit): 10,000 requests hit origin (10x cheaper)

**4. DDoS Protection**
- Tunnel endpoints get hammered by bad actors
- Cloudflare free tier stops most attacks
- Fly.io alone would need $200-500/month for protection

**5. Flexibility**
- Easy to add multi-region Fly.io instances
- Cloudflare routes intelligently to nearest region
- Can swap Fly.io for another provider, keep Cloudflare

**6. Scale Path**
- Start: Single Fly.io region + Cloudflare
- Growth: Add Fly.io regions, Cloudflare routes to nearest
- Enterprise: Multi-cloud setup still using Cloudflare as facade

***

## Specific Configuration: Cloudflare + Fly.io

### **Step 1: Domain Setup**

```bash
# Buy domain from Namecheap/GoDaddy (~$12/year)
# Let's say: agentbridge.dev

# Add to Cloudflare (free account)
# In Cloudflare dashboard:
# - Add site: agentbridge.dev
# - Point nameservers to Cloudflare:
#   - ns1.cloudflare.com
#   - ns2.cloudflare.com
```

### **Step 2: Create DNS Records in Cloudflare**

```
Record: api.agentbridge.dev
Type: CNAME
Points to: agentbridge-api.fly.dev (your Fly.io app)
Cloudflare proxy: ✅ ON (orange cloud)
TTL: Auto

Record: *.agentbridge.dev (wildcard for tunnel endpoints)
Type: CNAME
Points to: agentbridge-tunnel.fly.dev (your tunnel server)
Cloudflare proxy: ✅ ON
TTL: Auto
```

### **Step 3: Cloudflare SSL Configuration**

```
In Cloudflare dashboard → SSL/TLS:
- Mode: Full (strict recommended)
- This requires Fly.io to have valid SSL
- Fly.io auto-renews via Let's Encrypt ✅

Enable:
- Automatic HTTPS rewrites: ON
- Always use HTTPS: ON
```

### **Step 4: Cloudflare Performance Settings**

```
Speed → Optimization:
- Brotli compression: ON (reduces bandwidth 20-30%)
- Minify CSS/JS: ON
- Rocket Loader: Optional (for dashboard)

Caching:
- Browser cache TTL: 1 hour (for static assets)
- Cache level: Cache Everything (for repeatable agent requests)
- Cache on cookie: Consider for session-based requests
```

### **Step 5: Cloudflare Security**

```
Security → WAF:
- Enable Cloudflare Managed Ruleset: ON
- OWASP Top 10 protection: ON

DDoS Protection:
- Sensitivity: High (block suspicious traffic)
- Challenge mode: ON (CAPTCHA for suspicious IPs)

Rate Limiting:
- 10 requests/second per IP (adjust as needed)
```

### **Step 6: Fly.io Configuration**

```bash
# Deploy tunnel server to Fly.io
fly launch

# Create app: agentbridge-tunnel
# Create app: agentbridge-api
# Create app: agentbridge-dashboard

# Fly.io automatically:
- Generates *.fly.dev subdomains
- Creates Let's Encrypt certificates
- Routes traffic to instances
- Scales horizontally

# In fly.toml:
[env]
region = "ord" # Chicago (midwest USA)
# Add more regions later: iad, dfw, lax, etc.
```

### **Step 7: Monitor Everything**

```
Cloudflare Dashboard shows:
- Traffic patterns
- Cache hit rate (should be 70-90% for agents)
- DDoS attacks blocked
- Origin errors

Fly.io Dashboard shows:
- CPU/memory usage
- Bandwidth by region
- Error rates
- Live logs

Set up alerts:
- Cloudflare: Alert if origin errors exceed 1%
- Fly.io: Alert if CPU > 80%
```

***

## Cost Breakdown in Practice

**Scenario: 1,000 Pro tier users, 50GB/month bandwidth**

### With Cloudflare + Fly.io:
```
Fly.io compute:     $10
Fly.io bandwidth:   $0 (included)
Database (Fly):     $75
Cloudflare:         $0 (free)
Domain:             $1
Total:              $86/month
```

### Without Cloudflare (Fly.io only):
```
Fly.io compute:     $50 (more to handle traffic)
Fly.io bandwidth:   $0 (included)
Fly.io DDoS:        $200 (required)
Database (Fly):     $75
Domain:             $1
Total:              $326/month
```

**Savings: $240/month (280% cheaper with Cloudflare)**

***

## Operational Checklist

### Initial Setup (1-2 hours)
- [ ] Register domain
- [ ] Add to Cloudflare free tier
- [ ] Deploy to Fly.io
- [ ] Create DNS records
- [ ] Enable SSL in Cloudflare
- [ ] Test domain resolution

### Ongoing Operations
- [ ] Monitor Cloudflare analytics (weekly)
- [ ] Monitor Fly.io metrics (weekly)
- [ ] Check error rates (daily)
- [ ] Review security logs (weekly)
- [ ] Update Cloudflare WAF rules (monthly)

### Scaling Points
- At 1,000 users: Add second Fly.io region
- At 5,000 users: Upgrade Cloudflare to Pro ($20/month)
- At 10,000 users: Consider Cloudflare Enterprise

***

## Final Answer

**Use: Cloudflare (DNS, SSL, DDoS, caching) + Fly.io (compute, database, tunnel servers)**

**Why:**
1. ✅ Most cost-effective: $55-130/month vs alternatives
2. ✅ Best performance: Cloudflare edge + Fly.io compute
3. ✅ Operational simplicity: Each tool has clear responsibility
4. ✅ Built-in DDoS protection: Critical for public tunnel endpoints
5. ✅ Perfect for agent traffic: Repetitive requests cache excellently
6. ✅ Easy to scale: Add Fly.io regions, Cloudflare routes intelligently
7. ✅ Industry standard: How modern SaaS does it (Stripe, GitHub, etc.)

**Don't overthink it:** This is the standard architecture for 2025. Implement it and iterate.

Want me to create a detailed deployment guide with exact commands for setting this up?