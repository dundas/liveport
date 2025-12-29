# Superuser Access

This document explains how superuser access works in LivePort and how to implement it in your code.

## Overview

Superusers have unlimited access to all LivePort features, bypassing:
- Rate limits
- Billing restrictions
- Usage quotas (tunnel hours, bandwidth)
- Any other limits

## Configuration

Superuser emails are configured in `packages/shared/src/auth/superuser.ts`:

```typescript
const SUPERUSER_EMAILS = [
  "git@davidddundas.com",
];
```

## Database Schema

Users have a `role` field in the database:
- `user` (default) - Normal user with standard limits
- `superuser` - Unlimited access

The role is automatically assigned during signup based on the email address, but can also be manually set in the database.

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

## Usage in API Routes

### Basic Superuser Check

```typescript
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isUserSuperuser } from "@/lib/superuser";

export async function GET() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSuperuser = isUserSuperuser(session.user);
  console.log(`User ${session.user.email} is superuser:`, isSuperuser);

  // ... rest of your logic
}
```

### Enforcing Superuser-Only Routes

For routes that should only be accessible by superusers:

```typescript
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireSuperuser } from "@/lib/superuser";

export async function DELETE(request: NextRequest) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Enforce superuser access - returns 403 if not superuser
  const superuserCheck = requireSuperuser(session.user);
  if (superuserCheck) return superuserCheck;

  // User is verified as superuser, proceed with admin operation
  // ... your admin logic here
}
```

### Bypassing Limits in Billing Logic

```typescript
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasBypassLimits } from "@/lib/superuser";

export async function POST(request: NextRequest) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user should bypass limits
  const bypassLimits = hasBypassLimits(session.user);

  if (!bypassLimits) {
    // Check balance and enforce limits for normal users
    const balance = await getBillingBalance(session.user.id);
    if (balance.totalAvailable <= 0) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 }
      );
    }
  }

  // Proceed with operation (superusers bypass the check above)
  // ... your logic here
}
```

### Displaying Superuser Badge in UI

```typescript
import { getSuperuserBadge } from "@/lib/superuser";

export default function UserProfile({ user }: { user: User }) {
  const badge = getSuperuserBadge(user);

  return (
    <div>
      <h1>{user.name}</h1>
      {badge.show && (
        <Badge variant="default">{badge.text}</Badge>
      )}
    </div>
  );
}
```

## Utilities Reference

### Shared Package (`@liveport/shared/auth`)

- `isSuperuserEmail(email: string): boolean` - Check if email is in superuser list
- `isSuperuserRole(role?: string | null): boolean` - Check if role is "superuser"
- `isSuperuser(email: string, role?: string | null): boolean` - Check both email and role
- `getRoleForEmail(email: string): UserRole` - Get appropriate role for email during signup
- `SUPERUSER_INFO` - Metadata about superuser benefits

### Dashboard (`@/lib/superuser`)

- `isUserSuperuser(user: User): boolean` - Check if session user is superuser
- `requireSuperuser(user: User): NextResponse | null` - Enforce superuser access (returns error response if not superuser)
- `hasBypassLimits(user: User): boolean` - Check if user should bypass billing/rate limits
- `getSuperuserBadge(user: User)` - Get badge display info for UI

## Migration

To add the `role` column to existing databases:

```typescript
import { MechStorageClient, runRoleMigration } from "@liveport/shared";

const db = new MechStorageClient({
  appId: process.env.MECH_APPS_APP_ID!,
  apiKey: process.env.MECH_APPS_API_KEY!,
});

await runRoleMigration(db);
```

Or run directly via SQL:

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
```

## Setting Superuser Role Manually

To manually grant superuser access to a user via database:

```sql
UPDATE "user" SET role = 'superuser' WHERE email = 'git@davidddundas.com';
```

Or via the mech-storage API:

```typescript
await db.query(`
  UPDATE "user"
  SET role = 'superuser'
  WHERE email = $1
`, ['git@davidddundas.com']);
```

## Security Considerations

1. **Hardcoded List**: The superuser email list is hardcoded in the source code. This ensures:
   - No accidental database modifications can remove superuser access
   - The list is version-controlled and auditable
   - Even if the database role is changed, the email check still works

2. **Dual Check**: The system checks BOTH the role field AND the hardcoded email list:
   - This provides redundancy
   - Database changes alone cannot remove superuser access
   - You can grant temporary superuser access via role without modifying code

3. **Logging**: Consider logging superuser actions for audit purposes:
   ```typescript
   if (isUserSuperuser(session.user)) {
     logger.info({ userId: session.user.id, email: session.user.email }, "Superuser action performed");
   }
   ```

## Testing

To test superuser functionality in development:

1. Add your test email to `SUPERUSER_EMAILS` in `packages/shared/src/auth/superuser.ts`
2. Sign up with that email
3. Verify the role is set correctly in the database
4. Test that limits are bypassed

## Common Patterns

### Example: Bypass Rate Limiting

```typescript
import { rateLimit } from "@/lib/rate-limit";
import { hasBypassLimits } from "@/lib/superuser";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Skip rate limit check for superusers
  if (!hasBypassLimits(session.user)) {
    const limited = await rateLimit(session.user.id);
    if (limited) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }
  }

  // Proceed with operation
}
```

### Example: Show Unlimited Usage in UI

```typescript
export default function UsagePage({ user }: { user: User }) {
  const isSuperuser = isUserSuperuser(user);

  if (isSuperuser) {
    return (
      <div>
        <Badge>Unlimited Access</Badge>
        <p>You have superuser privileges with no usage limits.</p>
      </div>
    );
  }

  // Show normal usage meters for regular users
  return <UsageMeters userId={user.id} />;
}
```
