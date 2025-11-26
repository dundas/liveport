# LivePort MVP Roadmap

## Document Info
- **Source PRD**: `tasks/001-prd-liveport-mvp.md`
- **Task List**: `tasks/002-tasklist-liveport-mvp.md`
- **Created**: 2025-11-26
- **Target Launch**: Beta in 4 weeks

---

## Executive Summary

**Product**: LivePort - Secure localhost tunnels for AI agents
**Goal**: Enable AI agents to test applications running on developer localhost
**Differentiator**: Agent-first design with scoped bridge keys

### MVP Deliverables
1. **Dashboard** - Key management + tunnel monitoring
2. **CLI** - `liveport connect <port>` for developers
3. **Agent SDK** - TypeScript SDK for AI agents
4. **Tunnel Server** - LocalTunnel fork with bridge key auth

### Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + Tailwind |
| Backend | Node.js + Better Auth |
| Database | PostgreSQL (mech-storage) |
| Cache | Redis (Upstash) |
| Tunnel | LocalTunnel fork (MIT) |
| Infra | Cloudflare + Fly.io |

---

## Phase Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MVP ROADMAP (4 Weeks)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PHASE 1: Foundation          PHASE 2: Core Features                │
│  ━━━━━━━━━━━━━━━━━━━          ━━━━━━━━━━━━━━━━━━━━━━                │
│  Week 1                        Week 2                                │
│  ┌─────────────────┐          ┌─────────────────┐                   │
│  │ Project Setup   │          │ Bridge Key API  │                   │
│  │ Database Schema │    →     │ Tunnel Server   │                   │
│  │ Auth System     │          │ Infrastructure  │                   │
│  │ Dashboard Shell │          │ Key Management  │                   │
│  └─────────────────┘          └─────────────────┘                   │
│         │                            │                               │
│         ▼                            ▼                               │
│  PHASE 3: CLI & SDK           PHASE 4: Polish & Launch              │
│  ━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━━━━━━━━━                │
│  Week 3                        Week 4                                │
│  ┌─────────────────┐          ┌─────────────────┐                   │
│  │ CLI Client      │          │ Tunnels UI      │                   │
│  │ Agent SDK       │    →     │ Error Handling  │                   │
│  │ Agent API       │          │ Documentation   │                   │
│  │ npm Packages    │          │ E2E Tests       │                   │
│  └─────────────────┘          │ BETA LAUNCH 🚀  │                   │
│                               └─────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (Week 1)

### Milestone: "Hello World Tunnel"
**Exit Criteria**: Developer can sign up, generate a key, but tunnel not yet functional

### Tasks

| ID | Task | Agent | Hours | Commit |
|----|------|-------|-------|--------|
| 001 | Project Setup & Monorepo | `config-task-writer` | 2h | `chore: initialize pnpm monorepo` |
| 002 | Database Schema (mech-storage) | `config-task-writer` | 1.5h | `chore: create database schema` |
| 003 | Redis Setup (Upstash) | `config-task-writer` | 1h | `feat(shared): add redis client` |
| 004 | Dashboard Scaffolding | `tdd-developer` | 2h | `feat(dashboard): initialize next.js` |
| 005 | Better Auth Integration | `tdd-developer` | 3h | `feat(dashboard): add authentication` |

### Parallel Execution
```
Day 1-2:  [TASK-001] ─┬─ [TASK-002] ─┬─ [TASK-003]
                      │              │
Day 2-3:              └─ [TASK-004] ─┘
                              │
Day 3-5:                [TASK-005]
```

### Deliverables
- [ ] Monorepo with `apps/dashboard`, `apps/tunnel-server`, `packages/*`
- [ ] PostgreSQL tables: `users`, `bridge_keys`, `tunnels`
- [ ] Redis connection with rate limiter utility
- [ ] Dashboard with login/signup (email + GitHub OAuth)
- [ ] Protected routes redirect to login

### Definition of Done
- `pnpm install && pnpm build` succeeds
- User can sign up with email or GitHub
- Session persists across page refreshes
- Database seeded with test user

---

## Phase 2: Core Features (Week 2)

### Milestone: "Working Tunnel"
**Exit Criteria**: Developer can generate key, run CLI, tunnel works end-to-end

### Tasks

| ID | Task | Agent | Hours | Commit |
|----|------|-------|-------|--------|
| 006 | Bridge Key API Spec | `spec-writer` | 2h | `docs: add bridge key openapi spec` |
| 007 | Bridge Key API Implementation | `tdd-developer` | 4h | `feat(dashboard): add key management api` |
| 008 | Bridge Key UI | `tdd-developer` | 3h | `feat(dashboard): add key management ui` |
| 009 | Tunnel Server Architecture | `technical-planner` | 2h | `docs: add tunnel server architecture` |
| 010 | Tunnel Server Implementation | `tdd-developer` | 6h | `feat(tunnel): implement tunnel server` |
| 011 | Infrastructure (Cloudflare + Fly.io) | `config-task-writer` | 3h | `chore: deploy infrastructure` |

### Parallel Execution
```
Day 1:    [TASK-006] ─┬─ [TASK-009]
                      │
Day 1-2:  [TASK-007] ─┤
                      │
Day 2-3:  [TASK-008]  └─ [TASK-010] ────────┐
                              │              │
Day 3-4:                      └──────────────┼─ [TASK-011]
                                             │
Day 4-5:                            Integration Testing
```

### Deliverables
- [ ] OpenAPI spec for bridge key endpoints
- [ ] `POST /api/keys` - Generate bridge key
- [ ] `GET /api/keys` - List user's keys
- [ ] `DELETE /api/keys/:id` - Revoke key
- [ ] Key generation UI with copy-to-clipboard
- [ ] Keys list table with revoke action
- [ ] Tunnel server accepting WebSocket connections
- [ ] Bridge key validation on connect
- [ ] Subdomain assignment (random `xyz789.liveport.dev`)
- [ ] Cloudflare DNS with wildcard `*.liveport.dev`
- [ ] Fly.io deployment for tunnel server

### Definition of Done
- User can generate bridge key in dashboard
- Key displayed once with copy button
- Tunnel server validates keys correctly
- Invalid/expired keys rejected with clear error
- `*.liveport.dev` resolves to tunnel server

---

## Phase 3: CLI & SDK (Week 3)

### Milestone: "Agent Can Test"
**Exit Criteria**: AI agent can wait for tunnel and access localhost app

### Tasks

| ID | Task | Agent | Hours | Commit |
|----|------|-------|-------|--------|
| 012 | CLI Specification | `spec-writer` | 1.5h | `docs: add cli command spec` |
| 013 | CLI Implementation | `tdd-developer` | 5h | `feat(cli): implement liveport cli` |
| 014 | Agent SDK Specification | `spec-writer` | 1.5h | `docs: add agent sdk spec` |
| 015 | Agent SDK Implementation | `tdd-developer` | 4h | `feat(sdk): implement agent sdk` |
| 016 | Agent API Endpoints | `tdd-developer` | 3h | `feat(dashboard): add agent api` |

### Parallel Execution
```
Day 1:    [TASK-012] ─┬─ [TASK-014]
                      │       │
Day 1-3:  [TASK-013] ─┤       └─ [TASK-015]
                      │              │
Day 2-3:              └─ [TASK-016] ─┘
                              │
Day 4-5:              Integration Testing
```

### Deliverables
- [ ] `@liveport/cli` npm package
  - `liveport connect <port> --key <key>`
  - `liveport status`
  - `liveport disconnect`
  - Auto-reconnect on network drop
  - Colored terminal output
- [ ] `@liveport/agent-sdk` npm package
  - `waitForTunnel({ timeout })`
  - `listTunnels()`
  - `disconnect()`
  - TypeScript types exported
- [ ] Agent API endpoints
  - `GET /api/agent/tunnels/wait` (long-poll)
  - `GET /api/agent/tunnels` (list active)

### Definition of Done
- `npm install -g @liveport/cli` works
- `liveport connect 3000 --key lpk_xxx` creates tunnel
- `liveport status` shows active tunnel
- Agent SDK can wait for and receive tunnel URL
- Full flow: Dashboard → Key → CLI → SDK → Localhost works

---

## Phase 4: Polish & Launch (Week 4)

### Milestone: "Beta Launch 🚀"
**Exit Criteria**: Product ready for early adopters

### Tasks

| ID | Task | Agent | Hours | Commit |
|----|------|-------|-------|--------|
| 017 | Active Tunnels Dashboard | `tdd-developer` | 3h | `feat(dashboard): add tunnels page` |
| 018 | Dashboard Home & Usage | `tdd-developer` | 2h | `feat(dashboard): add home page` |
| 019 | Error Handling | `tdd-developer` | 3h | `feat: improve error handling` |
| 020 | npm Package Publishing | `config-task-writer` | 2h | `ci: add npm publish workflow` |
| 021 | Documentation | `tdd-developer` | 3h | `docs: add user documentation` |
| 022 | E2E Testing | `tdd-developer` | 4h | `test: add e2e test suite` |
| 023 | Beta Launch Prep | `config-task-writer` | 2h | `chore: prepare beta launch` |

### Parallel Execution
```
Day 1-2:  [TASK-017] ─┬─ [TASK-018] ─┬─ [TASK-019]
                      │              │
Day 2-3:              └─ [TASK-020] ─┼─ [TASK-021]
                                     │
Day 3-4:                    [TASK-022]
                                     │
Day 5:                      [TASK-023] → 🚀 LAUNCH
```

### Deliverables
- [ ] Tunnels page with real-time updates
- [ ] Disconnect button for active tunnels
- [ ] Home page with usage summary
- [ ] Global error boundary
- [ ] User-friendly error messages
- [ ] npm packages published
- [ ] README with quickstart
- [ ] CLI documentation
- [ ] SDK documentation
- [ ] E2E tests passing
- [ ] Sentry error monitoring
- [ ] Production environment live

### Definition of Done
- Dashboard shows active tunnels in real-time
- All error states have clear UI
- `npm install -g @liveport/cli` installs from npm
- Documentation covers all features
- E2E tests pass in CI
- Production deployed and accessible

---

## Agent Assignment Summary

| Agent | Tasks | Total Hours | Role |
|-------|-------|-------------|------|
| `config-task-writer` | 001, 002, 003, 011, 020, 023 | 11.5h | Setup & deployment |
| `spec-writer` | 006, 009, 012, 014 | 7h | Specifications |
| `technical-planner` | 009 | 2h | Architecture |
| `tdd-developer` | 004, 005, 007, 008, 010, 013, 015, 016, 017, 018, 019, 021, 022 | 44.5h | Implementation |

### Workflow Per Task

```
┌─────────────────────────────────────────────────────────────────┐
│                     TASK EXECUTION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. SPECIFICATION (if needed)                                   │
│     Agent: spec-writer or technical-planner                     │
│     Output: OpenAPI spec, architecture doc, interface spec      │
│                                                                  │
│  2. CONFIGURATION (if needed)                                   │
│     Agent: config-task-writer                                   │
│     Output: Setup scripts, deployment configs                   │
│                                                                  │
│  3. IMPLEMENTATION                                              │
│     Agent: tdd-developer                                        │
│     Process: Red → Green → Refactor                             │
│     Output: Code + Tests + Commit                               │
│                                                                  │
│  4. VALIDATION                                                  │
│     - Run tests: `pnpm test`                                    │
│     - Check lint: `pnpm lint`                                   │
│     - Verify acceptance criteria                                │
│                                                                  │
│  5. COMMIT                                                      │
│     Format: `type(scope): description`                          │
│     Include: Tests, docs updates if needed                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Critical Path

The critical path determines the minimum time to MVP:

```
TASK-001 → TASK-004 → TASK-005 → TASK-007 → TASK-010 → TASK-013 → TASK-015 → TASK-022 → TASK-023
   │                                 │           │           │           │
   └── Monorepo                      │           │           │           └── E2E Tests
                                     │           │           └── Agent SDK
                                     │           └── CLI
                                     └── Tunnel Server
```

**Critical Path Duration**: ~32 hours of sequential work

**Parallelizable Work**: ~33 hours can run alongside critical path

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| LocalTunnel fork complexity | High | Start with minimal changes, test early |
| mech-storage API issues | Medium | Have fallback to direct PostgreSQL |
| Cloudflare wildcard DNS | Medium | Test DNS propagation early (Day 1 of Week 2) |
| WebSocket scaling | Medium | Load test before launch |
| npm publish issues | Low | Test with `--dry-run` first |

---

## Success Metrics (Beta Launch)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Registered users | 50+ | Database count |
| Bridge keys created | 200+ | Database count |
| Successful tunnels | 500+ | Tunnel server logs |
| CLI installs | 100+ | npm download stats |
| SDK installs | 30+ | npm download stats |
| Uptime | 99%+ | Fly.io metrics |
| Time to first tunnel | < 5 min | User testing |

---

## Post-MVP Roadmap (Future)

### v0.2 (Month 2)
- [ ] Python Agent SDK
- [ ] Custom subdomains
- [ ] Request logging & inspection
- [ ] Webhook notifications

### v0.3 (Month 3)
- [ ] Usage-based billing (Stripe)
- [ ] Team management
- [ ] Multi-region support
- [ ] Request replay

### v1.0 (Month 4-6)
- [ ] SSO/SAML
- [ ] Audit logs
- [ ] Self-hosted option
- [ ] Enterprise features

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 8+
- mech-storage API key
- Upstash Redis account
- Cloudflare account
- Fly.io account

### First Steps
1. Clone the repo
2. Run `pnpm install`
3. Copy `.env.example` to `.env.local`
4. Start with TASK-001: Project Setup

### Commands
```bash
# Start development
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build

# Deploy to Fly.io
pnpm deploy
```

---

## Appendix: Commit Convention

```
type(scope): description

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation
- chore: Maintenance
- test: Tests
- ci: CI/CD changes
- refactor: Code refactor

Scopes:
- dashboard: Next.js app
- tunnel: Tunnel server
- cli: CLI package
- sdk: Agent SDK
- shared: Shared utilities

Examples:
- feat(dashboard): add bridge key generation form
- feat(cli): implement connect command
- fix(tunnel): handle websocket reconnection
- docs: add quickstart guide
- chore: configure turborepo
```

---

*Roadmap generated from PRD and task list*
*Last updated: 2025-11-26*
