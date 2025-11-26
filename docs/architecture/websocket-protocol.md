# WebSocket Protocol Specification

## Overview

This document specifies the WebSocket protocol used between the LivePort CLI client and the tunnel server for establishing and maintaining HTTP tunnels.

## Connection

### Endpoint

```
wss://tunnel.liveport.dev/connect
```

### Headers

```http
Connection: Upgrade
Upgrade: websocket
Sec-WebSocket-Key: <base64-key>
Sec-WebSocket-Version: 13
X-Bridge-Key: lpk_xxxxxxxxxxxx
X-Local-Port: 3000
```

### Authentication

The connection is authenticated using the `X-Bridge-Key` header. The server validates the key before accepting the WebSocket upgrade.

## Message Format

All messages are JSON-encoded UTF-8 strings.

### Base Message Structure

```typescript
interface Message {
  type: MessageType;
  id?: string;         // Request ID for correlation
  timestamp: number;   // Unix timestamp in milliseconds
  payload?: unknown;   // Type-specific payload
}

type MessageType =
  // Connection lifecycle
  | "connected"
  | "error"
  | "disconnect"
  // Heartbeat
  | "heartbeat"
  | "heartbeat_ack"
  // HTTP proxying
  | "http_request"
  | "http_response";
```

## Message Types

### Connection Lifecycle

#### `connected` (Server → Client)

Sent by server after successful connection and subdomain assignment.

```typescript
interface ConnectedMessage {
  type: "connected";
  timestamp: number;
  payload: {
    tunnelId: string;      // UUID for this connection
    subdomain: string;     // Assigned subdomain
    url: string;           // Full public URL
    expiresAt: string;     // ISO 8601 timestamp (from key)
  };
}
```

**Example:**
```json
{
  "type": "connected",
  "timestamp": 1700000000000,
  "payload": {
    "tunnelId": "550e8400-e29b-41d4-a716-446655440000",
    "subdomain": "brave-panda-7f3a",
    "url": "https://brave-panda-7f3a.liveport.dev",
    "expiresAt": "2024-01-01T12:00:00Z"
  }
}
```

#### `error` (Server → Client)

Sent when an error occurs. May be followed by connection close.

```typescript
interface ErrorMessage {
  type: "error";
  timestamp: number;
  payload: {
    code: string;          // Error code
    message: string;       // Human-readable message
    fatal: boolean;        // If true, connection will close
    retryAfter?: number;   // Seconds to wait before retry
  };
}
```

**Error Codes:**

| Code | Description | Fatal | Close Code |
|------|-------------|-------|------------|
| `INVALID_KEY` | Key format invalid or not found | Yes | 4001 |
| `KEY_EXPIRED` | Key has expired | Yes | 4002 |
| `KEY_REVOKED` | Key has been revoked | Yes | 4003 |
| `PORT_NOT_ALLOWED` | Key doesn't allow this port | Yes | 4004 |
| `RATE_LIMITED` | Too many connections/requests | Yes | 4029 |
| `REQUEST_TIMEOUT` | Request to local server timed out | No | - |
| `REQUEST_ERROR` | Error forwarding request | No | - |
| `SERVER_ERROR` | Internal server error | Yes | 1011 |

**Example:**
```json
{
  "type": "error",
  "timestamp": 1700000000000,
  "payload": {
    "code": "KEY_EXPIRED",
    "message": "Bridge key has expired",
    "fatal": true
  }
}
```

#### `disconnect` (Bidirectional)

Sent by either party to initiate graceful disconnection.

```typescript
interface DisconnectMessage {
  type: "disconnect";
  timestamp: number;
  payload: {
    reason: string;        // Human-readable reason
  };
}
```

**Example:**
```json
{
  "type": "disconnect",
  "timestamp": 1700000000000,
  "payload": {
    "reason": "User initiated disconnect"
  }
}
```

### Heartbeat

#### `heartbeat` (Client → Server)

Sent by client every 10 seconds to maintain connection.

```typescript
interface HeartbeatMessage {
  type: "heartbeat";
  timestamp: number;
  payload: {
    requestCount: number;  // Total requests served this session
  };
}
```

**Example:**
```json
{
  "type": "heartbeat",
  "timestamp": 1700000000000,
  "payload": {
    "requestCount": 42
  }
}
```

#### `heartbeat_ack` (Server → Client)

Acknowledgment of heartbeat.

```typescript
interface HeartbeatAckMessage {
  type: "heartbeat_ack";
  timestamp: number;
}
```

**Example:**
```json
{
  "type": "heartbeat_ack",
  "timestamp": 1700000000001
}
```

### HTTP Proxying

#### `http_request` (Server → Client)

Sent when an HTTP request arrives at the tunnel subdomain.

```typescript
interface HttpRequestMessage {
  type: "http_request";
  id: string;              // Request ID for correlation
  timestamp: number;
  payload: {
    method: string;        // HTTP method
    path: string;          // Request path (includes query string)
    headers: Record<string, string>;
    body?: string;         // Base64-encoded body (if present)
  };
}
```

**Example:**
```json
{
  "type": "http_request",
  "id": "req_abc123",
  "timestamp": 1700000000000,
  "payload": {
    "method": "POST",
    "path": "/api/users?active=true",
    "headers": {
      "content-type": "application/json",
      "accept": "application/json",
      "x-request-id": "xyz789"
    },
    "body": "eyJuYW1lIjoiSm9obiJ9"
  }
}
```

**Header Handling:**
- `Host` header is rewritten to `localhost:{port}`
- `X-Forwarded-For` contains original client IP
- `X-Forwarded-Proto` is set to `https`
- `X-Forwarded-Host` contains original host

#### `http_response` (Client → Server)

Sent in response to an `http_request`.

```typescript
interface HttpResponseMessage {
  type: "http_response";
  id: string;              // Must match request ID
  timestamp: number;
  payload: {
    status: number;        // HTTP status code
    headers: Record<string, string>;
    body?: string;         // Base64-encoded body (if present)
  };
}
```

**Example:**
```json
{
  "type": "http_response",
  "id": "req_abc123",
  "timestamp": 1700000000100,
  "payload": {
    "status": 200,
    "headers": {
      "content-type": "application/json",
      "cache-control": "no-cache"
    },
    "body": "eyJpZCI6MSwibmFtZSI6IkpvaG4ifQ=="
  }
}
```

## Protocol Flow

### Connection Establishment

```
Client                                   Server
   │                                        │
   │ WS Upgrade + X-Bridge-Key + X-Port     │
   │───────────────────────────────────────►│
   │                                        │
   │                            Validate key│
   │                            Assign subdomain
   │                            Store connection
   │                                        │
   │◄───────────────────────────────────────│
   │ 101 Switching Protocols                │
   │                                        │
   │◄───────────────────────────────────────│
   │ { type: "connected", ... }             │
   │                                        │
   │ { type: "heartbeat", ... }             │
   │───────────────────────────────────────►│
   │                                        │
   │◄───────────────────────────────────────│
   │ { type: "heartbeat_ack", ... }         │
   │                                        │
```

### HTTP Request Handling

```
Browser              Server              Client              Local App
   │                    │                   │                    │
   │ GET /api/data      │                   │                    │
   │───────────────────►│                   │                    │
   │                    │                   │                    │
   │                    │ http_request      │                    │
   │                    │──────────────────►│                    │
   │                    │                   │                    │
   │                    │                   │ GET /api/data      │
   │                    │                   │───────────────────►│
   │                    │                   │                    │
   │                    │                   │◄───────────────────│
   │                    │                   │ 200 OK + JSON      │
   │                    │                   │                    │
   │                    │◄──────────────────│                    │
   │                    │ http_response     │                    │
   │                    │                   │                    │
   │◄───────────────────│                   │                    │
   │ 200 OK + JSON      │                   │                    │
   │                    │                   │                    │
```

### Graceful Disconnect

```
Client                                   Server
   │                                        │
   │ { type: "disconnect", ... }            │
   │───────────────────────────────────────►│
   │                                        │
   │                            Clean up    │
   │                            Remove tunnel
   │                                        │
   │◄───────────────────────────────────────│
   │ { type: "disconnect", ... }            │
   │                                        │
   │ WebSocket Close (1000)                 │
   │◄──────────────────────────────────────►│
   │                                        │
```

## Timeouts and Limits

| Parameter | Value | Description |
|-----------|-------|-------------|
| Connection timeout | 30s | Max time to establish connection |
| Request timeout | 30s | Max time for client to respond |
| Heartbeat interval | 10s | Time between heartbeats |
| Heartbeat timeout | 30s | Max time without heartbeat |
| Max message size | 10MB | Maximum WebSocket message size |
| Max pending requests | 100 | Max concurrent proxied requests |

## WebSocket Close Codes

| Code | Name | Description |
|------|------|-------------|
| 1000 | Normal | Clean close, no error |
| 1001 | Going Away | Server shutting down |
| 1002 | Protocol Error | Protocol violation |
| 1003 | Unsupported Data | Invalid message type |
| 1011 | Unexpected Condition | Server error |
| 4001 | Invalid Key | Key validation failed |
| 4002 | Key Expired | Bridge key expired |
| 4003 | Key Revoked | Bridge key revoked |
| 4004 | Port Not Allowed | Port not permitted by key |
| 4029 | Rate Limited | Rate limit exceeded |

## Security Considerations

### Transport Security
- All WebSocket connections MUST use `wss://` (TLS)
- The server validates the origin header
- Keys are never logged or stored in plaintext

### Message Validation
- All messages MUST be valid JSON
- Unknown message types are ignored with a warning
- Invalid messages result in connection close

### Request Isolation
- Each request has a unique ID
- Responses must match request IDs
- Requests time out independently

## Client Implementation Notes

### Reconnection Strategy

1. If disconnected unexpectedly, attempt reconnection
2. Use exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
3. Reset backoff on successful connection
4. After 5 failed attempts, prompt user
5. Don't reconnect on fatal errors (invalid key, expired, etc.)

### Request Handling

1. Receive `http_request` message
2. Forward to local server via HTTP
3. Capture response (status, headers, body)
4. Base64-encode body if present
5. Send `http_response` with matching ID
6. If local server unreachable, send error response

### Heartbeat Implementation

1. Start heartbeat timer after receiving `connected`
2. Send `heartbeat` every 10 seconds
3. If no `heartbeat_ack` within 5 seconds, log warning
4. If connection seems dead, attempt reconnection

## Server Implementation Notes

### Connection Management

1. Validate key before accepting upgrade
2. Generate unique subdomain
3. Store connection in memory
4. Start heartbeat monitoring
5. Clean up on disconnect

### Request Routing

1. Extract subdomain from Host header
2. Look up connection in memory
3. If not found, return 502 Bad Gateway
4. Generate unique request ID
5. Send `http_request` message
6. Wait for `http_response` (with timeout)
7. Return response to HTTP client

### Resource Cleanup

1. On disconnect, remove from memory
2. Release subdomain reservation
3. Update database record
4. Log connection duration and request count
