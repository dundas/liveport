# Requirements: PR #19 Phase 1 Critical Fixes

**Document Version**: 1.0
**Date**: 2025-12-29
**Status**: Ready for Implementation
**Related**: PR #19 - Gap Analysis Phase 3

---

## Overview

This document specifies 4 critical fixes required to bring PR #19 to merge-ready state. These fixes address configuration security, architectural clarity, and user safety warnings identified in the latest automated code review.

## Acceptance Criteria

All 4 fixes must be implemented and validated before this work is considered complete.

---

## Fix #1: Replace Hardcoded Email in .env.example

### Current Problem
**File**: `apps/dashboard/.env.example:34`
**Severity**: CRITICAL - Configuration Security

The `.env.example` file contains a real email address:
```bash
SUPERUSER_EMAILS=git@davidddundas.com
```

This creates a security risk: developers copying `.env.example` to `.env` inherit this email as superuser.

### Requirement

The `.env.example` file MUST:
1. Use a placeholder email (e.g., `admin@example.com`) instead of real email
2. Include a clear comment indicating this must be changed
3. Maintain the format documentation
4. Keep the security warning about unlimited access

### Acceptance Criteria

- [ ] `SUPERUSER_EMAILS` value is `admin@example.com` (placeholder)
- [ ] Comment added: "IMPORTANT: Replace with your actual superuser email(s)"
- [ ] Format documentation preserved
- [ ] Security warning preserved

### Expected Code
```bash
# Superuser Emails (comma-separated list)
# These users get unlimited access: no rate limits, unlimited tunnel hours/bandwidth
# Format: SUPERUSER_EMAILS=email1@example.com,email2@example.com
# IMPORTANT: Replace with your actual superuser email(s)
SUPERUSER_EMAILS=admin@example.com
```

### Files to Change
- `apps/dashboard/.env.example` (line 34)

---

## Fix #2: Proxy Gateway Fail-Safe Default

### Current Problem
**File**: `apps/tunnel-server/src/proxy-gateway.ts:76-78`
**Severity**: CRITICAL - Defense in Depth

The runtime proxy validation function has default-allow logic:
```typescript
function isProxyTargetAllowed(hostnameRaw: string, port: number): boolean {
  if (allowedHosts.size === 0 && allowedDomains.length === 0) {
    return true;  // Allows all targets
  }
  // ... rest
}
```

While we prevent server startup without an allowlist, this runtime check should also be fail-safe.

### Requirement

The `isProxyTargetAllowed()` function MUST:
1. Return `false` (deny) when no allowlist is configured (fail-safe)
2. Log an error when this occurs (indicates misconfiguration)
3. Maintain existing allowlist validation logic

### Acceptance Criteria

- [ ] When `allowedHosts.size === 0 && allowedDomains.length === 0`: returns `false`
- [ ] Error logged using logger when fail-safe triggers
- [ ] Existing allowlist validation logic unchanged
- [ ] All proxy-gateway tests still pass

### Expected Code
```typescript
function isProxyTargetAllowed(hostnameRaw: string, port: number): boolean {
  // Fail-safe: deny all if no allowlist configured
  if (allowedHosts.size === 0 && allowedDomains.length === 0) {
    logger.error({
      hostname: hostnameRaw,
      port,
    }, 'Proxy target check with empty allowlist - denying request (fail-safe)');
    return false;
  }

  // Existing validation logic...
}
```

### Files to Change
- `apps/tunnel-server/src/proxy-gateway.ts` (lines 76-78)

---

## Fix #3: Clarify Dual Verification with Hierarchical Approach

### Current Problem
**File**: `packages/shared/src/auth/superuser.ts:63-65`
**Severity**: CRITICAL - Architectural Clarity

Current implementation checks both database role OR email list:
```typescript
export function isSuperuser(email: string, role?: string | null): boolean {
  return isSuperuserRole(role) || isSuperuserEmail(email);
}
```

This creates confusion about which is authoritative.

### Requirement

Implement a **hierarchical approach** where:
1. **Database role takes precedence** (authoritative source)
2. **Email list is fallback** (for bootstrap/initial setup only)
3. Clear documentation of this hierarchy
4. If role field is set (not null/undefined), use it
5. If role field is not set, fall back to email check

### Rationale
- Database role is standard RBAC pattern (preferred)
- Email list enables initial superuser setup before database access
- Clear precedence avoids confusion
- Allows evolution: email list for bootstrap → database role for management

### Acceptance Criteria

- [ ] Function checks if `role` is explicitly set (not null/undefined)
- [ ] If role is set, returns result of `isSuperuserRole(role)` (database wins)
- [ ] If role is not set, returns result of `isSuperuserEmail(email)` (email fallback)
- [ ] JSDoc comment explains the hierarchy
- [ ] All superuser tests still pass

### Expected Code
```typescript
/**
 * Check if a user has superuser access
 *
 * Uses hierarchical verification:
 * 1. Database role field takes precedence (if set)
 * 2. Email list is fallback (for bootstrap/initial setup)
 *
 * This allows:
 * - Initial superuser setup via environment variable
 * - Long-term management via database role field
 * - Clear precedence when both are present
 *
 * @param email - User email
 * @param role - User role from database (optional)
 * @returns true if the user is a superuser
 */
export function isSuperuser(email: string, role?: string | null): boolean {
  // Database role takes precedence (authoritative)
  if (role !== null && role !== undefined) {
    return isSuperuserRole(role);
  }

  // Email list is fallback (bootstrap only)
  return isSuperuserEmail(email);
}
```

### Documentation Update

Update `docs/SUPERUSER.md` to document the hierarchy:

Add section:
```markdown
## Superuser Verification Hierarchy

LivePort uses a hierarchical approach for superuser verification:

### 1. Database Role (Primary)
If the user has a `role` field set in the database:
- `role = "superuser"` → User is a superuser
- `role = "user"` → User is NOT a superuser (even if in email list)
- Database role is the authoritative source

### 2. Email List (Fallback)
If the user has NO `role` field set in the database:
- Check if email is in `SUPERUSER_EMAILS` environment variable
- Used for initial superuser setup before database access

### Best Practice
1. Use `SUPERUSER_EMAILS` for initial setup
2. Run migration to set database role
3. Manage superusers via database role field going forward
4. Email list remains as fallback for bootstrap

This hierarchy provides:
- Clear precedence (database wins)
- Bootstrap capability (email list)
- Long-term manageability (database)
```

### Files to Change
- `packages/shared/src/auth/superuser.ts` (lines 63-65 + JSDoc)
- `docs/SUPERUSER.md` (add hierarchy section)

---

## Fix #4: Add Never-Expiring Key Warnings

### Current Problem
**Files**:
- `apps/dashboard/src/components/keys/create-key-dialog.tsx`
- `apps/dashboard/src/app/api/keys/route.ts`

**Severity**: HIGH - User Safety

Users can create never-expiring keys with:
- No UI warning about security implications
- No audit logging of creation
- No indication this is a risky choice

### Requirement

The create key flow MUST:
1. Display a prominent warning in the UI when "Never expires" is selected
2. Log an audit message when a never-expiring key is created
3. Warning should explain the risk and best practices

### Acceptance Criteria - UI Warning

- [ ] Yellow warning box appears when `expiresIn === 'never'`
- [ ] Warning uses yellow color scheme (warning, not error)
- [ ] Warning includes icon (warning triangle)
- [ ] Warning explains the security risk
- [ ] Warning lists best practices (rotation, monitoring, revocation)
- [ ] Warning is clear and non-technical

### Acceptance Criteria - Audit Logging

- [ ] Log message created when never-expiring key is generated
- [ ] Log includes: userId, email, keyName
- [ ] Log level is `warn` (not info or error)
- [ ] Log message is descriptive

### Expected Code - UI Warning

In `apps/dashboard/src/components/keys/create-key-dialog.tsx`:
```tsx
{expiresIn === 'never' && (
  <div className="rounded-md bg-yellow-50 p-4 mt-4 border border-yellow-200">
    <div className="flex">
      <div className="flex-shrink-0">
        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      </div>
      <div className="ml-3">
        <h3 className="text-sm font-medium text-yellow-800">
          Security Warning
        </h3>
        <div className="mt-2 text-sm text-yellow-700">
          <p>
            Never-expiring keys provide indefinite access if compromised.
          </p>
          <p className="mt-2 font-medium">Best practices:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Rotate keys every 6-12 months</li>
            <li>Monitor key usage regularly</li>
            <li>Revoke immediately if compromised</li>
            <li>Consider using shorter-lived keys when possible</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
)}
```

### Expected Code - Audit Logging

In `apps/dashboard/src/app/api/keys/route.ts` (after key generation):
```typescript
// Import logger at top
import { getLogger } from "@/lib/logger";
const logger = getLogger("api:keys");

// After generating never-expiring key
if (expiresIn === 'never') {
  logger.warn({
    userId: session.user.id,
    email: session.user.email,
    keyName: name,
    action: 'create_never_expiring_key',
  }, 'User created never-expiring bridge key');
}
```

### Files to Change
- `apps/dashboard/src/components/keys/create-key-dialog.tsx` (add warning UI)
- `apps/dashboard/src/app/api/keys/route.ts` (add audit logging)

---

## Implementation Guidelines

### Code Style
- Use existing code patterns from the codebase
- Follow TypeScript strict mode
- Use clear, descriptive comments
- Match existing formatting

### Testing Strategy
- Test UI warning appears/disappears correctly
- Verify proxy gateway returns false when no allowlist
- Confirm superuser hierarchy works as expected
- Check audit logging appears in logs

### Git Commits
Each fix should be committed separately:
- `fix(config): use placeholder email in .env.example`
- `fix(proxy-gateway): add fail-safe default-deny when no allowlist`
- `fix(auth): clarify superuser verification with hierarchical approach`
- `feat(keys): add security warning for never-expiring keys`

---

## Validation Checklist

After all fixes are implemented:

### Build & Tests
- [ ] All packages build successfully
- [ ] All existing tests pass (84+ tests)
- [ ] No new TypeScript errors

### Functionality
- [ ] .env.example has placeholder email
- [ ] Proxy gateway denies when no allowlist
- [ ] Superuser hierarchy works correctly
- [ ] Warning appears for never-expiring keys
- [ ] Audit log created for never-expiring keys

### Code Review
- [ ] Clear comments and documentation
- [ ] Consistent with existing patterns
- [ ] No console.log (use logger)

---

## Success Criteria

This requirements document is considered **COMPLETE** when:

1. All 4 fixes are implemented per specifications
2. All acceptance criteria are met
3. Builds complete successfully
4. Tests pass with no regressions
5. Coach agent validates against this requirements document
6. Production validator confirms end-to-end functionality

---

## References

- **Gap Analysis**: `docs/GAP_ANALYSIS_PR19_FINAL.md`
- **Original PR**: #19
- **Latest Code Review**: Automated review comment (10 issues)
- **Superuser Docs**: `docs/SUPERUSER.md`

---

## Approval

This implementation will be validated by the Coach agent against these requirements. The Player agent will provide evidence for each acceptance criterion.

**Coach Verdict Options:**
- `<!-- VERDICT:APPROVED -->` - All requirements met with evidence
- `<!-- VERDICT:REVISE -->` - Issues found, specific feedback provided
- `<!-- VERDICT:REJECTED -->` - Major gaps, requires significant rework
