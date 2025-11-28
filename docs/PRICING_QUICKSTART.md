# Pricing & Billing Quick Start

## TL;DR

**Pricing**: 
- $0.000005/tunnel-second (~$0.018/hour)
- $0.05/GB bandwidth
- $2.50/month for static subdomain (optional, pro-rated)

**Status**: Metering ✅ | Billing 📝 (documented, not implemented)  
**Margin**: ~90% (thanks to Cloudflare + Fly.io)

## How It Works

```mermaid
graph LR
    User[User Request] -->|HTTP| CF[Cloudflare]
    CF -->|Proxy| TS[Tunnel Server]
    TS -->|Track| Metrics[(Metrics)]
    Metrics -->|Sync 60s| DB[(PostgreSQL)]
    DB -->|Monthly| Stripe[Stripe Billing]
    Stripe -->|Invoice| User
```

## Metering (Implemented)

### What's Tracked
- **Tunnel Duration**: `connected_at` to `disconnected_at` (seconds)
- **Bytes Transferred**: Request + response body sizes
- **Static Subdomains**: Reserved custom subdomains (if any)

### How It Works
1. HTTP request arrives at tunnel server
2. Server measures request/response sizes
3. Increments counters in memory
4. Syncs to database every 60 seconds
5. Finalizes metrics when tunnel disconnects

### Files Changed
```
apps/tunnel-server/src/
├── types.ts              (added bytesTransferred)
├── connection-manager.ts (added tracking methods)
├── http-handler.ts       (measure & track bytes)
├── websocket-handler.ts  (finalize on disconnect)
├── metering.ts           (new: periodic sync)
└── index.ts              (start/stop metering)
```

### Configuration
```bash
# Enable metering (default: true)
METERING_ENABLED=true

# Sync interval (default: 60000ms)
METERING_SYNC_INTERVAL_MS=60000
```

### Testing
```bash
# Start tunnel server
cd apps/tunnel-server
npm run dev

# Check logs for metering activity
# [Metering] Starting (sync interval: 60000ms)
# [Metering] Syncing metrics for 5 tunnels...
# [Metering] Sync complete

# Query database
psql $DATABASE_URL -c "SELECT subdomain, request_count, bytes_transferred FROM tunnels;"
```

## Billing (Not Yet Implemented)

### Stripe Setup (Phase 2)
1. Create Stripe account
2. Create products:
   - Active Tunnels: $1.50 (metered)
   - Data Transfer: $0.05 (metered)
3. Implement usage reporter (daily cron)
4. Set up webhooks
5. Build checkout flow

### See Full Guide
📖 [Stripe Integration Guide](./deployment/stripe-integration.md)

## Cost Examples

| Usage | Tunnel Time | Bandwidth | Calculation | Total |
|-------|-------------|-----------|-------------|-------|
| Quick test | 1 hour | 1 GB | (3600s × $0.000005) + $0.05 | **$0.07** |
| Daily dev | 8h/day × 30 days | 10 GB | (864,000s × $0.000005) + $0.50 | **$4.82** |
| 24/7 tunnel | 30 days | 25 GB | (2,592,000s × $0.000005) + $1.25 | **$14.21** |

**vs ngrok Pro**: $20/month → **LivePort saves 29-99% depending on usage**

## Infrastructure Costs

### With Cloudflare (Recommended)
```
Cloudflare (free):     $0
Fly.io compute:        $10-20
Fly.io database:       $75
Domain:                $1
─────────────────────────
Total:                 $86-96/month
```

### Without Cloudflare
```
Fly.io compute:        $50
Fly.io DDoS:           $200
Fly.io database:       $75
Domain:                $1
─────────────────────────
Total:                 $326/month
```

**Savings with Cloudflare**: $240/month (280% cheaper)

## Free Tier (MVP)

### Initial Launch
- **Cost**: Free
- **Limits**: 2 tunnels, 1GB/month
- **Duration**: 3-6 months
- **Goal**: User acquisition

### Transition to Paid
1. Announce 30 days in advance
2. Grandfather early users
3. Enable Stripe billing
4. Enforce free tier limits

## Quick Links

- 📊 [Pricing Model](./business/pricing-model.md)
- 🎯 [Pricing Simplified](./business/PRICING_SIMPLIFIED.md)
- 🏗️ [Metering Architecture](./architecture/metering.md)
- ☁️ [Infrastructure Setup](./architecture/infrastructure.md)
- 🔧 [Cloudflare Setup](./deployment/cloudflare-setup.md)
- 💳 [Stripe Integration](./deployment/stripe-integration.md)
- 📈 [Implementation Summary](./business/pricing-implementation-summary.md)
- 🔗 [Static Subdomains Feature](./features/static-subdomains.md)

## Common Commands

### Check Metering Status
```bash
# View tunnel server logs
fly logs -a liveport-tunnel | grep Metering

# Query usage for a user
psql $DATABASE_URL -c "
  SELECT 
    COUNT(*) as tunnels,
    SUM(request_count) as requests,
    SUM(bytes_transferred) / 1024 / 1024 / 1024 as gb
  FROM tunnels
  WHERE user_id = 'user_123'
    AND connected_at >= '2025-11-01'
"
```

### Calculate Monthly Cost
```bash
# For a specific user
psql $DATABASE_URL -c "
  SELECT 
    COUNT(DISTINCT DATE(connected_at)) as domain_days,
    SUM(bytes_transferred) / 1024.0 / 1024.0 / 1024.0 as gb,
    (COUNT(DISTINCT DATE(connected_at)) / 30.0 * 1.50) + 
    (SUM(bytes_transferred) / 1024.0 / 1024.0 / 1024.0 * 0.05) as cost
  FROM tunnels
  WHERE user_id = 'user_123'
    AND connected_at >= '2025-11-01'
    AND connected_at < '2025-12-01'
"
```

## Troubleshooting

### Metering not syncing
1. Check `METERING_ENABLED=true`
2. Verify database connection
3. Check logs for errors: `fly logs -a liveport-tunnel`

### Metrics seem low
1. Verify HTTP handler is tracking bytes
2. Check if tunnels are being finalized on disconnect
3. Compare tunnel server logs vs database

### High infrastructure costs
1. Check Cloudflare cache hit rate (should be >70%)
2. Optimize sync interval (increase to 5 minutes)
3. Review Fly.io instance sizes

## Next Steps

1. ✅ Metering implemented
2. ⏳ Test in staging
3. ⏳ Deploy to production
4. ⏳ Monitor for 1 month
5. ⏳ Implement Stripe billing
6. ⏳ Launch paid tier

## Questions?

- Technical: See [Metering Architecture](./architecture/metering.md)
- Business: See [Pricing Model](./business/pricing-model.md)
- Deployment: See [Cloudflare Setup](./deployment/cloudflare-setup.md)

