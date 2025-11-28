# Stripe Integration Guide (Phase 2)

## Overview

This guide covers integrating Stripe for metered billing in LivePort. We'll implement usage-based pricing:
- **$0.000005/second** for tunnel time (~$0.018/hour, ~$13/month for 24/7)
- **$0.05/GB** for data transfer

## Prerequisites

- Stripe account (test mode for development)
- LivePort metering system operational
- Database with `tunnels` table tracking usage

## Step 1: Stripe Account Setup

### 1.1 Create Stripe Account
1. Go to [stripe.com](https://stripe.com)
2. Sign up for an account
3. Complete business verification (for live mode)

### 1.2 Get API Keys
1. Go to **Developers** → **API Keys**
2. Copy keys:
   - **Publishable key**: `pk_test_...` (for frontend)
   - **Secret key**: `sk_test_...` (for backend)

### 1.3 Enable Test Mode
Toggle **View test data** in the dashboard to work with test keys initially.

## Step 2: Product & Pricing Setup

### 2.1 Create Products in Stripe Dashboard

**Product 1: Tunnel Time**
1. Go to **Products** → **Add product**
2. **Name**: `Tunnel Time`
3. **Description**: `Per-second tunnel usage`
4. **Pricing model**: Usage-based
5. **Unit amount**: `$0.000005` (or create as $0.005 per 1000 seconds for easier Stripe UI)
6. **Billing period**: Monthly
7. **Usage type**: Metered
8. **Aggregation**: Sum
9. Save product → Copy **Price ID**: `price_tunnel_seconds_...`

**Note**: Stripe doesn't support prices below $0.50, so we'll report usage in **1000-second blocks** at $0.005 per block.

**Product 2: Data Transfer**
1. Go to **Products** → **Add product**
2. **Name**: `Data Transfer`
3. **Description**: `Bandwidth usage`
4. **Pricing model**: Usage-based
5. **Unit amount**: `$0.05`
6. **Billing period**: Monthly
7. **Usage type**: Metered
8. **Aggregation**: Sum
9. Save product → Copy **Price ID**: `price_bandwidth_...`

### 2.2 Configure Billing
1. Go to **Settings** → **Billing**
2. Set **Billing cycle anchor**: First of month
3. Enable **Proration**: Yes
4. Set **Invoice grace period**: 3 days

## Step 3: Backend Integration

### 3.1 Install Stripe SDK

```bash
cd apps/dashboard
npm install stripe
```

### 3.2 Environment Variables

Add to `.env`:
```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Price IDs
STRIPE_PRICE_ID_TUNNELS=price_tunnel_...
STRIPE_PRICE_ID_BANDWIDTH=price_bandwidth_...

# Webhook Secret (from Step 4)
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3.3 Create Stripe Client

Create `apps/dashboard/src/lib/stripe.ts`:

```typescript
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
});

export const PRICE_IDS = {
  tunnelSeconds: process.env.STRIPE_PRICE_ID_TUNNEL_SECONDS!,
  bandwidth: process.env.STRIPE_PRICE_ID_BANDWIDTH!,
};
```

### 3.4 Create Customer on Signup

Update `apps/dashboard/src/app/api/auth/signup/route.ts`:

```typescript
import { stripe } from '@/lib/stripe';

export async function POST(req: Request) {
  const { email, name } = await req.json();
  
  // Create user in database
  const user = await db.insert('user', {
    email,
    name,
    // ... other fields
  });

  // Create Stripe customer
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      userId: user.id,
    },
  });

  // Store Stripe customer ID
  await db.update('user', user.id, {
    stripeCustomerId: customer.id,
  });

  return Response.json({ success: true });
}
```

### 3.5 Create Subscription

Create `apps/dashboard/src/lib/billing.ts`:

```typescript
import { stripe, PRICE_IDS } from './stripe';

export async function createSubscription(userId: string) {
  const user = await db.getRecord('user', userId);
  
  if (!user.stripeCustomerId) {
    throw new Error('User has no Stripe customer ID');
  }

  // Create subscription with metered pricing
  const subscription = await stripe.subscriptions.create({
    customer: user.stripeCustomerId,
    items: [
      {
        price: PRICE_IDS.tunnelSeconds,
      },
      {
        price: PRICE_IDS.bandwidth,
      },
    ],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    expand: ['latest_invoice.payment_intent'],
  });

  // Store subscription ID
  await db.update('user', userId, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
  });

  return subscription;
}
```

## Step 4: Usage Reporting

### 4.1 Create Usage Reporter

Create `apps/dashboard/src/lib/usage-reporter.ts`:

```typescript
import { stripe } from './stripe';
import { getDatabase } from '@liveport/shared';

export interface UsageReport {
  userId: string;
  tunnelSeconds: number;
  bandwidthGB: number;
}

/**
 * Calculate usage for a billing period
 */
export async function calculateUsage(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<UsageReport> {
  const db = getDatabase();

  // Query tunnels for this user in the billing period
  const result = await db.query(`
    SELECT 
      SUM(EXTRACT(EPOCH FROM (COALESCE(disconnected_at, NOW()) - connected_at))) as total_seconds,
      SUM(bytes_transferred) as total_bytes
    FROM tunnels
    WHERE user_id = $1
      AND connected_at >= $2
      AND connected_at < $3
  `, [userId, startDate.toISOString(), endDate.toISOString()]);

  const row = result.rows[0];
  const tunnelSeconds = parseFloat(row.total_seconds || '0');
  const totalBytes = parseInt(row.total_bytes || '0', 10);
  const bandwidthGB = totalBytes / (1024 * 1024 * 1024);

  return {
    userId,
    tunnelSeconds,
    bandwidthGB,
  };
}

/**
 * Report usage to Stripe
 */
export async function reportUsageToStripe(
  userId: string,
  usage: UsageReport
): Promise<void> {
  const user = await db.getRecord('user', userId);
  
  if (!user.stripeSubscriptionId) {
    throw new Error('User has no active subscription');
  }

  // Get subscription items
  const subscription = await stripe.subscriptions.retrieve(
    user.stripeSubscriptionId,
    { expand: ['items'] }
  );

  // Find subscription items for tunnel seconds and bandwidth
  const tunnelSecondsItem = subscription.items.data.find(
    (item) => item.price.id === PRICE_IDS.tunnelSeconds
  );
  const bandwidthItem = subscription.items.data.find(
    (item) => item.price.id === PRICE_IDS.bandwidth
  );

  if (!tunnelSecondsItem || !bandwidthItem) {
    throw new Error('Subscription items not found');
  }

  // Report tunnel usage (in 1000-second blocks for Stripe)
  if (usage.tunnelSeconds > 0) {
    const blocks = Math.ceil(usage.tunnelSeconds / 1000);
    await stripe.subscriptionItems.createUsageRecord(
      tunnelSecondsItem.id,
      {
        quantity: blocks, // Report in 1000-second blocks
        timestamp: Math.floor(Date.now() / 1000),
        action: 'set', // 'set' replaces, 'increment' adds
      }
    );
  }

  // Report bandwidth usage (in GB, rounded to 2 decimals)
  if (usage.bandwidthGB > 0) {
    await stripe.subscriptionItems.createUsageRecord(
      bandwidthItem.id,
      {
        quantity: Math.round(usage.bandwidthGB * 100), // Report in 0.01 GB units
        timestamp: Math.floor(Date.now() / 1000),
        action: 'set',
      }
    );
  }

  console.log(`[Billing] Reported usage for user ${userId}:`, usage);
}
```

### 4.2 Daily Usage Sync

Create a cron job to report usage daily:

Create `apps/dashboard/src/app/api/cron/sync-usage/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { calculateUsage, reportUsageToStripe } from '@/lib/usage-reporter';
import { getDatabase } from '@liveport/shared';

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();

  // Get all users with active subscriptions
  const users = await db.query(`
    SELECT id, stripe_subscription_id
    FROM "user"
    WHERE stripe_subscription_id IS NOT NULL
      AND subscription_status = 'active'
  `);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let successCount = 0;
  let errorCount = 0;

  for (const user of users.rows) {
    try {
      const usage = await calculateUsage(user.id, startOfMonth, now);
      await reportUsageToStripe(user.id, usage);
      successCount++;
    } catch (err) {
      console.error(`Failed to sync usage for user ${user.id}:`, err);
      errorCount++;
    }
  }

  return NextResponse.json({
    success: true,
    synced: successCount,
    errors: errorCount,
  });
}
```

### 4.3 Configure Cron (Vercel/Fly.io)

**For Vercel** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-usage",
      "schedule": "0 0 * * *"
    }
  ]
}
```

**For Fly.io** (use external cron like GitHub Actions):
```yaml
# .github/workflows/sync-usage.yml
name: Sync Usage to Stripe
on:
  schedule:
    - cron: '0 0 * * *' # Daily at midnight UTC
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger usage sync
        run: |
          curl -X GET https://app.liveport.dev/api/cron/sync-usage \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## Step 5: Webhooks

### 5.1 Create Webhook Endpoint

Create `apps/dashboard/src/app/api/webhooks/stripe/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getDatabase } from '@liveport/shared';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const db = getDatabase();

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await db.query(
        `UPDATE "user" 
         SET subscription_status = $1, updated_at = NOW()
         WHERE stripe_customer_id = $2`,
        [subscription.status, subscription.customer]
      );
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await db.query(
        `UPDATE "user" 
         SET subscription_status = 'canceled', 
             stripe_subscription_id = NULL,
             updated_at = NOW()
         WHERE stripe_customer_id = $1`,
        [subscription.customer]
      );
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      console.log(`Payment succeeded for invoice ${invoice.id}`);
      // Optionally: Send receipt email
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.error(`Payment failed for invoice ${invoice.id}`);
      // Notify user about failed payment
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
```

### 5.2 Register Webhook in Stripe

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. **Endpoint URL**: `https://app.liveport.dev/api/webhooks/stripe`
4. **Events to send**:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Save → Copy **Signing secret**: `whsec_...`
6. Add to `.env`: `STRIPE_WEBHOOK_SECRET=whsec_...`

### 5.3 Test Webhook Locally

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test event
stripe trigger customer.subscription.created
```

## Step 6: Frontend Integration

### 6.1 Checkout Page

Create `apps/dashboard/src/app/billing/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/billing/success`,
      },
    });

    if (error) {
      console.error(error);
      alert(error.message);
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button type="submit" disabled={!stripe || loading}>
        {loading ? 'Processing...' : 'Subscribe'}
      </button>
    </form>
  );
}

export default function BillingPage() {
  const [clientSecret, setClientSecret] = useState('');

  // Fetch client secret on mount
  useEffect(() => {
    fetch('/api/billing/create-subscription', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => setClientSecret(data.clientSecret));
  }, []);

  if (!clientSecret) {
    return <div>Loading...</div>;
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm />
    </Elements>
  );
}
```

### 6.2 Usage Dashboard

Create `apps/dashboard/src/app/billing/usage/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';

export default function UsagePage() {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    fetch('/api/billing/usage')
      .then((res) => res.json())
      .then(setUsage);
  }, []);

  if (!usage) return <div>Loading...</div>;

  const tunnelCost = (usage.tunnelDomainDays / 30) * 1.50;
  const bandwidthCost = usage.bandwidthGB * 0.05;
  const totalCost = tunnelCost + bandwidthCost;

  return (
    <div>
      <h1>Current Usage</h1>
      <div>
        <h2>Tunnels</h2>
        <p>{usage.tunnelDomainDays} domain-days × $1.50/30 = ${tunnelCost.toFixed(2)}</p>
      </div>
      <div>
        <h2>Bandwidth</h2>
        <p>{usage.bandwidthGB.toFixed(2)} GB × $0.05 = ${bandwidthCost.toFixed(2)}</p>
      </div>
      <div>
        <h2>Estimated Total</h2>
        <p>${totalCost.toFixed(2)}</p>
      </div>
    </div>
  );
}
```

## Step 7: Testing

### 7.1 Test Card Numbers

Use Stripe test cards:
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

### 7.2 Test Workflow

1. **Create account** → Stripe customer created
2. **Subscribe** → Subscription created with metered items
3. **Create tunnels** → Usage tracked in database
4. **Cron runs** → Usage reported to Stripe
5. **End of month** → Invoice generated
6. **Payment processed** → Webhook received

### 7.3 Verify in Stripe Dashboard

1. Go to **Customers** → Find test customer
2. Click **Subscriptions** → View active subscription
3. Click **Usage** → See reported usage
4. Go to **Invoices** → View generated invoices

## Step 8: Go Live

### 8.1 Switch to Live Mode

1. Complete Stripe verification
2. Update environment variables with live keys:
   ```bash
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   ```
3. Recreate products in live mode
4. Update webhook endpoint to live mode
5. Test with real payment method

### 8.2 Production Checklist

- [ ] Stripe account verified
- [ ] Live API keys configured
- [ ] Products created in live mode
- [ ] Webhook endpoint registered (live mode)
- [ ] Cron job configured and tested
- [ ] Usage reporting tested end-to-end
- [ ] Frontend checkout flow tested
- [ ] Invoice emails configured
- [ ] Payment failure handling tested
- [ ] Refund policy documented

## Troubleshooting

### Issue: Usage not reported to Stripe
**Fix**: Check cron logs, verify subscription items exist, ensure usage > 0

### Issue: Webhook signature verification failed
**Fix**: Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard

### Issue: Payment failed
**Fix**: Check customer has valid payment method, verify card details

## Cost Estimate

### Stripe Fees
- **2.9% + $0.30** per successful charge
- **No monthly fees** for usage-based pricing

### Example Calculation
- User usage: $10/month
- Stripe fee: $10 × 2.9% + $0.30 = $0.59
- **Net revenue**: $9.41 (94.1% margin)

## Next Steps

1. Implement free tier limits (before charging)
2. Add usage alerts for users
3. Create billing history page
4. Implement refund flow
5. Add invoice PDF generation
6. Set up revenue analytics

## References

- [Stripe Metered Billing](https://stripe.com/docs/billing/subscriptions/usage-based)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe Testing](https://stripe.com/docs/testing)

