# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages (uses Turborepo)
pnpm build

# Build specific package
pnpm build --filter=@liveport/shared
pnpm build --filter=@liveport/dashboard

# Development mode
pnpm dev

# Run tests
pnpm test
pnpm test --filter=@liveport/shared

# Run single test file
cd packages/shared && pnpm vitest run src/keys/index.test.ts

# Lint
pnpm lint

# Format
pnpm format
```

## Architecture

LivePort is a pnpm monorepo using Turborepo for build orchestration. It provides secure localhost tunnels for AI agents.

### Packages

- **`@liveport/shared`** (`packages/shared/`) - Core utilities shared across all packages
  - `db/` - mech-storage PostgreSQL client and repositories
  - `redis/` - Redis client, rate limiting, tunnel state, caching
  - `auth/` - ClearAuth adapter for mech-storage
  - `keys/` - Bridge key generation and validation
  - `types/` - Shared TypeScript types
  - Build: `tsup` outputs CJS, ESM, and DTS

- **`@liveport/dashboard`** (`apps/dashboard/`) - Next.js 16 web dashboard
  - Uses App Router with route groups: `(auth)` for login/signup, `(dashboard)` for protected pages
  - Auth via ClearAuth (GitHub + Google OAuth) with mech-storage adapter
  - UI components from shadcn/ui in `src/components/ui/`
  - Runs on port 3001

- **`@liveport/cli`** (`packages/cli/`) - CLI client (placeholder)
- **`@liveport/agent-sdk`** (`packages/agent-sdk/`) - Agent SDK (placeholder)
- **`apps/tunnel-server/`** - Tunnel server (placeholder)

### Key Integrations

**Database**: Uses mech-storage API (not direct PostgreSQL). Client at `@liveport/shared/db`:
```typescript
import { MechStorageClient } from "@liveport/shared";
const db = new MechStorageClient({ appId, apiKey, baseUrl });
```

**Auth**: ClearAuth with mech-storage adapter (`apps/dashboard/src/lib/auth.ts`):
```typescript
import { createClearAuthNode } from "clearauth/node";
createClearAuthNode({ secret, baseUrl, database: { appId, apiKey, baseUrl } });
```

**Redis**: Fly.io Upstash Redis (`liveport-redis`). Client at `@liveport/shared/redis`.

### Database Schema

Tables: `user`, `session`, `account`, `verification` (ClearAuth conventions) plus LivePort tables (`bridge_keys`, `tunnels`). Schema defined in `packages/shared/src/db/schema.ts`.

## Environment Variables

Copy `apps/dashboard/.env.example` to `.env`. Required:
- `MECH_APPS_APP_ID`, `MECH_APPS_API_KEY` - Database credentials
- `REDIS_URL` - Redis connection string (use `rediss://` for TLS with Upstash)
- `AUTH_SECRET` - ClearAuth secret (32+ chars)

## Task Documentation

Implementation tasks are tracked in `tasks/002-tasklist-liveport-mvp.md`. Each task specifies the agent type, dependencies, and commit message format.
