# LivePort MVP Task List

## Document Info
- **Source PRD**: `tasks/001-prd-liveport-mvp.md`
- **Created**: 2025-11-26
- **Status**: Ready for execution

---

## Agent Legend

| Agent | Role | When to Use |
|-------|------|-------------|
| `decomposition-architect` | Break down goals into sub-tasks | Start of each phase |
| `technical-planner` | Architecture decisions | Before implementation |
| `spec-writer` | API/interface specifications | Before coding APIs |
| `config-task-writer` | Setup/config tasks | Infrastructure, deployment |
| `tdd-developer` | Code implementation | All feature code |

---

## Phase 1: Foundation (Week 1)

### TASK-001: Project Setup & Monorepo Structure
**Agent**: `config-task-writer`
**Estimated Time**: 2 hours
**Dependencies**: None

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 1.1 | Initialize monorepo with pnpm workspaces | `chore: initialize pnpm monorepo structure` |
| 1.2 | Create package structure: `apps/dashboard`, `apps/tunnel-server`, `packages/cli`, `packages/agent-sdk`, `packages/shared` | `chore: add monorepo package structure` |
| 1.3 | Configure TypeScript with shared tsconfig | `chore: configure typescript with path aliases` |
| 1.4 | Set up ESLint + Prettier with shared config | `chore: add eslint and prettier configuration` |
| 1.5 | Configure Turborepo for build orchestration | `chore: add turborepo for monorepo builds` |
| 1.6 | Add .env.example files for each package | `chore: add environment variable templates` |

#### Validation
- `pnpm install` succeeds
- `pnpm build` runs without errors
- `pnpm lint` passes

#### Artifacts
```
liveport/
├── apps/
│   ├── dashboard/          # Next.js dashboard
│   └── tunnel-server/      # Tunnel server
├── packages/
│   ├── cli/                # CLI client
│   ├── agent-sdk/          # Agent SDK
│   └── shared/             # Shared types/utils
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── package.json
```

---

### TASK-002: Database Schema & mech-storage Setup
**Agent**: `config-task-writer`
**Estimated Time**: 1.5 hours
**Dependencies**: None (can run parallel with TASK-001)

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 2.1 | Create mech-storage account and obtain API key | `docs: add mech-storage setup instructions` |
| 2.2 | Create PostgreSQL schema via mech-storage API | `chore: create database schema via mech-storage` |
| 2.3 | Add mech-storage client wrapper in `packages/shared` | `feat(shared): add mech-storage client wrapper` |
| 2.4 | Create database seed script for development | `chore: add database seed script` |

#### Validation
- mech-storage API responds to health check
- Tables created: `users`, `bridge_keys`, `tunnels`
- Seed script creates test user

#### Artifacts
- `packages/shared/src/db/mech-storage.ts`
- `packages/shared/src/db/schema.sql`
- `scripts/seed-db.ts`

---

### TASK-003: Redis Setup (Upstash)
**Agent**: `config-task-writer`
**Estimated Time**: 1 hour
**Dependencies**: None (can run parallel)

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 3.1 | Create Upstash Redis database | `docs: add upstash redis setup instructions` |
| 3.2 | Add Redis client wrapper in `packages/shared` | `feat(shared): add redis client with connection pooling` |
| 3.3 | Create rate limiter utility | `feat(shared): add rate limiter using redis` |
| 3.4 | Add health check endpoint for Redis | `feat(shared): add redis health check utility` |

#### Validation
- Redis PING returns PONG
- Rate limiter increments correctly
- Connection handles reconnection

#### Artifacts
- `packages/shared/src/redis/client.ts`
- `packages/shared/src/redis/rate-limiter.ts`

---

### TASK-004: Dashboard App Scaffolding
**Agent**: `tdd-developer`
**Estimated Time**: 2 hours
**Dependencies**: TASK-001

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 4.1 | Initialize Next.js 14 with App Router | `feat(dashboard): initialize next.js 14 app` |
| 4.2 | Configure Tailwind CSS with design tokens | `feat(dashboard): add tailwind with custom theme` |
| 4.3 | Create base layout with navigation shell | `feat(dashboard): add app layout with navigation` |
| 4.4 | Add shadcn/ui component library | `feat(dashboard): integrate shadcn/ui components` |
| 4.5 | Create placeholder pages: `/`, `/keys`, `/tunnels` | `feat(dashboard): add placeholder route pages` |

#### Validation
- `pnpm dev` starts dashboard on port 3000
- All routes render without errors
- Tailwind classes apply correctly

#### Artifacts
- `apps/dashboard/app/layout.tsx`
- `apps/dashboard/app/page.tsx`
- `apps/dashboard/app/keys/page.tsx`
- `apps/dashboard/app/tunnels/page.tsx`
- `apps/dashboard/tailwind.config.ts`

---

### TASK-005: Better Auth Integration
**Agent**: `tdd-developer`
**Estimated Time**: 3 hours
**Dependencies**: TASK-002, TASK-004

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 5.1 | Install and configure Better Auth | `feat(dashboard): add better-auth configuration` |
| 5.2 | Create mech-storage adapter for Better Auth | `feat(shared): add mech-storage adapter for better-auth` |
| 5.3 | Implement email/password signup flow | `feat(dashboard): add email signup with verification` |
| 5.4 | Implement email/password login flow | `feat(dashboard): add email login flow` |
| 5.5 | Add GitHub OAuth provider | `feat(dashboard): add github oauth authentication` |
| 5.6 | Create auth middleware for protected routes | `feat(dashboard): add auth middleware for protected routes` |
| 5.7 | Build login/signup UI pages | `feat(dashboard): add auth ui pages` |
| 5.8 | Add logout functionality | `feat(dashboard): add logout with session cleanup` |

#### Validation
- Signup creates user in mech-storage
- Login returns valid session
- GitHub OAuth redirects correctly
- Protected routes redirect to login
- Logout clears session

#### Artifacts
- `apps/dashboard/lib/auth.ts`
- `apps/dashboard/app/api/auth/[...all]/route.ts`
- `apps/dashboard/app/(auth)/login/page.tsx`
- `apps/dashboard/app/(auth)/signup/page.tsx`
- `packages/shared/src/auth/mech-storage-adapter.ts`

---

## Phase 2: Core Features (Week 2)

### TASK-006: Bridge Key API Specification
**Agent**: `spec-writer`
**Estimated Time**: 2 hours
**Dependencies**: TASK-005

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 6.1 | Define bridge key data model and constraints | `docs: add bridge key data model specification` |
| 6.2 | Write OpenAPI spec for key management endpoints | `docs: add openapi spec for bridge key api` |
| 6.3 | Document key generation algorithm | `docs: add bridge key generation specification` |
| 6.4 | Define error responses and rate limits | `docs: add api error model and rate limits` |

#### Validation
- OpenAPI spec validates with no errors
- All endpoints have examples
- Error codes documented

#### Artifacts
- `docs/api/bridge-keys.openapi.yaml`
- `docs/api/errors.md`

---

### TASK-007: Bridge Key Generation & Management API
**Agent**: `tdd-developer`
**Estimated Time**: 4 hours
**Dependencies**: TASK-005, TASK-006

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 7.1 | Create bridge key generation utility (crypto) | `feat(shared): add secure bridge key generator` |
| 7.2 | Implement `POST /api/keys` - create key | `feat(dashboard): add create bridge key endpoint` |
| 7.3 | Implement `GET /api/keys` - list user keys | `feat(dashboard): add list bridge keys endpoint` |
| 7.4 | Implement `DELETE /api/keys/:id` - revoke key | `feat(dashboard): add revoke bridge key endpoint` |
| 7.5 | Add key validation utility | `feat(shared): add bridge key validation utility` |
| 7.6 | Add rate limiting to key endpoints | `feat(dashboard): add rate limiting to key api` |
| 7.7 | Write integration tests for key API | `test(dashboard): add bridge key api integration tests` |

#### Validation
- Key generation produces `lpk_` prefixed keys
- Keys stored hashed in database
- List returns only user's keys
- Revoke updates status and invalidates key
- Rate limiting blocks excessive requests

#### Artifacts
- `packages/shared/src/keys/generator.ts`
- `packages/shared/src/keys/validator.ts`
- `apps/dashboard/app/api/keys/route.ts`
- `apps/dashboard/app/api/keys/[id]/route.ts`
- `apps/dashboard/__tests__/api/keys.test.ts`

---

### TASK-008: Bridge Key Management UI
**Agent**: `tdd-developer`
**Estimated Time**: 3 hours
**Dependencies**: TASK-007

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 8.1 | Create key generation form component | `feat(dashboard): add bridge key generation form` |
| 8.2 | Build key display modal (show once) | `feat(dashboard): add key reveal modal with copy` |
| 8.3 | Create keys list table component | `feat(dashboard): add bridge keys table component` |
| 8.4 | Add revoke confirmation dialog | `feat(dashboard): add key revocation dialog` |
| 8.5 | Implement keys page with data fetching | `feat(dashboard): complete keys management page` |
| 8.6 | Add empty state and loading skeletons | `feat(dashboard): add keys page loading states` |

#### Validation
- Form submits and shows generated key
- Copy button works
- Table shows all user keys
- Revoke updates UI immediately
- Loading states display correctly

#### Artifacts
- `apps/dashboard/app/keys/page.tsx`
- `apps/dashboard/components/keys/key-form.tsx`
- `apps/dashboard/components/keys/key-table.tsx`
- `apps/dashboard/components/keys/key-modal.tsx`

---

### TASK-009: Tunnel Server Architecture
**Agent**: `technical-planner`
**Estimated Time**: 2 hours
**Dependencies**: TASK-006

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 9.1 | Document tunnel server architecture | `docs: add tunnel server architecture design` |
| 9.2 | Define WebSocket protocol for CLI connection | `docs: add websocket protocol specification` |
| 9.3 | Plan subdomain generation strategy | `docs: add subdomain generation strategy` |
| 9.4 | Document connection lifecycle | `docs: add tunnel connection lifecycle` |

#### Validation
- Architecture document reviewed
- Protocol handles all edge cases
- Subdomain collision strategy defined

#### Artifacts
- `docs/architecture/tunnel-server.md`
- `docs/architecture/websocket-protocol.md`

---

### TASK-010: Tunnel Server Implementation
**Agent**: `tdd-developer`
**Estimated Time**: 6 hours
**Dependencies**: TASK-003, TASK-007, TASK-009

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 10.1 | Fork LocalTunnel server into `apps/tunnel-server` | `feat(tunnel): fork localtunnel server base` |
| 10.2 | Add bridge key validation middleware | `feat(tunnel): add bridge key validation` |
| 10.3 | Implement subdomain generator | `feat(tunnel): add random subdomain generator` |
| 10.4 | Add tunnel registration to database | `feat(tunnel): persist tunnel connections to db` |
| 10.5 | Implement heartbeat system with Redis | `feat(tunnel): add heartbeat tracking via redis` |
| 10.6 | Add rate limiting per bridge key | `feat(tunnel): add per-key rate limiting` |
| 10.7 | Implement graceful shutdown | `feat(tunnel): add graceful connection shutdown` |
| 10.8 | Add request counting (no logging) | `feat(tunnel): add request count tracking` |
| 10.9 | Write tunnel server tests | `test(tunnel): add tunnel server unit tests` |

#### Validation
- WebSocket accepts connection with valid key
- Rejects invalid/expired keys
- Subdomain assigned and routable
- Heartbeat keeps connection alive
- Rate limiting triggers at threshold
- Shutdown closes connections gracefully

#### Artifacts
- `apps/tunnel-server/src/index.ts`
- `apps/tunnel-server/src/key-validator.ts`
- `apps/tunnel-server/src/subdomain.ts`
- `apps/tunnel-server/src/heartbeat.ts`
- `apps/tunnel-server/__tests__/`

---

### TASK-011: Cloudflare & Fly.io Infrastructure
**Agent**: `config-task-writer`
**Estimated Time**: 3 hours
**Dependencies**: TASK-010

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 11.1 | Register domain and add to Cloudflare | `docs: add domain setup instructions` |
| 11.2 | Configure wildcard DNS for tunnels | `docs: add cloudflare dns configuration` |
| 11.3 | Create Fly.io app for tunnel server | `chore: add fly.io tunnel server config` |
| 11.4 | Create Fly.io app for dashboard | `chore: add fly.io dashboard config` |
| 11.5 | Configure SSL/TLS in Cloudflare | `docs: add ssl configuration guide` |
| 11.6 | Set up CI/CD with GitHub Actions | `ci: add github actions deployment workflow` |
| 11.7 | Add deployment scripts | `chore: add deployment scripts for fly.io` |

#### Validation
- `*.liveport.dev` resolves to Fly.io
- SSL certificates valid
- Dashboard accessible at `app.liveport.dev`
- Tunnel server accessible
- CI/CD deploys on push to main

#### Artifacts
- `apps/tunnel-server/fly.toml`
- `apps/dashboard/fly.toml`
- `.github/workflows/deploy.yml`
- `scripts/deploy.sh`
- `docs/infrastructure/setup.md`

---

## Phase 3: CLI & SDK (Week 3)

### TASK-012: CLI Specification
**Agent**: `spec-writer`
**Estimated Time**: 1.5 hours
**Dependencies**: TASK-009

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 12.1 | Define CLI command interface | `docs: add cli command specification` |
| 12.2 | Document configuration file format | `docs: add cli config file specification` |
| 12.3 | Specify exit codes and error messages | `docs: add cli exit codes and errors` |

#### Validation
- All commands documented
- Config format specified
- Error codes comprehensive

#### Artifacts
- `docs/cli/commands.md`
- `docs/cli/configuration.md`

---

### TASK-013: CLI Implementation
**Agent**: `tdd-developer`
**Estimated Time**: 5 hours
**Dependencies**: TASK-010, TASK-012

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 13.1 | Set up CLI package with Commander | `feat(cli): initialize cli with commander` |
| 13.2 | Implement `connect` command | `feat(cli): add connect command` |
| 13.3 | Add WebSocket client for tunnel | `feat(cli): add websocket tunnel client` |
| 13.4 | Implement auto-reconnect logic | `feat(cli): add auto-reconnect with backoff` |
| 13.5 | Add colored terminal output (chalk) | `feat(cli): add colored terminal output` |
| 13.6 | Implement `status` command | `feat(cli): add status command` |
| 13.7 | Implement `disconnect` command | `feat(cli): add disconnect command` |
| 13.8 | Add graceful shutdown (SIGTERM/SIGINT) | `feat(cli): add graceful shutdown handling` |
| 13.9 | Create config file handler | `feat(cli): add config file support` |
| 13.10 | Write CLI tests | `test(cli): add cli command tests` |

#### Validation
- `liveport connect 3000 --key lpk_xxx` creates tunnel
- Terminal shows connection status
- Auto-reconnects on network drop
- `liveport status` shows active tunnels
- Ctrl+C gracefully disconnects

#### Artifacts
- `packages/cli/src/index.ts`
- `packages/cli/src/commands/connect.ts`
- `packages/cli/src/commands/status.ts`
- `packages/cli/src/commands/disconnect.ts`
- `packages/cli/src/tunnel-client.ts`
- `packages/cli/__tests__/`

---

### TASK-014: Agent SDK Specification
**Agent**: `spec-writer`
**Estimated Time**: 1.5 hours
**Dependencies**: TASK-006

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 14.1 | Define SDK interface and types | `docs: add agent sdk interface specification` |
| 14.2 | Document SDK methods and options | `docs: add agent sdk method documentation` |
| 14.3 | Specify error handling and retries | `docs: add sdk error handling specification` |

#### Validation
- All methods documented
- Types exported
- Error handling clear

#### Artifacts
- `docs/sdk/typescript.md`
- `packages/agent-sdk/src/types.ts`

---

### TASK-015: Agent SDK Implementation
**Agent**: `tdd-developer`
**Estimated Time**: 4 hours
**Dependencies**: TASK-010, TASK-014

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 15.1 | Set up SDK package structure | `feat(sdk): initialize agent sdk package` |
| 15.2 | Implement `LivePortAgent` class | `feat(sdk): add liveport agent class` |
| 15.3 | Implement `waitForTunnel()` with polling | `feat(sdk): add wait for tunnel method` |
| 15.4 | Implement `listTunnels()` | `feat(sdk): add list tunnels method` |
| 15.5 | Implement `disconnect()` | `feat(sdk): add disconnect method` |
| 15.6 | Add retry logic with exponential backoff | `feat(sdk): add retry logic with backoff` |
| 15.7 | Export TypeScript types | `feat(sdk): export typescript types` |
| 15.8 | Write SDK tests | `test(sdk): add agent sdk unit tests` |

#### Validation
- `waitForTunnel()` returns tunnel when ready
- `waitForTunnel()` throws on timeout
- `listTunnels()` returns array of tunnels
- Types export correctly
- Retries on network errors

#### Artifacts
- `packages/agent-sdk/src/index.ts`
- `packages/agent-sdk/src/agent.ts`
- `packages/agent-sdk/src/types.ts`
- `packages/agent-sdk/__tests__/`

---

### TASK-016: Agent API Endpoints
**Agent**: `tdd-developer`
**Estimated Time**: 3 hours
**Dependencies**: TASK-007, TASK-010

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 16.1 | Create agent API route group | `feat(dashboard): add agent api route group` |
| 16.2 | Implement `GET /api/agent/tunnels/wait` | `feat(dashboard): add wait for tunnel endpoint` |
| 16.3 | Implement `GET /api/agent/tunnels` | `feat(dashboard): add list tunnels for agent endpoint` |
| 16.4 | Add bridge key auth middleware for agent routes | `feat(dashboard): add bridge key auth middleware` |
| 16.5 | Write agent API tests | `test(dashboard): add agent api integration tests` |

#### Validation
- `/wait` long-polls until tunnel ready
- `/wait` returns 408 on timeout
- `/tunnels` returns active tunnels for key
- Invalid key returns 401

#### Artifacts
- `apps/dashboard/app/api/agent/tunnels/route.ts`
- `apps/dashboard/app/api/agent/tunnels/wait/route.ts`
- `apps/dashboard/middleware/bridge-key-auth.ts`
- `apps/dashboard/__tests__/api/agent/`

---

## Phase 4: Polish & Launch (Week 4)

### TASK-017: Active Tunnels Dashboard
**Agent**: `tdd-developer`
**Estimated Time**: 3 hours
**Dependencies**: TASK-010, TASK-016

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 17.1 | Create tunnel list component | `feat(dashboard): add tunnel list component` |
| 17.2 | Add real-time updates (polling) | `feat(dashboard): add tunnel list auto-refresh` |
| 17.3 | Implement disconnect button | `feat(dashboard): add tunnel disconnect action` |
| 17.4 | Show tunnel details (URL, port, time, requests) | `feat(dashboard): add tunnel details display` |
| 17.5 | Add empty state for no tunnels | `feat(dashboard): add tunnels empty state` |
| 17.6 | Complete tunnels page | `feat(dashboard): complete tunnels page` |

#### Validation
- Active tunnels display in real-time
- Disconnect button closes tunnel
- Details accurate (port, URL, time)
- Empty state shows when no tunnels

#### Artifacts
- `apps/dashboard/app/tunnels/page.tsx`
- `apps/dashboard/components/tunnels/tunnel-list.tsx`
- `apps/dashboard/components/tunnels/tunnel-card.tsx`

---

### TASK-018: Dashboard Home & Usage Display
**Agent**: `tdd-developer`
**Estimated Time**: 2 hours
**Dependencies**: TASK-017

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 18.1 | Create dashboard home page | `feat(dashboard): add home page layout` |
| 18.2 | Add usage summary cards | `feat(dashboard): add usage summary cards` |
| 18.3 | Show quick actions (create key, view tunnels) | `feat(dashboard): add quick action buttons` |
| 18.4 | Display recent activity | `feat(dashboard): add recent activity feed` |

#### Validation
- Home shows usage stats
- Quick actions work
- Recent activity updates

#### Artifacts
- `apps/dashboard/app/(dashboard)/page.tsx`
- `apps/dashboard/components/dashboard/usage-cards.tsx`
- `apps/dashboard/components/dashboard/quick-actions.tsx`

---

### TASK-019: Error Handling & Edge Cases
**Agent**: `tdd-developer`
**Estimated Time**: 3 hours
**Dependencies**: TASK-013, TASK-015, TASK-017

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 19.1 | Add global error boundary to dashboard | `feat(dashboard): add global error boundary` |
| 19.2 | Handle network errors in CLI | `feat(cli): improve network error handling` |
| 19.3 | Handle network errors in SDK | `feat(sdk): improve network error handling` |
| 19.4 | Add user-friendly error messages | `feat: add user-friendly error messages` |
| 19.5 | Handle expired key gracefully | `feat: handle expired bridge key errors` |
| 19.6 | Add connection timeout handling | `feat: add connection timeout handling` |

#### Validation
- Dashboard shows error UI on failure
- CLI shows helpful error messages
- SDK throws typed errors
- Expired keys show clear message

#### Artifacts
- `apps/dashboard/app/error.tsx`
- `packages/shared/src/errors/index.ts`

---

### TASK-020: npm Package Publishing
**Agent**: `config-task-writer`
**Estimated Time**: 2 hours
**Dependencies**: TASK-013, TASK-015

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 20.1 | Configure package.json for CLI publishing | `chore(cli): configure npm package for publishing` |
| 20.2 | Configure package.json for SDK publishing | `chore(sdk): configure npm package for publishing` |
| 20.3 | Add README files for packages | `docs: add readme for cli and sdk packages` |
| 20.4 | Set up npm publish workflow | `ci: add npm publish workflow` |
| 20.5 | Create changeset configuration | `chore: add changesets for version management` |

#### Validation
- `npm publish --dry-run` succeeds for both packages
- README renders correctly on npm
- CI publishes on release tag

#### Artifacts
- `packages/cli/package.json`
- `packages/cli/README.md`
- `packages/agent-sdk/package.json`
- `packages/agent-sdk/README.md`
- `.github/workflows/publish.yml`
- `.changeset/config.json`

---

### TASK-021: Documentation
**Agent**: `tdd-developer`
**Estimated Time**: 3 hours
**Dependencies**: All previous tasks

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 21.1 | Write main README with quickstart | `docs: add main readme with quickstart` |
| 21.2 | Create CLI usage documentation | `docs: add cli usage documentation` |
| 21.3 | Create SDK usage documentation | `docs: add sdk usage documentation` |
| 21.4 | Document API endpoints | `docs: add api endpoint documentation` |
| 21.5 | Add architecture overview | `docs: add architecture overview` |
| 21.6 | Create troubleshooting guide | `docs: add troubleshooting guide` |

#### Validation
- README has clear quickstart
- All commands documented
- SDK examples work
- API endpoints documented

#### Artifacts
- `README.md`
- `docs/cli/README.md`
- `docs/sdk/README.md`
- `docs/api/README.md`
- `docs/troubleshooting.md`

---

### TASK-022: End-to-End Testing
**Agent**: `tdd-developer`
**Estimated Time**: 4 hours
**Dependencies**: All previous tasks

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 22.1 | Set up Playwright for e2e tests | `test: add playwright e2e test setup` |
| 22.2 | Write auth flow e2e tests | `test: add auth flow e2e tests` |
| 22.3 | Write key management e2e tests | `test: add key management e2e tests` |
| 22.4 | Write full tunnel flow e2e test | `test: add tunnel flow e2e test` |
| 22.5 | Add e2e tests to CI | `ci: add e2e tests to ci workflow` |

#### Validation
- All e2e tests pass
- CI runs e2e on PR
- Full user journey tested

#### Artifacts
- `e2e/auth.spec.ts`
- `e2e/keys.spec.ts`
- `e2e/tunnels.spec.ts`
- `playwright.config.ts`

---

### TASK-023: Beta Launch Preparation
**Agent**: `config-task-writer`
**Estimated Time**: 2 hours
**Dependencies**: TASK-021, TASK-022

#### Sub-tasks
| # | Task | Commit Message |
|---|------|----------------|
| 23.1 | Configure production environment variables | `chore: add production env configuration` |
| 23.2 | Set up monitoring (Sentry) | `chore: add sentry error monitoring` |
| 23.3 | Configure Cloudflare security rules | `docs: add cloudflare security configuration` |
| 23.4 | Create launch checklist | `docs: add beta launch checklist` |
| 23.5 | Deploy to production | `chore: deploy v0.1.0 to production` |

#### Validation
- Production environment works
- Sentry captures errors
- Security rules active
- All checklist items complete

#### Artifacts
- `docs/launch-checklist.md`
- `.env.production.example`

---

## Task Dependency Graph

```
TASK-001 (Project Setup)
    │
    ├── TASK-004 (Dashboard Scaffolding)
    │       │
    │       └── TASK-005 (Better Auth)
    │               │
    │               ├── TASK-006 (Key API Spec)
    │               │       │
    │               │       └── TASK-007 (Key API)
    │               │               │
    │               │               └── TASK-008 (Key UI)
    │               │
    │               └── TASK-016 (Agent API)
    │
    ├── TASK-002 (Database) ─────┐
    │                            │
    └── TASK-003 (Redis) ────────┼── TASK-009 (Tunnel Architecture)
                                 │       │
                                 │       └── TASK-010 (Tunnel Server)
                                 │               │
                                 │               ├── TASK-011 (Infrastructure)
                                 │               │
                                 │               ├── TASK-012 (CLI Spec)
                                 │               │       │
                                 │               │       └── TASK-013 (CLI)
                                 │               │
                                 │               └── TASK-014 (SDK Spec)
                                 │                       │
                                 │                       └── TASK-015 (SDK)
                                 │
                                 └── TASK-017 (Tunnels UI)
                                         │
                                         └── TASK-018 (Dashboard Home)

TASK-013 + TASK-015 ── TASK-019 (Error Handling)
                              │
                              └── TASK-020 (npm Publishing)

All Tasks ── TASK-021 (Documentation)
                │
                └── TASK-022 (E2E Testing)
                        │
                        └── TASK-023 (Beta Launch)
```

---

## Parallel Execution Opportunities

These tasks can run in parallel:

| Parallel Group | Tasks |
|----------------|-------|
| **Group A** (Foundation) | TASK-001, TASK-002, TASK-003 |
| **Group B** (Specs) | TASK-006, TASK-009, TASK-012, TASK-014 |
| **Group C** (Implementation) | TASK-007 + TASK-010 (after deps) |
| **Group D** (CLI/SDK) | TASK-013, TASK-015 (after TASK-010) |

---

## Summary

| Phase | Tasks | Total Time | Key Deliverable |
|-------|-------|------------|-----------------|
| Phase 1 | TASK-001 to TASK-005 | ~10 hours | Auth + Dashboard skeleton |
| Phase 2 | TASK-006 to TASK-011 | ~21 hours | Key management + Tunnel server |
| Phase 3 | TASK-012 to TASK-016 | ~15 hours | CLI + SDK + Agent API |
| Phase 4 | TASK-017 to TASK-023 | ~19 hours | Polish + Launch |
| **Total** | **23 tasks** | **~65 hours** | **Beta-ready MVP** |

---

## Execution Order (Recommended)

1. **Start**: TASK-001, TASK-002, TASK-003 (parallel)
2. **Then**: TASK-004, TASK-005
3. **Then**: TASK-006, TASK-009 (specs in parallel)
4. **Then**: TASK-007, TASK-010 (implementation)
5. **Then**: TASK-008, TASK-011, TASK-012, TASK-014 (parallel)
6. **Then**: TASK-013, TASK-015, TASK-016 (parallel)
7. **Then**: TASK-017, TASK-018, TASK-019
8. **Then**: TASK-020, TASK-021, TASK-022
9. **Finally**: TASK-023 (launch)

---

*Task list generated from PRD: `tasks/001-prd-liveport-mvp.md`*
