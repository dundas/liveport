# Cloudflare Setup Guide

## Overview

This guide walks through configuring Cloudflare as the edge layer for LivePort. Cloudflare provides:
- DNS management with wildcard support
- SSL/TLS termination
- DDoS protection (free tier)
- Web Application Firewall (WAF)
- Caching for performance

## Prerequisites

- Domain name (e.g., `liveport.dev`)
- Cloudflare account (free tier is sufficient)
- Fly.io apps deployed (`liveport-tunnel`, `liveport-api`, `liveport-dashboard`)

## Step 1: Add Domain to Cloudflare

### 1.1 Create Cloudflare Account
1. Go to [cloudflare.com](https://cloudflare.com)
2. Sign up for a free account
3. Verify your email

### 1.2 Add Site
1. Click "Add a Site" in the Cloudflare dashboard
2. Enter your domain: `liveport.dev`
3. Select the **Free** plan
4. Click "Continue"

### 1.3 Update Nameservers
Cloudflare will provide two nameservers (e.g., `ns1.cloudflare.com`, `ns2.cloudflare.com`).

**At your domain registrar** (Namecheap, GoDaddy, etc.):
1. Log in to your registrar account
2. Find DNS/Nameserver settings for `liveport.dev`
3. Replace existing nameservers with Cloudflare's nameservers
4. Save changes

**Wait for propagation** (5 minutes to 24 hours):
```bash
# Check nameserver propagation
dig NS liveport.dev +short
# Should show: ns1.cloudflare.com, ns2.cloudflare.com
```

## Step 2: Configure DNS Records

### 2.1 API Subdomain
Point `api.liveport.dev` to your Fly.io API server.

**DNS Record**:
- **Type**: `CNAME`
- **Name**: `api`
- **Target**: `liveport-api.fly.dev`
- **Proxy status**: ✅ **Proxied** (orange cloud)
- **TTL**: Auto

### 2.2 Dashboard Subdomain
Point `app.liveport.dev` (or root `liveport.dev`) to your dashboard.

**DNS Record**:
- **Type**: `CNAME`
- **Name**: `app` (or `@` for root)
- **Target**: `liveport-dashboard.fly.dev`
- **Proxy status**: ✅ **Proxied** (orange cloud)
- **TTL**: Auto

### 2.3 Wildcard for Tunnel Subdomains
Point `*.liveport.dev` to your tunnel server.

**DNS Record**:
- **Type**: `CNAME`
- **Name**: `*`
- **Target**: `liveport-tunnel.fly.dev`
- **Proxy status**: ✅ **Proxied** (orange cloud)
- **TTL**: Auto

### 2.4 Root Domain (Optional)
If you want `liveport.dev` to redirect to `app.liveport.dev`:

**DNS Record**:
- **Type**: `CNAME`
- **Name**: `@`
- **Target**: `liveport-dashboard.fly.dev`
- **Proxy status**: ✅ **Proxied**
- **TTL**: Auto

### Verify DNS
```bash
# Check API subdomain
dig api.liveport.dev +short

# Check wildcard (any subdomain)
dig xyz123.liveport.dev +short

# Both should resolve to Cloudflare IPs (not Fly.io IPs directly)
```

## Step 3: SSL/TLS Configuration

### 3.1 SSL/TLS Mode
1. Go to **SSL/TLS** → **Overview**
2. Set encryption mode to: **Full (strict)**
   - This ensures end-to-end encryption between Cloudflare and Fly.io
   - Fly.io provides Let's Encrypt certificates automatically

### 3.2 Edge Certificates
1. Go to **SSL/TLS** → **Edge Certificates**
2. Enable:
   - ✅ **Always Use HTTPS** (redirect HTTP to HTTPS)
   - ✅ **Automatic HTTPS Rewrites**
   - ✅ **Minimum TLS Version**: TLS 1.2
   - ✅ **Opportunistic Encryption**
   - ✅ **TLS 1.3** (enabled by default)

### 3.3 Verify SSL
```bash
# Check SSL certificate
curl -I https://api.liveport.dev
# Should return 200 OK with valid SSL

# Check wildcard SSL
curl -I https://test123.liveport.dev
# Should work for any subdomain
```

## Step 4: Security Configuration

### 4.1 Web Application Firewall (WAF)
1. Go to **Security** → **WAF**
2. Enable **Managed Rules**:
   - ✅ Cloudflare Managed Ruleset
   - ✅ Cloudflare OWASP Core Ruleset
3. Set sensitivity: **Medium** (adjust based on false positives)

### 4.2 DDoS Protection
1. Go to **Security** → **DDoS**
2. Verify **DDoS Protection** is enabled (automatic on all plans)
3. Set sensitivity: **High**

### 4.3 Rate Limiting
**Option A: Free Tier (Basic)**
1. Go to **Security** → **WAF** → **Rate Limiting Rules**
2. Create rule:
   - **Name**: `Global Rate Limit`
   - **If incoming requests match**: `All incoming requests`
   - **Then**: Rate limit
   - **Requests**: `100` per `10 seconds`
   - **Action**: Block
   - **Duration**: `60 seconds`

**Option B: Paid Tier (Advanced)**
```javascript
// Custom rate limiting rule
(http.request.uri.path contains "/api/") and 
(rate(1m) > 1000)
```

### 4.4 Bot Protection
1. Go to **Security** → **Bots**
2. Enable **Bot Fight Mode** (free tier)
   - Blocks known bad bots
   - Challenges suspicious traffic

### 4.5 Security Level
1. Go to **Security** → **Settings**
2. Set **Security Level**: **Medium**
   - Low: Minimal challenges
   - Medium: Balanced (recommended)
   - High: More aggressive (may impact legitimate users)

## Step 5: Performance Configuration

### 5.1 Caching
1. Go to **Caching** → **Configuration**
2. Set **Caching Level**: **Standard**
3. Set **Browser Cache TTL**: `4 hours`

**Cache Rules** (for tunnel endpoints):
1. Go to **Caching** → **Cache Rules**
2. Create rule:
   - **Name**: `Cache Static Assets`
   - **If**: `(http.request.uri.path contains "/static/")`
   - **Then**: Cache eligibility = Eligible
   - **Edge TTL**: `1 hour`

**Bypass Cache for Tunnels**:
```javascript
// Rule: Don't cache tunnel traffic
(wildcard(http.host, "*.liveport.dev")) and 
not (http.host eq "api.liveport.dev") and
not (http.host eq "app.liveport.dev")
→ Cache eligibility: Bypass cache
```

### 5.2 Compression
1. Go to **Speed** → **Optimization**
2. Enable:
   - ✅ **Brotli** (better compression than gzip)
   - ✅ **Auto Minify**: CSS, JavaScript, HTML

### 5.3 HTTP/3 (QUIC)
1. Go to **Network**
2. Enable:
   - ✅ **HTTP/3 (with QUIC)**
   - ✅ **0-RTT Connection Resumption**

## Step 6: Page Rules (Optional)

### Redirect Root to App
If you want `liveport.dev` → `app.liveport.dev`:

1. Go to **Rules** → **Page Rules**
2. Create rule:
   - **URL**: `liveport.dev/*`
   - **Setting**: Forwarding URL (301 - Permanent Redirect)
   - **Destination**: `https://app.liveport.dev/$1`

### Force HTTPS
1. Go to **Rules** → **Page Rules**
2. Create rule:
   - **URL**: `http://*liveport.dev/*`
   - **Setting**: Always Use HTTPS

## Step 7: Analytics & Monitoring

### 7.1 Enable Analytics
1. Go to **Analytics & Logs** → **Web Analytics**
2. View:
   - Requests per second
   - Bandwidth usage
   - Cache hit rate (should be 70-90% for static assets)
   - Threats blocked

### 7.2 Set Up Alerts
1. Go to **Notifications**
2. Create alerts for:
   - **DDoS attack detected**
   - **SSL certificate expiring**
   - **Origin errors** (5xx from Fly.io)

### 7.3 Real User Monitoring (RUM)
1. Go to **Speed** → **Optimization**
2. Enable **Web Analytics** for dashboard

## Step 8: Verify Configuration

### 8.1 Test DNS Resolution
```bash
# API
curl -I https://api.liveport.dev/health
# Should return 200 OK

# Dashboard
curl -I https://app.liveport.dev
# Should return 200 OK

# Wildcard tunnel
curl -I https://test-subdomain.liveport.dev
# Should return 502 (no tunnel active) or 200 (if tunnel exists)
```

### 8.2 Test SSL
```bash
# Check SSL certificate issuer
openssl s_client -connect api.liveport.dev:443 -servername api.liveport.dev < /dev/null 2>/dev/null | openssl x509 -noout -issuer
# Should show: Cloudflare
```

### 8.3 Test DDoS Protection
```bash
# Simulate rate limiting (should get blocked after 100 requests)
for i in {1..150}; do curl -s https://api.liveport.dev/health > /dev/null; done
# After ~100 requests, should receive 429 or CAPTCHA challenge
```

### 8.4 Test Caching
```bash
# First request (cache MISS)
curl -I https://app.liveport.dev/static/logo.png
# Check header: cf-cache-status: MISS

# Second request (cache HIT)
curl -I https://app.liveport.dev/static/logo.png
# Check header: cf-cache-status: HIT
```

## Step 9: Production Checklist

- [ ] Nameservers updated and propagated
- [ ] DNS records created (api, app, wildcard)
- [ ] SSL/TLS mode set to Full (strict)
- [ ] Always Use HTTPS enabled
- [ ] WAF enabled with OWASP rules
- [ ] Rate limiting configured
- [ ] Bot protection enabled
- [ ] Caching rules configured
- [ ] Compression enabled (Brotli)
- [ ] HTTP/3 enabled
- [ ] Analytics alerts configured
- [ ] All endpoints tested and working

## Troubleshooting

### Issue: 525 SSL Handshake Failed
**Cause**: Fly.io doesn't have a valid SSL certificate.

**Fix**:
```bash
# Verify Fly.io has SSL
fly certs list -a liveport-tunnel
# Should show certificate for *.fly.dev

# If missing, add:
fly certs add liveport-tunnel.fly.dev -a liveport-tunnel
```

### Issue: 522 Connection Timed Out
**Cause**: Cloudflare can't reach Fly.io origin.

**Fix**:
1. Check Fly.io app is running: `fly status -a liveport-tunnel`
2. Check DNS target is correct: `dig liveport-tunnel.fly.dev +short`
3. Verify Fly.io firewall allows Cloudflare IPs

### Issue: 403 Forbidden (WAF Block)
**Cause**: WAF rule blocking legitimate traffic.

**Fix**:
1. Go to **Security** → **Events**
2. Find blocked request
3. Create exception rule or adjust sensitivity

### Issue: Slow Response Times
**Cause**: Caching not working or origin slow.

**Fix**:
1. Check cache hit rate in Analytics (should be >70%)
2. Verify cache rules are applied
3. Check Fly.io response times: `fly logs -a liveport-tunnel`

## Cost Optimization

### Free Tier Limits
- **Bandwidth**: Unlimited
- **Requests**: Unlimited
- **DDoS Protection**: Included
- **SSL Certificates**: Included
- **Page Rules**: 3 rules
- **Rate Limiting**: Basic (10 rules)

### When to Upgrade to Pro ($20/month)
- Need >3 page rules
- Advanced rate limiting
- Image optimization
- Mobile optimization
- Prioritized support

### When to Upgrade to Business ($200/month)
- Custom WAF rules
- Advanced DDoS protection
- Guaranteed uptime SLA
- 24/7 support

## Next Steps

1. **Monitor Performance**: Watch Analytics for first week
2. **Tune WAF**: Adjust rules based on false positives
3. **Optimize Caching**: Increase cache hit rate
4. **Set Up Monitoring**: Integrate with Sentry/Datadog
5. **Document Incidents**: Keep runbook for common issues

## References

- [Cloudflare DNS Setup](https://developers.cloudflare.com/dns/)
- [SSL/TLS Configuration](https://developers.cloudflare.com/ssl/)
- [WAF Rules](https://developers.cloudflare.com/waf/)
- [Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Caching](https://developers.cloudflare.com/cache/)

