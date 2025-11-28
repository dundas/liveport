# LivePort Pricing Model

## Overview

LivePort uses a usage-based pricing model designed to be developer-friendly, cost-effective, and scalable. This model leverages our low-overhead architecture (Cloudflare + Fly.io) to offer significant savings compared to competitors like ngrok.

## Pricing Structure (Simplified)

### Base Tier
*   **Cost**: $0 / month
*   **Includes**:
    *   Access to the platform
    *   Basic dashboard features
    *   CLI access

### Usage Charges (Pay Only What You Use)
*   **Tunnel Time**: $0.000005 per tunnel-second (~$0.018/hour, ~$13/month for 24/7)
    *   Charged per second the tunnel is open
    *   Starts when connection established, stops when disconnected
    *   Random subdomain (e.g., `xyz789.liveport.dev`)
*   **Data Transfer**: $0.05 per GB
    *   Metered on total bandwidth (request + response) through the tunnel

### Premium Add-On
*   **Static Subdomain**: $2.50/month (pro-rated daily)
    *   Choose your own subdomain (e.g., `myapp.liveport.dev`)
    *   Keeps the same URL across connections
    *   Pro-rated: $0.083/day if enabled mid-month
    *   Can be enabled/disabled anytime

### Why This Model?
- ✅ **Extremely simple**: Only 2 metrics (time + bandwidth) + optional static subdomain
- ✅ **Perfectly fair**: Pay exactly for what you use
- ✅ **Predictable**: Easy to estimate costs
- ✅ **Developer-friendly**: Short tests cost pennies, static URLs for production

### Comparison

| Metric | LivePort | LivePort + Static | ngrok (Pro) | Savings |
| :--- | :--- | :--- | :--- | :--- |
| Base Cost | $0 | $0 | $20 | 100% |
| 1 hour test, 1GB | $0.07 | $0.07 | $20/month | ~99% |
| 24/7 tunnel, 25GB | $14.21 | $16.71 | ~$35+ | ~52% |
| Static subdomain | Random | $2.50/mo | Included | - |

**Note**: ngrok Pro includes 1 static domain, but costs $20/month base. LivePort's static subdomain is optional and only $2.50/month.

## Billing Implementation

### Metering Strategy
We track two primary metrics in our `tunnels` database table:
1.  `connected_at`: Timestamp when tunnel opened
2.  `disconnected_at`: Timestamp when tunnel closed
3.  `bytes_transferred`: Total bytes sent/received through the tunnel

### Calculation Logic

```typescript
// Monthly Calculation Example
const tunnels = await db.query(`
  SELECT 
    SUM(EXTRACT(EPOCH FROM (COALESCE(disconnected_at, NOW()) - connected_at))) as total_seconds,
    SUM(bytes_transferred) as total_bytes
  FROM tunnels
  WHERE user_id = $1
    AND connected_at >= $2
    AND connected_at < $3
`, [userId, startOfMonth, endOfMonth]);

const tunnelSeconds = tunnels.total_seconds;
const tunnelCost = tunnelSeconds * 0.000005; // $0.000005 per second

const bandwidthGB = tunnels.total_bytes / (1024 * 1024 * 1024);
const bandwidthCost = bandwidthGB * 0.05;

// Static subdomain (if user has any)
const staticSubdomains = await db.query(`
  SELECT 
    subdomain,
    created_at,
    COALESCE(deleted_at, $3) as end_date
  FROM static_subdomains
  WHERE user_id = $1
    AND created_at < $3
    AND (deleted_at IS NULL OR deleted_at >= $2)
`, [userId, startOfMonth, endOfMonth]);

let staticSubdomainCost = 0;
for (const sub of staticSubdomains.rows) {
  const daysInBillingPeriod = getDaysInRange(
    Math.max(sub.created_at, startOfMonth),
    Math.min(sub.end_date, endOfMonth)
  );
  staticSubdomainCost += daysInBillingPeriod * (2.50 / 30); // $0.083/day
}

const totalBill = tunnelCost + bandwidthCost + staticSubdomainCost;
```

### Stripe Integration
*   **Product 1**: "Active Tunnel" (Metered Usage) - $1.50/unit
*   **Product 2**: "Data Transfer" (Metered Usage) - $0.05/unit

Usage is reported to Stripe daily or monthly via their Usage API.

## Free Tier Strategy (MVP)
For the initial MVP launch:
*   **Pricing**: Free
*   **Limits**:
    *   Max 2 concurrent tunnels per user.
    *   Max 1GB bandwidth per month.
*   **Goal**: User acquisition and system stability testing.
*   **Transition**: Introduce paid billing in Phase 2.

