# PRD: WebSocket Proxying Support

## Document Info
- **Version**: 1.0
- **Created**: 2025-12-29
- **Status**: Draft
- **Author**: PRD Writer Skill
- **Priority**: Critical (P0)

---

## 1. Problem Statement

### The Problem
LivePort currently only supports HTTP request/response proxying. When a client sends a WebSocket upgrade request (with `Connection: Upgrade` and `Upgrade: websocket` headers), the tunnel server **strips these hop-by-hop headers** and forwards a regular HTTP request, causing the upgrade to fail with **400 Bad Request**.

This prevents developers from tunneling WebSocket-based applications through LivePort, including:
- **Playwright `run-server`** - Requires WebSocket connections for remote browser control (blocking Daytona integration)
- Real-time applications (chat, dashboards, multiplayer games)
- Live-reload/HMR development servers
- GraphQL subscriptions over WebSocket
- Socket.io applications

### Current Behavior
```
Public Client                Tunnel Server              CLI Client            Local Server
     |                             |                         |                     |
     |-- HTTP Upgrade Request ---> |                         |                     |
     |   (Upgrade: websocket)      |                         |                     |
     |                             |                         |                     |
     |                             |-- HTTP Request -------> |                     |
     |                             |   (Upgrade header       |-- HTTP Request ---> |
     |                             |    STRIPPED)            |                     |
     |                             |                         |                     |
     |                             |                         | <-- 400 Bad --------|
     |                             | <-- 400 Bad Request --- |     Request         |
     | <-- 400 Bad Request -------- |                         |                     |
```

### Why This Happens
In `apps/tunnel-server/src/http-handler.ts:348-357`, the response header filtering explicitly removes the `Upgrade` header:

```typescript
// Strips hop-by-hop headers including "upgrade"
if (
  ![
    "transfer-encoding",
    "connection",
    "keep-alive",
    "upgrade",         // ❌ Removed! Breaks WebSocket upgrades
    // ...
  ].includes(key.toLowerCase())
) {
  responseHeaders.set(key, value);
}
```

This is correct for standard HTTP proxying (hop-by-hop headers shouldn't be forwarded), but **WebSocket upgrades require special handling**.

### The Opportunity
Adding WebSocket proxying support will:
1. **Unblock Daytona integration** - Enable Playwright browser testing through LivePort tunnels
2. **Achieve feature parity with ngrok** - Become a complete tunneling solution
3. **Expand use cases** - Support the growing ecosystem of WebSocket-based developer tools
4. **Differentiate from competitors** - Most tunnel services support WebSockets; this is table-stakes functionality

---

## 2. Target Users

### Primary User: AI Agent Developer
- Building automated browser testing with Playwright
- Runs Playwright `run-server` in remote sandbox (Daytona)
- Needs to connect to browser over WebSocket through tunnel
- **Currently blocked** - Cannot use LivePort for this workflow

**User Pain Point**: "I tried using LivePort for my Playwright tests, but got 400 errors. I had to use ngrok instead."

### Secondary Users
- **Full-stack developers** building real-time features (chat, notifications)
- **Game developers** building multiplayer games with WebSocket
- **DevOps engineers** tunneling monitoring dashboards with live updates

---

## 3. Product Vision

**One-liner**: LivePort tunnels WebSocket connections just like HTTP requests, with full bidirectional frame proxying.

**Value Proposition**: Run `liveport connect 3000`, and your WebSocket server at `localhost:3000` is accessible at `wss://xyz789.liveport.online` - no configuration, no code changes.

### Core User Flow (Playwright Example)

```
1. Developer creates Daytona sandbox with Playwright
2. Sandbox starts Playwright run-server on port 3000
   → Output: "Listening on ws://0.0.0.0:3000/ws"

3. Developer/agent runs: liveport connect 3000 --key lpk_xxx
   → Output: "✓ Tunnel active at https://xyz789.liveport.online"

4. Agent connects to Playwright:
   await chromium.connect('wss://xyz789.liveport.online/ws')

5. WebSocket upgrade succeeds (101 Switching Protocols)
6. Browser control commands flow bidirectionally over WebSocket
7. Tests run successfully ✅
```

### Architecture Overview

```
Public Client                Tunnel Server              CLI Client            Local Server
     |                             |                         |                     |
     |-- HTTP Upgrade Request ---> |                         |                     |
     |   (Upgrade: websocket)      |                         |                     |
     |                             |                         |                     |
     |                      [Detect WebSocket Upgrade]       |                     |
     |                             |                         |                     |
     |                             |-- WS Upgrade Msg -----> |                     |
     |                             |   (via tunnel WS)       |                     |
     |                             |                         |-- WS Upgrade -----> |
     |                             |                         |                     |
     |                             |                         | <-- 101 Switching --|
     |                             | <-- WS Accept Msg ----- |     Protocols       |
     |                             |                         |                     |
     | <-- 101 Switching ----------|                         |                     |
     |     Protocols               |                         |                     |
     |                             |                         |                     |
     |<=========== WebSocket Frames (bidirectional) ====================>|
     |                             |                         |                     |
```

---

## 4. MVP Scope

### In Scope (Must Have)

#### Tunnel Server Changes
- [ ] **Detect WebSocket upgrade requests** in HTTP handler
  - Check for `Upgrade: websocket` + `Connection: upgrade` headers
  - Intercept before standard HTTP proxying logic

- [ ] **New WebSocket upgrade message type** (`websocket_upgrade`)
  - Send to CLI client with upgrade request details (path, headers)
  - Wait for upgrade response from CLI

- [ ] **WebSocket connection tracking**
  - Track active proxied WebSocket connections separately from tunnels
  - Limit to 100 concurrent WebSocket connections per tunnel
  - Count toward metering (bytes transferred)

- [ ] **Bidirectional frame proxying**
  - Relay text frames (opcode 1)
  - Relay binary frames (opcode 2)
  - Relay control frames (ping/pong/close)
  - Handle fragmented messages (continuation frames)

- [ ] **Frame size limits**
  - Max frame size: 10MB (same as HTTP body limit)
  - Reject larger frames with close code 1009 (Message Too Big)

- [ ] **Connection lifecycle management**
  - Handle close handshake (opcode 8)
  - Clean up on disconnect (tunnel close, client close, timeout)
  - Track bytes transferred for metering

#### Protocol Changes (`packages/shared/src/types.ts`)
- [ ] Add `WebSocketUpgradeMessage` type
- [ ] Add `WebSocketUpgradeResponseMessage` type
- [ ] Add `WebSocketFrameMessage` type
- [ ] Add `WebSocketCloseMessage` type

#### CLI Client Changes (`packages/cli/`)
- [ ] Listen for `websocket_upgrade` messages from tunnel server
- [ ] Establish WebSocket connection to local server
- [ ] Send `websocket_upgrade_response` back to tunnel server
- [ ] Proxy frames bidirectionally between tunnel and local WebSocket
- [ ] Handle disconnects gracefully

#### Connection Manager Changes
- [ ] Add `proxiedWebSockets` map to track WebSocket connections
- [ ] Methods: `registerProxiedWebSocket()`, `unregisterProxiedWebSocket()`
- [ ] Track frame count and bytes transferred per WebSocket
- [ ] Include WebSocket connections in metering

#### Testing & Validation
- [ ] Unit tests for WebSocket upgrade detection
- [ ] Integration test: Tunnel a simple WebSocket echo server
- [ ] Integration test: Connect to Playwright `run-server` through tunnel
- [ ] Load test: 100 concurrent WebSocket connections per tunnel
- [ ] Frame size test: Send 10MB binary frame
- [ ] Disconnect test: Graceful close, abrupt disconnect

### Out of Scope (Post-MVP)

- ❌ WebSocket message inspection/logging (privacy concerns)
- ❌ WebSocket message transformation or filtering
- ❌ Socket.io-specific features (rooms, namespaces, broadcasting)
- ❌ WebSocket subprotocol negotiation (e.g., `graphql-ws`, `soap`)
- ❌ Automatic reconnection on WebSocket disconnect (client responsibility)
- ❌ WebSocket compression (permessage-deflate extension)
- ❌ Custom WebSocket origins/CORS handling

---

## 5. User Stories

### WebSocket Upgrade

**US-1**: As a developer, when I send a WebSocket upgrade request to my tunnel URL, it should succeed with 101 Switching Protocols.
- **Acceptance Criteria**:
  - Request: `GET wss://xyz789.liveport.online/ws`
  - Headers: `Upgrade: websocket`, `Connection: upgrade`
  - Response: `HTTP/1.1 101 Switching Protocols`
  - Connection upgrades to WebSocket

**US-2**: As a CLI client, I receive WebSocket upgrade requests from the tunnel server and forward them to localhost.
- **Acceptance Criteria**:
  - Receive `websocket_upgrade` message with path and headers
  - Establish WebSocket to `ws://localhost:3000{path}`
  - Send `websocket_upgrade_response` with success/failure
  - If local server rejects upgrade, report failure

### Frame Proxying

**US-3**: As a developer, when I send a text frame to my WebSocket tunnel, it arrives at my local server.
- **Acceptance Criteria**:
  - Send: `ws.send("Hello, World!")`
  - Local server receives: `"Hello, World!"`
  - Frame type: text (opcode 1)

**US-4**: As a developer, when my local server sends a binary frame, it arrives at my WebSocket client.
- **Acceptance Criteria**:
  - Local server sends: `ws.send(Buffer.from([0x01, 0x02, 0x03]))`
  - Client receives: `ArrayBuffer([0x01, 0x02, 0x03])`
  - Frame type: binary (opcode 2)

**US-5**: As a developer, ping/pong frames work through the tunnel for keepalive.
- **Acceptance Criteria**:
  - Client sends ping frame
  - Server receives ping
  - Server sends pong frame
  - Client receives pong
  - Connection stays alive

### Connection Limits

**US-6**: As the tunnel server, I reject new WebSocket connections when a tunnel has 100 active connections.
- **Acceptance Criteria**:
  - Tunnel has 100 WebSocket connections
  - 101st connection attempt receives close frame
  - Close code: 1008 (Policy Violation)
  - Close reason: "Maximum WebSocket connections per tunnel (100) exceeded"

**US-7**: As the tunnel server, I reject WebSocket frames larger than 10MB.
- **Acceptance Criteria**:
  - Client sends 11MB binary frame
  - Connection closed with code 1009 (Message Too Big)
  - Error logged to monitoring

### Connection Lifecycle

**US-8**: As a developer, when I close my WebSocket connection, it disconnects from the local server.
- **Acceptance Criteria**:
  - Client sends close frame (opcode 8, code 1000)
  - Local server receives close frame
  - Connection terminates gracefully
  - Bytes transferred tracked in metering

**US-9**: As a developer, when my local server crashes, the public WebSocket connection closes.
- **Acceptance Criteria**:
  - Local server process exits
  - CLI detects local WebSocket disconnect
  - Public connection receives close frame (code 1011, "Server Error")
  - Connection cleaned up

**US-10**: As a developer, when I disconnect my tunnel, all active WebSocket connections close.
- **Acceptance Criteria**:
  - Tunnel has 5 active WebSocket connections
  - Developer runs `liveport disconnect`
  - All 5 WebSocket connections receive close frames
  - Close code: 1001 (Going Away)
  - Close reason: "Tunnel disconnected"

### Playwright Integration

**US-11**: As an AI agent, I can connect to a Playwright run-server through a LivePort tunnel.
- **Acceptance Criteria**:
  - Playwright server: `playwright run-server --port 3000`
  - Tunnel: `liveport connect 3000 --key lpk_xxx`
  - Agent code: `await chromium.connect('wss://xyz789.liveport.online/ws')`
  - Connection succeeds
  - Browser launches remotely
  - Agent can control browser (navigate, click, screenshot)

**US-12**: As an AI agent, I can run Playwright tests against a tunneled browser for 30+ minutes.
- **Acceptance Criteria**:
  - Long-running test suite (30+ minutes)
  - WebSocket connection stays alive
  - Ping/pong frames keep connection active
  - Tests complete successfully
  - No disconnects or timeouts

---

## 6. Technical Requirements

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| WebSocket Detection | Hono middleware | Intercept before HTTP handler |
| Frame Proxying | `ws` library (Node.js) | Already used, proven, lightweight |
| Message Format | JSON over tunnel WS | Consistent with existing protocol |
| Frame Encoding | Base64 for binary data | Safe for JSON serialization |

### Protocol Additions

#### Message Types (add to `packages/shared/src/types.ts`)

```typescript
/**
 * WebSocket upgrade request from tunnel server to CLI
 */
export interface WebSocketUpgradeMessage {
  type: "websocket_upgrade";
  id: string;  // Unique WebSocket connection ID
  timestamp: number;
  payload: {
    path: string;  // e.g., "/ws" or "/"
    headers: Record<string, string>;  // Original upgrade headers
    subprotocol?: string;  // Requested subprotocol (if any)
  };
}

/**
 * WebSocket upgrade response from CLI to tunnel server
 */
export interface WebSocketUpgradeResponseMessage {
  type: "websocket_upgrade_response";
  id: string;  // Matches upgrade request ID
  timestamp: number;
  payload: {
    accepted: boolean;
    statusCode: number;  // 101 for success, 400/403/500 for failure
    headers?: Record<string, string>;  // Response headers (e.g., Sec-WebSocket-Accept)
    reason?: string;  // Error reason if rejected
  };
}

/**
 * WebSocket frame relayed through tunnel
 */
export interface WebSocketFrameMessage {
  type: "websocket_frame";
  id: string;  // WebSocket connection ID
  direction: "client_to_server" | "server_to_client";
  timestamp: number;
  payload: {
    opcode: number;  // 1=text, 2=binary, 8=close, 9=ping, 10=pong
    data: string;    // Base64-encoded for binary, plain for text
    final: boolean;  // FIN bit (true for final fragment)
    closeCode?: number;  // Only for opcode 8 (close)
    closeReason?: string;  // Only for opcode 8 (close)
  };
}

/**
 * WebSocket connection closed
 */
export interface WebSocketCloseMessage {
  type: "websocket_close";
  id: string;  // WebSocket connection ID
  timestamp: number;
  payload: {
    code: number;     // Close code (1000 = normal, 1006 = abnormal, etc.)
    reason: string;   // Close reason
    initiator: "client" | "server" | "tunnel";  // Who initiated close
  };
}
```

### HTTP Handler Logic (Upgrade Detection)

Add before the catch-all `app.all("*", ...)` handler in `http-handler.ts`:

```typescript
// Intercept WebSocket upgrade requests
app.all("*", async (c, next) => {
  const upgrade = c.req.header("upgrade")?.toLowerCase();
  const connection = c.req.header("connection")?.toLowerCase();

  // Detect WebSocket upgrade
  if (upgrade === "websocket" && connection?.includes("upgrade")) {
    return handleWebSocketUpgrade(c, cfg);
  }

  // Not a WebSocket upgrade, proceed to normal HTTP handler
  return next();
});

async function handleWebSocketUpgrade(
  c: Context,
  cfg: HttpHandlerConfig
): Promise<Response> {
  const host = c.req.header("host") || "";
  const subdomain = extractSubdomain(host, cfg.baseDomain);

  if (!subdomain) {
    return c.text("Invalid tunnel URL", 404);
  }

  const connection = connectionManager.findBySubdomain(subdomain);

  if (!connection || connection.state !== "active") {
    return c.text("Tunnel not found or inactive", 502);
  }

  // Check WebSocket connection limit (100 per tunnel)
  const wsCount = connectionManager.getWebSocketCount(subdomain);
  if (wsCount >= 100) {
    return c.text("Maximum WebSocket connections exceeded (100)", 503);
  }

  // Generate unique WebSocket connection ID
  const wsConnId = `${subdomain}:ws:${nanoid(10)}`;

  // Build upgrade request message
  const upgradeMessage: WebSocketUpgradeMessage = {
    type: "websocket_upgrade",
    id: wsConnId,
    timestamp: Date.now(),
    payload: {
      path: new URL(c.req.url).pathname,
      headers: headersToObject(c.req.raw.headers),
      subprotocol: c.req.header("sec-websocket-protocol"),
    },
  };

  // Send to CLI client
  connection.socket.send(JSON.stringify(upgradeMessage));

  // Wait for upgrade response (5 second timeout)
  const upgradeResponse = await connectionManager.waitForWebSocketUpgrade(
    wsConnId,
    5000
  );

  if (!upgradeResponse.accepted) {
    return c.text(
      upgradeResponse.reason || "WebSocket upgrade failed",
      upgradeResponse.statusCode || 500
    );
  }

  // Upgrade succeeded - now we need raw socket access to proxy frames
  // This requires handling at the HTTP server level, not Hono
  // Will be implemented in a custom upgrade handler

  return c.text("WebSocket upgrade handling not fully implemented", 501);
}
```

**Note**: Full WebSocket proxying requires raw TCP socket access, which Hono doesn't expose. We'll need to handle WebSocket upgrades at the Node.js HTTP server level using the `upgrade` event.

### Connection Manager Changes

Add to `connection-manager.ts`:

```typescript
export interface ProxiedWebSocket {
  id: string;
  subdomain: string;
  publicSocket: WebSocket;  // Client-facing WebSocket
  createdAt: Date;
  frameCount: number;
  bytesTransferred: number;
}

export class ConnectionManager {
  // Existing fields...
  private proxiedWebSockets = new Map<string, ProxiedWebSocket>();
  private wsUpgradePending = new Map<string, {
    resolve: (response: WebSocketUpgradeResponseMessage) => void;
    reject: (error: Error) => void;
  }>();

  /**
   * Register a new proxied WebSocket connection
   */
  registerProxiedWebSocket(
    id: string,
    subdomain: string,
    publicSocket: WebSocket
  ): void {
    this.proxiedWebSockets.set(id, {
      id,
      subdomain,
      publicSocket,
      createdAt: new Date(),
      frameCount: 0,
      bytesTransferred: 0,
    });

    logger.info({ id, subdomain }, "WebSocket connection registered");
  }

  /**
   * Unregister a proxied WebSocket connection
   */
  unregisterProxiedWebSocket(id: string): void {
    const ws = this.proxiedWebSockets.get(id);
    if (ws) {
      this.proxiedWebSockets.delete(id);
      logger.info(
        {
          id,
          subdomain: ws.subdomain,
          frames: ws.frameCount,
          bytes: ws.bytesTransferred
        },
        "WebSocket connection unregistered"
      );
    }
  }

  /**
   * Track a proxied WebSocket frame
   */
  trackWebSocketFrame(id: string, bytes: number): void {
    const ws = this.proxiedWebSockets.get(id);
    if (ws) {
      ws.frameCount++;
      ws.bytesTransferred += bytes;

      // Also add to tunnel's bytes transferred
      this.addBytesTransferred(ws.subdomain, bytes);
    }
  }

  /**
   * Get count of WebSocket connections for a subdomain
   */
  getWebSocketCount(subdomain: string): number {
    let count = 0;
    for (const ws of this.proxiedWebSockets.values()) {
      if (ws.subdomain === subdomain) {
        count++;
      }
    }
    return count;
  }

  /**
   * Wait for WebSocket upgrade response from CLI
   */
  waitForWebSocketUpgrade(
    id: string,
    timeoutMs: number
  ): Promise<WebSocketUpgradeResponseMessage> {
    return new Promise((resolve, reject) => {
      this.wsUpgradePending.set(id, { resolve, reject });

      setTimeout(() => {
        if (this.wsUpgradePending.has(id)) {
          this.wsUpgradePending.delete(id);
          reject(new Error("WebSocket upgrade timeout"));
        }
      }, timeoutMs);
    });
  }

  /**
   * Resolve a pending WebSocket upgrade
   */
  resolveWebSocketUpgrade(
    id: string,
    response: WebSocketUpgradeResponseMessage
  ): void {
    const pending = this.wsUpgradePending.get(id);
    if (pending) {
      this.wsUpgradePending.delete(id);
      pending.resolve(response);
    }
  }

  /**
   * Close all WebSocket connections for a subdomain
   */
  closeAllWebSockets(subdomain: string, code: number, reason: string): void {
    for (const [id, ws] of this.proxiedWebSockets.entries()) {
      if (ws.subdomain === subdomain) {
        ws.publicSocket.close(code, reason);
        this.unregisterProxiedWebSocket(id);
      }
    }
  }
}
```

### CLI Client Changes

Add WebSocket upgrade handling to CLI client:

```typescript
// Listen for websocket_upgrade messages
tunnelSocket.on("message", async (data) => {
  const message = JSON.parse(data.toString()) as BaseMessage;

  if (message.type === "websocket_upgrade") {
    const upgrade = message as WebSocketUpgradeMessage;
    await handleWebSocketUpgrade(upgrade, tunnelSocket, localPort);
  }

  // ... existing message handlers
});

async function handleWebSocketUpgrade(
  upgrade: WebSocketUpgradeMessage,
  tunnelSocket: WebSocket,
  localPort: number
): Promise<void> {
  const { id, payload } = upgrade;
  const { path, headers } = payload;

  try {
    // Connect to local WebSocket server
    const localWsUrl = `ws://localhost:${localPort}${path}`;
    const localWs = new WebSocket(localWsUrl, {
      headers: {
        ...headers,
        host: `localhost:${localPort}`,
      },
    });

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      localWs.once("open", () => resolve());
      localWs.once("error", (err) => reject(err));
    });

    // Send success response to tunnel server
    const response: WebSocketUpgradeResponseMessage = {
      type: "websocket_upgrade_response",
      id,
      timestamp: Date.now(),
      payload: {
        accepted: true,
        statusCode: 101,
        headers: {
          "sec-websocket-accept": headers["sec-websocket-key"],  // Calculate proper value
        },
      },
    };
    tunnelSocket.send(JSON.stringify(response));

    // Proxy frames bidirectionally
    localWs.on("message", (data, isBinary) => {
      const frame: WebSocketFrameMessage = {
        type: "websocket_frame",
        id,
        direction: "server_to_client",
        timestamp: Date.now(),
        payload: {
          opcode: isBinary ? 2 : 1,
          data: isBinary ? Buffer.from(data).toString("base64") : data.toString(),
          final: true,
        },
      };
      tunnelSocket.send(JSON.stringify(frame));
    });

    localWs.on("close", (code, reason) => {
      const closeMsg: WebSocketCloseMessage = {
        type: "websocket_close",
        id,
        timestamp: Date.now(),
        payload: {
          code,
          reason: reason.toString(),
          initiator: "server",
        },
      };
      tunnelSocket.send(JSON.stringify(closeMsg));
    });

  } catch (error) {
    // Send failure response
    const response: WebSocketUpgradeResponseMessage = {
      type: "websocket_upgrade_response",
      id,
      timestamp: Date.now(),
      payload: {
        accepted: false,
        statusCode: 502,
        reason: `Failed to connect to local WebSocket server: ${error.message}`,
      },
    };
    tunnelSocket.send(JSON.stringify(response));
  }
}
```

### Security Considerations

1. **Frame Size Limits**
   - Max 10MB per frame (same as HTTP body limit)
   - Prevents memory exhaustion attacks
   - Close code 1009 (Message Too Big) for oversized frames

2. **Connection Limits**
   - Max 100 concurrent WebSocket connections per tunnel
   - Prevents resource exhaustion
   - Returns 503 Service Unavailable when limit exceeded

3. **Upgrade Validation**
   - Validate `Sec-WebSocket-Key` header
   - Compute correct `Sec-WebSocket-Accept` response
   - Reject malformed upgrade requests

4. **Subprotocol Handling**
   - Pass through `Sec-WebSocket-Protocol` header
   - Let local server negotiate subprotocol
   - Don't intercept or validate subprotocol choice

5. **Metering**
   - Track bytes transferred (same as HTTP)
   - Count WebSocket frames separately for analytics
   - Include in usage limits and billing

---

## 7. Success Metrics

### MVP Launch Goals

| Metric | Target | Measurement |
|--------|--------|-------------|
| Playwright integration works | 100% | Manual test: connect to `run-server` |
| WebSocket upgrade success rate | >99% | Tunnel server logs |
| Frame delivery success rate | >99.9% | Frame tracking metrics |
| Max concurrent connections supported | 100 per tunnel | Load testing |
| Frame latency overhead | <10ms | Performance testing |

### Validation Tests

1. **Playwright Test** (Critical Path)
   ```bash
   # Terminal 1: Start Playwright server
   playwright run-server --port 3000

   # Terminal 2: Start tunnel
   liveport connect 3000 --key lpk_xxx

   # Terminal 3: Connect agent
   const browser = await chromium.connect('wss://xyz789.liveport.online/ws');
   await browser.newPage();
   # Success! ✅
   ```

2. **Echo Server Test**
   - Start WebSocket echo server on localhost:3000
   - Tunnel: `liveport connect 3000`
   - Client: Send 1000 messages, verify all echo back
   - Success: 100% message delivery

3. **Load Test**
   - Open 100 concurrent WebSocket connections
   - Send 10 messages/second on each connection
   - Run for 5 minutes
   - Success: No disconnects, all messages delivered

4. **Frame Size Test**
   - Send 10MB binary frame
   - Verify frame arrives intact
   - Send 11MB frame
   - Verify connection closes with code 1009

5. **Disconnect Test**
   - Establish WebSocket connection
   - Close tunnel
   - Verify public connection closes with code 1001

---

## 8. Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Frame proxying adds latency | Medium | High | Optimize encoding, use binary frames, benchmark |
| Memory usage spikes with many connections | High | Medium | Limit to 100 connections per tunnel, stream frames |
| WebSocket library bugs | High | Low | Use battle-tested `ws` library, comprehensive tests |
| Race conditions in upgrade handling | High | Medium | Careful state management, timeout handling |
| Breaking existing HTTP tunneling | Critical | Low | Intercept upgrades BEFORE HTTP handler, thorough regression testing |
| Hono doesn't expose raw sockets | High | High | Handle upgrades at Node.js HTTP server level using `upgrade` event |

---

## 9. Open Questions

### 1. WebSocket Compression
**Question**: Should we support permessage-deflate compression extension?
- **Recommendation**: No (MVP), yes (post-MVP). Adds complexity, most modern apps handle compression at application layer.

### 2. Subprotocol Negotiation
**Question**: Should we validate or restrict WebSocket subprotocols?
- **Recommendation**: No. Pass through transparently, let local server decide.

### 3. Frame Batching
**Question**: Should we batch multiple small frames into one tunnel message?
- **Recommendation**: No (MVP). Adds latency, complicates logic. Optimize if needed post-launch.

### 4. Connection Time Metering
**Question**: Should we charge for connection time (like AWS API Gateway)?
- **Recommendation**: No. Stay consistent with current metering (bytes transferred). Revisit in pricing iteration.

### 5. WebSocket Pings
**Question**: Should tunnel server inject ping frames for keepalive?
- **Recommendation**: No. Let client and server handle their own keepalive. Tunnel is transparent.

---

## 10. Implementation Plan

### Phase 1: Protocol & Types (Week 1, Day 1-2)
- [ ] Add WebSocket message types to `packages/shared/src/types.ts`
- [ ] Update `BaseMessage` discriminated union
- [ ] Add TypeScript tests for new message types
- [ ] Update protocol documentation

**Deliverable**: Protocol defined, types compile

### Phase 2: Connection Manager (Week 1, Day 3-4)
- [ ] Add `proxiedWebSockets` Map to ConnectionManager
- [ ] Implement `registerProxiedWebSocket()`, `unregisterProxiedWebSocket()`
- [ ] Implement `trackWebSocketFrame()` for metering
- [ ] Implement `getWebSocketCount()` for connection limits
- [ ] Implement `waitForWebSocketUpgrade()` promise management
- [ ] Add unit tests for all new methods

**Deliverable**: Connection tracking ready, tested

### Phase 3: HTTP Handler - Upgrade Detection (Week 1, Day 5)
- [ ] Add WebSocket upgrade detection middleware to `http-handler.ts`
- [ ] Implement `handleWebSocketUpgrade()` function
- [ ] Send `websocket_upgrade` message to CLI
- [ ] Wait for `websocket_upgrade_response`
- [ ] Return 101 or error status
- [ ] Add unit tests for upgrade detection

**Deliverable**: Upgrade requests detected and forwarded

### Phase 4: Node.js HTTP Server - Raw Socket Handling (Week 2, Day 1-3)
- [ ] Modify `apps/tunnel-server/src/index.ts` HTTP server creation
- [ ] Listen for `upgrade` event on HTTP server
- [ ] Perform WebSocket handshake on public-facing socket
- [ ] Store public WebSocket in ConnectionManager
- [ ] Relay frames from CLI to public WebSocket
- [ ] Handle close events

**Deliverable**: Public WebSocket connections established

### Phase 5: CLI Client - Local WebSocket Proxying (Week 2, Day 4-5)
- [ ] Listen for `websocket_upgrade` messages in CLI
- [ ] Connect to local WebSocket server (`ws://localhost:PORT/path`)
- [ ] Send `websocket_upgrade_response` (success/failure)
- [ ] Relay frames from local WebSocket to tunnel
- [ ] Relay frames from tunnel to local WebSocket
- [ ] Handle disconnects (local close, tunnel close)

**Deliverable**: Bidirectional frame proxying works

### Phase 6: Frame Handling & Limits (Week 3, Day 1-2)
- [ ] Implement frame size check (10MB limit)
- [ ] Implement connection limit check (100 per tunnel)
- [ ] Handle fragmented messages (continuation frames)
- [ ] Handle control frames (ping, pong, close)
- [ ] Track bytes transferred for metering
- [ ] Add comprehensive frame handling tests

**Deliverable**: All frame types handled, limits enforced

### Phase 7: Integration Testing (Week 3, Day 3-4)
- [ ] Test 1: WebSocket echo server
- [ ] Test 2: Playwright run-server connection
- [ ] Test 3: 100 concurrent connections
- [ ] Test 4: 10MB frame size test
- [ ] Test 5: Graceful disconnect scenarios
- [ ] Fix bugs found in testing

**Deliverable**: All integration tests pass

### Phase 8: Documentation & Launch (Week 3, Day 5)
- [ ] Update README with WebSocket support
- [ ] Add WebSocket examples to documentation
- [ ] Update dashboard to show WebSocket connection count
- [ ] Add monitoring/logging for WebSocket metrics
- [ ] Announce feature to users

**Deliverable**: Feature launched, documented

---

## 11. Testing Strategy

### Unit Tests

```typescript
// Connection Manager
describe("ConnectionManager WebSocket", () => {
  test("registers proxied WebSocket", () => {
    const manager = new ConnectionManager();
    const ws = new WebSocket("ws://test");
    manager.registerProxiedWebSocket("id1", "subdomain1", ws);
    expect(manager.getWebSocketCount("subdomain1")).toBe(1);
  });

  test("enforces 100 connection limit", () => {
    const manager = new ConnectionManager();
    for (let i = 0; i < 100; i++) {
      manager.registerProxiedWebSocket(`id${i}`, "sub1", new WebSocket("ws://test"));
    }
    expect(manager.getWebSocketCount("sub1")).toBe(100);
    // 101st connection should be rejected by handler
  });

  test("tracks bytes transferred", () => {
    const manager = new ConnectionManager();
    manager.registerProxiedWebSocket("id1", "sub1", ws);
    manager.trackWebSocketFrame("id1", 1024);
    manager.trackWebSocketFrame("id1", 2048);
    const ws = manager.proxiedWebSockets.get("id1");
    expect(ws.bytesTransferred).toBe(3072);
  });
});

// HTTP Handler
describe("HTTP Handler WebSocket Upgrade", () => {
  test("detects WebSocket upgrade request", () => {
    const req = {
      headers: {
        "upgrade": "websocket",
        "connection": "upgrade",
      },
    };
    expect(isWebSocketUpgrade(req)).toBe(true);
  });

  test("ignores regular HTTP requests", () => {
    const req = {
      headers: {
        "connection": "keep-alive",
      },
    };
    expect(isWebSocketUpgrade(req)).toBe(false);
  });
});
```

### Integration Tests

```typescript
// Echo Server Test
describe("WebSocket Echo Test", () => {
  test("proxies messages bidirectionally", async () => {
    // Start local echo server on port 3000
    const echoServer = new WebSocket.Server({ port: 3000 });
    echoServer.on("connection", (ws) => {
      ws.on("message", (msg) => ws.send(msg));
    });

    // Start tunnel
    const tunnel = await startTunnel(3000, bridgeKey);

    // Connect public client
    const client = new WebSocket(tunnel.url.replace("https", "wss"));
    await new Promise(resolve => client.once("open", resolve));

    // Send message
    client.send("Hello, Echo!");
    const response = await new Promise(resolve => {
      client.once("message", resolve);
    });

    expect(response.toString()).toBe("Hello, Echo!");

    // Cleanup
    client.close();
    tunnel.disconnect();
    echoServer.close();
  });
});

// Playwright Test
describe("Playwright Integration", () => {
  test("connects to run-server through tunnel", async () => {
    // Start Playwright run-server
    const playwrightProc = spawn("playwright", ["run-server", "--port", "3000"]);
    await waitForPlaywrightReady(playwrightProc);

    // Start tunnel
    const tunnel = await startTunnel(3000, bridgeKey);

    // Connect Playwright client
    const wsUrl = tunnel.url.replace("https", "wss") + "/ws";
    const browser = await chromium.connect(wsUrl);

    // Verify connection works
    const page = await browser.newPage();
    await page.goto("https://example.com");
    const title = await page.title();
    expect(title).toBe("Example Domain");

    // Cleanup
    await browser.close();
    tunnel.disconnect();
    playwrightProc.kill();
  });
});
```

---

## 12. Alternatives Considered

### Alternative 1: Don't Support WebSocket, Use ngrok
**Pros**: No development needed, ngrok already works
**Cons**: Defeats purpose of LivePort, user frustration, missing table-stakes feature
**Decision**: ❌ Rejected - WebSocket support is critical for product viability

### Alternative 2: HTTP Tunneling Only, Document Workaround
**Pros**: Simpler, less code
**Cons**: Poor user experience, doesn't solve Playwright use case
**Decision**: ❌ Rejected - Doesn't meet user needs

### Alternative 3: Proxy Only HTTP/1.1 Upgrade, Client Handles WebSocket
**Pros**: Simpler tunnel server implementation
**Cons**: Requires special client setup, doesn't work for standard WebSocket clients
**Decision**: ❌ Rejected - Not transparent, breaks standard clients

### Alternative 4: Full Bidirectional Frame Proxying (Chosen)
**Pros**: Transparent to client and server, standard WebSocket protocol, works with any client
**Cons**: More complex implementation, requires frame relaying
**Decision**: ✅ Chosen - Best user experience, achieves feature parity

---

## Appendix A: WebSocket Close Codes

Reference for close codes used in implementation:

| Code | Name | Meaning | Usage |
|------|------|---------|-------|
| 1000 | Normal Closure | Normal close | Client/server closes cleanly |
| 1001 | Going Away | Endpoint going away | Tunnel disconnecting |
| 1006 | Abnormal Closure | No close frame received | TCP connection lost |
| 1008 | Policy Violation | Policy violated | Connection limit exceeded |
| 1009 | Message Too Big | Message too large | Frame exceeds 10MB |
| 1011 | Server Error | Server error | Local WebSocket server crashed |

---

## Appendix B: Competitive Comparison

| Feature | LivePort (Post-PR) | ngrok | LocalTunnel | Cloudflare Tunnel |
|---------|-------------------|-------|-------------|-------------------|
| WebSocket Support | ✅ | ✅ | ✅ | ✅ |
| Frame Size Limit | 10MB | Unlimited | Unlimited | 100MB |
| Connection Limit | 100/tunnel | Unlimited (paid) | No limit | No limit |
| Transparent Proxying | ✅ | ✅ | ✅ | ✅ |
| Metering | Bytes transferred | Bandwidth cap | None | None |
| Agent SDK | ✅ | ❌ | ❌ | ❌ |

---

## Appendix C: Frame Encoding Examples

### Text Frame
```json
{
  "type": "websocket_frame",
  "id": "abc-ws-123",
  "direction": "client_to_server",
  "timestamp": 1703894400000,
  "payload": {
    "opcode": 1,
    "data": "Hello, World!",
    "final": true
  }
}
```

### Binary Frame
```json
{
  "type": "websocket_frame",
  "id": "abc-ws-123",
  "direction": "server_to_client",
  "timestamp": 1703894400000,
  "payload": {
    "opcode": 2,
    "data": "AQIDBA==",  // Base64: [0x01, 0x02, 0x03, 0x04]
    "final": true
  }
}
```

### Close Frame
```json
{
  "type": "websocket_frame",
  "id": "abc-ws-123",
  "direction": "client_to_server",
  "timestamp": 1703894400000,
  "payload": {
    "opcode": 8,
    "data": "",
    "final": true,
    "closeCode": 1000,
    "closeReason": "Normal closure"
  }
}
```

---

*End of PRD*
