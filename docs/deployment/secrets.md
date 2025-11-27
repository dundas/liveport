# LivePort Secrets Management

This document describes all secrets used by LivePort and how to manage them.

## Required Secrets

### Dashboard (`liveport-dashboard`)

| Secret | Description | Example Format |
|--------|-------------|----------------|
| `MECH_APPS_APP_ID` | mech-storage application ID | `app_xxxxxxxxxxxx` |
| `MECH_APPS_API_KEY` | mech-storage API key | `mk_xxxxxxxxxxxx` |
| `REDIS_URL` | Upstash Redis connection URL | `redis://default:xxx@xxx.upstash.io:6379` |
| `BETTER_AUTH_SECRET` | Session signing secret (32+ chars) | Random string |
| `SENTRY_DSN` | Sentry error tracking DSN | `https://xxx@xxx.sentry.io/xxx` |
| `INTERNAL_API_SECRET` | Server-to-server auth | Random string |

### Tunnel Server (`liveport-tunnel`)

| Secret | Description | Example Format |
|--------|-------------|----------------|
| `MECH_APPS_APP_ID` | mech-storage application ID | `app_xxxxxxxxxxxx` |
| `MECH_APPS_API_KEY` | mech-storage API key | `mk_xxxxxxxxxxxx` |
| `REDIS_URL` | Upstash Redis connection URL | `redis://default:xxx@xxx.upstash.io:6379` |
| `SENTRY_DSN` | Sentry error tracking DSN | `https://xxx@xxx.sentry.io/xxx` |
| `INTERNAL_API_SECRET` | Server-to-server auth (must match dashboard) | Random string |
| `DASHBOARD_API_URL` | Dashboard URL for key validation | `https://app.liveport.dev` |

## Setting Secrets

### Via Fly.io CLI

```bash
# Set individual secret
fly secrets set MECH_APPS_APP_ID="app_xxx" -a liveport-dashboard

# Set multiple secrets
fly secrets set \
  MECH_APPS_APP_ID="app_xxx" \
  MECH_APPS_API_KEY="mk_xxx" \
  REDIS_URL="redis://..." \
  -a liveport-dashboard

# Import from file (DO NOT commit this file!)
fly secrets import < secrets.env -a liveport-dashboard
```

### Via Fly.io Dashboard

1. Go to https://fly.io/apps/liveport-dashboard
2. Click "Secrets" in the sidebar
3. Add/update secrets

## Generating Secrets

### BETTER_AUTH_SECRET

```bash
# Generate a secure 32-byte secret
openssl rand -base64 32
```

### INTERNAL_API_SECRET

```bash
# Generate a secure API secret
openssl rand -hex 32
```

## Secret Rotation

### Rotating BETTER_AUTH_SECRET

**Warning**: This will invalidate all active sessions.

1. Generate new secret: `openssl rand -base64 32`
2. Update in Fly.io: `fly secrets set BETTER_AUTH_SECRET="new-secret" -a liveport-dashboard`
3. Users will need to log in again

### Rotating INTERNAL_API_SECRET

**Important**: Update both services simultaneously.

1. Generate new secret: `openssl rand -hex 32`
2. Update dashboard: `fly secrets set INTERNAL_API_SECRET="new-secret" -a liveport-dashboard`
3. Update tunnel: `fly secrets set INTERNAL_API_SECRET="new-secret" -a liveport-tunnel`

### Rotating Database Credentials

1. Generate new API key in mech-storage dashboard
2. Update secrets:
   ```bash
   fly secrets set MECH_APPS_API_KEY="new-key" -a liveport-dashboard
   fly secrets set MECH_APPS_API_KEY="new-key" -a liveport-tunnel
   ```
3. Revoke old API key in mech-storage dashboard

### Rotating Redis URL

1. Create new Redis instance or get new credentials
2. Update secrets:
   ```bash
   fly secrets set REDIS_URL="redis://..." -a liveport-dashboard
   fly secrets set REDIS_URL="redis://..." -a liveport-tunnel
   ```
3. Monitor for connection errors

## Viewing Secrets

```bash
# List secret names (values are never shown)
fly secrets list -a liveport-dashboard
```

## Security Best Practices

1. **Never commit secrets** to git
2. **Never log secrets** - review code for accidental logging
3. **Use strong secrets** - minimum 32 characters for auth secrets
4. **Rotate regularly** - at least quarterly, immediately if compromised
5. **Limit access** - only admins should manage production secrets
6. **Audit access** - review who has access to Fly.io organization

## Local Development

For local development, copy `.env.example` to `.env.local`:

```bash
cp apps/dashboard/.env.example apps/dashboard/.env.local
```

Edit `.env.local` with development credentials. **Never use production credentials locally.**

## Emergency Procedures

### Suspected Credential Leak

1. **Immediately rotate** all affected secrets
2. Review access logs for unauthorized use
3. Check Sentry for unusual errors
4. Notify team and document incident

### Lost Access to Secrets

1. Contact Fly.io support if locked out
2. Regenerate all secrets from source systems
3. Update all services with new secrets
