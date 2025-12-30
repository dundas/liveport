# PRD-007: WebSocket Proxy Rewrite Using http-proxy Architecture

**Status:** Draft
**Created:** 2025-12-30
**Related:** PRD-005 (WebSocket Raw Byte Piping - Failed)

## Problem Statement

The WebSocket raw byte piping implementation (PRD-005, PR #23) fails with "RSV1 must be clear" errors despite multiple fix attempts. The fundamental issue is that we're trying to relay WebSocket frames through a tunnel while both the public client and tunnel server have active WebSocket frame parsers that conflict with raw byte relay.

### Root Cause

When relaying raw WebSocket bytes:
1. Public Client's ws library Receiver parses incoming frames
2. We write raw bytes to the public client's socket
3. Both our code AND the ws library read from the same socket
4. The ws library encounters frames with RSV1 bit set (from compression negotiation)
5. Error: "Invalid WebSocket frame: RSV1 must be clear"

**We cannot control the public client's ws library**, so disabling the Receiver on our end doesn't solve the problem.

## Solution: Adopt http-proxy Architecture

Based on research into proven tunneling solutions ([node-http-proxy](https://github.com/http-party/node-http-proxy), [localtunnel](https://github.com/localtunnel/server)), the standard pattern is:

**Don't parse WebSocket frames at all - pipe raw TCP sockets directly**.

### Architecture Change

**Current (Broken):**
```
Public Client
  → [ws library parses frames]
  → Tunnel Server
  → [relay raw bytes through tunnel WS]
  → CLI
  → [TCP connection]
  → Local Server
```

**Proposed (http-proxy pattern):**
```
Public Client
  → Tunnel Server [handle HTTP upgrade manually, NO ws library]
  → [pipe raw socket bytes through tunnel]
  → CLI [use http-proxy for WS upgrade]
  → Local Server
```

### Key Changes

1. **Tunnel Server**:
   - Handle HTTP WebSocket upgrade manually (no ws library)
   - After upgrade, pipe raw TCP socket bytes directly
   - No WebSocket frame parsing whatsoever

2. **CLI**:
   - Use http-proxy library to handle WebSocket proxying to local server
   - Proven, battle-tested code for WS upgrade and socket piping

## Technical Implementation

### 1. Tunnel Server Changes (`apps/tunnel-server/src/websocket-proxy.ts`)

Remove ws library usage for public client connections. Handle HTTP upgrade manually:

```typescript
import { createHash } from "crypto";

server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
  // Validate subdomain
  const subdomain = extractSubdomain(req.headers.host || "", baseDomain);

  //Find tunnel connection
  const connection = connectionManager.findBySubdomain(subdomain);

  // Perform WebSocket handshake manually
  const key = req.headers['sec-websocket-key'];
  const acceptKey = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
    '\r\n'
  );

  // Now socket is in WebSocket mode - pipe raw bytes through tunnel
  socket.on('data', (chunk: Buffer) => {
    const message: WebSocketDataMessage = {
      type: 'websocket_data',
      id: wsId,
      timestamp: Date.now(),
      payload: { data: chunk.toString('base64') }
    };
    connection.socket.send(JSON.stringify(message));
  });

  socket.on('close', () => {
    // Send close message through tunnel
  });
});
```

### 2. CLI Changes (`packages/cli/src/websocket-handler.ts`)

Use http-proxy to handle WebSocket connections to local server:

```typescript
import httpProxy from 'http-proxy';
import http from 'http';

class WebSocketHandler {
  private proxy: httpProxy;

  constructor() {
    this.proxy = httpProxy.createProxyServer({});
  }

  async handleOpen(message: WebSocketOpenMessage): Promise<void> {
    const { id, url, headers } = message.payload;

    // Create a mini HTTP server for this specific WS connection
    const server = http.createServer();

    server.on('upgrade', (req, socket, head) => {
      // Use http-proxy to proxy the WebSocket connection
      this.proxy.ws(req, socket, head, {
        target: `ws://localhost:${this.localPort}`
      });
    });

    // Trigger the upgrade
    server.emit('upgrade', /* construct upgrade request */, socket, Buffer.alloc(0));
  }
}
```

### 3. Message Format (No Changes)

Keep existing `WebSocketDataMessage` format for tunnel relay:

```typescript
interface WebSocketDataMessage {
  type: "websocket_data";
  id: string;
  timestamp: number;
  payload: {
    data: string; // Base64-encoded raw bytes
  };
}
```

## Benefits

1. **Proven Architecture**: Uses same pattern as node-http-proxy, localtunnel
2. **No Frame Parsing**: Eliminates RSV1 errors completely
3. **Battle-Tested Code**: http-proxy handles WS upgrade on CLI side
4. **Simpler**: Manual HTTP upgrade is straightforward, no ws library conflicts
5. **Performance**: No parsing overhead, direct byte piping

## Migration Path

1. Create new branch `feat/websocket-httpproxy-rewrite`
2. Implement tunnel server manual HTTP upgrade
3. Implement CLI http-proxy integration
4. Update integration tests
5. Test locally end-to-end
6. Deploy to production
7. Validate with production tests

## Success Criteria

- ✅ WebSocket connections work end-to-end
- ✅ No "RSV1 must be clear" errors
- ✅ Binary data transmitted correctly
- ✅ Large messages (1MB+) handled correctly
- ✅ All integration tests pass
- ✅ Production validation successful

## Open Questions

1. **Error Handling**: How to handle errors during manual HTTP upgrade?
2. **Keep-Alive**: Do we need WebSocket ping/pong frames?
3. **Backwards Compatibility**: Should we keep `websocket_frame` handler?

## References

- [node-http-proxy GitHub](https://github.com/http-party/node-http-proxy)
- [http-proxy WebSocket recipe](https://github.com/chimurai/http-proxy-middleware/blob/master/recipes/websocket.md)
- [WebSocket RFC 6455 - Opening Handshake](https://datatracker.ietf.org/doc/html/rfc6455#section-4)
- [httpxy - Modern TypeScript rewrite](https://github.com/unjs/httpxy)

## Timeline

- **Day 1**: Implement tunnel server manual HTTP upgrade
- **Day 1**: Implement CLI http-proxy integration
- **Day 2**: Update tests, local validation
- **Day 2**: Deploy to production, validate

## Risks

- **Low**: Manual HTTP upgrade is well-documented in WebSocket RFC
- **Low**: http-proxy is mature, battle-tested library
- **Medium**: Need to ensure all edge cases are handled (errors, timeouts, etc.)
