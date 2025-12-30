# Gap Analysis: PR #20 - WebSocket Protocol Types and Connection Tracking

**Status**: Ready for fixes before merge
**Date**: 2025-12-29
**Branch**: `feat/websocket-protocol-types`
**PR**: https://github.com/dundas/liveport-private/pull/20

---

## Executive Summary

PR #20 provides a **solid foundation** for WebSocket proxying with excellent test coverage (74 tests) and clean architecture. However, **1 critical bug** must be fixed before merge, and several improvements are recommended for production readiness.

**Overall Assessment**: ✅ **Approve with Required Changes**

---

## Critical Issues (MUST FIX)

### 1. Off-By-One Error in Connection Limit ⚠️

**Severity**: HIGH (breaks advertised limit)
**Location**: `apps/tunnel-server/src/connection-manager.ts:421-423`

**Current Code**:
```typescript
isWebSocketLimitExceeded(subdomain: string, limit: number): boolean {
  return this.getWebSocketCount(subdomain) > limit;
}
```

**Issue**:
- Allows `limit + 1` connections (e.g., 101 connections for limit=100)
- Test also expects incorrect behavior

**Fix Required**:
```typescript
isWebSocketLimitExceeded(subdomain: string, limit: number): boolean {
  return this.getWebSocketCount(subdomain) >= limit;
}
```

**Test Update Required**:
`apps/tunnel-server/src/connection-manager-websocket.test.ts:215`
- Change expectation from "over 100" to "at 100"

**Impact**: Breaks SLA of "100 connections per tunnel"

---

## Major Issues (RECOMMENDED)

### 2. Performance: O(n) WebSocket Counting

**Severity**: MEDIUM (scalability concern)
**Location**: `apps/tunnel-server/src/connection-manager.ts:374-382`

**Current Implementation**:
```typescript
getWebSocketCount(subdomain: string): number {
  let count = 0;
  for (const ws of this.proxiedWebSockets.values()) {
    if (ws.subdomain === subdomain) {
      count++;
    }
  }
  return count;
}
```

**Issue**:
- Called on **every** WebSocket upgrade request (before limit check)
- With 1000+ active WebSockets across all tunnels, this becomes expensive
- Creates O(n*m) complexity for m upgrade requests

**Recommended Fix**:
Add secondary index for O(1) lookups:
```typescript
private wsCountBySubdomain = new Map<string, number>();

registerProxiedWebSocket(id: string, subdomain: string, publicSocket: WebSocket): void {
  // ... existing registration code

  // Update count index
  const currentCount = this.wsCountBySubdomain.get(subdomain) || 0;
  this.wsCountBySubdomain.set(subdomain, currentCount + 1);
}

unregisterProxiedWebSocket(id: string): void {
  const ws = this.proxiedWebSockets.get(id);
  if (!ws) return;

  this.proxiedWebSockets.delete(id);

  // Update count index
  const currentCount = this.wsCountBySubdomain.get(ws.subdomain) || 0;
  if (currentCount <= 1) {
    this.wsCountBySubdomain.delete(ws.subdomain);
  } else {
    this.wsCountBySubdomain.set(ws.subdomain, currentCount - 1);
  }

  // ... logging
}

getWebSocketCount(subdomain: string): number {
  return this.wsCountBySubdomain.get(subdomain) || 0;
}
```

**Impact**: Significant performance improvement under load

---

### 3. Error Handling May Leak Internal Details

**Severity**: MEDIUM (security concern)
**Location**: `apps/tunnel-server/src/http-handler.ts:174-180`

**Current Code**:
```typescript
} catch (err) {
  const error = err as Error;
  if (error.message === "WebSocket upgrade timeout") {
    return c.text("WebSocket upgrade timeout", 504);
  }
  throw err; // ⚠️ Could leak internal errors
}
```

**Issue**:
- Unhandled errors propagate to client
- Could expose internal stack traces or sensitive info

**Recommended Fix**:
```typescript
} catch (err) {
  const error = err as Error;
  if (error.message === "WebSocket upgrade timeout") {
    return c.text("WebSocket upgrade timeout", 504);
  }

  logger.error({ err, wsConnId }, "WebSocket upgrade failed");
  return c.text("Internal server error", 500);
}
```

**Impact**: Better error handling and no information leakage

---

## Security Considerations

### 4. Race Condition: Limit Check vs Registration

**Severity**: LOW (edge case)
**Location**: `apps/tunnel-server/src/http-handler.ts:127-133`

**Scenario**:
1. Thread A: Checks count (99) → passes limit check
2. Thread B: Checks count (99) → passes limit check
3. Thread A: Registers WebSocket #100
4. Thread B: Registers WebSocket #101 ⚠️

**Current Code**:
```typescript
// Check WebSocket connection limit (100 per tunnel)
const wsCount = connectionManager.getWebSocketCount(subdomain);
if (wsCount >= 100) {
  return c.text("Maximum WebSocket connections exceeded (100)", 503);
}

// Generate WebSocket connection ID
const wsConnId = `${subdomain}:ws:${nanoid(10)}`;
```

**Issue**: Time-of-check to time-of-use (TOCTOU) race

**Recommended Fix** (for future PR):
Atomic check-and-register:
```typescript
const wsConnId = `${subdomain}:ws:${nanoid(10)}`;

try {
  connectionManager.registerProxiedWebSocketWithLimit(id, subdomain, socket, 100);
} catch (err) {
  if (err.message === "WebSocket limit exceeded") {
    return c.text("Maximum WebSocket connections exceeded (100)", 503);
  }
  throw err;
}
```

**Impact**: Prevents exceeding limits under concurrent load

---

### 5. DoS Potential: Timeout Accumulation

**Severity**: LOW (moderate attack surface)

**Scenario**:
- Attacker opens 100 WebSocket upgrade requests to same tunnel
- Each waits 5 seconds for timeout
- Total: 500 seconds of pending state in memory

**Current Mitigation**:
- Limit of 100 connections per tunnel
- 5-second timeout cleans up

**Recommended Enhancement** (future PR):
Add global pending upgrade limit per tunnel:
```typescript
const pendingCount = Array.from(this.wsUpgradePending.keys())
  .filter(id => id.startsWith(`${subdomain}:`))
  .length;

if (pendingCount >= 10) {
  return c.text("Too many pending WebSocket upgrades", 429);
}
```

**Impact**: Prevents resource exhaustion attacks

---

## Minor Improvements

### 6. Extract Magic Number to Constant

**Location**: Multiple files

**Current**:
```typescript
if (wsCount >= 100) {  // http-handler.ts:128
if (wsCount >= 100) {  // test file
```

**Recommended**:
```typescript
// types.ts
export const MAX_WEBSOCKETS_PER_TUNNEL = 100;

// http-handler.ts
if (wsCount >= MAX_WEBSOCKETS_PER_TUNNEL) {
```

**Impact**: Better maintainability

---

### 7. Add Comment for 501 Status Code

**Location**: `apps/tunnel-server/src/http-handler.ts:173`

**Current**:
```typescript
return c.text("Upgrade will be handled at HTTP server level", 501);
```

**Recommended**:
```typescript
// Return 501 (Not Implemented) to signal that actual WebSocket upgrade
// will be handled by the Node.js HTTP server 'upgrade' event (Task 4.0).
// Hono cannot handle raw socket upgrades, so we delegate to server-level handler.
return c.text("Upgrade will be handled at HTTP server level", 501);
```

**Impact**: Clearer intent for future developers

---

### 8. Export ProxiedWebSocket Interface

**Location**: `apps/tunnel-server/src/types.ts:214-221`

**Current**: Interface is defined but not exported in discriminated union

**Recommended**:
```typescript
export interface ProxiedWebSocket {
  id: string;
  subdomain: string;
  publicSocket: WebSocket;
  createdAt: Date;
  frameCount: number;
  bytesTransferred: number;
}
```

Then update exports at bottom of file to include it.

**Impact**: Better testability and reusability

---

### 9. Add JSDoc for Public Methods

**Location**: `apps/tunnel-server/src/connection-manager.ts`

**Recommended**: Add JSDoc to WebSocket-related methods:
```typescript
/**
 * Register a proxied WebSocket connection
 * @param id - Unique WebSocket connection ID (format: ${subdomain}:ws:${nanoid})
 * @param subdomain - Tunnel subdomain this WebSocket belongs to
 * @param publicSocket - The public-facing WebSocket connection
 */
registerProxiedWebSocket(id: string, subdomain: string, publicSocket: WebSocket): void {
```

**Impact**: Better IDE autocomplete and documentation

---

### 10. Input Validation in trackWebSocketFrame

**Severity**: LOW (defensive programming)
**Location**: `apps/tunnel-server/src/connection-manager.ts:358-369`

**Current**: No validation of `bytes` parameter

**Recommended**:
```typescript
trackWebSocketFrame(id: string, bytes: number): void {
  if (bytes < 0 || !Number.isFinite(bytes)) {
    logger.error({ id, bytes }, "Invalid byte count for WebSocket frame");
    return;
  }

  const ws = this.proxiedWebSockets.get(id);
  // ... rest of implementation
}
```

**Impact**: Prevents data corruption from invalid inputs

---

### 11. Warning Log for Duplicate Upgrade Resolutions

**Location**: `apps/tunnel-server/src/connection-manager.ts:404-416`

**Recommended**:
```typescript
resolveWebSocketUpgrade(id: string, response: WebSocketUpgradeResponseMessage): void {
  const pending = this.wsUpgradePending.get(id);
  if (!pending) {
    logger.warn({ id }, "Attempted to resolve non-existent WebSocket upgrade");
    return;
  }
  // ... rest
}
```

**Impact**: Better debugging of duplicate messages

---

## Test Coverage Gaps

### Missing Test Cases (Nice-to-Have)

1. **Concurrent WebSocket registrations**
   - Test thread safety with parallel limit checks
   - Current: Single-threaded tests only

2. **Exact limit boundary behavior**
   - Test registering exactly 100 connections
   - Test 101st connection rejection
   - **Required after fixing off-by-one error**

3. **Upgrade timeout edge cases**
   - Test timeout firing exactly as response arrives
   - Test cleanup after timeout

4. **Frame count integer overflow**
   - Test behavior after 2^53 frames (unlikely but defensive)

5. **Invalid close codes**
   - Test frame messages with invalid close codes
   - Test proper validation/rejection

---

## Implementation Checklist

### Must Complete Before Merge ✅

- [ ] Fix off-by-one error in `isWebSocketLimitExceeded()` (line 422)
- [ ] Update test expectations for limit check (test line 220)
- [ ] Run full test suite to verify fix

### Strongly Recommended (Before Merge)

- [ ] Add O(1) WebSocket counting with secondary index
- [ ] Add error handling for uncaught errors in `handleWebSocketUpgrade()`
- [ ] Extract MAX_WEBSOCKETS_PER_TUNNEL constant
- [ ] Add tests for exact limit boundary (100 connections)

### Nice-to-Have (Can defer to future PRs)

- [ ] Add comment for 501 status code
- [ ] Export ProxiedWebSocket interface
- [ ] Add JSDoc for public WebSocket methods
- [ ] Add input validation in trackWebSocketFrame
- [ ] Add warning log for duplicate resolutions
- [ ] Implement atomic check-and-register for race condition
- [ ] Add global pending upgrade limit

---

## Files Requiring Changes

### Critical Fixes
```
apps/tunnel-server/src/connection-manager.ts           (line 422)
apps/tunnel-server/src/connection-manager-websocket.test.ts  (line 220)
```

### Recommended Changes
```
apps/tunnel-server/src/connection-manager.ts           (add secondary index)
apps/tunnel-server/src/http-handler.ts                 (error handling, constants)
apps/tunnel-server/src/types.ts                        (export constant)
```

### Test Updates
```
apps/tunnel-server/src/connection-manager-websocket.test.ts  (boundary tests)
```

---

## Estimated Effort

**Critical Fixes**: 15 minutes
- Off-by-one fix + test update: 10 min
- Test verification: 5 min

**Recommended Changes**: 1-2 hours
- O(1) counting optimization: 45 min
- Error handling improvements: 20 min
- Extract constants: 10 min
- Additional tests: 30 min

**Total to "Ready to Merge"**: ~2 hours

---

## Risk Assessment

### Current State (Before Fixes)
- **Production Readiness**: ⚠️ **NOT READY** (off-by-one bug)
- **Performance**: ⚠️ **Acceptable** (O(n) becomes issue at scale)
- **Security**: ✅ **Good** (minor edge cases)
- **Test Coverage**: ✅ **Excellent** (74 tests)

### After Critical Fixes
- **Production Readiness**: ✅ **READY**
- **Performance**: ⚠️ **Acceptable** (still O(n))
- **Security**: ✅ **Good**
- **Test Coverage**: ✅ **Excellent**

### After All Recommended Changes
- **Production Readiness**: ✅ **PRODUCTION READY**
- **Performance**: ✅ **Optimized**
- **Security**: ✅ **Robust**
- **Test Coverage**: ✅ **Comprehensive**

---

## Next Steps

1. **Implement critical fix** (~15 min)
2. **Run test suite** to verify
3. **Optionally implement recommended changes** (~2 hrs)
4. **Push updates** to PR
5. **Request re-review**
6. **Merge when approved**

---

## Conclusion

This PR demonstrates **strong engineering fundamentals** with excellent test coverage and clean architecture. The single critical bug is straightforward to fix. Recommended optimizations will improve production readiness but are not blocking.

**Recommendation**: Fix the off-by-one error immediately, consider implementing the O(1) counting optimization, then merge. Defer nice-to-have improvements to future PRs to maintain momentum.

**Overall Grade**: A- (would be A+ after critical fix)
