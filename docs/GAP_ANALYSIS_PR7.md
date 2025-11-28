# Gap Analysis: PR #7 - Usage-Based Pricing Model

## Overview

This document analyzes the current state of PR #7 vs. what's needed for a production-ready merge.

**PR Status**: ✅ All CI checks passing  
**Review Status**: ⚠️ Changes Requested (Claude Review)

---

## Summary of Issues

| Priority | Issue | Status | Effort |
|----------|-------|--------|--------|
| 🔴 Critical | Missing byte tracking in HTTP handler | ✅ Fixed | - |
| 🔴 Critical | Use mech-storage API instead of raw SQL | ❌ Pending | 2h |
| 🔴 Critical | In-memory rate limiting won't scale | ❌ Pending | 2h |
| 🔴 Critical | Race condition in metering sync | ❌ Pending | 1h |
| 🔴 Critical | Missing database transactions (UPSERT) | ❌ Pending | 1h |
| ⚠️ High | Missing database indexes | ❌ Pending | 30m |
| ⚠️ High | Missing tests for metering logic | ❌ Pending | 4h |
| ⚠️ High | Inconsistent logging (console vs pino) | ❌ Pending | 1h |
| 📝 Medium | Empty catch blocks in HTTP handler | ❌ Pending | 30m |
| 📝 Medium | Missing request body size limits | ❌ Pending | 30m |
| 📝 Medium | Reduce metering sync interval | ❌ Pending | 15m |
| 📝 Low | Add metering health checks | ❌ Pending | 1h |
| 📝 Low | BigInt for bytesTransferred | ❌ Pending | 30m |

**Total Estimated Effort**: ~13 hours

---

## 🔴 Critical Issues (Must Fix)

### 1. ✅ FIXED: Byte Tracking in HTTP Handler

**Status**: Already implemented in the PR  
**Location**: `apps/tunnel-server/src/http-handler.ts`

The HTTP handler already tracks `requestBodySize` and `responseBodySize` and calls `connectionManager.addBytesTransferred()`.

### 2. ❌ Use Mech-Storage API Instead of Raw SQL

**Location**: `apps/tunnel-server/src/metering.ts:82-116`

**Current Code**:
```typescript
const existing = await db.query(
  `SELECT id FROM tunnels WHERE id = $1`,
  [conn.id]
);
```

**Problem**: Project uses mech-storage API, not direct PostgreSQL queries.

**Fix**: Use repository pattern from `@liveport/shared`:
```typescript
import { TunnelRepository } from "@liveport/shared";

const repo = new TunnelRepository(db);
const existing = await repo.findById(conn.id);
```

**Effort**: 2 hours

### 3. ❌ In-Memory Rate Limiting Won't Scale

**Location**: `apps/dashboard/src/lib/rate-limit.ts:12`

**Current Code**:
```typescript
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
```

**Problem**: 
- Vercel runs multiple instances
- Rate limits can be bypassed by hitting different instances
- Security vulnerability for brute force attacks

**Fix**: Use Redis from `@liveport/shared/redis`:
```typescript
import { createRedisClient } from "@liveport/shared";

const redis = createRedisClient({ url: process.env.REDIS_URL });

export async function checkRateLimit(key: string, limit: number, windowMs: number) {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }
  return count <= limit;
}
```

**Effort**: 2 hours

### 4. ❌ Race Condition in Metering Sync

**Location**: `apps/tunnel-server/src/metering.ts:65-127`

**Problem**: Connections can disconnect during sync iteration, causing:
- Partial metric updates
- Missing finalization calls
- Data loss

**Fix**: Take snapshot before iterating:
```typescript
export async function syncMetrics(): Promise<void> {
  const connectionManager = getConnectionManager();
  
  // Take snapshot to avoid race conditions
  const connections = [...connectionManager.getAll()];
  
  if (connections.length === 0) {
    return;
  }
  // ... rest of sync logic
}
```

**Effort**: 1 hour

### 5. ❌ Missing Database Transactions (UPSERT)

**Location**: `apps/tunnel-server/src/metering.ts:82-116`

**Problem**: SELECT then INSERT/UPDATE without transaction creates race conditions.

**Fix**: Use UPSERT pattern:
```typescript
await db.query(`
  INSERT INTO tunnels (id, user_id, bridge_key_id, subdomain, local_port, 
    public_url, region, connected_at, request_count, bytes_transferred)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE 
  SET request_count = EXCLUDED.request_count, 
      bytes_transferred = EXCLUDED.bytes_transferred,
      updated_at = NOW()
`, [...values]);
```

**Effort**: 1 hour

---

## ⚠️ High Priority Issues

### 6. ❌ Missing Database Indexes

**Location**: `packages/shared/src/db/schema.ts`

**Problem**: No indexes on frequently queried columns.

**Fix**: Add to schema:
```sql
CREATE INDEX idx_tunnels_user_id ON tunnels(user_id);
CREATE INDEX idx_tunnels_connected_at ON tunnels(connected_at);
CREATE INDEX idx_tunnels_bridge_key_id ON tunnels(bridge_key_id);
CREATE INDEX idx_tunnels_user_connected ON tunnels(user_id, connected_at);
```

**Effort**: 30 minutes

### 7. ❌ Missing Tests for Metering Logic

**Problem**: No tests for billing-critical code:
- `syncMetrics()`
- `finalizeTunnelMetrics()`
- Byte tracking in HTTP handler
- Rate limiting

**Impact**: Billing bugs = revenue loss + customer complaints

**Fix**: Add comprehensive test suite:
```typescript
describe('Metering Service', () => {
  it('should sync metrics to database');
  it('should handle connection disconnect during sync');
  it('should finalize metrics on tunnel close');
  it('should track bytes correctly');
});
```

**Effort**: 4 hours

### 8. ❌ Inconsistent Logging

**Problem**: 
- Tunnel server uses `console.log`
- Dashboard uses structured `logger`

**Fix**: Use pino logger consistently:
```typescript
import { createLogger } from "@liveport/shared/logging";
const logger = createLogger({ service: "tunnel-server:metering" });

// Replace console.log with logger.info
logger.info({ tunnelCount: connections.length }, "Syncing metrics");
```

**Effort**: 1 hour

---

## 📝 Medium Priority Issues

### 9. ❌ Empty Catch Blocks

**Location**: `apps/tunnel-server/src/http-handler.ts:186-188`

**Current**:
```typescript
} catch {
  // No body
}
```

**Fix**:
```typescript
} catch (err) {
  logger.warn({ err, requestId }, "Failed to parse request body");
}
```

**Effort**: 30 minutes

### 10. ❌ Missing Request Body Size Limits

**Problem**: No protection against oversized requests.

**Fix**:
```typescript
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

if (bodyBytes.byteLength > MAX_BODY_SIZE) {
  return c.json({ error: "Request too large" }, 413);
}
```

**Effort**: 30 minutes

### 11. ❌ Reduce Metering Sync Interval

**Current**: 60 seconds  
**Recommended**: 10-30 seconds

**Reason**: 
- Less data loss on crash
- Better billing accuracy
- Faster visibility into usage

**Fix**: Change `syncIntervalMs` default to 30000.

**Effort**: 15 minutes

---

## 📝 Low Priority Issues

### 12. ❌ Add Metering Health Checks

**Problem**: No way to monitor metering service health.

**Fix**: Add endpoint:
```typescript
app.get("/_internal/metering/health", (c) => {
  return c.json({
    status: "healthy",
    lastSyncAt: lastSyncTime.toISOString(),
    syncErrorCount,
    activeConnections: connectionManager.getCount(),
  });
});
```

**Effort**: 1 hour

### 13. ❌ BigInt for bytesTransferred

**Problem**: JavaScript numbers lose precision beyond 2^53.

**Risk**: Low (9 petabytes unlikely), but good practice.

**Fix**: Use BigInt or validate max value.

**Effort**: 30 minutes

---

## Implementation Plan

### Phase 1: Critical Fixes (Today) - 7 hours

1. [ ] Fix race condition (snapshot connections)
2. [ ] Add UPSERT for metering sync
3. [ ] Implement Redis rate limiting
4. [ ] Refactor to use mech-storage API
5. [ ] Add database indexes

### Phase 2: High Priority (Tomorrow) - 5 hours

6. [ ] Add metering tests
7. [ ] Standardize logging (pino everywhere)
8. [ ] Add request body size limits

### Phase 3: Polish (This Week) - 2 hours

9. [ ] Fix empty catch blocks
10. [ ] Reduce sync interval
11. [ ] Add health checks
12. [ ] BigInt for bytes

---

## Files to Modify

| File | Changes |
|------|---------|
| `apps/tunnel-server/src/metering.ts` | UPSERT, snapshot, logging, intervals |
| `apps/tunnel-server/src/http-handler.ts` | Body size limits, error logging |
| `apps/dashboard/src/lib/rate-limit.ts` | Redis-based rate limiting |
| `packages/shared/src/db/schema.ts` | Add indexes |
| `apps/tunnel-server/src/__tests__/metering.test.ts` | New test file |

---

## What's Already Working ✅

1. **Byte tracking** in HTTP handler
2. **Metering service** periodic sync
3. **Finalization** on disconnect
4. **Database schema** for tunnels and static_subdomains
5. **Documentation** is excellent
6. **Pricing model** is well-defined
7. **CI/CD** all checks passing
8. **Vercel deployment** working

---

## Conclusion

The PR is **80% complete**. The core functionality works, but needs hardening for production:

- **Security**: Redis rate limiting
- **Reliability**: Race conditions, transactions
- **Observability**: Consistent logging
- **Quality**: Tests for billing code

**Estimated time to merge-ready**: 1-2 days of focused work.

---

## Quick Wins (< 30 min each)

1. ✅ Reduce sync interval (15 min)
2. ✅ Add database indexes (30 min)
3. ✅ Fix empty catch blocks (30 min)
4. ✅ Add body size limits (30 min)

Start with these for quick progress while planning larger fixes.

