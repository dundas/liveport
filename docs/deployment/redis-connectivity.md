# Redis Connectivity for Production

## Problem

The LivePort architecture requires Redis for:
- Rate limiting across services
- Tunnel heartbeat tracking
- Session management

However, there's a critical infrastructure challenge:
- **Dashboard** is deployed on **Vercel** (for optimal Next.js performance)
- **Tunnel Server** is deployed on **Fly.io** (for WebSocket stability)
- **Fly.io Redis** is on a **private network** only accessible to Fly.io apps

This means the Vercel-hosted dashboard cannot connect to Fly.io's private Redis instance.

## Solutions

### ✅ Recommended: Public Upstash Redis

**Use a public Upstash Redis instance accessible from both Vercel and Fly.io.**

#### Setup Steps:

1. **Create Upstash Redis Instance**
   - Go to [upstash.com](https://upstash.com)
   - Create a new Redis database
   - Select "Global" region for best performance
   - Enable TLS

2. **Get Connection URL**
   ```
   redis://default:YOUR_PASSWORD@your-instance.upstash.io:6379
   ```

3. **Configure Dashboard (Vercel)**
   - Go to Vercel Project Settings → Environment Variables
   - Add `REDIS_URL` with the Upstash connection string
   - Redeploy

4. **Configure Tunnel Server (Fly.io)**
   ```bash
   fly secrets set REDIS_URL="redis://default:YOUR_PASSWORD@your-instance.upstash.io:6379" -a liveport-tunnel
   ```

#### Pros:
- ✅ Works with both Vercel and Fly.io
- ✅ Managed service (no maintenance)
- ✅ Built-in TLS encryption
- ✅ Global replication available
- ✅ Free tier available

#### Cons:
- ⚠️ Slightly higher latency than private network
- ⚠️ Additional cost at scale (but free tier is generous)

---

### Alternative 1: Vercel KV (Requires Code Changes)

Use Vercel's built-in KV store for the dashboard.

#### Setup:
1. Enable Vercel KV in project settings
2. Update dashboard code to use `@vercel/kv` instead of `ioredis`
3. Keep Fly.io Redis for tunnel server

#### Pros:
- ✅ Optimized for Vercel
- ✅ Very low latency for dashboard
- ✅ Included in Vercel plans

#### Cons:
- ❌ Requires code refactoring
- ❌ Two separate Redis instances to manage
- ❌ More complex architecture

---

### Alternative 2: In-Memory Fallback (Development Only)

For local development, the dashboard can fall back to in-memory rate limiting if `REDIS_URL` is not set.

#### Current Implementation:
```typescript
// apps/dashboard/src/lib/rate-limit.ts
if (!redisUrl) {
  logger.warn("[RateLimit] REDIS_URL not configured, falling back to in-memory");
  // Uses Map-based in-memory store
}
```

#### Pros:
- ✅ Works for local development
- ✅ No external dependencies

#### Cons:
- ❌ **NOT production-safe** (rate limits reset on deploy/restart)
- ❌ Doesn't work across multiple instances
- ❌ No shared state between dashboard and tunnel server

---

### Alternative 3: Fly.io Private Network Proxy (Complex)

Set up a Redis proxy on Fly.io that's accessible publicly.

#### Pros:
- ✅ Uses existing Fly.io Redis
- ✅ No additional Redis service

#### Cons:
- ❌ Complex setup and maintenance
- ❌ Additional security considerations
- ❌ Another service to monitor

---

## Recommended Implementation

**Use Public Upstash Redis** for production. Here's why:

1. **Simplicity**: Single Redis instance for both services
2. **Reliability**: Managed service with high availability
3. **Security**: Built-in TLS encryption
4. **Cost**: Free tier covers MVP usage
5. **Scalability**: Easy to upgrade as usage grows

## Configuration Checklist

### Dashboard (Vercel)
- [ ] Create Upstash Redis instance
- [ ] Add `REDIS_URL` to Vercel environment variables
- [ ] Verify rate limiting works in production
- [ ] Monitor Redis usage in Upstash dashboard

### Tunnel Server (Fly.io)
- [ ] Set `REDIS_URL` secret via `fly secrets set`
- [ ] Deploy updated configuration
- [ ] Verify heartbeat tracking works
- [ ] Monitor Redis connections in logs

### Testing
- [ ] Test rate limiting from dashboard
- [ ] Test tunnel heartbeats
- [ ] Verify both services can connect simultaneously
- [ ] Load test to ensure Redis handles concurrent connections

## Monitoring

### Upstash Dashboard
- Monitor connection count
- Check command latency
- Review memory usage
- Set up alerts for high usage

### Application Logs
```bash
# Dashboard (Vercel)
vercel logs --follow

# Tunnel Server (Fly.io)
fly logs -a liveport-tunnel
```

Look for:
- `[RateLimit] Redis-backed rate limiters initialized` (success)
- `[RateLimit] Failed to initialize Redis` (failure)
- Connection errors or timeouts

## Fallback Strategy

If Redis becomes unavailable:
1. Dashboard falls back to in-memory rate limiting (logs warning)
2. Tunnel server continues to work but without rate limiting
3. Monitor Sentry for Redis connection errors
4. Investigate and restore Redis connectivity

## Cost Estimation

### Upstash Free Tier
- 10,000 commands/day
- 256 MB storage
- TLS included

### Estimated Usage (MVP)
- Rate limiting: ~1,000 commands/day
- Heartbeats: ~2,000 commands/day
- Session data: ~500 commands/day
- **Total: ~3,500 commands/day** (well within free tier)

### Paid Tier (if needed)
- $0.20 per 100K commands
- Estimated cost at 100K commands/day: ~$60/month

## Security Best Practices

1. **Use TLS**: Always enable TLS for Redis connections
2. **Strong Password**: Use Upstash's generated password
3. **Environment Variables**: Never commit Redis URLs to git
4. **Rotate Credentials**: Rotate Redis password quarterly
5. **Monitor Access**: Review connection logs regularly

## Next Steps

1. Create Upstash Redis instance
2. Update `.env.example` files with Upstash URL format
3. Configure Vercel environment variables
4. Set Fly.io secrets
5. Deploy and test
6. Monitor for 24 hours
7. Document in runbook

---

**Status**: Ready to implement  
**Priority**: Critical (required for production)  
**Estimated Time**: 30 minutes  
**Last Updated**: November 28, 2025

