# PRD: WebSocket Raw Byte Piping Refactor

## Document Info
- **Version**: 1.0
- **Created**: 2025-12-29
- **Status**: Draft
- **Author**: PRD Writer Skill
- **Priority**: Critical (P0)
- **Related**: PRD 004 (WebSocket Proxying Support)

---

## 1. Problem Statement

### The Problem
WebSocket proxying is currently implemented (PRD 004) but **fails with "RSV1 must be clear" errors** when relaying frames. The upgrade handshake succeeds, but frame relay breaks immediately when the client sends data.

**Error observed:**
```
❌ WebSocket error: Invalid WebSocket frame: RSV1 must be clear

Connecting to wss://simple-goose-uxu4.liveport.online/...
✅ WebSocket connection established!
👋 Connection closed: 1006 -
```

**Backend behavior:**
- Backend WebSocket server NEVER receives the connection
- No "Client connected" message appears
- Connection dies on first frame from public client

### Current Implementation (Frame Parsing Approach)
```
Public WS Client → Parse frames → JSON → Control channel → Reconstruct frames → Local WS Server
                   ↓                                                              ↓
            Extract opcode, data,                                        ws.send(data, {binary, fin})
            encode to base64/text                                        ❌ LOSES FRAME METADATA
```

**Files:**
- `apps/tunnel-server/src/websocket-proxy.ts:87-122` - Parses frames, extracts opcode/data
- `apps/tunnel-server/src/websocket-handler.ts:391-434` - Reconstructs frames from JSON
- `packages/cli/src/websocket-handler.ts:253-276` - Reconstructs frames to send to local server

### Root Cause
1. **Frame metadata loss** - Parsing and reconstructing WebSocket frames loses:
   - RSV bits (extension negotiation flags)
   - Masking keys
   - Extension-specific data
   - Frame boundaries for fragmented messages

2. **Invalid API usage** - The `ws` library's `send()` method was called with invalid `fin` parameter (fixed, but didn't resolve RSV1 error)

3. **Architectural mismatch** - Successful WebSocket tunnel implementations (websockify, wstunnel, wsp) **don't parse frames** - they pipe raw bytes

### Impact
- **WebSocket tunneling completely broken** - No WebSocket application can work through LivePort
- Blocks: Playwright, live-reload servers, Socket.io, real-time apps, GraphQL subscriptions
- Critical for Daytona integration

---

## 2. Proposed Solution

### Solution Overview
**Refactor from frame parsing to raw byte piping**, following the architecture used by websockify and other successful WebSocket tunnel implementations.

### New Architecture (Raw Byte Piping)
```
Public WS Client → Raw bytes → Binary message → Control channel → Raw bytes → Local TCP Socket
                   ↓                                                           ↓
         WebSocket._socket.on('data')                              net.Socket.write(bytes)
         ❌ NO FRAME PARSING                                        ✅ PRESERVES ALL METADATA
```

### Key Changes

#### 1. Tunnel Server (apps/tunnel-server/src/websocket-proxy.ts)
**Current:**
```typescript
publicWs.on("message", (data: RawData, isBinary: boolean) => {
  const frameMessage: WebSocketFrameMessage = {
    type: "websocket_frame",
    payload: { opcode: isBinary ? 2 : 1, data: ... }
  };
  connection.socket.send(JSON.stringify(frameMessage));
});
```

**New:**
```typescript
// Access underlying socket for raw bytes
const socket = (publicWs as any)._socket;
socket.on('data', (chunk: Buffer) => {
  const dataMessage: WebSocketDataMessage = {
    type: "websocket_data",
    id: wsId,
    data: chunk.toString('base64')
  };
  connection.socket.send(JSON.stringify(dataMessage));
});
```

#### 2. CLI (packages/cli/src/websocket-handler.ts)
**Current:**
```typescript
const localSocket = new WebSocket(localUrl, {
  headers, protocol, perMessageDeflate: false
});
localSocket.send(data, { binary: true });
```

**New:**
```typescript
import net from 'net';

const localSocket = net.connect(this.localPort, 'localhost');
localSocket.on('connect', () => {
  // Send upgrade response to tunnel server
});
localSocket.write(Buffer.from(data, 'base64')); // Raw bytes
```

### Technical Details

#### Message Types
```typescript
// New message type for raw bytes
export interface WebSocketDataMessage {
  type: "websocket_data";
  id: string;
  timestamp: number;
  data: string; // base64 encoded raw bytes
}

// Keep existing types for upgrade/close
WebSocketUpgradeMessage
WebSocketUpgradeResponseMessage
WebSocketCloseMessage
```

#### Flow
1. **Upgrade** - Same as current (works correctly)
2. **Data relay** - New raw byte approach:
   ```
   Public Client → ws://tunnel → CLI → TCP:localhost:3000
   ```
3. **Close** - Same as current

---

## 3. Success Criteria

### Functional Requirements
1. ✅ WebSocket upgrade handshake succeeds
2. ✅ Backend server receives connection ("Client connected" appears)
3. ✅ Bidirectional data flows without errors
4. ✅ No "RSV1 must be clear" errors
5. ✅ Test WebSocket server echoes messages correctly
6. ✅ Playwright run-server works through tunnel

### Non-Functional Requirements
1. **Performance** - Raw byte piping should be faster than frame parsing
2. **Compatibility** - Must work with all WebSocket extensions (compression, etc.)
3. **Reliability** - No frame corruption or data loss

### Test Cases
```typescript
// Test 1: Simple echo
const ws = new WebSocket('wss://tunnel.liveport.online');
ws.send('hello');
// Expected: Receive 'Echo: hello' from backend

// Test 2: Binary data
ws.send(Buffer.from([0x01, 0x02, 0x03]));
// Expected: Receive binary echo

// Test 3: Large message
ws.send('x'.repeat(1024 * 1024)); // 1MB
// Expected: Receive complete echo

// Test 4: Fragmented messages
// Expected: Reassembled correctly at backend
```

---

## 4. Out of Scope
- WebSocket compression negotiation (will work automatically with raw bytes)
- WebSocket subprotocol selection (already handled in upgrade)
- Multiple WebSocket extensions beyond compression

---

## 5. Implementation Notes

### References
- [websockify](https://github.com/novnc/websockify) - Translates WebSocket to TCP
- [wstunnel](https://github.com/erebe/wstunnel) - Tunnels TCP over WebSocket
- [wsp](https://github.com/root-gg/wsp) - Reverse proxy over WebSocket

All use **raw byte piping**, not frame parsing.

### Risks
1. **Breaking change** - Existing WebSocket connections will break during deployment
2. **Testing complexity** - Need to test various WebSocket scenarios
3. **TCP connection management** - CLI needs to manage TCP connections per WebSocket

### Mitigation
1. Deploy during low-traffic window
2. Comprehensive test suite before deployment
3. Reuse existing connection management patterns from HTTP proxying

---

## 6. Acceptance Criteria

### Phase 1: Core Refactor
- [ ] Raw byte piping implemented in tunnel server
- [ ] TCP connection handling implemented in CLI
- [ ] Data relay working bidirectionally
- [ ] Unit tests passing

### Phase 2: Integration Testing
- [ ] test-ws-server.mjs receives connections
- [ ] test-ws-client.mjs successfully echoes messages
- [ ] No RSV1 errors in logs
- [ ] Backend logs show "Client connected"

### Phase 3: Production Validation
- [ ] Deployed to production
- [ ] Playwright run-server works
- [ ] Real-time app testing passes
- [ ] Performance metrics acceptable

---

## 7. Timeline Estimate
- **Phase 1**: 4-6 hours (core refactor + tests)
- **Phase 2**: 2-3 hours (integration testing)
- **Phase 3**: 1-2 hours (deployment + validation)
- **Total**: 7-11 hours

---

## 8. Open Questions
1. Should we maintain backward compatibility with frame-based approach? **No** - It doesn't work
2. How to handle WebSocket ping/pong frames? **Raw bytes handle automatically**
3. Need to handle WebSocket close frames specially? **Yes** - Keep existing close message handling

---

## Appendix: Error Investigation

### Attempts Made
1. ✅ Disabled `perMessageDeflate` compression (all 4 connection points)
2. ✅ Removed invalid `fin` parameter from `ws.send()`
3. ✅ Deployed fixes to production
4. ❌ Error persists - frame parsing is fundamentally flawed

### Conclusion
The architecture must change from frame parsing to raw byte piping to preserve WebSocket frame metadata (RSV bits, masking, extensions).
