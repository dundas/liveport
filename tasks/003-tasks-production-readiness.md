# LivePort Production Readiness Task List

## Document Info
- **Source**: Gap Analysis (2025-11-27)
- **Created**: 2025-11-27
- **Status**: Ready for execution
- **Prerequisite**: MVP tasks (TASK-001 through TASK-023) completed

---

## Overview

This task list covers the gaps identified in the production readiness gap analysis. These tasks transform LivePort from a feature-complete MVP to a production-ready service.

**Priority Levels:**
- 🔴 **Critical** - Must complete before production launch
- 🟡 **Important** - Should complete within first week post-launch
- 🟢 **Nice-to-Have** - Can be completed post-launch

---

## Relevant Files

### Testing Infrastructure
- `packages/shared/src/keys/index.ts` - Bridge key generation/validation (needs tests)
- `packages/shared/src/keys/index.test.ts` - Unit tests for key utilities (to create)
- `packages/shared/src/redis/rate-limiter.ts` - Rate limiting logic (needs tests)
- `packages/shared/src/redis/rate-limiter.test.ts` - Unit tests for rate limiter (to create)
- `packages/shared/src/auth/mech-storage-adapter.ts` - Auth adapter (needs tests)
- `packages/shared/src/auth/mech-storage-adapter.test.ts` - Unit tests for adapter (to create)
- `apps/tunnel-server/src/key-validator.ts` - Key validation (needs tests)
- `apps/tunnel-server/src/key-validator.test.ts` - Unit tests (to create)
- `apps/tunnel-server/src/websocket-handler.ts` - WebSocket handling (needs tests)
- `apps/dashboard/src/app/api/keys/route.ts` - Keys API (needs integration tests)
- `apps/dashboard/__tests__/api/keys.test.ts` - API integration tests (to create)
- `vitest.config.ts` - Test configuration (to create at root and package level)

### Error Monitoring & Logging
- `packages/shared/src/logging/index.ts` - Structured logging utility (to create)
- `apps/dashboard/src/lib/sentry.ts` - Sentry client initialization (to create)
- `apps/dashboard/src/app/global-error.tsx` - Global error boundary (to create/update)
- `apps/tunnel-server/src/logging.ts` - Server logging (to create)
- `apps/tunnel-server/src/sentry.ts` - Sentry for tunnel server (to create)

### Security
- `apps/dashboard/src/middleware.ts` - Auth middleware (needs rate limiting)
- `apps/dashboard/src/lib/rate-limit.ts` - Auth rate limiting (to create)
- `apps/dashboard/next.config.ts` - Security headers configuration
- `apps/tunnel-server/src/cors.ts` - CORS configuration (to create)

### Health Checks & Monitoring
- `apps/dashboard/src/app/api/health/route.ts` - Health check endpoint (to create)
- `apps/tunnel-server/src/index.ts` - Health check exists, may need enhancement
- `scripts/health-check.ts` - Health check script for monitoring (to create)

### Database Operations
- `packages/shared/src/db/migrations/` - Migration directory (to create)
- `scripts/migrate.ts` - Migration runner script (to create)
- `scripts/backup.ts` - Database backup script (to create)

### CLI & SDK Publishing
- `packages/cli/package.json` - npm publish configuration
- `packages/cli/README.md` - Package documentation
- `packages/agent-sdk/package.json` - npm publish configuration
- `packages/agent-sdk/README.md` - Package documentation
- `.changeset/config.json` - Changeset configuration (to create)
- `.github/workflows/publish.yml` - npm publish workflow (to create)

### API Documentation
- `docs/api/openapi.yaml` - OpenAPI specification (to create)
- `apps/dashboard/src/app/api/docs/route.ts` - Swagger UI endpoint (to create)

### Deployment & Operations
- `docs/deployment/runbook.md` - Deployment runbook (to create)
- `docs/deployment/secrets.md` - Secrets management guide (to create)
- `docs/deployment/incident-response.md` - Incident procedures (to create)
- `.env.production.example` - Production env template (to create)

### Notes
- Unit tests should be co-located with source files using `.test.ts` suffix
- Integration tests go in `__tests__/` directories
- Use Vitest as the test runner per repo conventions
- Use pino for structured logging (JSON format in production)

---

## Tasks

### 🔴 TASK-024: Unit & Integration Test Coverage
**Priority**: Critical
**Agent**: `tdd-developer`
**Dependencies**: None

- [ ] 24.0 Set up testing infrastructure and write critical path tests
  - [ ] 24.1 Add Vitest configuration to root and all packages
    - Create `vitest.config.ts` at root with workspace configuration
    - Create package-level configs for `shared`, `cli`, `agent-sdk`, `tunnel-server`
    - Configure coverage thresholds (target: 70% for critical paths)
    - Commit: `chore: add vitest configuration across monorepo`
  - [ ] 24.2 Write unit tests for bridge key generation and validation
    - Test `generateBridgeKey()` produces correct format (lpk_ prefix, 32 chars)
    - Test `validateBridgeKey()` rejects invalid formats
    - Test `maskBridgeKey()` correctly masks middle characters
    - Test `hashBridgeKey()` produces consistent hashes
    - Commit: `test(shared): add bridge key utility tests`
  - [ ] 24.3 Write unit tests for rate limiter
    - Test rate limiting increments correctly
    - Test rate limit reset after window expires
    - Test rate limit blocking at threshold
    - Mock Redis client for isolation
    - Commit: `test(shared): add rate limiter unit tests`
  - [ ] 24.4 Write unit tests for mech-storage adapter
    - Test user CRUD operations
    - Test session management
    - Test account linking
    - Mock MechStorageClient for isolation
    - Commit: `test(shared): add mech-storage adapter tests`
  - [ ] 24.5 Write unit tests for tunnel server key validator
    - Test valid key acceptance
    - Test expired key rejection
    - Test revoked key rejection
    - Test usage limit enforcement
    - Commit: `test(tunnel): add key validator unit tests`
  - [ ] 24.6 Write integration tests for keys API endpoints
    - Test POST /api/keys creates key with correct scoping
    - Test GET /api/keys returns only user's keys
    - Test DELETE /api/keys/:id revokes key
    - Test rate limiting on key creation
    - Commit: `test(dashboard): add keys api integration tests`
  - [ ] 24.7 Write integration tests for agent API endpoints
    - Test GET /api/agent/tunnels returns tunnels for key
    - Test GET /api/agent/tunnels/wait long-polls correctly
    - Test 401 response for invalid key
    - Commit: `test(dashboard): add agent api integration tests`
  - [ ] 24.8 Add test scripts to package.json and CI workflow
    - Add `test` script to root package.json
    - Add `test:coverage` script for coverage reports
    - Verify CI workflow runs tests
    - Commit: `chore: add test scripts and ci integration`

#### Validation
- `pnpm test` passes with no failures
- Coverage report shows >70% on critical paths
- CI runs tests on every PR

---

### 🔴 TASK-025: Error Monitoring & Logging Infrastructure
**Priority**: Critical
**Agent**: `config-task-writer`
**Dependencies**: None

- [ ] 25.0 Set up error monitoring and structured logging
  - [ ] 25.1 Install and configure Sentry for dashboard
    - Install `@sentry/nextjs` package
    - Create `sentry.client.config.ts` and `sentry.server.config.ts`
    - Configure DSN via environment variable `SENTRY_DSN`
    - Set up source maps upload in build
    - Commit: `feat(dashboard): add sentry error monitoring`
  - [ ] 25.2 Install and configure Sentry for tunnel server
    - Install `@sentry/node` package
    - Initialize Sentry in server startup
    - Configure environment and release tags
    - Commit: `feat(tunnel): add sentry error monitoring`
  - [ ] 25.3 Create structured logging utility with pino
    - Install `pino` and `pino-pretty` packages
    - Create `packages/shared/src/logging/index.ts`
    - Configure JSON output in production, pretty in development
    - Add log levels: error, warn, info, debug
    - Include request ID, timestamp, service name
    - Commit: `feat(shared): add pino structured logging`
  - [ ] 25.4 Integrate logging into dashboard API routes
    - Add request logging middleware
    - Log API errors with stack traces
    - Log authentication events
    - Commit: `feat(dashboard): add request logging`
  - [ ] 25.5 Integrate logging into tunnel server
    - Log WebSocket connections and disconnections
    - Log key validation results
    - Log rate limit events
    - Commit: `feat(tunnel): add structured logging`
  - [ ] 25.6 Update error boundaries to report to Sentry
    - Update `apps/dashboard/src/app/error.tsx`
    - Create `apps/dashboard/src/app/global-error.tsx`
    - Capture and report unhandled errors
    - Commit: `feat(dashboard): integrate error boundaries with sentry`

#### Validation
- Sentry receives test error from dashboard
- Sentry receives test error from tunnel server
- Logs appear in JSON format in production
- Request IDs correlate across services

---

### 🔴 TASK-026: Security Hardening
**Priority**: Critical
**Agent**: `tdd-developer`
**Dependencies**: None

- [ ] 26.0 Implement security measures for production
  - [ ] 26.1 Add rate limiting to authentication endpoints
    - Create `apps/dashboard/src/lib/rate-limit.ts`
    - Limit login attempts: 5 per minute per IP
    - Limit signup attempts: 3 per minute per IP
    - Use Redis for distributed rate limiting
    - Commit: `feat(dashboard): add auth endpoint rate limiting`
  - [ ] 26.2 Configure CORS for agent SDK requests
    - Create `apps/dashboard/src/lib/cors.ts`
    - Allow requests from configured origins
    - Handle preflight requests properly
    - Apply to /api/agent/* routes
    - Commit: `feat(dashboard): configure cors for agent api`
  - [ ] 26.3 Add security headers via Next.js config
    - Configure Content-Security-Policy
    - Add X-Frame-Options: DENY
    - Add X-Content-Type-Options: nosniff
    - Add Referrer-Policy: strict-origin-when-cross-origin
    - Commit: `feat(dashboard): add security headers`
  - [ ] 26.4 Configure CORS for tunnel server
    - Create `apps/tunnel-server/src/cors.ts`
    - Allow requests only from tunnel subdomains
    - Validate Origin header
    - Commit: `feat(tunnel): configure cors headers`
  - [ ] 26.5 Audit and fix potential vulnerabilities
    - Run `pnpm audit` and address high/critical issues
    - Review environment variable handling
    - Ensure no secrets in logs
    - Commit: `fix: address security audit findings`
  - [ ] 26.6 Add input validation to all API endpoints
    - Validate request body schemas with Zod
    - Sanitize user input
    - Return consistent error responses
    - Commit: `feat(dashboard): add input validation to api routes`

#### Validation
- Auth rate limiting blocks after 5 failed attempts
- CORS blocks requests from unauthorized origins
- Security headers present in responses
- `pnpm audit` shows no high/critical vulnerabilities

---

### 🔴 TASK-027: Health Checks & Monitoring
**Priority**: Critical
**Agent**: `config-task-writer`
**Dependencies**: TASK-025

- [ ] 27.0 Implement health checks and uptime monitoring
  - [ ] 27.1 Add health check endpoint to dashboard
    - Create `apps/dashboard/src/app/api/health/route.ts`
    - Check database connectivity
    - Check Redis connectivity
    - Return service status and version
    - Commit: `feat(dashboard): add health check endpoint`
  - [ ] 27.2 Enhance tunnel server health check
    - Add database connectivity check
    - Add Redis connectivity check
    - Include active connection count
    - Commit: `feat(tunnel): enhance health check endpoint`
  - [ ] 27.3 Configure Fly.io health checks
    - Update `apps/dashboard/fly.toml` with health check config
    - Update `apps/tunnel-server/fly.toml` with health check config
    - Set appropriate intervals and timeouts
    - Commit: `chore: configure fly.io health checks`
  - [ ] 27.4 Set up uptime monitoring service
    - Document setup for Betterstack/UptimeRobot/similar
    - Configure alerts for downtime
    - Create status page (optional)
    - Commit: `docs: add uptime monitoring setup guide`
  - [ ] 27.5 Add readiness and liveness probes
    - Separate `/health/ready` (dependencies up)
    - Separate `/health/live` (process alive)
    - Document probe usage
    - Commit: `feat: add readiness and liveness probes`

#### Validation
- `/api/health` returns 200 when all services up
- `/api/health` returns 503 when dependency down
- Fly.io restarts unhealthy machines
- Monitoring alerts on downtime

---

### 🟡 TASK-028: Database Operations & Backups
**Priority**: Important
**Agent**: `config-task-writer`
**Dependencies**: None

- [ ] 28.0 Set up database operations and backup strategy
  - [ ] 28.1 Create database migration system
    - Create `packages/shared/src/db/migrations/` directory
    - Create migration runner script `scripts/migrate.ts`
    - Document migration file naming convention (001_name.sql)
    - Track applied migrations in database
    - Commit: `feat(shared): add database migration system`
  - [ ] 28.2 Write initial migration from current schema
    - Export current schema as baseline migration
    - Create `001_initial_schema.sql`
    - Test migration on fresh database
    - Commit: `chore: add initial database migration`
  - [ ] 28.3 Document backup strategy
    - Document mech-storage backup capabilities
    - Create backup script if manual backup needed
    - Document restore procedure
    - Commit: `docs: add database backup and restore guide`
  - [ ] 28.4 Add connection pooling configuration
    - Configure appropriate pool size for production
    - Add connection timeout settings
    - Document connection management
    - Commit: `feat(shared): configure database connection pooling`
  - [ ] 28.5 Create database seeding script for development
    - Create `scripts/seed.ts`
    - Add test user, keys, and tunnels
    - Document usage
    - Commit: `chore: add database seed script`

#### Validation
- Migrations run successfully on fresh database
- Backup/restore procedure documented
- Connection pool handles concurrent requests
- Seed script creates expected data

---

### 🟡 TASK-029: CLI & SDK Publishing
**Priority**: Important
**Agent**: `config-task-writer`
**Dependencies**: None

- [ ] 29.0 Prepare and publish npm packages
  - [ ] 29.1 Configure CLI package for npm publishing
    - Update `packages/cli/package.json` with publish config
    - Set `name`: `@liveport/cli`
    - Configure `bin` entry point
    - Add `files` array for published files
    - Set `publishConfig` for public access
    - Commit: `chore(cli): configure npm publishing`
  - [ ] 29.2 Write CLI README with usage examples
    - Installation instructions (`npm install -g @liveport/cli`)
    - Quick start guide
    - All command documentation
    - Configuration file reference
    - Troubleshooting section
    - Commit: `docs(cli): add comprehensive readme`
  - [ ] 29.3 Configure Agent SDK package for npm publishing
    - Update `packages/agent-sdk/package.json` with publish config
    - Set `name`: `@liveport/agent-sdk`
    - Configure TypeScript declarations
    - Add `files` array for published files
    - Commit: `chore(sdk): configure npm publishing`
  - [ ] 29.4 Write Agent SDK README with usage examples
    - Installation instructions
    - Quick start with code examples
    - API reference for all methods
    - Error handling documentation
    - TypeScript usage examples
    - Commit: `docs(sdk): add comprehensive readme`
  - [ ] 29.5 Set up Changesets for version management
    - Install `@changesets/cli`
    - Create `.changeset/config.json`
    - Document changeset workflow
    - Commit: `chore: add changesets for version management`
  - [ ] 29.6 Create npm publish GitHub Action workflow
    - Create `.github/workflows/publish.yml`
    - Trigger on release tag
    - Build and publish CLI and SDK
    - Configure NPM_TOKEN secret
    - Commit: `ci: add npm publish workflow`

#### Validation
- `npm publish --dry-run` succeeds for both packages
- README renders correctly on npm preview
- Changesets generates changelog
- CI workflow publishes on release tag

---

### 🟡 TASK-030: API Documentation
**Priority**: Important
**Agent**: `spec-writer`
**Dependencies**: None

- [ ] 30.0 Create comprehensive API documentation
  - [ ] 30.1 Write OpenAPI specification for all endpoints
    - Create `docs/api/openapi.yaml`
    - Document all /api/keys endpoints
    - Document all /api/tunnels endpoints
    - Document all /api/agent endpoints
    - Include request/response schemas
    - Add authentication requirements
    - Commit: `docs: add openapi specification`
  - [ ] 30.2 Add example requests and responses
    - Add examples for each endpoint
    - Include error response examples
    - Document rate limit responses
    - Commit: `docs: add api examples to openapi spec`
  - [ ] 30.3 Set up Swagger UI for interactive docs
    - Install `swagger-ui-react` or use hosted version
    - Create `/api/docs` route to serve Swagger UI
    - Load OpenAPI spec dynamically
    - Commit: `feat(dashboard): add swagger ui for api docs`
  - [ ] 30.4 Document authentication flows
    - Document session-based auth for dashboard
    - Document bridge key auth for agent API
    - Include code examples in multiple languages
    - Commit: `docs: add authentication documentation`
  - [ ] 30.5 Create API changelog
    - Create `docs/api/CHANGELOG.md`
    - Document versioning strategy
    - Note any breaking changes
    - Commit: `docs: add api changelog`

#### Validation
- OpenAPI spec validates without errors
- Swagger UI loads and displays all endpoints
- Examples work when tested
- Authentication documented clearly

---

### 🟡 TASK-031: Deployment & Operations Guide
**Priority**: Important
**Agent**: `config-task-writer`
**Dependencies**: TASK-025, TASK-027

- [ ] 31.0 Create deployment and operations documentation
  - [ ] 31.1 Write deployment runbook
    - Create `docs/deployment/runbook.md`
    - Document Fly.io deployment process
    - Include rollback procedures
    - Document environment-specific configs
    - Commit: `docs: add deployment runbook`
  - [ ] 31.2 Document secrets management
    - Create `docs/deployment/secrets.md`
    - List all required secrets
    - Document Fly.io secrets management
    - Include rotation procedures
    - Commit: `docs: add secrets management guide`
  - [ ] 31.3 Create incident response procedures
    - Create `docs/deployment/incident-response.md`
    - Document escalation paths
    - Include common issue resolutions
    - Add monitoring alert responses
    - Commit: `docs: add incident response procedures`
  - [ ] 31.4 Document architecture for operators
    - Create `docs/architecture/overview.md`
    - Include service diagram
    - Document data flows
    - Explain scaling considerations
    - Commit: `docs: add architecture overview`
  - [ ] 31.5 Create troubleshooting guide
    - Create `docs/troubleshooting.md`
    - Common CLI issues and solutions
    - Common tunnel issues and solutions
    - Debug logging instructions
    - Commit: `docs: add troubleshooting guide`

#### Validation
- New team member can deploy following runbook
- Secrets are documented without exposing values
- Incident procedures cover common scenarios
- Architecture diagram is accurate

---

### 🔴 TASK-032: Production Environment Configuration
**Priority**: Critical
**Agent**: `config-task-writer`
**Dependencies**: TASK-025, TASK-026, TASK-027

- [ ] 32.0 Configure production environment for launch
  - [ ] 32.1 Create production environment template
    - Create `.env.production.example`
    - Document all required variables
    - Include comments explaining each variable
    - Commit: `chore: add production env template`
  - [ ] 32.2 Configure Fly.io secrets for dashboard
    - Set MECH_STORAGE_APP_ID
    - Set MECH_STORAGE_API_KEY
    - Set REDIS_URL
    - Set BETTER_AUTH_SECRET
    - Set SENTRY_DSN
    - Document in secrets guide
    - Commit: `docs: document dashboard fly.io secrets`
  - [ ] 32.3 Configure Fly.io secrets for tunnel server
    - Set MECH_STORAGE_APP_ID
    - Set MECH_STORAGE_API_KEY
    - Set REDIS_URL
    - Set SENTRY_DSN
    - Set INTERNAL_API_SECRET
    - Document in secrets guide
    - Commit: `docs: document tunnel server fly.io secrets`
  - [ ] 32.4 Set up Cloudflare DNS and SSL
    - Configure wildcard DNS for *.liveport.dev
    - Enable SSL/TLS encryption
    - Configure caching rules
    - Document configuration
    - Commit: `docs: add cloudflare configuration guide`
  - [ ] 32.5 Validate deployment pipeline end-to-end
    - Test push to main triggers deploy
    - Verify dashboard deploys successfully
    - Verify tunnel server deploys successfully
    - Test health checks pass
    - Commit: `chore: validate deployment pipeline`
  - [ ] 32.6 Create launch checklist
    - Create `docs/launch-checklist.md`
    - Include all pre-launch verification steps
    - Include post-launch monitoring steps
    - Sign-off checkboxes
    - Commit: `docs: add production launch checklist`

#### Validation
- All secrets configured in Fly.io
- Deployment pipeline completes successfully
- Services accessible at production URLs
- Health checks pass in production
- Launch checklist complete

---

## Task Dependency Graph

```
TASK-024 (Tests) ─────────────────────────────────────────┐
                                                          │
TASK-025 (Monitoring) ────────┬───────────────────────────┤
                              │                           │
TASK-026 (Security) ──────────┤                           │
                              │                           │
TASK-027 (Health Checks) ─────┴─────────┐                 │
                                        │                 │
TASK-028 (Database) ────────────────────┤                 │
                                        │                 │
TASK-029 (Publishing) ──────────────────┤                 │
                                        │                 │
TASK-030 (API Docs) ────────────────────┤                 │
                                        │                 │
TASK-031 (Operations) ──────────────────┤                 │
                                        │                 │
                                        ▼                 │
                              TASK-032 (Production) ◄─────┘
                                        │
                                        ▼
                                   🚀 LAUNCH
```

---

## Parallel Execution Opportunities

| Parallel Group | Tasks | Notes |
|----------------|-------|-------|
| **Group A** (Foundation) | TASK-024, TASK-025, TASK-026 | Can all start immediately |
| **Group B** (Documentation) | TASK-028, TASK-029, TASK-030, TASK-031 | Can run in parallel |
| **Group C** (Final) | TASK-027, TASK-032 | After monitoring setup |

---

## Summary

| Task | Priority | Effort | Key Deliverable |
|------|----------|--------|-----------------|
| TASK-024 | 🔴 Critical | ~8 hours | Test coverage >70% |
| TASK-025 | 🔴 Critical | ~4 hours | Sentry + structured logging |
| TASK-026 | 🔴 Critical | ~4 hours | Rate limiting + security headers |
| TASK-027 | 🔴 Critical | ~3 hours | Health checks + monitoring |
| TASK-028 | 🟡 Important | ~3 hours | Migrations + backups |
| TASK-029 | 🟡 Important | ~3 hours | npm packages published |
| TASK-030 | 🟡 Important | ~4 hours | OpenAPI + Swagger UI |
| TASK-031 | 🟡 Important | ~3 hours | Operations documentation |
| TASK-032 | 🔴 Critical | ~4 hours | Production configured |
| **Total** | | **~36 hours** | **Production-ready** |

---

## Execution Order (Recommended)

1. **Start (Parallel)**: TASK-024, TASK-025, TASK-026
2. **Then**: TASK-027 (needs TASK-025)
3. **Parallel (Documentation)**: TASK-028, TASK-029, TASK-030, TASK-031
4. **Finally**: TASK-032 (production launch prep)
5. **Launch** 🚀

---

*Task list generated from Production Readiness Gap Analysis (2025-11-27)*
