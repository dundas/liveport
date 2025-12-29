# Unlimited Length (Never-Expiring) Keys

## Overview

Users can now create bridge keys that never expire. This feature is available to all users (not just superusers).

## Changes Made

### 1. Frontend - Create Key Dialog
**File**: `apps/dashboard/src/components/keys/create-key-dialog.tsx`

Added "Never expires" option to the expiration dropdown:
- `1 hour`
- `6 hours`
- `24 hours`
- `7 days`
- `30 days`
- **`Never expires`** ← New option

### 2. API - Key Creation Route
**File**: `apps/dashboard/src/app/api/keys/route.ts`

**Removed limits:**
- ❌ Old: Maximum 365 days (1 year)
- ✅ New: Unlimited expiration time
- ✅ New: Support for `expiresIn: 'never'` to create keys with `expiresAt: null`

**Example API requests:**

```typescript
// Never-expiring key
POST /api/keys
{
  "expiresIn": "never"
}

// Long-lived key (e.g., 1000 days)
POST /api/keys
{
  "expiresInDays": 1000
}

// Standard short-lived key
POST /api/keys
{
  "expiresIn": "7d"
}
```

### 3. Frontend - Keys List Page
**File**: `apps/dashboard/src/app/(dashboard)/keys/page.tsx`

**Updated to display never-expiring keys:**
- Shows green "Never" badge for keys with `expiresAt: null`
- Handles null expiration dates in status checks
- Never-expiring keys can still be revoked manually

**Visual example:**
```
Key: bk_abc...  Status: Active  Expires: [Never]  Created: Dec 29, 2025
```

## Usage

### Creating a Never-Expiring Key

1. Go to the Bridge Keys page in the dashboard
2. Click "Create Key"
3. Select "Never expires" from the Expiration dropdown
4. (Optional) Set Max Uses or Allowed Port
5. Click "Create Key"
6. Copy the key (shown only once)

### API Usage

```bash
# Create a never-expiring key via API
curl -X POST https://liveport.online/api/keys \
  -H "Content-Type: application/json" \
  -d '{"expiresIn": "never"}'

# Create a 1000-day key
curl -X POST https://liveport.online/api/keys \
  -H "Content-Type: application/json" \
  -d '{"expiresInDays": 1000}'
```

### CLI Usage

Once you have a never-expiring key, use it indefinitely:

```bash
# Save the key in your environment
export LIVEPORT_KEY=bk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Use it forever (no need to rotate)
liveport connect 3000 --key $LIVEPORT_KEY
```

## Database Schema

Keys with `expiresAt: null` never expire:

```sql
-- Check if a key is expired
SELECT
  id,
  key_prefix,
  status,
  CASE
    WHEN expires_at IS NULL THEN 'Never'
    WHEN expires_at < NOW() THEN 'Expired'
    ELSE 'Active'
  END as expiration_status
FROM bridge_keys;
```

## Security Considerations

### Pros
- **Convenience**: No need to rotate keys frequently
- **Long-running services**: Perfect for background services and agents
- **Reduced maintenance**: Set it and forget it

### Cons
- **Security risk if leaked**: A leaked never-expiring key can be used indefinitely
- **No forced rotation**: Users must manually revoke/rotate keys

### Best Practices

1. **Use for trusted environments only**
   - CI/CD pipelines
   - Internal services
   - Long-running agents

2. **Don't use for:**
   - User-facing applications
   - Shared/public environments
   - Testing (use short-lived keys instead)

3. **Monitor key usage**
   - Check the `current_uses` counter regularly
   - Review `last_used_at` timestamps
   - Revoke suspicious keys immediately

4. **Rotate periodically anyway**
   - Even never-expiring keys should be rotated every 6-12 months
   - Use the "Revoke" button to disable old keys
   - Create new keys before revoking old ones (to avoid downtime)

5. **Combine with other restrictions**
   - Set `allowedPort` to restrict which ports can be tunneled
   - Set `maxUses` to limit total number of connections
   - Monitor usage in the dashboard

## Examples

### Example 1: CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy with LivePort Tunnel

env:
  LIVEPORT_KEY: ${{ secrets.LIVEPORT_KEY }}  # Never-expiring key

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Start tunnel
        run: |
          curl -fsSL https://liveport.online/install.sh | sh
          liveport connect 3000 --key $LIVEPORT_KEY &
```

### Example 2: Long-Running Agent

```typescript
// agent.ts
import { LivePortClient } from '@liveport/agent-sdk';

const client = new LivePortClient({
  key: process.env.LIVEPORT_KEY, // Never-expiring key
});

// Agent runs indefinitely without key rotation
await client.start();
```

### Example 3: Development Environment

```bash
# .env
LIVEPORT_KEY=bk_dev_xxxxxxxxxxxxxxxx  # Never-expiring dev key

# Always available for local development
liveport connect 8080
```

## Migration

### Upgrading Existing Keys

Existing keys with expiration dates are not affected. To upgrade:

1. Create a new never-expiring key
2. Update your services to use the new key
3. Delete/revoke the old expiring key

### Downgrading (Adding Expiration)

You cannot add an expiration date to a never-expiring key. Instead:

1. Create a new key with an expiration date
2. Update services to use the new key
3. Delete the never-expiring key

## Monitoring

### Dashboard

The keys page shows:
- Green "Never" badge for never-expiring keys
- Number of uses (helps detect anomalies)
- Last used timestamp

### Database Queries

```sql
-- Find all never-expiring keys
SELECT * FROM bridge_keys WHERE expires_at IS NULL;

-- Find never-expiring keys that haven't been used recently
SELECT * FROM bridge_keys
WHERE expires_at IS NULL
  AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '30 days');

-- Count keys by expiration type
SELECT
  CASE
    WHEN expires_at IS NULL THEN 'Never'
    WHEN expires_at < NOW() THEN 'Expired'
    ELSE 'Active'
  END as type,
  COUNT(*) as count
FROM bridge_keys
GROUP BY type;
```

## FAQ

### Q: Are never-expiring keys less secure?

A: They have the same security as any other key, but the risk window is unlimited. If leaked, the key can be used indefinitely until manually revoked.

### Q: Can I convert an expiring key to never-expiring?

A: No, you need to create a new never-expiring key and delete the old one.

### Q: Do never-expiring keys count against quotas?

A: No, superusers have unlimited access regardless of key expiration. Regular users are subject to billing based on usage, not key expiration.

### Q: Can I set a very long expiration (like 100 years)?

A: Yes! You can now set any positive number of days. For example, `"expiresInDays": 36500` gives you 100 years.

### Q: What happens if I revoke a never-expiring key?

A: It's immediately disabled, just like any other key. The status changes to "revoked" and it can no longer be used.

## Related Features

- **Superuser Access**: Superusers get unlimited tunnel hours/bandwidth regardless of key expiration
- **Key Revocation**: Manually disable keys at any time via the dashboard or API
- **Usage Limits**: Combine never-expiring keys with `maxUses` for one-time-use scenarios
- **Port Restrictions**: Use `allowedPort` to restrict which ports can be tunneled

## Implementation Details

### Type Definitions

```typescript
// Frontend
interface BridgeKeyResponse {
  expiresAt: string | null;  // null = never expires
}

// API
expiresIn?: "1h" | "6h" | "24h" | "7d" | "30d" | "never"
```

### Database

```sql
-- expiresAt column can be NULL
expires_at TIMESTAMP
```

### Validation

```typescript
// API route validation
if (expiresIn === 'never') {
  expiresAt = undefined; // null in database
} else {
  // Calculate expiration date (no maximum limit)
}
```
