# WebSocket Tunneling Guide

## Overview

LivePort supports **bidirectional WebSocket connections** through your tunnels. When a client makes a WebSocket upgrade request to your tunnel URL, LivePort automatically detects it and establishes a WebSocket connection to your local server, relaying frames in both directions.

## How It Works

```
Public Client    →    Tunnel Server    →    CLI Client    →    Local Server
    |                      |                     |                   |
    |  HTTP Upgrade        |                     |                   |
    |-------------------→  |                     |                   |
    |                      |  websocket_upgrade  |                   |
    |                      |------------------→  |                   |
    |                      |                     |  WS Connect       |
    |                      |                     |----------------→  |
    |                      |                     |                   |
    |                      |  upgrade_response   |  WS Open          |
    |                      | ←-------------------|  ←--------------- |
    |  101 Switching       |                     |                   |
    | ←--------------------|                     |                   |
    |                      |                     |                   |
    |  WebSocket Frames    |  WebSocket Frames   |  WebSocket Frames |
    | ←-------------------→| ←----------------→  | ←---------------→ |
```

### Message Flow

1. **Upgrade Request**: Public client sends HTTP Upgrade request with `Connection: Upgrade` and `Upgrade: websocket` headers
2. **Detection**: Tunnel server detects WebSocket upgrade and creates a proxy connection
3. **CLI Relay**: Server sends `websocket_upgrade` message to CLI with path, headers, and subprotocol
4. **Local Connection**: CLI connects to `ws://localhost:PORT/path` with forwarded headers
5. **Response**: CLI sends `websocket_upgrade_response` back to server (accepted or rejected)
6. **Frame Relay**: Once established, all frames (text, binary, ping, pong, close) are relayed bidirectionally

## Supported Features

### Frame Types

LivePort supports all standard WebSocket frame types:

- **Text frames** (opcode 1): UTF-8 text messages
- **Binary frames** (opcode 2): Raw binary data (automatically base64 encoded during transit)
- **Ping frames** (opcode 9): Connection keep-alive
- **Pong frames** (opcode 10): Ping responses
- **Close frames** (opcode 8): Graceful connection termination

### Resource Limits

To ensure fair usage and prevent abuse:

- **Maximum connections**: 100 concurrent WebSocket connections per tunnel
- **Maximum frame size**: 10MB per frame
- **No timeout**: Connections can stay open indefinitely (until close frame or network error)

Exceeding these limits will result in:
- Connection refused (429 error) if 100 connections already active
- Connection closed with code 1009 ("Message too big") if frame exceeds 10MB

## Usage Examples

### 1. Simple Echo Server

**Local Server** (`server.js`):

```javascript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3000 });

wss.on('connection', (ws, req) => {
  console.log(`New connection from ${req.socket.remoteAddress}`);

  ws.on('message', (data, isBinary) => {
    console.log(`Received ${isBinary ? 'binary' : 'text'}: ${data}`);
    // Echo back
    ws.send(data, { binary: isBinary });
  });

  ws.on('close', (code, reason) => {
    console.log(`Connection closed: ${code} ${reason}`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

console.log('WebSocket server listening on port 3000');
```

**Start Tunnel**:

```bash
# Terminal 1: Start local server
node server.js

# Terminal 2: Create tunnel
liveport connect 3000 --key lpk_your_key
# → https://abc123.liveport.dev
```

**Test Client** (`client.js`):

```javascript
import WebSocket from 'ws';

const ws = new WebSocket('wss://abc123.liveport.dev');

ws.on('open', () => {
  console.log('Connected!');
  ws.send('Hello, LivePort!');
});

ws.on('message', (data) => {
  console.log('Echo:', data.toString());
  ws.close();
});

ws.on('close', () => {
  console.log('Disconnected');
});
```

### 2. Chat Application

**Chat Server** (`chat-server.js`):

```javascript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3000 });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`Client connected. Total: ${clients.size}`);

  ws.on('message', (data) => {
    const message = data.toString();
    console.log('Broadcasting:', message);

    // Broadcast to all clients
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Client disconnected. Total: ${clients.size}`);
  });
});

console.log('Chat server running on port 3000');
```

**Chat Client** (Browser):

```html
<!DOCTYPE html>
<html>
<head>
  <title>LivePort Chat</title>
</head>
<body>
  <div id="messages"></div>
  <input id="input" type="text" placeholder="Type a message..." />
  <button id="send">Send</button>

  <script>
    const ws = new WebSocket('wss://abc123.liveport.dev');
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const send = document.getElementById('send');

    ws.onopen = () => {
      console.log('Connected to chat!');
    };

    ws.onmessage = (event) => {
      const div = document.createElement('div');
      div.textContent = event.data;
      messages.appendChild(div);
    };

    send.onclick = () => {
      if (input.value) {
        ws.send(input.value);
        input.value = '';
      }
    };

    input.onkeypress = (e) => {
      if (e.key === 'Enter') send.click();
    };
  </script>
</body>
</html>
```

### 3. Playwright Testing

Test WebSocket functionality in your application using Playwright:

```typescript
import { test, expect } from '@playwright/test';
import { LivePortAgent } from '@liveport/agent-sdk';

test.describe('WebSocket Features', () => {
  let tunnel;

  test.beforeAll(async () => {
    const agent = new LivePortAgent({
      key: process.env.LIVEPORT_BRIDGE_KEY!,
    });

    // Wait for developer to start tunnel
    tunnel = await agent.waitForTunnel({ timeout: 30000 });
    console.log(`Testing at: ${tunnel.url}`);
  });

  test('should establish WebSocket connection', async ({ page }) => {
    // Navigate to your app
    await page.goto(tunnel.url);

    // Listen for WebSocket events
    const wsMessages = [];
    page.on('websocket', (ws) => {
      console.log('WebSocket opened:', ws.url());

      ws.on('framesent', (event) => {
        console.log('→ Sent:', event.payload);
      });

      ws.on('framereceived', (event) => {
        console.log('← Received:', event.payload);
        wsMessages.push(event.payload);
      });
    });

    // Trigger WebSocket connection in your app
    await page.click('#connect-button');

    // Wait for message
    await page.waitForFunction(
      () => document.querySelector('#status')?.textContent === 'Connected'
    );

    // Verify WebSocket communication
    await page.fill('#message-input', 'Test message');
    await page.click('#send-button');

    // Check received message
    await expect(page.locator('#messages')).toContainText('Test message');
  });

  test('should handle WebSocket disconnection', async ({ page }) => {
    await page.goto(tunnel.url);

    // Connect
    await page.click('#connect-button');
    await page.waitForSelector('#status:has-text("Connected")');

    // Disconnect
    await page.click('#disconnect-button');
    await page.waitForSelector('#status:has-text("Disconnected")');
  });
});
```

### 4. Binary Data Transfer

**Binary Server** (`binary-server.js`):

```javascript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3000 });

wss.on('connection', (ws) => {
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      console.log(`Received ${data.length} bytes of binary data`);

      // Process binary data (e.g., image, file)
      const buffer = Buffer.from(data);

      // Send binary response
      ws.send(buffer, { binary: true });
    }
  });
});
```

**Binary Client**:

```javascript
import WebSocket from 'ws';
import fs from 'fs';

const ws = new WebSocket('wss://abc123.liveport.dev');

ws.on('open', () => {
  // Send binary file
  const imageData = fs.readFileSync('./image.png');
  ws.send(imageData, { binary: true });
});

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    console.log(`Received ${data.length} bytes`);
    fs.writeFileSync('./received.png', data);
  }
});
```

## Monitoring

### CLI Output

The LivePort CLI displays WebSocket connection events:

```bash
$ liveport connect 3000 --key lpk_xxx

✓ Connected to tunnel server
✓ Tunnel created: https://abc123.liveport.dev

[WebSocket] Client connected: ws-fj8dk2
[WebSocket] Frame received: text, 14 bytes
[WebSocket] Frame sent: text, 14 bytes
[WebSocket] Client disconnected: ws-fj8dk2 (code: 1000, reason: Normal closure)
```

### Dashboard

Monitor active WebSocket connections in the LivePort dashboard:

- **Connection count**: See how many WebSocket connections are active on each tunnel
- **Connection details**: View connection IDs, duration, and frame counts
- **Resource usage**: Track total bytes transferred

*(Dashboard UI for WebSocket metrics coming soon)*

## Troubleshooting

### Connection Refused (HTTP 429)

**Error**: `WebSocket connection failed: HTTP 429 Too Many Requests`

**Cause**: You have reached the maximum of 100 concurrent WebSocket connections per tunnel.

**Solution**:
- Close unused connections
- Create multiple tunnels if you need more connections
- Check for connection leaks in your application

### Message Too Big (Code 1009)

**Error**: `WebSocket closed with code 1009: Message too big`

**Cause**: You sent a frame larger than 10MB.

**Solution**:
- Split large messages into smaller chunks
- Compress data before sending
- Use HTTP endpoints for large file transfers

### Connection Timeout

**Error**: `WebSocket connection timeout`

**Cause**: The local WebSocket server took too long to accept the connection (>5 seconds).

**Solution**:
- Ensure your local server is running
- Check that the port number is correct
- Look for errors in your server logs

### Upgrade Failed (HTTP 502)

**Error**: `WebSocket upgrade failed: HTTP 502 Bad Gateway`

**Cause**: The CLI couldn't connect to your local WebSocket server.

**Solution**:
- Verify your local server is listening on the correct port
- Check that your server supports WebSocket upgrades
- Ensure no firewall is blocking localhost connections

### Frames Not Relaying

**Symptoms**: Connection establishes but messages don't arrive

**Debugging**:

1. **Check server logs**: Verify your server is receiving/sending frames
2. **Enable debug mode**: Set `DEBUG=liveport:*` environment variable
3. **Test locally**: Connect directly to `ws://localhost:PORT` to rule out tunnel issues
4. **Check frame type**: Ensure you're sending/receiving the correct frame type (text vs binary)

### High Latency

**Symptoms**: Messages take several seconds to arrive

**Causes**:
- Geographic distance to tunnel server
- Network congestion
- Large frame sizes

**Optimizations**:
- Use smaller, more frequent frames instead of large batches
- Enable WebSocket compression (if supported by your library)
- Consider using UDP-based protocols for real-time applications

## Best Practices

### 1. Connection Management

```javascript
// Good: Reuse connections
const ws = new WebSocket('wss://abc123.liveport.dev');
ws.on('open', () => {
  // Send multiple messages over one connection
  ws.send('message 1');
  ws.send('message 2');
  ws.send('message 3');
});

// Bad: Creating new connections for each message
function sendMessage(msg) {
  const ws = new WebSocket('wss://abc123.liveport.dev');
  ws.on('open', () => ws.send(msg));
  ws.on('message', () => ws.close());
}
```

### 2. Error Handling

```javascript
const ws = new WebSocket('wss://abc123.liveport.dev');

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
  // Implement reconnection logic
  setTimeout(() => reconnect(), 1000);
});

ws.on('close', (code, reason) => {
  console.log(`Closed: ${code} - ${reason}`);
  if (code === 1006) {
    // Abnormal closure - retry
    reconnect();
  }
});
```

### 3. Heartbeat / Keep-Alive

```javascript
// Send ping frames to keep connection alive
const ws = new WebSocket('wss://abc123.liveport.dev');
let pingInterval;

ws.on('open', () => {
  pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000); // Every 30 seconds
});

ws.on('pong', () => {
  console.log('Pong received - connection alive');
});

ws.on('close', () => {
  clearInterval(pingInterval);
});
```

### 4. Graceful Shutdown

```javascript
// Server-side graceful shutdown
const wss = new WebSocketServer({ port: 3000 });

process.on('SIGTERM', () => {
  console.log('Shutting down...');

  // Close all connections gracefully
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });

  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});
```

## API Reference

### WebSocket Message Types

The tunnel server and CLI communicate using these message types:

#### `websocket_upgrade`

Sent from server to CLI when a WebSocket upgrade is requested.

```typescript
interface WebSocketUpgradeMessage {
  type: "websocket_upgrade";
  id: string;  // Unique connection ID
  timestamp: number;
  payload: {
    path: string;  // Request path (e.g., "/chat")
    headers: Record<string, string>;  // HTTP headers
    subprotocol?: string;  // Requested subprotocol
  };
}
```

#### `websocket_upgrade_response`

Sent from CLI to server with the result of the upgrade attempt.

```typescript
interface WebSocketUpgradeResponseMessage {
  type: "websocket_upgrade_response";
  id: string;  // Matches upgrade message ID
  timestamp: number;
  payload: {
    accepted: boolean;
    statusCode: number;  // 101 if accepted, 502 if failed
    headers?: Record<string, string>;
    reason?: string;  // Error reason if not accepted
  };
}
```

#### `websocket_frame`

Relays WebSocket frames in both directions.

```typescript
interface WebSocketFrameMessage {
  type: "websocket_frame";
  id: string;  // Connection ID
  direction: "client_to_server" | "server_to_client";
  timestamp: number;
  payload: {
    opcode: number;  // 1=text, 2=binary, 9=ping, 10=pong
    data: string;    // Plain text for opcode 1, base64 for others
    final: boolean;  // FIN bit
  };
}
```

#### `websocket_close`

Sent when a WebSocket connection is closed.

```typescript
interface WebSocketCloseMessage {
  type: "websocket_close";
  id: string;  // Connection ID
  timestamp: number;
  payload: {
    code: number;       // Close code (1000 = normal)
    reason: string;     // Close reason
    initiator: "client" | "server" | "error";
  };
}
```

## Security Considerations

### 1. Authentication

WebSocket connections through LivePort tunnels inherit the same authentication as HTTP requests - they're protected by your bridge key. However, you should still implement your own authentication:

```javascript
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');

  if (!isValidToken(token)) {
    ws.close(1008, 'Invalid authentication');
    return;
  }

  // Proceed with authenticated connection
});
```

### 2. Rate Limiting

Implement rate limiting to prevent abuse:

```javascript
const connectionCounts = new Map();

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  const count = connectionCounts.get(ip) || 0;

  if (count >= 10) {
    ws.close(1008, 'Too many connections');
    return;
  }

  connectionCounts.set(ip, count + 1);

  ws.on('close', () => {
    connectionCounts.set(ip, connectionCounts.get(ip) - 1);
  });
});
```

### 3. Input Validation

Always validate and sanitize incoming messages:

```javascript
ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());

    if (!isValidMessage(message)) {
      ws.close(1003, 'Invalid message format');
      return;
    }

    // Process valid message
  } catch (err) {
    ws.close(1003, 'Invalid JSON');
  }
});
```

## Performance Tips

### 1. Message Batching

Send multiple updates in a single frame:

```javascript
// Good: Batch updates
const updates = [update1, update2, update3];
ws.send(JSON.stringify(updates));

// Bad: Send individually
updates.forEach(update => ws.send(JSON.stringify(update)));
```

### 2. Compression

Use per-message compression for large payloads:

```javascript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({
  port: 3000,
  perMessageDeflate: {
    zlibDeflateOptions: {
      level: 6,  // Compression level (0-9)
    },
  },
});
```

### 3. Connection Pooling

Reuse connections and limit concurrent connections:

```javascript
class WebSocketPool {
  constructor(maxConnections = 5) {
    this.maxConnections = maxConnections;
    this.connections = [];
  }

  getConnection() {
    // Return existing idle connection or create new one
    const idle = this.connections.find(c => c.readyState === WebSocket.OPEN && !c.inUse);
    if (idle) {
      idle.inUse = true;
      return idle;
    }

    if (this.connections.length < this.maxConnections) {
      const ws = new WebSocket('wss://abc123.liveport.dev');
      ws.inUse = true;
      this.connections.push(ws);
      return ws;
    }

    throw new Error('Connection pool exhausted');
  }

  releaseConnection(ws) {
    ws.inUse = false;
  }
}
```

## Additional Resources

- [WebSocket Protocol (RFC 6455)](https://tools.ietf.org/html/rfc6455)
- [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [ws Library Documentation](https://github.com/websockets/ws)
- [LivePort Architecture Docs](./architecture/websocket-protocol.md)

## Need Help?

- **Documentation**: Check [README.md](../README.md) and [docs/](.)
- **Issues**: Report bugs at [GitHub Issues](https://github.com/dundas/liveport/issues)
- **Examples**: See [examples/](../examples/) for more code samples
