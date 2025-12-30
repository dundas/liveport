# Task List: WebSocket Proxying Support

**PRD**: `tasks/004-prd-websocket-proxying.md`
**Priority**: Critical (P0) - Blocking Daytona/Playwright integration
**Target**: Junior Developer

---

## Git Workflow & Commit Strategy

### When to Commit
- **After each completed sub-task** - Small, focused commits
- **When tests pass** - Ensure `pnpm test` passes before committing
- **Before switching contexts** - Commit work in progress with clear WIP prefix

### Commit Message Format
```
<type>(<scope>): <description>

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types**: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`
**Scopes**: `websocket`, `types`, `connection-manager`, `http-handler`, `cli`, `tests`

**Examples**:
- `feat(types): add WebSocket message types`
- `feat(connection-manager): add WebSocket connection tracking`
- `test(websocket): add upgrade detection tests`
- `refactor(http-handler): extract WebSocket upgrade logic`

### When to Create PRs

Create **one PR per major task group** (not per sub-task):

1. **PR #1**: After completing Tasks 1.0 + 2.0
   - Title: `feat(websocket): add protocol types and connection tracking`
   - Includes: Message types + ConnectionManager updates
   - Commits: ~15-18 commits (one per sub-task)

2. **PR #2**: After completing Task 3.0
   - Title: `feat(http-handler): add WebSocket upgrade detection`
   - Includes: Upgrade detection middleware + tests
   - Commits: ~5-6 commits

3. **PR #3**: After completing Task 4.0
   - Title: `feat(tunnel-server): implement WebSocket upgrade handling`
   - Includes: Raw socket upgrade + frame relay
   - Commits: ~11-12 commits

4. **PR #4**: After completing Task 5.0
   - Title: `feat(cli): add WebSocket proxying support`
   - Includes: CLI WebSocket handler + tests
   - Commits: ~10-11 commits

5. **PR #5**: After completing Task 6.0
   - Title: `feat(websocket): add frame validation and resource limits`
   - Includes: Size limits, connection limits, control frames
   - Commits: ~9-10 commits

6. **PR #6**: After completing Task 7.0
   - Title: `test(websocket): add integration tests`
   - Includes: All integration tests
   - Commits: ~7-8 commits

7. **PR #7**: After completing Task 8.0
   - Title: `docs(websocket): add documentation and deploy`
   - Includes: Docs, examples, dashboard updates
   - Commits: ~12-13 commits

### PR Guidelines
- **Keep PRs focused** - One logical feature per PR
- **All tests must pass** - CI should be green
- **Include test coverage** - Unit + integration tests
- **Self-review first** - Check diff before requesting review
- **Link to PRD** - Reference `tasks/004-prd-websocket-proxying.md` in description

---

## Agent Assignments

Each task specifies which Claude Code agent should implement it:

**`tdd-developer`** (Tasks 1.0-7.0)
- Implements features using red→green→refactor TDD workflow
- Writes tests first, then implementation
- Makes small, reviewable commits
- Best for: Protocol types, ConnectionManager, HTTP handler, CLI, frame handling, integration tests

**`general-purpose`** (Task 8.0)
- Handles multi-step tasks requiring coordination
- Documentation, examples, dashboard updates
- Deployment orchestration and monitoring
- Best for: Documentation and deployment tasks

---

## Relevant Files

### To Create
- `apps/tunnel-server/src/websocket-proxy.ts` - WebSocket frame relay and connection management
- `apps/tunnel-server/src/websocket-proxy.test.ts` - Unit tests for WebSocket proxying
- `packages/cli/src/websocket-handler.ts` - CLI WebSocket client handler (new CLI package)
- `packages/cli/src/websocket-handler.test.ts` - CLI WebSocket handler tests
- `apps/tunnel-server/src/http-handler.websocket.test.ts` - Integration tests for WebSocket upgrade

### To Modify
- `apps/tunnel-server/src/types.ts` - Add WebSocket message types
- `apps/tunnel-server/src/connection-manager.ts` - Add WebSocket connection tracking
- `apps/tunnel-server/src/connection-manager.test.ts` - Add WebSocket tracking tests
- `apps/tunnel-server/src/http-handler.ts` - Add WebSocket upgrade detection
- `apps/tunnel-server/src/http-handler.test.ts` - Add upgrade detection tests
- `apps/tunnel-server/src/index.ts` - Add HTTP `upgrade` event handler
- `apps/tunnel-server/src/websocket-handler.ts` - Handle new WebSocket message types
- `packages/shared/src/types/index.ts` - Export WebSocket types (if needed for shared code)

### Test Infrastructure
- Unit tests co-located with source files (`.test.ts` pattern)
- Integration tests in `apps/tunnel-server/src/` directory
- Test runner: Vitest (per existing pattern in codebase)

---

## Tasks

### 1.0 Protocol & Message Types ✅
Add WebSocket-specific message types to `apps/tunnel-server/src/types.ts` for upgrade requests, responses, frames, and close events.

**Agent**: `tdd-developer` - Test-first implementation of TypeScript types with comprehensive type tests

- [x] **1.1** Add `WebSocketUpgradeMessage` type
  - Fields: `type`, `id`, `timestamp`, `payload` (path, headers, subprotocol)
  - Add to `MessageType` union: `"websocket_upgrade"`
  - Add to discriminated union `Message` type

- [x] **1.2** Add `WebSocketUpgradeResponseMessage` type
  - Fields: `type`, `id`, `timestamp`, `payload` (accepted, statusCode, headers, reason)
  - Add to `MessageType` union: `"websocket_upgrade_response"`
  - Add to discriminated union `Message` type

- [x] **1.3** Add `WebSocketFrameMessage` type
  - Fields: `type`, `id`, `direction`, `timestamp`, `payload` (opcode, data, final, closeCode, closeReason)
  - Add to `MessageType` union: `"websocket_frame"`
  - Add to discriminated union `Message` type
  - Document opcodes: 1=text, 2=binary, 8=close, 9=ping, 10=pong

- [x] **1.4** Add `WebSocketCloseMessage` type
  - Fields: `type`, `id`, `timestamp`, `payload` (code, reason, initiator)
  - Add to `MessageType` union: `"websocket_close"`
  - Add to discriminated union `Message` type

- [x] **1.5** Add WebSocket close codes to `CloseCodes` constant
  - Add `MESSAGE_TOO_BIG: 1009`
  - Add `POLICY_VIOLATION: 1008`
  - Document usage in comments

- [x] **1.6** Write unit tests for new message types
  - File: `apps/tunnel-server/src/types.test.ts` (create if doesn't exist)
  - Test: Type inference works correctly
  - Test: Discriminated union narrows types based on `type` field
  - Test: All required fields are present

**Dependencies**: None
**Testing**: Unit tests for type correctness (13 tests passing)
**Commit**: ✅ `a418b98` - `feat(types): add WebSocket message types`

---

### 2.0 Connection Manager Updates ✅
Extend `apps/tunnel-server/src/connection-manager.ts` to track proxied WebSocket connections separately from HTTP tunnels.

**Agent**: `tdd-developer` - Test-first implementation with mocked WebSocket instances

- [x] **2.1** Add `ProxiedWebSocket` interface to types
  - Fields: `id`, `subdomain`, `publicSocket`, `createdAt`, `frameCount`, `bytesTransferred`
  - Import `WebSocket` from `ws` library

- [x] **2.2** Add `proxiedWebSockets` Map to ConnectionManager class
  - Type: `Map<string, ProxiedWebSocket>`
  - Initialize in constructor

- [x] **2.3** Add `wsUpgradePending` Map to ConnectionManager class
  - Type: `Map<string, { resolve, reject }>`
  - Used for waiting on CLI upgrade responses
  - Initialize in constructor

- [x] **2.4** Implement `registerProxiedWebSocket(id, subdomain, publicSocket)`
  - Add entry to `proxiedWebSockets` Map
  - Log registration with `logger.info`
  - Return void

- [x] **2.5** Implement `unregisterProxiedWebSocket(id)`
  - Remove entry from `proxiedWebSockets` Map
  - Log unregistration with frame count and bytes
  - Return void

- [x] **2.6** Implement `trackWebSocketFrame(id, bytes)`
  - Increment `frameCount` for WebSocket
  - Add `bytes` to `bytesTransferred` for WebSocket
  - Also call `addBytesTransferred(subdomain, bytes)` for tunnel metering
  - Return void

- [x] **2.7** Implement `getWebSocketCount(subdomain)`
  - Iterate over `proxiedWebSockets` values
  - Count entries where `ws.subdomain === subdomain`
  - Return count as number

- [x] **2.8** Implement `waitForWebSocketUpgrade(id, timeoutMs)`
  - Return `Promise<WebSocketUpgradeResponseMessage>`
  - Store `{ resolve, reject }` in `wsUpgradePending` Map
  - Set timeout to reject after `timeoutMs`
  - Clean up Map entry on timeout

- [x] **2.9** Implement `resolveWebSocketUpgrade(id, response)`
  - Look up pending entry in `wsUpgradePending`
  - Call `resolve(response)` if found
  - Remove entry from Map
  - Return void

- [x] **2.10** Implement `closeAllWebSockets(subdomain, code, reason)`
  - Iterate over `proxiedWebSockets` entries
  - For each WebSocket with matching subdomain:
    - Call `publicSocket.close(code, reason)`
    - Call `unregisterProxiedWebSocket(id)`
  - Implemented as `closeWebSocketsForTunnel()`

- [x] **2.11** Update `unregister(subdomain)` to close WebSockets
  - Before removing tunnel, call `closeAllWebSockets(subdomain, 1001, "Tunnel disconnected")`
  - Ensures WebSockets close when tunnel closes

- [x] **2.12** Write unit tests for ConnectionManager WebSocket methods
  - File: `apps/tunnel-server/src/connection-manager-websocket.test.ts`
  - Test: `registerProxiedWebSocket` adds to Map
  - Test: `unregisterProxiedWebSocket` removes from Map
  - Test: `trackWebSocketFrame` increments counters
  - Test: `getWebSocketCount` returns correct count
  - Test: `waitForWebSocketUpgrade` resolves on response
  - Test: `waitForWebSocketUpgrade` rejects on timeout
  - Test: `closeAllWebSockets` closes all for subdomain
  - Mock WebSocket instances for testing

**Dependencies**: Task 1.0 (message types)
**Testing**: Unit tests with mocked WebSocket instances (16 tests passing)
**Commits**:
  - ✅ `c55cbc5` - `feat(connection-manager): add WebSocket connection tracking`
  - ✅ `b33f45f` - `feat(connection-manager): auto-close WebSockets on tunnel unregister`
**PR**: Create PR #1 after this task (combine with Task 1.0)

---

### 3.0 HTTP Handler - WebSocket Upgrade Detection ✅
Add WebSocket upgrade detection to `apps/tunnel-server/src/http-handler.ts` before standard HTTP handling.

**Agent**: `tdd-developer` - Test-first implementation with unit tests for upgrade detection logic

- [x] **3.1** Create `isWebSocketUpgrade(request)` helper function
  - Check `upgrade` header === `"websocket"` (case-insensitive)
  - Check `connection` header contains `"upgrade"` (case-insensitive)
  - Return boolean
  - Export for testing

- [x] **3.2** Add WebSocket upgrade middleware before catch-all handler
  - Insert before `app.all("*", async (c) => { /* HTTP handler */ })`
  - Use `app.all("*", async (c, next) => { ... })`
  - Call `isWebSocketUpgrade(c.req)` to detect upgrade
  - If upgrade: call `handleWebSocketUpgrade(c, cfg)`, return response
  - If not upgrade: call `next()` to continue to HTTP handler

- [x] **3.3** Implement `handleWebSocketUpgrade(c, cfg)` async function
  - Extract `host` header, call `extractSubdomain(host, cfg.baseDomain)`
  - If no subdomain: return `c.text("Invalid tunnel URL", 404)`
  - Find tunnel connection: `connectionManager.findBySubdomain(subdomain)`
  - If no connection or not active: return `c.text("Tunnel not found or inactive", 502)`
  - Check WebSocket count: `connectionManager.getWebSocketCount(subdomain)`
  - If count >= 100: return `c.text("Maximum WebSocket connections exceeded (100)", 503)`
  - Generate WebSocket ID: `${subdomain}:ws:${nanoid(10)}`
  - Build `WebSocketUpgradeMessage` with path, headers, subprotocol
  - Send message to CLI: `connection.socket.send(JSON.stringify(upgradeMessage))`
  - Wait for response: `await connectionManager.waitForWebSocketUpgrade(wsConnId, 5000)`
  - If not accepted: return `c.text(reason, statusCode)`
  - If accepted: return `c.text("Upgrade will be handled at HTTP server level", 501)`
  - Note: Actual upgrade happens in HTTP server `upgrade` event (Task 4.0)

- [x] **3.4** Write unit tests for `isWebSocketUpgrade`
  - File: `apps/tunnel-server/src/http-handler.test.ts`
  - Test: Returns true for valid WebSocket upgrade
  - Test: Returns false for regular HTTP request
  - Test: Case-insensitive header matching

- [x] **3.5** Write unit tests for `handleWebSocketUpgrade`
  - File: `apps/tunnel-server/src/http-handler.test.ts`
  - Test: Returns 404 for invalid subdomain
  - Test: Returns 502 for inactive tunnel
  - Test: Returns 503 when 100 WebSocket limit reached
  - Test: Sends upgrade message to CLI
  - Test: Waits for CLI response
  - Mock ConnectionManager methods

**Dependencies**: Task 2.0 (ConnectionManager updates)
**Testing**: Unit tests with mocked dependencies (13 new tests, 74 total passing)
**Commit**: ✅ `f07c814` - `feat(http-handler): add WebSocket upgrade detection`
**PR**: Create PR #2 after this task

---

### 4.0 HTTP Server - Raw Socket Upgrade Handling
Handle WebSocket upgrades at Node.js HTTP server level in `apps/tunnel-server/src/index.ts` using the `upgrade` event.

**Agent**: `tdd-developer` - Test-first implementation of WebSocket handshake and frame relay with integration tests

- [ ] **4.1** Create `apps/tunnel-server/src/websocket-proxy.ts` module
  - Export `handleWebSocketUpgradeEvent(req, socket, head, connectionManager, baseDomain)`
  - Will contain core WebSocket upgrade and frame relay logic

- [ ] **4.2** Implement WebSocket upgrade validation in `websocket-proxy.ts`
  - Extract `host` header from `req.headers`
  - Call `extractSubdomain(host, baseDomain)` (import from http-handler)
  - If no subdomain: destroy socket, return
  - Find tunnel: `connectionManager.findBySubdomain(subdomain)`
  - If no tunnel or not active: destroy socket, return
  - Check WebSocket count limit (100)
  - If exceeded: destroy socket, return

- [ ] **4.3** Implement WebSocket handshake in `websocket-proxy.ts`
  - Import `WebSocketServer` from `ws`
  - Create temporary WebSocket server: `new WebSocketServer({ noServer: true })`
  - Call `wss.handleUpgrade(req, socket, head, (publicWs) => { ... })`
  - This performs the WebSocket handshake and returns upgraded socket

- [ ] **4.4** Register public WebSocket in ConnectionManager
  - Generate WebSocket ID: `${subdomain}:ws:${nanoid(10)}`
  - Call `connectionManager.registerProxiedWebSocket(wsId, subdomain, publicWs)`
  - Set up event listeners on `publicWs`

- [ ] **4.5** Set up public WebSocket event handlers
  - Listen for `message` event: relay to CLI via `websocket_frame` message
  - Listen for `close` event: send `websocket_close` message to CLI, unregister
  - Listen for `error` event: log error, close WebSocket
  - Listen for `ping` event: relay as frame (opcode 9)
  - Listen for `pong` event: relay as frame (opcode 10)

- [ ] **4.6** Implement frame relay: public client → CLI
  - On `message` event, get data and `isBinary` flag
  - Build `WebSocketFrameMessage`:
    - `id`: WebSocket ID
    - `direction`: `"client_to_server"`
    - `opcode`: `isBinary ? 2 : 1`
    - `data`: `isBinary ? Buffer.from(data).toString("base64") : data.toString()`
    - `final`: true
  - Send to CLI: `tunnelConnection.socket.send(JSON.stringify(frameMessage))`
  - Track bytes: `connectionManager.trackWebSocketFrame(wsId, data.length)`

- [ ] **4.7** Add `upgrade` event listener to HTTP server in `index.ts`
  - Find where HTTP server is created (in `startServer`)
  - Add: `server.on("upgrade", (req, socket, head) => { ... })`
  - Import `handleWebSocketUpgradeEvent` from `websocket-proxy.ts`
  - Call handler: `handleWebSocketUpgradeEvent(req, socket, head, connectionManager, cfg.baseDomain)`
  - Wrap in try-catch, destroy socket on error

- [ ] **4.8** Update WebSocket handler to relay frames: CLI → public client
  - Modify `apps/tunnel-server/src/websocket-handler.ts`
  - In `handleMessage`, add case for `"websocket_frame"`
  - Extract frame details from message
  - If direction is `"server_to_client"`:
    - Look up WebSocket: `connectionManager.proxiedWebSockets.get(message.id)`
    - Decode data (base64 for binary, plain for text)
    - Send to public client: `ws.publicSocket.send(data, { binary: opcode === 2 })`
    - Track bytes: `connectionManager.trackWebSocketFrame(id, data.length)`

- [ ] **4.9** Handle `websocket_close` from CLI
  - In `handleMessage`, add case for `"websocket_close"`
  - Look up WebSocket: `connectionManager.proxiedWebSockets.get(message.id)`
  - Close public socket: `ws.publicSocket.close(payload.code, payload.reason)`
  - Unregister: `connectionManager.unregisterProxiedWebSocket(message.id)`

- [ ] **4.10** Write unit tests for `websocket-proxy.ts`
  - File: `apps/tunnel-server/src/websocket-proxy.test.ts`
  - Test: Validates subdomain extraction
  - Test: Rejects upgrade for invalid subdomain
  - Test: Rejects upgrade when connection limit reached
  - Test: Performs WebSocket handshake
  - Test: Registers WebSocket in ConnectionManager
  - Mock HTTP request, socket, ConnectionManager

- [ ] **4.11** Write integration test for upgrade flow
  - File: `apps/tunnel-server/src/http-handler.websocket.test.ts`
  - Test: Full upgrade flow from HTTP request to WebSocket
  - Start local HTTP server
  - Send upgrade request
  - Verify 101 Switching Protocols response
  - Verify WebSocket connection established

**Dependencies**: Task 3.0 (upgrade detection)
**Testing**: Unit tests + integration test for full upgrade
**Commit After**: Task 4.11 complete - `feat(tunnel-server): implement WebSocket upgrade handling and frame relay`
**PR**: Create PR #3 after this task

---

### 5.0 CLI Client - Local WebSocket Proxying
Create CLI WebSocket handler to connect to localhost and relay frames bidirectionally.

**Note**: This assumes CLI package exists. If not, this task includes creating the CLI package structure.

**Agent**: `tdd-developer` - Test-first implementation of CLI WebSocket handler with mocked connections

- [ ] **5.1** Create CLI package structure (if doesn't exist)
  - Directory: `packages/cli/`
  - Files: `package.json`, `tsconfig.json`, `src/index.ts`
  - Add to workspace in root `package.json`
  - Install dependencies: `ws`, `commander`, `nanoid`

- [ ] **5.2** Create `packages/cli/src/websocket-handler.ts`
  - Export `handleWebSocketUpgrade(upgrade, tunnelSocket, localPort)`
  - Will contain CLI-side WebSocket logic

- [ ] **5.3** Implement local WebSocket connection in `websocket-handler.ts`
  - Extract `id`, `path`, `headers` from `WebSocketUpgradeMessage`
  - Build local URL: `ws://localhost:${localPort}${path}`
  - Create WebSocket: `new WebSocket(localUrl, { headers })`
  - Wait for `open` event (or `error` event)
  - Use Promise to await connection

- [ ] **5.4** Send upgrade response to tunnel server
  - On connection success:
    - Build `WebSocketUpgradeResponseMessage` with `accepted: true`, `statusCode: 101`
    - Calculate `Sec-WebSocket-Accept` header (use `ws` library helper)
    - Send message: `tunnelSocket.send(JSON.stringify(response))`
  - On connection failure:
    - Build response with `accepted: false`, `statusCode: 502`, `reason: error.message`
    - Send message to tunnel server

- [ ] **5.5** Set up local WebSocket event handlers
  - Listen for `message` event: relay to tunnel as `websocket_frame`
  - Listen for `close` event: send `websocket_close` to tunnel
  - Listen for `error` event: log error, send close message
  - Listen for `ping`/`pong`: relay as frames

- [ ] **5.6** Implement frame relay: local server → tunnel
  - On `message` event, get data and `isBinary`
  - Build `WebSocketFrameMessage`:
    - `direction`: `"server_to_client"`
    - `opcode`: `isBinary ? 2 : 1`
    - `data`: encoded (base64 for binary)
  - Send to tunnel: `tunnelSocket.send(JSON.stringify(frameMessage))`

- [ ] **5.7** Listen for frames from tunnel in CLI main loop
  - In CLI main WebSocket handler (where tunnel messages are received)
  - Add case for `"websocket_frame"` message type
  - If direction is `"client_to_server"`:
    - Look up local WebSocket by `message.id`
    - Decode data
    - Send to local server: `localWs.send(data, { binary: opcode === 2 })`

- [ ] **5.8** Listen for close from tunnel
  - Add case for `"websocket_close"` message type
  - Look up local WebSocket
  - Close local connection: `localWs.close(payload.code, payload.reason)`
  - Clean up tracking

- [ ] **5.9** Track local WebSocket connections in CLI
  - Add Map in CLI to track: `Map<string, WebSocket>` (id → local WebSocket)
  - Register on connect, unregister on close
  - Close all on CLI shutdown

- [ ] **5.10** Write unit tests for `websocket-handler.ts`
  - File: `packages/cli/src/websocket-handler.test.ts`
  - Test: Connects to local WebSocket server
  - Test: Sends upgrade response on success
  - Test: Sends failure response on error
  - Test: Relays frames bidirectionally
  - Mock WebSocket connections

**Dependencies**: Task 4.0 (tunnel server upgrade handling)
**Testing**: Unit tests with mocked WebSocket
**Commit After**: Task 5.10 complete - `feat(cli): add WebSocket proxying support and tests`
**PR**: Create PR #4 after this task

---

### 6.0 Frame Handling & Resource Limits
Implement frame validation, size limits, connection limits, and metering.

**Agent**: `tdd-developer` - Test-first implementation of validation and limits with integration tests

- [ ] **6.1** Add frame size validation in `websocket-proxy.ts`
  - In public WebSocket `message` handler
  - Check `data.length > 10 * 1024 * 1024` (10MB)
  - If exceeded: close with code 1009, reason "Message too big"
  - Don't relay frame to CLI

- [ ] **6.2** Add frame size validation in CLI `websocket-handler.ts`
  - In local WebSocket `message` handler
  - Check frame size > 10MB
  - If exceeded: close local WebSocket with code 1009
  - Send close message to tunnel

- [ ] **6.3** Enforce connection limit in `websocket-proxy.ts`
  - Before performing upgrade, check count
  - If `connectionManager.getWebSocketCount(subdomain) >= 100`:
    - Send 503 response (already in Task 4.2)
    - Destroy socket immediately
    - Log warning with subdomain

- [ ] **6.4** Add WebSocket frame metering
  - In `trackWebSocketFrame`, ensure bytes are added to tunnel's `bytesTransferred`
  - This is already implemented in Task 2.6
  - Verify it's called for both directions (client→server, server→client)

- [ ] **6.5** Handle fragmented messages
  - WebSocket frames have FIN bit (final fragment)
  - For MVP: only support final=true frames (no fragmentation)
  - If `final === false`: close connection with code 1008 (Policy Violation)
  - Add TODO comment for future fragmentation support

- [ ] **6.6** Handle control frames (ping/pong)
  - In public WebSocket, listen for `ping` and `pong` events
  - Relay as frames with opcode 9 (ping) and 10 (pong)
  - In CLI, relay these frames to local WebSocket
  - Note: `ws` library auto-responds to pings, but we still relay for observability

- [ ] **6.7** Add graceful close handling
  - When tunnel disconnects, close all WebSockets with code 1001 (Going Away)
  - Already implemented in Task 2.11
  - Verify close reason is descriptive: "Tunnel disconnected"

- [ ] **6.8** Write integration tests for frame limits
  - File: `apps/tunnel-server/src/http-handler.websocket.test.ts`
  - Test: Send 10MB frame → succeeds
  - Test: Send 11MB frame → connection closes with 1009
  - Test: Open 100 WebSocket connections → all succeed
  - Test: Open 101st connection → rejected with 503

- [ ] **6.9** Write integration tests for control frames
  - Test: Send ping → receive pong
  - Test: Ping frames relay through tunnel
  - Use actual WebSocket client and server

**Dependencies**: Task 5.0 (CLI WebSocket handler)
**Testing**: Integration tests for limits and control frames
**Commit After**: Task 6.9 complete - `feat(websocket): add frame validation and resource limits`
**PR**: Create PR #5 after this task

---

### 7.0 Integration Testing
Create comprehensive end-to-end tests for WebSocket proxying.

**Agent**: `tdd-developer` - Create integration test suite with real WebSocket servers and clients

- [ ] **7.1** Create WebSocket echo server test
  - File: `apps/tunnel-server/src/integration/websocket-echo.test.ts`
  - Start local WebSocket echo server on port 3000
  - Start tunnel server
  - Create tunnel connection (mock CLI)
  - Connect public WebSocket client to tunnel URL
  - Send message: "Hello, Echo!"
  - Verify message echoes back
  - Close connections, verify cleanup

- [ ] **7.2** Create concurrent connections test
  - File: `apps/tunnel-server/src/integration/websocket-concurrent.test.ts`
  - Start local WebSocket echo server
  - Create tunnel
  - Open 100 WebSocket connections in parallel
  - Verify all 100 succeed
  - Send message on each, verify all echo
  - Attempt 101st connection
  - Verify rejection with 503
  - Close all connections

- [ ] **7.3** Create frame size limit test
  - File: `apps/tunnel-server/src/integration/websocket-frame-size.test.ts`
  - Start local WebSocket server
  - Create tunnel
  - Send 1MB frame → verify delivery
  - Send 10MB frame → verify delivery (at limit)
  - Send 11MB frame → verify connection closes with 1009
  - Check error logs

- [ ] **7.4** Create disconnect handling test
  - File: `apps/tunnel-server/src/integration/websocket-disconnect.test.ts`
  - Scenario 1: Client closes WebSocket
    - Verify local server receives close event
    - Verify WebSocket unregistered
  - Scenario 2: Local server closes WebSocket
    - Verify public client receives close event
    - Verify cleanup
  - Scenario 3: Tunnel disconnects
    - Verify all WebSockets close with code 1001
    - Verify all unregistered

- [ ] **7.5** Create bidirectional frame test
  - File: `apps/tunnel-server/src/integration/websocket-bidirectional.test.ts`
  - Start local WebSocket server
  - Public client sends 100 text frames → verify all received
  - Local server sends 100 binary frames → verify all received
  - Measure latency, verify <10ms overhead
  - Verify frame counts tracked correctly

- [ ] **7.6** Add CI pipeline for integration tests
  - Update `.github/workflows/test.yml` (or equivalent)
  - Run integration tests on pull requests
  - Start Redis and PostgreSQL services for tests
  - Set reasonable timeout for integration tests

- [ ] **7.7** Document manual testing procedure
  - File: `docs/TESTING_WEBSOCKET.md`
  - Step-by-step guide for manual testing
  - How to start tunnel server locally
  - How to start local WebSocket echo server
  - How to test with browser DevTools
  - Note: Playwright testing will be handled separately on liveport side

**Dependencies**: Task 6.0 (frame handling complete)
**Testing**: 5 integration test files covering WebSocket core functionality
**Commit After**: Task 7.7 complete - `test(websocket): add integration tests and CI pipeline`
**PR**: Create PR #6 after this task

---

### 8.0 Documentation & Deployment
Update documentation, examples, dashboard UI, and deploy to production.

**Agent**: `general-purpose` - Multi-step task involving documentation, dashboard updates, and deployment coordination

- [ ] **8.1** Update main README
  - File: `README.md`
  - Add "WebSocket Support" section
  - Example: tunneling WebSocket echo server
  - Example: Playwright run-server (note: Playwright integration testing handled separately)
  - Mention connection limit (100) and frame size limit (10MB)

- [ ] **8.2** Create WebSocket usage guide
  - File: `docs/WEBSOCKET_GUIDE.md`
  - Overview: How WebSocket proxying works
  - Architecture diagram (similar to PRD)
  - Connection lifecycle
  - Frame types and opcodes
  - Error codes and troubleshooting
  - Resource limits and best practices

- [ ] **8.3** Add WebSocket examples
  - Directory: `examples/websocket/`
  - Example 1: `echo-server.js` - Simple WebSocket echo server
  - Example 2: `playwright-test.ts` - Playwright reference example (actual testing on liveport side)
  - Example 3: `chat-app/` - Real-time chat app demo
  - Each with README explaining setup

- [ ] **8.4** Update dashboard to show WebSocket stats
  - File: `apps/dashboard/src/app/(dashboard)/tunnels/page.tsx`
  - Add column: "WebSocket Connections" (current count)
  - Fetch from API: add to tunnel list response
  - Display count: "3 / 100 connections"

- [ ] **8.5** Add WebSocket metrics to dashboard API
  - File: `apps/dashboard/src/app/api/tunnels/route.ts`
  - Call tunnel server: `GET /api/tunnels/by-key/:keyId`
  - Add field: `websocketConnections` (count)
  - Modify tunnel server API to include count

- [ ] **8.6** Update tunnel server API to include WebSocket count
  - File: `apps/tunnel-server/src/http-handler.ts`
  - In `/api/tunnels/by-key/:keyId` handler
  - Add field: `websocketConnections: connectionManager.getWebSocketCount(subdomain)`
  - Return in response

- [ ] **8.7** Add WebSocket connection count to tunnel summary
  - Modify `ConnectionManager.getSummary()` to include WebSocket counts
  - Update `/_internal/tunnels` endpoint to show WebSocket stats

- [ ] **8.8** Add monitoring/alerting for WebSocket metrics
  - Log WebSocket connection count every 1 minute
  - Alert if any tunnel has >90 WebSocket connections (approaching limit)
  - Track WebSocket frame count in metrics
  - Track WebSocket bytes transferred separately from HTTP

- [ ] **8.9** Write deployment checklist
  - File: `docs/DEPLOYMENT.md`
  - Pre-deployment checks:
    - All integration tests pass
    - WebSocket echo server test passes
    - Load test 100 concurrent WebSockets
  - Deployment steps:
    - Deploy tunnel server first (backward compatible)
    - Deploy dashboard (includes new API fields)
    - Announce feature to users via email/blog
  - Rollback plan if issues arise
  - Note: Playwright testing coordinated separately with liveport team

- [ ] **8.10** Deploy to staging
  - Deploy tunnel server to staging environment
  - Run manual tests:
    - WebSocket echo server
    - 50 concurrent connections
  - Monitor logs for errors
  - Verify metrics dashboard shows WebSocket counts

- [ ] **8.11** Deploy to production
  - Deploy tunnel server to production (Fly.io)
  - Monitor for first hour:
    - Error rate
    - WebSocket connection count
    - Frame delivery success rate
  - Watch for user reports/issues
  - Be ready to rollback if critical issues

- [ ] **8.12** Announce feature launch
  - Write blog post: "LivePort Now Supports WebSocket Tunneling"
  - Highlight Playwright use case
  - Include code examples
  - Share on Twitter, Reddit, HN
  - Email existing users about new capability

**Dependencies**: Task 7.0 (all tests passing)
**Testing**: Manual testing in staging + production monitoring
**Commit After**: Task 8.12 complete - `docs(websocket): add documentation, examples, and deployment guides`
**PR**: Create PR #7 after this task

---

## Summary

**Total Tasks**: 8 parent tasks, 86 sub-tasks
**Critical Path**: Tasks 1→2→3→4→5→6→7→8 (sequential dependencies)
**Agent Strategy**: `tdd-developer` for implementation (Tasks 1.0-7.0), `general-purpose` for deployment (Task 8.0)

### Implementation Order

**Phase 1: Foundation** (Tasks 1.0 + 2.0) - `tdd-developer`
- Add WebSocket protocol message types
- Extend ConnectionManager for WebSocket tracking
- **Create PR #1** after completion

**Phase 2: Upgrade Detection** (Task 3.0) - `tdd-developer`
- Add WebSocket upgrade detection to HTTP handler
- **Create PR #2** after completion

**Phase 3: Server-Side Proxying** (Task 4.0) - `tdd-developer`
- Implement HTTP server upgrade handling
- Add bidirectional frame relay
- **Create PR #3** after completion

**Phase 4: CLI Support** (Task 5.0) - `tdd-developer`
- Create CLI WebSocket handler
- Connect to local WebSocket servers
- **Create PR #4** after completion

**Phase 5: Resource Limits** (Task 6.0) - `tdd-developer`
- Add frame size validation (10MB)
- Enforce connection limits (100/tunnel)
- **Create PR #5** after completion

**Phase 6: Testing** (Task 7.0) - `tdd-developer`
- Add 5 integration test files
- Configure CI pipeline
- **Create PR #6** after completion

**Phase 7: Deploy** (Task 8.0) - `general-purpose`
- Documentation and examples
- Dashboard UI updates
- Staging → Production deployment
- **Create PR #7** after completion

### Testing Checklist (Pre-Deployment)
- [ ] All unit tests pass (`pnpm test`)
- [ ] All integration tests pass
- [ ] WebSocket echo server test passes
- [ ] 100 concurrent connections test passes
- [ ] Frame size limit test passes
- [ ] Disconnect handling test passes
- [ ] Bidirectional frame relay test passes
- [ ] Manual testing in staging complete
- [ ] Load testing complete (100 connections × 10 messages/sec × 5 min)

### Success Criteria
✅ WebSocket upgrade success rate >99%
✅ Frame delivery success rate >99.9%
✅ Support 100 concurrent WebSocket connections per tunnel
✅ Frame latency overhead <10ms
✅ All integration tests passing
✅ Production deployment successful with monitoring

**Note**: Playwright integration testing will be handled separately on the liveport side

---

**Ready to implement!** Start with Task 1.0 and work sequentially through dependencies.

For questions or blockers, refer to:
- PRD: `tasks/004-prd-websocket-proxying.md`
- Existing code: `apps/tunnel-server/src/` for patterns
- Tests: Look at existing `.test.ts` files for testing patterns
