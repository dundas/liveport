# Simplified Pricing Model

## The Change

We've simplified LivePort's pricing from a complex "domain-days" model to an extremely simple **time + bandwidth** model.

### Before (Complex)
- $1.50/month per concurrent domain
- Calculated as "domain-days" / 30
- Hard to estimate costs
- Confusing for users

### After (Simple) ✅
- **$0.000005 per second** (~$0.018/hour)
- **$0.05 per GB**
- **$2.50/month for static subdomain** (optional, pro-rated)
- Crystal clear billing
- Pay exactly for what you use

## Why This Is Better

### 1. Perfectly Fair
- Open tunnel for 10 minutes? Pay for 10 minutes.
- Close it immediately after testing? Stop paying immediately.
- No rounding to days or months.

### 2. Developer-Friendly
Quick tests are **extremely cheap**:
- 5-minute test: **$0.0015** (less than a penny)
- 1-hour test: **$0.018** (2 cents)
- Full day: **$0.43** (43 cents)

### 3. Predictable
Easy mental math:
- **~$0.02/hour** (2 cents per hour)
- **~$0.50/day** (50 cents per day)
- **~$13/month** (for 24/7 tunnel)
- **+$2.50/month** (for static subdomain, if needed)

### 4. Scales Naturally
- Testing: Pennies
- Development: A few dollars
- Production: Scales with actual usage

## Cost Examples

### Typical Use Cases

| Scenario | Tunnel Time | Bandwidth | Cost | + Static | ngrok Pro |
|----------|-------------|-----------|------|----------|-----------|
| **Quick E2E test** | 10 minutes | 100 MB | **$0.005** | $0.005 | $20/month |
| **Daily dev (8h)** | 8 hours | 2 GB | **$0.24/day** | $0.24/day | $20/month |
| **Weekly sprint** | 40 hours | 10 GB | **$0.72** | $0.72 | $20/month |
| **Monthly dev (8h/day)** | 240 hours | 50 GB | **$6.82** | $9.32 | $20/month |
| **24/7 staging** | 720 hours | 100 GB | **$17.96** | $20.46 | $35+/month |

### Real-World Savings

**Scenario 1: AI Agent Testing**
- Run 100 tests per day
- Each test: 2 minutes, 50 MB
- Daily: 200 minutes = **$0.06/day**
- Monthly: **$1.80**
- **ngrok cost**: $20/month
- **Savings**: 91%

**Scenario 2: Development Team (5 devs)**
- Each dev: 6 hours/day, 5 days/week
- Total: 600 hours/month, 100 GB
- Monthly: **$8.00**
- **ngrok cost**: $100/month (5 × $20)
- **Savings**: 92%

**Scenario 3: Staging Environment**
- 24/7 tunnel for staging
- 30 days, 200 GB
- Monthly: **$22.96**
- **ngrok cost**: $35+/month
- **Savings**: 34%

## Implementation

### What Changed in Code
**Nothing!** The metering system already tracks:
- `connected_at`: When tunnel opened
- `disconnected_at`: When tunnel closed
- `bytes_transferred`: Total bandwidth

### Billing Calculation
```typescript
// Simple SQL query
const result = await db.query(`
  SELECT 
    SUM(EXTRACT(EPOCH FROM (COALESCE(disconnected_at, NOW()) - connected_at))) as seconds,
    SUM(bytes_transferred) as bytes
  FROM tunnels
  WHERE user_id = $1
    AND connected_at >= $2
    AND connected_at < $3
`);

const cost = (result.seconds * 0.000005) + (result.bytes / 1e9 * 0.05);
```

### Stripe Configuration
**Product 1: Tunnel Time**
- Price: $0.005 per 1000 seconds (Stripe minimum is $0.50)
- Report usage in 1000-second blocks
- Example: 3600 seconds = 4 blocks = $0.02

**Product 2: Bandwidth**
- Price: $0.05 per GB
- Report usage in GB (rounded to 2 decimals)

## Pricing Psychology

### Why $0.000005/second?
- **Rounds nicely**: $0.018/hour, $0.43/day, $13/month
- **Feels cheap**: "Less than 2 cents per hour"
- **Scales well**: 24/7 usage is still reasonable (~$13/month)

### Why $0.05/GB?
- **Industry standard**: AWS, Cloudflare use similar pricing
- **Easy to understand**: "5 cents per gigabyte"
- **Covers costs**: Our bandwidth is essentially free (Cloudflare)

## Competitive Analysis

### LivePort vs ngrok

| Feature | LivePort | ngrok Pro | Winner |
|---------|----------|-----------|--------|
| **Base cost** | $0 | $20/month | ✅ LivePort |
| **Per-second billing** | ✅ Yes | ❌ No | ✅ LivePort |
| **Short tests** | $0.005 (10 min) | $20/month | ✅ LivePort (99.9% cheaper) |
| **Daily dev** | $0.24/day | $20/month | ✅ LivePort (96% cheaper) |
| **24/7 tunnel** | ~$13/month | $20+/month | ✅ LivePort (35% cheaper) |
| **Multiple tunnels** | Pay per second | Pay per plan | ✅ LivePort |

### LivePort vs Cloudflare Tunnel

| Feature | LivePort | Cloudflare Tunnel | Winner |
|---------|----------|-------------------|--------|
| **Cost** | $0.000005/s + $0.05/GB | Free | ❌ Cloudflare |
| **Agent SDK** | ✅ Yes | ❌ No | ✅ LivePort |
| **Scoped keys** | ✅ Yes | ❌ No | ✅ LivePort |
| **Dashboard** | ✅ Yes | Basic | ✅ LivePort |
| **Setup time** | 2 minutes | 15+ minutes | ✅ LivePort |

**Verdict**: Cloudflare Tunnel is free but lacks developer features. LivePort is worth the cost for teams.

## Margin Analysis

### Cost Structure (per user)
```
Infrastructure (Cloudflare + Fly.io): $0.10/user/month
Payment processing (Stripe): 2.9% + $0.30
Support: $0 (automated)
```

### Example Margin
**User spends $10/month**:
- Infrastructure: $0.10
- Stripe fee: $0.59
- **Net profit**: $9.31
- **Margin**: 93%

**Why such high margin?**
- Cloudflare handles most traffic (free)
- Fly.io scales efficiently
- No payroll costs (bootstrap)

## Free Tier Strategy

### Option A: Time-Based Free Tier
- **10 hours free per month** (~$0.18 value)
- Unlimited bandwidth (first 1 GB)
- Perfect for testing

### Option B: Credit-Based Free Tier
- **$1 free credit per month**
- Use for time or bandwidth
- More flexible

### Option C: No Free Tier (Recommended)
- Costs are so low, free tier is unnecessary
- 10-minute test = half a penny
- Just charge from day 1

**Recommendation**: No free tier. Pricing is already so cheap that a free tier adds complexity without value.

## Marketing Messaging

### Tagline
**"Pay per second. Not per month."**

### Value Props
1. **Pennies for testing**: "Run 100 tests for less than a dollar"
2. **No commitment**: "Stop paying the moment you disconnect"
3. **Perfectly fair**: "Pay exactly for what you use"
4. **Transparent**: "No hidden fees, no minimums"

### Comparison Table (for landing page)
```
┌─────────────────┬──────────────┬─────────────┐
│ Use Case        │ LivePort     │ ngrok Pro   │
├─────────────────┼──────────────┼─────────────┤
│ 10-min test     │ $0.005       │ $20/month   │
│ 1-hour demo     │ $0.02        │ $20/month   │
│ Daily dev (8h)  │ $0.24/day    │ $20/month   │
│ 24/7 staging    │ $13/month    │ $35+/month  │
└─────────────────┴──────────────┴─────────────┘

💡 With LivePort, you only pay when your tunnel is open.
```

## Next Steps

1. ✅ Update documentation (done)
2. ⏳ Test billing calculation in staging
3. ⏳ Create Stripe products
4. ⏳ Implement usage reporter
5. ⏳ Launch pricing page
6. ⏳ Announce to beta users

## FAQ

**Q: Why charge per second instead of per hour?**
A: Maximum fairness. If you use 10 minutes, you pay for 10 minutes, not a full hour.

**Q: Is there a minimum charge?**
A: No. If you use 1 second, you pay $0.000005 (effectively free).

**Q: What if I forget to disconnect?**
A: We'll send alerts at 24 hours and auto-disconnect at 7 days (configurable).

**Q: Can I get a monthly plan?**
A: Not initially. Usage-based is simpler and fairer. We may add prepaid credits later.

**Q: How do I estimate my costs?**
A: Use our calculator: `hours × $0.018 + GB × $0.05`

## Conclusion

This simplified pricing model is:
- ✅ **Easier to understand**: Time + bandwidth
- ✅ **Fairer**: Pay per second
- ✅ **Cheaper**: 50-99% less than ngrok
- ✅ **Simpler to implement**: Already have the data
- ✅ **Better margins**: 90%+ profit

**This is the right model for LivePort.**

