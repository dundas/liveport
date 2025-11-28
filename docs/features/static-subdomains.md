# Static Subdomains Feature

## Overview

Static subdomains allow users to reserve a custom subdomain (e.g., `myapp.liveport.dev`) that persists across tunnel connections. This is a **premium feature** priced at **$2.50/month** (pro-rated daily).

## Problem It Solves

### Default Behavior (Random Subdomains)
- Each tunnel connection gets a random subdomain: `xyz789.liveport.dev`
- Subdomain changes every time you reconnect
- Not suitable for:
  - Webhooks (need stable URL)
  - OAuth callbacks (need whitelisted URL)
  - Sharing with team (URL keeps changing)
  - Production/staging environments

### With Static Subdomains
- Reserve your own subdomain: `myapp.liveport.dev`
- Same URL every time you connect
- Perfect for:
  - ✅ Webhook endpoints (Stripe, GitHub, etc.)
  - ✅ OAuth callbacks (Google, GitHub, etc.)
  - ✅ Demo environments (stable URL to share)
  - ✅ Staging servers (consistent deployment URL)

## Pricing

### Cost Structure
- **$2.50 per month** per static subdomain
- **Pro-rated daily**: $0.083/day
- **Billed separately** from tunnel time and bandwidth

### Pro-Ration Examples

| Enabled On | Days Active | Cost |
|------------|-------------|------|
| Nov 1 (full month) | 30 days | $2.50 |
| Nov 15 (mid-month) | 15 days | $1.25 |
| Nov 28 (last 3 days) | 3 days | $0.25 |

### Billing Calculation
```typescript
// Calculate pro-rated cost
const daysInMonth = 30; // or actual days in current month
const daysActive = getDaysInRange(created_at, deleted_at || end_of_month);
const cost = (daysActive / daysInMonth) * 2.50;
```

## Database Schema

### Table: `static_subdomains`

```sql
CREATE TABLE static_subdomains (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  subdomain TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  status TEXT DEFAULT 'active'
);

-- Index for fast lookups
CREATE INDEX idx_static_subdomains_user_id ON static_subdomains(user_id);
CREATE INDEX idx_static_subdomains_subdomain ON static_subdomains(subdomain);
CREATE INDEX idx_static_subdomains_status ON static_subdomains(status) WHERE status = 'active';
```

### Fields

- `id`: Unique identifier (UUID)
- `user_id`: Owner of the subdomain
- `subdomain`: The reserved subdomain (e.g., `myapp`)
- `created_at`: When subdomain was reserved
- `deleted_at`: When subdomain was released (NULL if active)
- `status`: `active`, `deleted`, or `reserved`

## API Endpoints

### Reserve Static Subdomain

```typescript
POST /api/static-subdomains

Request:
{
  "subdomain": "myapp"
}

Response:
{
  "id": "sub_abc123",
  "subdomain": "myapp",
  "fullUrl": "https://myapp.liveport.dev",
  "createdAt": "2025-11-28T12:00:00Z",
  "status": "active",
  "cost": "$2.50/month (pro-rated)"
}

Errors:
- 400: Invalid subdomain format
- 409: Subdomain already taken
- 402: Payment method required
```

### List User's Static Subdomains

```typescript
GET /api/static-subdomains

Response:
{
  "subdomains": [
    {
      "id": "sub_abc123",
      "subdomain": "myapp",
      "fullUrl": "https://myapp.liveport.dev",
      "createdAt": "2025-11-01T12:00:00Z",
      "status": "active",
      "monthlyCost": 2.50
    }
  ]
}
```

### Release Static Subdomain

```typescript
DELETE /api/static-subdomains/:id

Response:
{
  "success": true,
  "message": "Subdomain released",
  "proRatedRefund": 1.25
}
```

## Subdomain Validation Rules

### Allowed Format
- **Length**: 3-32 characters
- **Characters**: Lowercase letters, numbers, hyphens
- **Pattern**: `^[a-z0-9][a-z0-9-]*[a-z0-9]$`
- **No consecutive hyphens**: `--` not allowed
- **No leading/trailing hyphens**

### Reserved Subdomains
```typescript
const RESERVED_SUBDOMAINS = [
  'www', 'api', 'app', 'admin', 'dashboard',
  'status', 'docs', 'blog', 'help', 'support',
  'mail', 'email', 'ftp', 'ssh', 'vpn',
  'staging', 'production', 'dev', 'test',
  'internal', 'private', 'public',
  // Add more as needed
];
```

### Validation Function
```typescript
export function validateSubdomain(subdomain: string): {
  valid: boolean;
  error?: string;
} {
  // Length check
  if (subdomain.length < 3 || subdomain.length > 32) {
    return { valid: false, error: 'Subdomain must be 3-32 characters' };
  }

  // Format check
  const pattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  if (!pattern.test(subdomain)) {
    return { valid: false, error: 'Invalid format. Use lowercase letters, numbers, and hyphens.' };
  }

  // No consecutive hyphens
  if (subdomain.includes('--')) {
    return { valid: false, error: 'Consecutive hyphens not allowed' };
  }

  // Reserved check
  if (RESERVED_SUBDOMAINS.includes(subdomain)) {
    return { valid: false, error: 'Subdomain is reserved' };
  }

  return { valid: true };
}
```

## CLI Integration

### Reserve Subdomain
```bash
# Reserve a static subdomain
liveport subdomain reserve myapp

# Output:
# ✓ Reserved subdomain: myapp.liveport.dev
# Cost: $2.50/month (pro-rated)
# To use: liveport connect 3000 --subdomain myapp
```

### Connect with Static Subdomain
```bash
# Connect using your static subdomain
liveport connect 3000 --subdomain myapp

# Output:
# ✓ Tunnel active at https://myapp.liveport.dev
# Using static subdomain (you own this URL)
```

### List Subdomains
```bash
liveport subdomain list

# Output:
# Static Subdomains:
# - myapp.liveport.dev (active, created Nov 1)
# - staging.liveport.dev (active, created Nov 15)
```

### Release Subdomain
```bash
liveport subdomain release myapp

# Output:
# ✓ Released subdomain: myapp.liveport.dev
# Pro-rated refund: $1.25 (15 days remaining)
```

## Dashboard UI

### Reserve Subdomain Form
```tsx
<form onSubmit={handleReserve}>
  <input
    type="text"
    placeholder="myapp"
    pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
    minLength={3}
    maxLength={32}
  />
  <span>.liveport.dev</span>
  <button type="submit">Reserve ($2.50/month)</button>
</form>

<p className="text-sm text-gray-600">
  Pro-rated daily. Cancel anytime.
</p>
```

### Static Subdomains List
```tsx
<div className="space-y-4">
  {subdomains.map((sub) => (
    <div key={sub.id} className="border rounded p-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold">{sub.subdomain}.liveport.dev</h3>
          <p className="text-sm text-gray-600">
            Active since {formatDate(sub.createdAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold">$2.50/month</p>
          <button onClick={() => release(sub.id)} className="text-red-600">
            Release
          </button>
        </div>
      </div>
    </div>
  ))}
</div>
```

## Tunnel Server Integration

### Subdomain Assignment Logic

```typescript
// In connection-manager.ts
export function register(
  socket: WebSocket,
  tunnelId: string,
  keyId: string,
  userId: string,
  localPort: number,
  expiresAt: Date,
  requestedSubdomain?: string // New parameter
): string | null {
  let subdomain: string;

  if (requestedSubdomain) {
    // Verify user owns this static subdomain
    const staticSub = await db.query(
      `SELECT id FROM static_subdomains 
       WHERE user_id = $1 AND subdomain = $2 AND status = 'active'`,
      [userId, requestedSubdomain]
    );

    if (staticSub.rows.length === 0) {
      throw new Error('Static subdomain not found or not owned by user');
    }

    // Check if subdomain is already in use
    if (this.tunnelsBySubdomain.has(requestedSubdomain)) {
      throw new Error('Static subdomain already in use by another tunnel');
    }

    subdomain = requestedSubdomain;
  } else {
    // Generate random subdomain
    subdomain = generateUniqueSubdomain(this.tunnelsBySubdomain.keys());
  }

  // ... rest of registration logic
}
```

### CLI Client Update

```typescript
// In packages/cli/src/commands/connect.ts
interface ConnectOptions {
  key?: string;
  subdomain?: string; // New option
}

export async function connect(port: number, options: ConnectOptions) {
  const headers: Record<string, string> = {
    'x-bridge-key': options.key || getStoredKey(),
    'x-local-port': String(port),
  };

  // Add static subdomain header if requested
  if (options.subdomain) {
    headers['x-requested-subdomain'] = options.subdomain;
  }

  const ws = new WebSocket(TUNNEL_SERVER_URL, { headers });
  // ... rest of connection logic
}
```

## Billing Integration (Stripe)

### Product Setup

**Product: Static Subdomain**
- Name: `Static Subdomain`
- Description: `Reserved custom subdomain`
- Pricing model: **Recurring (monthly)**
- Unit amount: `$2.50`
- Billing period: Monthly
- Pro-ration: Enabled

### Subscription Management

```typescript
// When user reserves a subdomain
export async function reserveStaticSubdomain(
  userId: string,
  subdomain: string
) {
  // Create subdomain record
  const sub = await db.insert('static_subdomains', {
    id: crypto.randomUUID(),
    user_id: userId,
    subdomain,
    created_at: new Date(),
    status: 'active',
  });

  // Add to Stripe subscription
  const user = await db.getRecord('user', userId);
  const subscription = await stripe.subscriptions.retrieve(
    user.stripeSubscriptionId
  );

  await stripe.subscriptionItems.create({
    subscription: subscription.id,
    price: PRICE_IDS.staticSubdomain,
    quantity: 1,
    proration_behavior: 'create_prorations', // Pro-rate the charge
  });

  return sub;
}

// When user releases a subdomain
export async function releaseStaticSubdomain(subdomainId: string) {
  const sub = await db.getRecord('static_subdomains', subdomainId);

  // Mark as deleted
  await db.update('static_subdomains', subdomainId, {
    deleted_at: new Date(),
    status: 'deleted',
  });

  // Remove from Stripe subscription (pro-rated refund)
  const user = await db.getRecord('user', sub.user_id);
  const subscription = await stripe.subscriptions.retrieve(
    user.stripeSubscriptionId,
    { expand: ['items'] }
  );

  const item = subscription.items.data.find(
    (item) => item.price.id === PRICE_IDS.staticSubdomain
  );

  if (item) {
    await stripe.subscriptionItems.del(item.id, {
      proration_behavior: 'create_prorations', // Pro-rated refund
    });
  }
}
```

## Use Cases

### 1. Webhook Development
```bash
# Reserve subdomain for webhook testing
liveport subdomain reserve myapp-webhooks

# Connect your local server
liveport connect 3000 --subdomain myapp-webhooks

# Configure webhook in Stripe dashboard
# URL: https://myapp-webhooks.liveport.dev/webhooks/stripe

# URL stays the same across reconnections!
```

### 2. OAuth Callbacks
```bash
# Reserve subdomain for OAuth app
liveport subdomain reserve myapp-oauth

# Add to OAuth provider (e.g., Google)
# Redirect URI: https://myapp-oauth.liveport.dev/auth/callback

# Connect during development
liveport connect 3000 --subdomain myapp-oauth
```

### 3. Demo Environment
```bash
# Reserve subdomain for client demos
liveport subdomain reserve acme-demo

# Share with client
# URL: https://acme-demo.liveport.dev

# Connect before demo
liveport connect 3000 --subdomain acme-demo
```

### 4. Staging Server
```bash
# Reserve subdomain for staging
liveport subdomain reserve myapp-staging

# Add to CI/CD pipeline
# Deploy to: https://myapp-staging.liveport.dev

# Connect staging server
liveport connect 8080 --subdomain myapp-staging
```

## Limitations

### Per-User Limits
- **Free tier**: 0 static subdomains
- **Paid tier**: Unlimited (each costs $2.50/month)

### Technical Limits
- **Max length**: 32 characters
- **Min length**: 3 characters
- **One tunnel per subdomain**: Can't have multiple tunnels on same static subdomain

### Subdomain Recycling
- Deleted subdomains are **held for 30 days** before becoming available again
- Prevents subdomain squatting and confusion

## Future Enhancements

1. **Custom Domains** (Phase 3)
   - Bring your own domain: `tunnel.yourdomain.com`
   - Pricing: $10/month per custom domain

2. **Subdomain Aliases**
   - Multiple subdomains pointing to same tunnel
   - Pricing: $1/month per alias

3. **SSL Certificate Management**
   - Custom SSL certificates for custom domains
   - Automatic renewal via Let's Encrypt

4. **Subdomain Transfer**
   - Transfer subdomain to another user
   - Useful for team changes

## Testing

### Manual Testing
```bash
# 1. Reserve subdomain
curl -X POST https://app.liveport.dev/api/static-subdomains \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"subdomain": "test123"}'

# 2. Connect with static subdomain
liveport connect 3000 --subdomain test123

# 3. Verify URL
curl https://test123.liveport.dev

# 4. Release subdomain
curl -X DELETE https://app.liveport.dev/api/static-subdomains/sub_abc123 \
  -H "Authorization: Bearer $TOKEN"
```

### Automated Tests
```typescript
describe('Static Subdomains', () => {
  it('should reserve a subdomain', async () => {
    const result = await reserveSubdomain(userId, 'myapp');
    expect(result.subdomain).toBe('myapp');
    expect(result.status).toBe('active');
  });

  it('should reject duplicate subdomains', async () => {
    await reserveSubdomain(userId, 'myapp');
    await expect(reserveSubdomain(userId2, 'myapp')).rejects.toThrow();
  });

  it('should calculate pro-rated cost correctly', async () => {
    const cost = calculateProRatedCost(15, 30); // 15 days of 30-day month
    expect(cost).toBe(1.25); // $2.50 / 2
  });
});
```

## Conclusion

Static subdomains are a valuable premium feature that:
- Solves real problems (webhooks, OAuth, demos)
- Generates predictable recurring revenue ($2.50/month)
- Differentiates LivePort from free alternatives
- Requires minimal infrastructure changes

**Recommended for Phase 2 implementation** (after basic billing is working).

