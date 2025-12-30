# Requirements: PR #19 Critical Security Fixes

**Document Version**: 1.0
**Date**: 2025-12-29
**Status**: Ready for Implementation
**Related**: PR #19 - Gap Analysis Phase 2

---

## Overview

This document specifies the 4 critical security fixes required before PR #19 can be merged. These fixes address security vulnerabilities and production stability issues identified in the second code review.

## Acceptance Criteria

All 4 fixes must be implemented and validated before this work is considered complete. Each fix has specific acceptance criteria that must be met.

---

## Fix #1: Remove Hardcoded Default Superuser Email

### Current Problem
**File**: `packages/shared/src/auth/superuser.ts:19`
**Severity**: CRITICAL - Security Backdoor

The current implementation has a hardcoded fallback that creates a permanent backdoor:
```typescript
if (!envEmails) {
  return ['git@davidddundas.com'];  // SECURITY RISK
}
```

### Requirement

The `getSuperuserEmails()` function MUST:
1. Return an empty array `[]` if `SUPERUSER_EMAILS` environment variable is not set
2. Log a clear error message when the env var is missing
3. NOT provide any default superuser email fallback
4. Continue to parse comma-separated emails when the env var IS set

### Acceptance Criteria

- [ ] `getSuperuserEmails()` returns `[]` when `SUPERUSER_EMAILS` is not set
- [ ] Error is logged to console when `SUPERUSER_EMAILS` is missing
- [ ] No hardcoded email addresses in the function
- [ ] Existing functionality works when `SUPERUSER_EMAILS` is set
- [ ] Function splits by comma, trims whitespace, lowercases, filters empty strings

### Test Evidence Required

```bash
# Test 1: No env var set
unset SUPERUSER_EMAILS
node -e "console.log(require('./packages/shared/dist/auth/superuser.js').getSuperuserEmails())"
# Expected: [] (empty array) and error logged

# Test 2: Env var set
export SUPERUSER_EMAILS="admin@example.com,user@test.com"
node -e "console.log(require('./packages/shared/dist/auth/superuser.js').getSuperuserEmails())"
# Expected: ['admin@example.com', 'user@test.com']
```

### Files to Change
- `packages/shared/src/auth/superuser.ts`

---

## Fix #2: Environment-Aware Instrumentation Exit

### Current Problem
**File**: `apps/dashboard/instrumentation.ts:21`
**Severity**: CRITICAL - Production Outage Risk

The current implementation kills the production app on misconfiguration:
```typescript
process.exit(1);  // KILLS PRODUCTION
```

### Requirement

The instrumentation hook MUST:
1. Use `process.exit(1)` in development mode (fail-fast for developers)
2. Log a prominent warning in production mode but allow app to start
3. Clearly indicate the app is running with invalid configuration in production
4. Use `process.env.NODE_ENV` to determine environment

### Acceptance Criteria

- [ ] In `NODE_ENV=development`: exits with code 1 when secrets invalid
- [ ] In `NODE_ENV=production`: logs warning but continues startup
- [ ] Warning message is clear and prominent (uses console.error)
- [ ] Warning indicates which secrets are missing/invalid
- [ ] Existing validation logic remains unchanged (still validates all secrets)

### Test Evidence Required

```bash
# Test 1: Development mode fails
NODE_ENV=development INTERNAL_API_SECRET= pnpm build --filter=@liveport/dashboard
# Expected: Process exits with code 1 and error message

# Test 2: Production mode warns but continues
NODE_ENV=production INTERNAL_API_SECRET= pnpm build --filter=@liveport/dashboard
# Expected: Warning logged, build continues

# Test 3: Valid secrets work in both modes
NODE_ENV=development INTERNAL_API_SECRET="abc123..." pnpm build --filter=@liveport/dashboard
# Expected: Success
```

### Files to Change
- `apps/dashboard/instrumentation.ts`

---

## Fix #3: Require Proxy Allowlist When Enabled

### Current Problem
**Files**:
- `apps/tunnel-server/src/index.ts:97-102` (startup validation)
- `apps/tunnel-server/src/proxy-gateway.ts:76-78` (runtime check)

**Severity**: CRITICAL - SSRF Vulnerability

Current implementation only warns but allows default-open proxy:
```typescript
if (!hasAllowedHosts && !hasAllowedDomains) {
  console.warn("⚠️  WARNING: Proxy gateway is running without an allowlist!");
  // Just warns, doesn't prevent - DANGEROUS
}
```

### Requirement

When `PROXY_GATEWAY_ENABLED=true`, the server MUST:
1. Check if at least one of `PROXY_ALLOWED_HOSTS` or `PROXY_ALLOWED_DOMAINS` is set
2. If neither is set, log a clear error message
3. Exit with code 1 to refuse starting with default-open proxy
4. In development mode, MAY allow default-open with a warning (optional)
5. In production mode, MUST require an allowlist

### Acceptance Criteria

- [ ] When `PROXY_GATEWAY_ENABLED=true` and no allowlist: server exits with code 1
- [ ] Error message clearly explains the security risk (SSRF)
- [ ] Error message shows how to set the allowlist
- [ ] When `PROXY_GATEWAY_ENABLED=false`: no validation occurs (proxy disabled)
- [ ] When allowlist IS set: server starts normally
- [ ] Development mode may optionally allow default-open with warning

### Test Evidence Required

```bash
# Test 1: Proxy enabled without allowlist - should fail
PROXY_GATEWAY_ENABLED=true \
PROXY_ALLOWED_HOSTS= \
PROXY_ALLOWED_DOMAINS= \
pnpm --filter=tunnel-server start
# Expected: Exit code 1 with error message

# Test 2: Proxy enabled with allowlist - should succeed
PROXY_GATEWAY_ENABLED=true \
PROXY_ALLOWED_HOSTS="api.openai.com,api.anthropic.com" \
pnpm --filter=tunnel-server start
# Expected: Server starts successfully

# Test 3: Proxy disabled - no validation
PROXY_GATEWAY_ENABLED=false \
pnpm --filter=tunnel-server start
# Expected: Server starts (allowlist not checked)
```

### Files to Change
- `apps/tunnel-server/src/index.ts` (startup validation)

---

## Fix #4: Add Tunnel Server Secret Validation

### Current Problem
**File**: `apps/tunnel-server/src/index.ts` (startup)
**Severity**: CRITICAL - Runtime Failures

The tunnel server does NOT validate secrets at startup, only at runtime when first request arrives. The dashboard validates secrets via instrumentation hook, but tunnel-server does not.

### Requirement

The tunnel server MUST:
1. Create a `validateTunnelServerSecrets()` function similar to dashboard's validation
2. Validate `INTERNAL_API_SECRET` is set and at least 32 characters
3. Validate `PROXY_TOKEN_SECRET` is set and at least 32 characters (only if `PROXY_GATEWAY_ENABLED=true`)
4. Call this validation function at startup before proceeding
5. Exit with code 1 if validation fails
6. Log which secrets are missing/invalid

### Acceptance Criteria

- [ ] New file created: `apps/tunnel-server/src/validate-secrets.ts`
- [ ] Function `validateTunnelServerSecrets()` validates `INTERNAL_API_SECRET`
- [ ] Function validates `PROXY_TOKEN_SECRET` only when proxy enabled
- [ ] Minimum length check: 32 characters for both secrets
- [ ] Validation called in `startServer()` before database init
- [ ] Server exits with code 1 if secrets invalid
- [ ] Clear error messages indicate which secret is missing/invalid

### Test Evidence Required

```bash
# Test 1: Missing INTERNAL_API_SECRET
INTERNAL_API_SECRET= \
pnpm --filter=tunnel-server start
# Expected: Exit code 1, error message about INTERNAL_API_SECRET

# Test 2: INTERNAL_API_SECRET too short
INTERNAL_API_SECRET="short" \
pnpm --filter=tunnel-server start
# Expected: Exit code 1, error about minimum 32 characters

# Test 3: Missing PROXY_TOKEN_SECRET when proxy enabled
INTERNAL_API_SECRET="abc123..." \
PROXY_GATEWAY_ENABLED=true \
PROXY_TOKEN_SECRET= \
pnpm --filter=tunnel-server start
# Expected: Exit code 1, error about PROXY_TOKEN_SECRET

# Test 4: All secrets valid
INTERNAL_API_SECRET="abc123..." \
PROXY_TOKEN_SECRET="def456..." \
PROXY_GATEWAY_ENABLED=true \
pnpm --filter=tunnel-server start
# Expected: Server starts successfully
```

### Files to Create
- `apps/tunnel-server/src/validate-secrets.ts` (new file)

### Files to Modify
- `apps/tunnel-server/src/index.ts` (add validation call)

---

## Implementation Guidelines

### Code Style
- Use existing code patterns from the codebase
- Follow TypeScript strict mode
- Use clear, descriptive error messages
- Include comments for non-obvious logic

### Testing Strategy
- Test both success and failure cases
- Test edge cases (empty strings, whitespace)
- Verify error messages are helpful
- Test in both development and production modes where applicable

### Error Messages
All error messages must be:
- Clear and actionable
- Explain the security risk (when applicable)
- Show how to fix the issue
- Include examples when helpful

Example:
```
❌ PROXY_ALLOWED_HOSTS or PROXY_ALLOWED_DOMAINS must be set when PROXY_GATEWAY_ENABLED=true
   Refusing to start with default-open proxy (SSRF risk)
   Set allowlist: PROXY_ALLOWED_HOSTS=api.openai.com,api.anthropic.com
```

### Git Commits
Each fix should be committed separately with clear commit messages:
- `fix(security): remove hardcoded superuser email fallback`
- `fix(dashboard): environment-aware secret validation in instrumentation`
- `fix(tunnel-server): require proxy allowlist when gateway enabled`
- `fix(tunnel-server): validate secrets at startup`

---

## Validation Checklist

After all fixes are implemented, verify:

### Unit Tests
- [ ] All existing tests still pass
- [ ] No new test failures introduced

### Build
- [ ] Dashboard builds successfully
- [ ] Tunnel server builds successfully
- [ ] Shared package builds successfully

### Functionality
- [ ] Dashboard starts with valid secrets
- [ ] Tunnel server starts with valid secrets and allowlist
- [ ] Appropriate errors shown for missing/invalid config
- [ ] No hardcoded email backdoors remain

### Code Review
- [ ] No console.log statements (use logger or console.error)
- [ ] TypeScript types are correct
- [ ] Error messages are clear and helpful
- [ ] Code follows existing patterns

---

## Success Criteria

This requirements document is considered **COMPLETE** when:

1. All 4 fixes are implemented per specifications
2. All acceptance criteria are met
3. All test evidence provided shows expected behavior
4. Code passes existing test suite
5. Builds complete successfully
6. Coach agent validates against this requirements document

---

## References

- **Gap Analysis**: `docs/GAP_ANALYSIS_PR19_UPDATED.md`
- **Original PR**: #19
- **Code Review**: Latest automated review comments
- **Dashboard Secrets Validation**: `apps/dashboard/src/lib/validate-secrets.ts` (reference implementation)

---

## Approval

This implementation will be validated by the Coach agent against these requirements. The Player agent will provide evidence for each acceptance criterion.

**Coach Verdict Options:**
- `<!-- VERDICT:APPROVED -->` - All requirements met with evidence
- `<!-- VERDICT:REVISE -->` - Issues found, specific feedback provided
- `<!-- VERDICT:REJECTED -->` - Major gaps, requires significant rework
