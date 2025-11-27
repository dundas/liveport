# LivePort Deployment Runbook

This document covers deployment procedures for LivePort services on Fly.io.

## Services Overview

| Service | App Name | Region | URL |
|---------|----------|--------|-----|
| Dashboard | `liveport-dashboard` | `iad` | https://app.liveport.dev |
| Tunnel Server | `liveport-tunnel` | `iad` | https://tunnel.liveport.dev |

## Prerequisites

1. Install Fly.io CLI: `curl -L https://fly.io/install.sh | sh`
2. Authenticate: `fly auth login`
3. Ensure access to the LivePort organization

## Standard Deployment

### Automatic Deployment (Recommended)

Deployments are triggered automatically on push to `main`:

1. Push to main branch
2. GitHub Actions runs tests
3. On success, deploys to Fly.io
4. Health checks verify deployment

### Manual Deployment

```bash
# Deploy Dashboard
cd apps/dashboard
fly deploy

# Deploy Tunnel Server
cd apps/tunnel-server
fly deploy
```

### Deploy with Build

```bash
# Build locally first
pnpm build

# Then deploy
fly deploy --local-only
```

## Rollback Procedures

### Quick Rollback (Last Working Version)

```bash
# List recent releases
fly releases -a liveport-dashboard

# Rollback to previous version
fly releases rollback -a liveport-dashboard

# Or rollback to specific version
fly releases rollback v42 -a liveport-dashboard
```

### Rollback via Git

```bash
# Find last good commit
git log --oneline -10

# Revert to that commit
git revert HEAD
git push origin main

# This triggers auto-deploy of reverted code
```

## Scaling

### Horizontal Scaling

```bash
# Scale dashboard to 2 instances
fly scale count 2 -a liveport-dashboard

# Scale tunnel server
fly scale count 3 -a liveport-tunnel
```

### Vertical Scaling

```bash
# Increase machine size
fly scale vm shared-cpu-2x -a liveport-dashboard

# Available sizes: shared-cpu-1x, shared-cpu-2x, shared-cpu-4x
# Performance sizes: performance-1x, performance-2x, etc.
```

### Memory Scaling

```bash
# Increase memory
fly scale memory 512 -a liveport-dashboard
```

## Health Checks

### Check Service Status

```bash
# Dashboard health
curl https://app.liveport.dev/api/health

# Detailed health
curl https://app.liveport.dev/api/health?detailed=true

# Tunnel server health
curl https://tunnel.liveport.dev/health
```

### Fly.io Status

```bash
# Check app status
fly status -a liveport-dashboard

# View recent logs
fly logs -a liveport-dashboard

# Stream logs
fly logs -a liveport-dashboard -f
```

## Environment Updates

### Update Secrets

```bash
# Set a secret
fly secrets set SENTRY_DSN="https://xxx@sentry.io/xxx" -a liveport-dashboard

# Set multiple secrets
fly secrets set KEY1=value1 KEY2=value2 -a liveport-dashboard

# List secrets (names only)
fly secrets list -a liveport-dashboard
```

### Update Environment Variables

Non-sensitive config goes in `fly.toml`:

```toml
[env]
  NODE_ENV = "production"
  LOG_LEVEL = "info"
```

Deploy to apply changes.

## Monitoring

### View Metrics

```bash
# CPU/Memory metrics
fly dashboard -a liveport-dashboard
```

### Check Logs

```bash
# Recent errors
fly logs -a liveport-dashboard | grep -i error

# Filter by instance
fly logs -a liveport-dashboard -i <instance-id>
```

### Sentry Errors

1. Go to https://sentry.io
2. Select the LivePort project
3. Review error reports and trends

## Database Operations

### Run Migrations

```bash
# From local machine with production secrets
MECH_APPS_APP_ID=xxx MECH_APPS_API_KEY=xxx pnpm migrate

# Check migration status
pnpm migrate:status
```

### Access Redis

```bash
# Connect to Redis
fly redis connect liveport-redis

# Basic commands
PING
INFO
KEYS *
```

## Incident Response

### Service Down

1. Check Fly.io status: https://status.fly.io
2. Check health endpoint
3. Review logs for errors
4. Check Redis connectivity
5. Check database connectivity
6. Rollback if needed

### High Error Rate

1. Check Sentry for error patterns
2. Review recent deployments
3. Check resource utilization
4. Scale up if resource-constrained
5. Rollback if caused by code change

### Slow Performance

1. Check Fly.io metrics
2. Review slow queries in logs
3. Check Redis cache hit rate
4. Consider scaling horizontally

## Useful Commands Reference

```bash
# SSH into running instance
fly ssh console -a liveport-dashboard

# Restart all instances
fly apps restart liveport-dashboard

# View instance IPs
fly ips list -a liveport-dashboard

# Check certificates
fly certs list -a liveport-dashboard

# View machine status
fly machines list -a liveport-dashboard
```

## Contacts

- On-call: Check PagerDuty/Opsgenie schedule
- Fly.io Support: https://community.fly.io
- Sentry: https://sentry.io
