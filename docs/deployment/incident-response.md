# LivePort Incident Response Procedures

## Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P1 - Critical | Service completely down | 15 minutes | All tunnels failing, dashboard inaccessible |
| P2 - High | Major feature broken | 1 hour | Cannot create new keys, auth failing |
| P3 - Medium | Degraded performance | 4 hours | Slow response times, intermittent errors |
| P4 - Low | Minor issue | 24 hours | UI bugs, non-critical errors |

## Incident Response Steps

### 1. Acknowledge

- Acknowledge the incident in monitoring system
- Post in #incidents channel: "Investigating [brief description]"
- Start incident timeline document

### 2. Assess

Check these in order:

```bash
# 1. Service status
fly status -a liveport-dashboard
fly status -a liveport-tunnel

# 2. Health endpoints
curl https://app.liveport.dev/api/health?detailed=true
curl https://tunnel.liveport.dev/health

# 3. Recent logs
fly logs -a liveport-dashboard --no-tail | tail -100
fly logs -a liveport-tunnel --no-tail | tail -100

# 4. Recent deployments
fly releases -a liveport-dashboard | head -5
```

### 3. Mitigate

**If caused by recent deployment:**
```bash
fly releases rollback -a liveport-dashboard
```

**If resource exhaustion:**
```bash
fly scale count 3 -a liveport-dashboard
fly scale memory 1024 -a liveport-dashboard
```

**If database issues:**
- Check mech-storage status page
- Contact mech-storage support

**If Redis issues:**
```bash
fly redis status liveport-redis
```

### 4. Communicate

Update stakeholders:

- Post status to #incidents channel every 30 minutes
- Update status page if user-facing
- Send customer communication if extended outage

### 5. Resolve

- Confirm services are healthy
- Verify with health checks
- Monitor for 15 minutes post-resolution

### 6. Post-Mortem

Within 48 hours:

1. Document timeline
2. Identify root cause
3. List action items to prevent recurrence
4. Share learnings with team

## Common Issues and Solutions

### Dashboard Returns 502/503

**Symptoms**: Dashboard requests fail with 502/503 errors

**Diagnosis**:
```bash
fly logs -a liveport-dashboard | grep -i error
fly status -a liveport-dashboard
```

**Solutions**:
1. Check if instances are running: `fly status -a liveport-dashboard`
2. Restart instances: `fly apps restart liveport-dashboard`
3. Check for OOM: Look for "killed" in logs
4. Scale up if needed: `fly scale memory 1024 -a liveport-dashboard`

### Tunnels Not Connecting

**Symptoms**: CLI reports connection failures

**Diagnosis**:
```bash
fly logs -a liveport-tunnel | grep -i error
fly redis status liveport-redis
```

**Solutions**:
1. Check tunnel server is running: `fly status -a liveport-tunnel`
2. Check Redis connectivity
3. Verify WebSocket endpoint is accessible
4. Check for rate limiting

### Authentication Failing

**Symptoms**: Users cannot log in or sessions expire immediately

**Diagnosis**:
```bash
fly logs -a liveport-dashboard | grep -i auth
```

**Solutions**:
1. Check BETTER_AUTH_SECRET is set
2. Check database connectivity
3. Check Redis for session storage
4. Clear browser cookies (if client-side)

### Database Connectivity Issues

**Symptoms**: API requests fail with database errors

**Diagnosis**:
```bash
fly logs -a liveport-dashboard | grep -i database
curl https://app.liveport.dev/api/health?detailed=true
```

**Solutions**:
1. Check mech-storage status
2. Verify MECH_APPS_APP_ID and MECH_APPS_API_KEY are correct
3. Check for rate limiting on database API
4. Contact mech-storage support

### High Error Rate in Sentry

**Symptoms**: Spike in errors in Sentry dashboard

**Diagnosis**:
1. Review error patterns in Sentry
2. Check if correlated with deployment
3. Look for common stack traces

**Solutions**:
1. If deployment-related: rollback
2. If user input related: add validation
3. If third-party: check their status page

### Redis Connection Failures

**Symptoms**: Rate limiting not working, session issues

**Diagnosis**:
```bash
fly redis status liveport-redis
fly logs -a liveport-dashboard | grep -i redis
```

**Solutions**:
1. Check Redis status
2. Verify REDIS_URL is correct
3. Check Redis memory usage
4. Restart Redis if needed: `fly redis restart liveport-redis`

## Escalation Path

1. **On-call engineer**: First responder
2. **Team lead**: If unresolved after 30 minutes
3. **Infrastructure team**: For Fly.io/Redis issues
4. **External support**: For mech-storage, Sentry issues

## Useful Links

- Fly.io Status: https://status.fly.io
- Fly.io Dashboard: https://fly.io/apps
- Sentry Dashboard: https://sentry.io
- mech-storage Status: (internal)
- Runbook: [./runbook.md](./runbook.md)
- Secrets Guide: [./secrets.md](./secrets.md)
