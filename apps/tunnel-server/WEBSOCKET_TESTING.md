# WebSocket Testing Guide

This guide shows you how to verify that the WebSocket server is working correctly.

## Overview

The tunnel server has **two types** of WebSocket connections:

1. **CLI Tunnel Connections** (`/connect` endpoint)
   - Used by CLI clients to establish tunnels
   - Requires bridge key authentication
   - Path: `ws://localhost:8080/connect`

2. **Public WebSocket Upgrades** (HTTP upgrade event)
   - Used by public clients to establish WebSocket connections through tunnels
   - Requires an active tunnel
   - Path: `ws://subdomain.localhost:8080` (or `ws://subdomain.liveport.online`)

---

## Quick Tests

### Method 1: Quick Shell Script (Fastest)

```bash
# Make sure server is running in another terminal:
# pnpm dev

# Run quick test
./test-ws-quick.sh
```

**What it checks**:
- ✅ Port 8080 is listening
- ✅ HTTP server is responding
- ✅ WebSocket endpoint accepts connections (if wscat installed)

---

### Method 2: Comprehensive TypeScript Test

```bash
# Make sure server is running in another terminal:
# pnpm dev

# Run comprehensive tests
npx tsx test-websocket-manual.ts
```

**What it tests**:
- ✅ HTTP server health endpoint
- ✅ CLI tunnel connection (`/connect`)
- ✅ Public WebSocket upgrade handling
- ✅ Error handling (invalid keys, missing tunnels)

---

### Method 3: Manual Testing with CLI Tools

#### Check if port is listening

```bash
# Check if port 8080 is open
lsof -i :8080 | grep LISTEN

# Or use netstat
netstat -an | grep 8080 | grep LISTEN
```

**Expected output**:
```
node    12345 user   21u  IPv4 0x1234567890  0t0  TCP *:8080 (LISTEN)
```

#### Test with curl (HTTP endpoint)

```bash
# Test HTTP health endpoint
curl http://localhost:8080/_health

# Expected response:
# {"status":"ok","uptime":123,"connections":0}
```

#### Test with wscat (WebSocket)

Install wscat if you don't have it:
```bash
npm install -g wscat
```

Test CLI tunnel connection:
```bash
# This should connect and then get rejected (invalid key)
wscat -c ws://localhost:8080/connect \
  -H "X-Bridge-Key: test-invalid" \
  -H "X-Local-Port: 3000"

# Expected: Error message about invalid key
```

Test public WebSocket upgrade:
```bash
# This should be rejected (no active tunnel)
wscat -c ws://test-subdomain.localhost:8080

# Expected: Connection closed (no tunnel exists)
```

---

### Method 4: Using Existing Integration Tests

The integration tests already verify WebSocket functionality:

```bash
# Run all tests (includes WebSocket tests)
pnpm test

# Run only WebSocket tests
pnpm vitest run src/http-handler.websocket.test.ts
pnpm vitest run src/websocket-proxy.test.ts
```

**Tests included**:
- 14 unit tests for WebSocket proxy
- 9 integration tests for end-to-end flows
- All test actual WebSocket protocol upgrades

---

## Detailed Manual Testing

### Test 1: Start the Server

```bash
# Terminal 1: Start the tunnel server
cd apps/tunnel-server
pnpm dev

# Expected output:
# =====================
# LivePort Tunnel Server
# =====================
# Port: 8080
# HTTP server listening on http://0.0.0.0:8080
# WebSocket server listening on ws://0.0.0.0:8080/connect
```

### Test 2: Verify Port is Open

```bash
# Terminal 2: Check port
lsof -i :8080
```

**Expected output**:
```
COMMAND   PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    12345   user   21u  IPv4 0x1234567890      0t0  TCP *:8080 (LISTEN)
```

If you see this, the server is listening on port 8080! ✅

### Test 3: Test HTTP Endpoint

```bash
# Test health endpoint
curl -v http://localhost:8080/_health
```

**Expected response**:
```
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok","uptime":123,"connections":0}
```

### Test 4: Test WebSocket Connection (with valid key)

To test with a valid key, you need to create a bridge key first:

```bash
# In the dashboard or using the API, create a bridge key
# Then use it to connect:

wscat -c ws://localhost:8080/connect \
  -H "X-Bridge-Key: YOUR_VALID_KEY_HERE" \
  -H "X-Local-Port: 3000"
```

**Expected response (if key is valid)**:
```json
{
  "type": "connected",
  "timestamp": 1234567890,
  "payload": {
    "tunnelId": "uuid-here",
    "subdomain": "random-animal-name",
    "url": "https://random-animal-name.liveport.online",
    "expiresAt": "2025-12-30T00:00:00Z"
  }
}
```

### Test 5: Test Public WebSocket Upgrade

Once you have an active tunnel:

```bash
# Connect to the public WebSocket endpoint
wscat -c ws://YOUR_SUBDOMAIN.localhost:8080

# This will establish a WebSocket connection through the tunnel
```

---

## Troubleshooting

### Port 8080 already in use

```bash
# Find what's using port 8080
lsof -i :8080

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=8081 pnpm dev
```

### Connection refused

```bash
# Make sure server is running
pnpm dev

# Check if port is listening
lsof -i :8080 | grep LISTEN
```

### WebSocket upgrade fails

Check that:
1. HTTP server is running (`curl http://localhost:8080/_health`)
2. Port 8080 is listening (`lsof -i :8080`)
3. No firewall blocking connections
4. Using correct headers (for CLI connections)

---

## Testing Checklist

Use this checklist to verify WebSocket functionality:

- [ ] **Port Check**: `lsof -i :8080` shows LISTEN
- [ ] **HTTP Health**: `curl http://localhost:8080/_health` returns 200
- [ ] **CLI Connection**: `/connect` endpoint accepts connections
- [ ] **Invalid Key Rejection**: Server rejects invalid bridge keys
- [ ] **Public Upgrade**: Upgrade event handles WebSocket requests
- [ ] **Integration Tests**: All 99 tests passing (`pnpm test`)

---

## Production Testing

For production deployments:

```bash
# Set production URL
export SERVER_URL=tunnel.liveport.online

# Run comprehensive test
npx tsx test-websocket-manual.ts

# Or quick test
./test-ws-quick.sh
```

---

## Next Steps

After verifying WebSocket functionality:

1. ✅ Port 8080 is listening
2. ✅ WebSocket connections work
3. ✅ Integration tests pass
4. 📝 Deploy to staging
5. 📝 Run production smoke tests
6. 📝 Monitor WebSocket connection metrics

---

## Resources

- [WebSocket Protocol (RFC 6455)](https://tools.ietf.org/html/rfc6455)
- [ws library docs](https://github.com/websockets/ws)
- [wscat CLI tool](https://github.com/websockets/wscat)
- [Node.js HTTP Upgrade Events](https://nodejs.org/api/http.html#event-upgrade)

---

**Generated**: 2025-12-29
**For**: Task 4.0 - WebSocket Upgrade Handling
