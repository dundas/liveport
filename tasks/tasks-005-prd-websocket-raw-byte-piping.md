# Tasks: WebSocket Raw Byte Piping Refactor

**Source PRD:** `tasks/005-prd-websocket-raw-byte-piping.md`

## Relevant Files

### Type Definitions
- `apps/tunnel-server/src/types.ts` - Add `WebSocketDataMessage` type, update `MessageType` union
- `packages/cli/src/types.ts` - Import and use new `WebSocketDataMessage` type

### Tunnel Server
- `apps/tunnel-server/src/websocket-proxy.ts` - Refactor to use raw byte piping via `_socket.on('data')`
- `apps/tunnel-server/src/websocket-handler.ts` - Update to handle `websocket_data` messages and relay to CLI
- `apps/tunnel-server/src/connection-manager.ts` - May need updates for tracking raw byte transfers

### CLI
- `packages/cli/src/websocket-handler.ts` - Refactor to use `net.Socket` instead of `WebSocket` client
- `packages/cli/src/tunnel-client.ts` - Update message routing to handle `websocket_data` messages

### Tests
- `apps/tunnel-server/src/websocket-proxy.test.ts` - Unit tests for raw byte piping (NEW)
- `packages/cli/src/websocket-handler.test.ts` - Unit tests for TCP connection handling (NEW)
- `test-ws-server.mjs` - Integration test backend (existing)
- `test-ws-client.mjs` - Integration test client (existing)

### Notes
- Tests use Vitest (configured in `apps/tunnel-server/vitest.config.ts` and `packages/shared/vitest.config.ts`)
- Mock WebSocket and TCP sockets for unit tests
- Use actual WebSocket connections for integration tests

---

## Tasks

- [x] 1.0 Update Message Types for Raw Byte Piping
  - [x] 1.1 Add `WebSocketDataMessage` interface to `apps/tunnel-server/src/types.ts`
    - Define interface with `type: "websocket_data"`, `id: string`, `timestamp: number`, `data: string` (base64)
    - Add `"websocket_data"` to `MessageType` union (line 8)
    - Add `WebSocketDataMessage` to `Message` union type (line 172)
  - [x] 1.2 Export `WebSocketDataMessage` from `packages/cli/src/types.ts`
    - Re-export type from `apps/tunnel-server/src/types.ts`
    - Ensure CLI can import and use the new message type
  - [x] 1.3 Update JSDoc comments to document raw byte piping approach
    - Add comments explaining this replaces frame parsing
    - Document that data is base64-encoded raw TCP bytes

- [x] 2.0 Refactor Tunnel Server for Raw Byte Piping
  - [x] 2.1 Access underlying TCP socket in `websocket-proxy.ts` after upgrade (line 77)
    - After `wss.handleUpgrade()` callback, access `(publicWs as any)._socket`
    - Store reference to underlying TCP socket
  - [x] 2.2 Replace `publicWs.on("message")` handler with `socket.on("data")` (lines 87-122)
    - Remove frame parsing logic (opcode extraction)
    - Listen to raw socket 'data' events instead
    - Encode chunks as base64
    - Send `WebSocketDataMessage` to CLI via control channel
    - Keep frame size checks (MAX_FRAME_SIZE)
  - [x] 2.3 Update `websocket-handler.ts` to relay `websocket_data` messages
    - Add handler for `websocket_data` message type
    - Route raw byte messages from tunnel server to public client
    - Convert base64 back to Buffer and write to public WebSocket's underlying socket
  - [x] 2.4 Remove obsolete ping/pong handlers (lines 183-231)
    - Raw bytes will automatically include ping/pong frames
    - Keep error and close handlers (still needed)
  - [x] 2.5 Update error logging to reflect raw byte relay approach
    - Change log messages from "frame relay" to "byte relay"

- [x] 3.0 Refactor CLI for TCP Connection Handling
  - [x] 3.1 Import `net` module in `packages/cli/src/websocket-handler.ts` (line 8)
    - Add `import net from "net"`
  - [x] 3.2 Update `LocalWebSocketConnection` interface (lines 21-27)
    - Rename `localSocket: WebSocket` to `localSocket: net.Socket`
    - Update type from `WebSocket` to `net.Socket`
  - [x] 3.3 Refactor `handleUpgrade()` to create TCP connection (lines 47-120)
    - Replace `new WebSocket(localUrl, {...})` with `net.connect(port, host)`
    - Parse port from `this.localPort`
    - Wait for 'connect' event instead of 'open'
    - Manually send HTTP upgrade request via `socket.write()`
    - Parse upgrade response headers from socket data
    - Extract HTTP status code to validate upgrade success
  - [x] 3.4 Update `setupLocalSocketHandlers()` for TCP socket events (lines 125-151)
    - Replace `localSocket.on("message")` with `localSocket.on("data")`
    - Read raw bytes, encode as base64
    - Send `WebSocketDataMessage` to tunnel server
    - Remove ping/pong handlers (no longer needed)
    - Keep 'close' and 'error' handlers
  - [x] 3.5 Refactor `handleFrame()` to `handleData()` for raw bytes (lines 237-278)
    - Rename method to `handleData(message: WebSocketDataMessage)`
    - Remove opcode-based logic (no more frame parsing)
    - Decode base64 to Buffer
    - Write raw bytes to `localSocket` via `localSocket.write(buffer)`
  - [x] 3.6 Remove obsolete `handleLocalMessage()` and `handleLocalFrame()` methods
    - These parsed frames, no longer needed with raw byte piping
    - Replace with simple base64 encoding of raw socket data

- [ ] 4.0 Write Integration Tests
  - [ ] 4.1 Create `apps/tunnel-server/src/websocket-proxy.test.ts`
    - Test 1: Verify underlying socket is accessed after WebSocket upgrade
    - Test 2: Verify 'data' events are captured and relayed as `WebSocketDataMessage`
    - Test 3: Verify base64 encoding of raw bytes
    - Test 4: Verify frame size limit enforcement (MAX_FRAME_SIZE)
    - Mock WebSocket and TCP socket using Vitest mocks
  - [ ] 4.2 Create `packages/cli/src/websocket-handler.test.ts`
    - Test 1: Verify TCP connection created with correct host/port
    - Test 2: Verify HTTP upgrade request is sent correctly
    - Test 3: Verify upgrade response parsing and validation
    - Test 4: Verify raw bytes decoded from base64 and written to socket
    - Test 5: Verify error handling for connection failures
    - Mock `net.Socket` using Vitest mocks
  - [ ] 4.3 Create end-to-end integration test script
    - Use existing `test-ws-server.mjs` and `test-ws-client.mjs`
    - Test text message echo
    - Test binary data echo (Buffer with bytes [0x01, 0x02, 0x03])
    - Test large message (1MB string)
    - Verify backend receives connection ("Client connected" log)
    - Verify no RSV1 errors
  - [ ] 4.4 Add test for bidirectional data flow
    - Verify client → server messages work
    - Verify server → client messages work
    - Test simultaneous bidirectional traffic

- [ ] 5.0 Deploy and Validate
  - [ ] 5.1 Build tunnel server and CLI
    - Run `pnpm build --filter=@liveport/cli`
    - Run `pnpm build --filter=tunnel-server`
    - Verify builds succeed without errors
  - [ ] 5.2 Run unit tests locally
    - Run `pnpm test --filter=tunnel-server`
    - Run `pnpm test --filter=@liveport/cli`
    - Ensure all tests pass
  - [ ] 5.3 Run integration tests locally
    - Start `test-ws-server.mjs` on port 3000
    - Start local CLI with `liveport connect 3000`
    - Run `test-ws-client.mjs` against tunnel URL
    - Verify echo works, backend receives connection, no errors
  - [ ] 5.4 Deploy to production
    - Deploy tunnel server to Fly.io: `fly deploy --app liveport-tunnel`
    - Verify deployment succeeds
    - Check logs for startup errors
  - [ ] 5.5 Run production validation tests
    - Connect CLI to production tunnel server
    - Run `test-ws-client.mjs` against production tunnel URL
    - Verify WebSocket upgrade succeeds
    - Verify backend logs show "Client connected"
    - Verify echo messages work bidirectionally
    - Verify no RSV1 errors in any logs
  - [ ] 5.6 Monitor performance metrics
    - Check latency for WebSocket messages
    - Verify no memory leaks (check process memory over time)
    - Verify raw byte piping is faster than previous frame parsing
    - Check CPU usage is acceptable

---

## Testing Strategy

### Unit Tests
- Mock WebSocket and TCP sockets to isolate logic
- Test message encoding/decoding (base64)
- Test error conditions (connection failures, oversized frames)
- Verify correct event handlers are registered

### Integration Tests
- Use real WebSocket connections and servers
- Test with `test-ws-server.mjs` and `test-ws-client.mjs`
- Verify end-to-end message flow
- Test various data types (text, binary, large payloads)

### Production Validation
- Test against real backend applications
- Verify Playwright run-server works through tunnel
- Monitor for any RSV1 errors or connection failures
- Validate performance is acceptable

---

## Success Criteria

All tasks completed when:

1. ✅ `WebSocketDataMessage` type defined and used
2. ✅ Tunnel server pipes raw bytes from underlying socket
3. ✅ CLI uses TCP socket to connect to local server
4. ✅ Unit tests pass (both tunnel server and CLI)
5. ✅ Integration tests pass (echo works, no errors)
6. ✅ Deployed to production successfully
7. ✅ Backend receives connections ("Client connected" appears)
8. ✅ No "RSV1 must be clear" errors
9. ✅ Bidirectional data flows correctly
10. ✅ Performance metrics acceptable

---

## References

- **PRD:** `tasks/005-prd-websocket-raw-byte-piping.md`
- **websockify:** https://github.com/novnc/websockify - Reference implementation using raw byte piping
- **wstunnel:** https://github.com/erebe/wstunnel - Another implementation using raw TCP over WebSocket
- **ws library docs:** https://github.com/websockets/ws - For understanding `_socket` access patterns
