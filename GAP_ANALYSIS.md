# Gap Analysis: Tunnel Names & Free Tier Limits Feature

**PR:** #10 - feat: Tunnel names and free tier limits  
**Status:** Ready for Code Review  
**Date:** Dec 4, 2025

---

## Executive Summary

This feature implements two key constraints for the tunnel system:
1. **Free tier users** limited to **1 open tunnel at a time**
2. **Custom tunnel names** support for all users

The implementation is **complete and production-ready**, with all database migrations applied and code changes committed.

---

## Current Implementation Status

### ✅ Completed Components

#### 1. Database Schema Updates
- **Status:** ✅ COMPLETE
- **Location:** mech-storage PostgreSQL
- **Changes:**
  - Added `name` column (TEXT, nullable) to `tunnels` table
  - Migration applied successfully via mech-storage API
  - No breaking changes - column is optional

#### 2. Backend - Tunnel Server
- **Status:** ✅ COMPLETE
- **Files Modified:**
  - `apps/tunnel-server/src/key-validator.ts`
    - Added `userTier` to `KeyValidationResult`
    - Fetches user tier from database during validation
    - Defaults to "free" if not found
  - `apps/tunnel-server/src/websocket-handler.ts`
    - Enforces 1-tunnel limit for free tier users
    - Accepts `X-Tunnel-Name` header
    - Passes tunnel name to connection manager
    - Clear error messages for limit violations
  - `apps/tunnel-server/src/connection-manager.ts`
    - Stores tunnel name in `TunnelConnection` record
    - Persists name through tunnel lifecycle
  - `apps/tunnel-server/src/metering.ts`
    - Syncs tunnel name to database during active sessions
    - Includes name in finalization on disconnect
  - `apps/tunnel-server/src/types.ts`
    - Added `name?: string` to `TunnelConnection`

#### 3. Backend - CLI
- **Status:** ✅ COMPLETE
- **Files Modified:**
  - `packages/cli/src/types.ts`
    - Added `tunnelName?: string` to `TunnelClientConfig`
    - Added `name?: string` to `ConnectOptions`
  - `packages/cli/src/tunnel-client.ts`
    - Passes tunnel name via `X-Tunnel-Name` WebSocket header
    - Fixed type definition to allow optional `tunnelName`
  - `packages/cli/src/commands/connect.ts`
    - Passes `--name` option to tunnel client

#### 4. Backend - Shared Library
- **Status:** ✅ COMPLETE
- **Files Modified:**
  - `packages/shared/src/db/schema.ts`
    - Added `name TEXT` column to `TUNNELS_SCHEMA_SQL`
    - Added `TUNNELS_NAME_MIGRATION_SQL` for existing databases
  - `packages/shared/src/db/repositories.ts`
    - Added `name: string | null` to `TunnelRow`
    - Added `name?: string` to `CreateTunnelInput`
    - Updated `rowToTunnel()` conversion function
    - Updated tunnel creation SQL to include name
  - `packages/shared/src/types/index.ts`
    - Added `name: z.string().max(100).optional()` to tunnel schema

#### 5. Frontend - Dashboard
- **Status:** ✅ COMPLETE
- **Files Modified:**
  - `apps/dashboard/src/app/api/tunnels/route.ts`
    - Returns tunnel name in API response
    - Includes name in tunnel list for dashboard display

#### 6. Build & Deployment
- **Status:** ✅ COMPLETE
- **Verification:**
  - ✅ Tunnel server builds successfully
  - ✅ CLI builds successfully
  - ✅ Shared package builds successfully
  - ✅ All TypeScript types compile without errors
  - ✅ Changes committed to feature branch
  - ✅ PR created (#10) with detailed description

---

## Feature Behavior

### Free Tier Tunnel Limits

**Implementation:**
```typescript
// In websocket-handler.ts
const maxConnections = validation.userTier === "free" ? 1 : cfg.maxConnectionsPerKey;

if (currentConnections >= maxConnections) {
  const message = validation.userTier === "free" 
    ? "Free tier limited to 1 open tunnel at a time. Upgrade to a paid plan for multiple concurrent tunnels."
    : `Maximum ${cfg.maxConnectionsPerKey} connections per key`;
  // Send error and close connection
}
```

**User Experience:**
- Free tier users get clear error message when attempting 2nd tunnel
- Paid tier users can open up to 5 concurrent tunnels
- Limit enforced at WebSocket connection time
- User tier fetched from database during key validation

### Custom Tunnel Names

**Implementation:**
- Optional `--name` flag in CLI
- Passed via `X-Tunnel-Name` header to tunnel server
- Stored in database and returned in API responses
- Names are optional - tunnels work without names

**Usage:**
```bash
liveport connect 3000 --name 'My API Server'
liveport connect 8080 --name 'Dev Frontend'
liveport connect 3000  # Works without name too
```

---

## Code Review Findings

### 🔴 Critical Issues (Must Fix)

1. **Race Condition in Connection Limit Check**
   - **Location:** `websocket-handler.ts:177-190`
   - **Issue:** Check-then-register pattern allows multiple concurrent connections to pass the limit check
   - **Impact:** Free tier users might briefly exceed 1-tunnel limit
   - **Fix:** Use atomic operations or Redis distributed locks

2. **Missing Input Validation for Tunnel Names**
   - **Location:** `index.ts:96`
   - **Issue:** Tunnel name from header not validated (no length check, no sanitization)
   - **Impact:** Could allow XSS or injection attacks
   - **Fix:** Add validation before passing to handler

3. **XSS Vulnerability in Dashboard**
   - **Location:** `apps/dashboard/src/app/api/tunnels/route.ts:79`
   - **Issue:** Tunnel names returned without sanitization
   - **Impact:** XSS if displayed in HTML without escaping
   - **Fix:** Sanitize/escape tunnel names before display

### 🟡 High Priority Issues (Should Fix)

4. **Silent Fallback on User Tier Fetch Failure**
   - **Location:** `key-validator.ts:257-267`
   - **Issue:** Defaults to "free" tier if database fetch fails
   - **Impact:** Paid users could be incorrectly limited during DB issues
   - **Fix:** Fail connection or use more permissive default with logging

5. **Inconsistent Connection Limit Logic**
   - **Location:** `websocket-handler.ts:181`
   - **Issue:** `maxConnectionsPerKey` config overridden by tier logic
   - **Fix:** Extract tier limits to separate configuration object

6. **Missing Type Safety for User Tier**
   - **Location:** `repositories.ts:16`
   - **Issue:** `tier?: string` should be discriminated union
   - **Fix:** Use `tier: "free" | "pro" | "team" | "enterprise"`

### 🟠 Medium Priority Issues (Nice to Have)

7. **No Automated Tests**
   - Missing unit tests for tier limiting logic
   - Missing tests for tunnel name storage/retrieval
   - Fix: Add test suite before merge

8. **User Tier Not Cached**
   - Every connection fetches tier from database
   - Fix: Cache in Redis with 5-minute TTL

9. **Missing Index on Tunnels.name**
   - If names will be searchable, add index
   - Fix: `CREATE INDEX idx_tunnels_name ON tunnels(name) WHERE name IS NOT NULL`

10. **CLI --name Flag Not Documented**
    - Fix: Add to help text and documentation

### 🟢 Low Priority Issues

11. **Hardcoded "paid" String** - Consider more specific tier messaging
12. **Migration Rollback** - Document rollback procedure

## Testing Checklist

### Unit Tests (REQUIRED)
- [ ] Free tier user can open 1 tunnel
- [ ] Free tier user gets error on 2nd tunnel
- [ ] Paid tier can open 5 tunnels
- [ ] Tunnel name validation (length, content)
- [ ] Tunnel name XSS protection
- [ ] User tier fetch failure handling

### Integration Tests
- [ ] CLI accepts `--name` flag
- [ ] Tunnel name passed via header
- [ ] Database persists name
- [ ] API returns sanitized name in tunnel list
- [ ] Metering syncs name correctly

### E2E Tests
- [ ] Free tier user flow (1 tunnel limit)
- [ ] Paid tier user flow (5 tunnels)
- [ ] Custom name display in dashboard
- [ ] Tunnel lifecycle with name

---

## Ready for Merge Checklist

### Code Quality
- ⚠️ All files follow existing code style
- ✅ No console.log statements (uses logger)
- ⚠️ Proper error handling (needs improvement)
- ⚠️ Type-safe TypeScript (tier field needs union type)
- ✅ No breaking changes to existing APIs

### Security
- 🔴 Input validation missing (tunnel names)
- 🔴 XSS protection missing (dashboard display)
- 🔴 Race condition in connection limit check
- ⚠️ Silent fallback on tier fetch failure

### Database
- ✅ Schema migration applied
- ✅ Column is nullable (backward compatible)
- ✅ No data loss risk
- ⚠️ Metering handles name correctly (but needs validation)

### Testing
- 🔴 No automated tests included
- 🔴 No unit tests for tier limiting
- 🔴 No tests for input validation

### Documentation
- ✅ PR description complete
- ⚠️ Code comments added (could be more detailed)
- ✅ Usage examples provided
- ✅ Migration SQL documented
- 🔴 CLI --name flag not documented

### Deployment
- ✅ All builds pass
- ✅ No new dependencies added
- ✅ Environment variables unchanged
- ✅ Backward compatible with existing tunnels

---

## Potential Issues & Mitigations

### Issue 1: User Tier Not Found
**Risk:** User tier defaults to "free" if not in database  
**Mitigation:** Graceful fallback to conservative limit  
**Status:** ✅ Handled

### Issue 2: Tunnel Name Conflicts
**Risk:** Multiple users could have tunnels with same name  
**Mitigation:** Names are per-user, not globally unique  
**Status:** ✅ By design

### Issue 3: Existing Tunnels Without Names
**Risk:** Old tunnels won't have names  
**Mitigation:** Name is optional, tunnels work without it  
**Status:** ✅ Backward compatible

### Issue 4: Rate Limiting with Free Tier
**Risk:** Rate limiter might conflict with tunnel limit  
**Mitigation:** Tunnel limit checked after rate limit  
**Status:** ✅ Proper ordering

---

## Performance Impact

- **Database:** Minimal - single TEXT column addition
- **API:** No additional queries (tier fetched during validation)
- **Memory:** Negligible - name stored in connection object
- **Network:** Minimal - name passed in header

---

## Security Considerations

- ✅ User tier verified from database (not client-provided)
- ✅ Tunnel name is user input but stored safely
- ✅ No SQL injection risks (parameterized queries)
- ✅ No authentication bypass risks
- ✅ Rate limiting still enforced

---

## Deployment Steps

1. **Merge PR #10** to main
2. **Deploy tunnel server** with updated code
3. **Deploy CLI** with `--name` support
4. **Deploy dashboard** with name display
5. **Monitor logs** for any tier validation issues

---

## Rollback Plan

If issues arise:
1. Revert commits (tunnel server, CLI, dashboard)
2. Drop `name` column from database (if needed)
3. Redeploy previous version
4. No data loss - column addition is reversible

---

## Next Steps

### Immediate (Before Merge)
- [ ] Code review approval
- [ ] Run integration tests
- [ ] Verify database migration

### Post-Merge
- [ ] Deploy to staging
- [ ] Run E2E tests
- [ ] Monitor production metrics
- [ ] Gather user feedback

### Future Enhancements
- [ ] UI for renaming tunnels
- [ ] Tunnel name search/filter
- [ ] Tunnel name validation rules
- [ ] Audit log for name changes

---

## Summary

**Current State:** 🔴 **REQUIRES CHANGES BEFORE MERGE**

### Code Review Status
- **Overall Assessment:** Medium Risk
- **Quality:** Good implementation with clear business logic
- **Security:** Critical issues found (input validation, XSS, race condition)
- **Testing:** No automated tests included

### Critical Issues Found (3)
1. Race condition in connection limit check
2. Missing input validation for tunnel names
3. XSS vulnerability in dashboard display

### High Priority Issues (3)
4. Silent fallback on user tier fetch failure
5. Inconsistent connection limit logic
6. Missing type safety for tier field

### Medium Priority Issues (4)
7. No automated tests
8. User tier not cached (performance)
9. Missing database index for names
10. CLI flag not documented

### Recommendation
**REQUEST CHANGES** - Address critical security issues before merging:
- Add input validation for tunnel names
- Add XSS protection in dashboard
- Fix race condition with atomic operations
- Add unit tests for tier limiting
- Improve error handling for tier fetch failures

---

**Created:** 2025-12-04 07:40 UTC  
**Last Updated:** 2025-12-04 07:45 UTC (After Code Review)
