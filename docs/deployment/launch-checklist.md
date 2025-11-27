# LivePort Production Launch Checklist

Use this checklist before launching to production.

## Pre-Launch Verification

### Infrastructure

- [ ] Fly.io apps created (`liveport-dashboard`, `liveport-tunnel`)
- [ ] Redis instance provisioned (`liveport-redis`)
- [ ] mech-storage database configured
- [ ] Custom domains configured
- [ ] SSL certificates active

### Secrets Configuration

- [ ] Dashboard secrets set:
  - [ ] `MECH_APPS_APP_ID`
  - [ ] `MECH_APPS_API_KEY`
  - [ ] `REDIS_URL`
  - [ ] `BETTER_AUTH_SECRET`
  - [ ] `SENTRY_DSN`
  - [ ] `INTERNAL_API_SECRET`

- [ ] Tunnel server secrets set:
  - [ ] `MECH_APPS_APP_ID`
  - [ ] `MECH_APPS_API_KEY`
  - [ ] `REDIS_URL`
  - [ ] `SENTRY_DSN`
  - [ ] `INTERNAL_API_SECRET`
  - [ ] `DASHBOARD_API_URL`

### Database

- [ ] Schema migrations applied (`pnpm migrate`)
- [ ] Migration status verified (`pnpm migrate:status`)
- [ ] Test user can be created

### Monitoring

- [ ] Sentry projects created (dashboard, tunnel)
- [ ] Sentry DSNs configured
- [ ] Test errors appear in Sentry
- [ ] Uptime monitoring configured
- [ ] Alert channels set up

### Security

- [ ] All secrets are production values (not dev/test)
- [ ] BETTER_AUTH_SECRET is unique and secure
- [ ] Rate limiting is enabled
- [ ] Security headers are configured
- [ ] CORS is properly configured

### Deployment Pipeline

- [ ] GitHub Actions workflow passes
- [ ] Auto-deploy on push to main works
- [ ] Rollback procedure tested

## Launch Day

### Deploy

- [ ] Final code review complete
- [ ] All tests passing
- [ ] Deploy to production
- [ ] Verify deployment successful

### Smoke Tests

- [ ] Dashboard loads at production URL
- [ ] Health check returns healthy: `curl https://app.liveport.dev/api/health`
- [ ] User can sign up
- [ ] User can log in
- [ ] User can create bridge key
- [ ] CLI can connect with bridge key
- [ ] Tunnel proxies requests correctly
- [ ] Agent SDK can wait for tunnel

### Post-Launch Monitoring

- [ ] Monitor error rates in Sentry (first hour)
- [ ] Monitor response times
- [ ] Check logs for unexpected errors
- [ ] Verify no sensitive data in logs

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| QA | | | |
| Product | | | |

## Rollback Plan

If critical issues found post-launch:

1. Run rollback: `fly releases rollback -a liveport-dashboard`
2. Notify team in #incidents
3. Document issues found
4. Fix and re-deploy

## Post-Launch Tasks

- [ ] Announce launch (internal)
- [ ] Update documentation if needed
- [ ] Schedule post-launch review meeting
- [ ] Create tracking issues for any known issues
