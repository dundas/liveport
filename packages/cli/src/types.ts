/**
 * CLI Types
 *
 * Types for the LivePort CLI client.
 */

// Message types for WebSocket protocol (mirrored from tunnel-server)
export type MessageType =
  | "connected"
  | "error"
  | "disconnect"
  | "heartbeat"
  | "heartbeat_ack"
  | "http_request"
  | "http_response"
  | "websocket_upgrade"
  | "websocket_upgrade_response"
  | "websocket_frame"
  | "websocket_close"
  | "websocket_data";

export interface BaseMessage {
  type: MessageType;
  id?: string;
  timestamp: number;
  payload?: unknown;
}

export interface ConnectedPayload {
  tunnelId: string;
  subdomain: string;
  url: string;
  expiresAt: string;
}

export interface ConnectedMessage extends BaseMessage {
  type: "connected";
  payload: ConnectedPayload;
}

export interface ErrorPayload {
  code: string;
  message: string;
  fatal: boolean;
  retryAfter?: number;
}

export interface ErrorMessage extends BaseMessage {
  type: "error";
  payload: ErrorPayload;
}

export interface DisconnectPayload {
  reason: string;
}

export interface DisconnectMessage extends BaseMessage {
  type: "disconnect";
  payload: DisconnectPayload;
}

export interface HeartbeatPayload {
  requestCount: number;
}

export interface HeartbeatMessage extends BaseMessage {
  type: "heartbeat";
  payload: HeartbeatPayload;
}

export interface HeartbeatAckMessage extends BaseMessage {
  type: "heartbeat_ack";
}

export interface HttpRequestPayload {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string; // Base64 encoded
}

export interface HttpRequestMessage extends BaseMessage {
  type: "http_request";
  id: string;
  payload: HttpRequestPayload;
}

export interface HttpResponsePayload {
  status: number;
  headers: Record<string, string>;
  body?: string; // Base64 encoded
}

export interface HttpResponseMessage extends BaseMessage {
  type: "http_response";
  id: string;
  payload: HttpResponsePayload;
}

// WebSocket message types
export interface WebSocketUpgradePayload {
  path: string;
  headers: Record<string, string>;
  subprotocol?: string;
}

export interface WebSocketUpgradeMessage extends BaseMessage {
  type: "websocket_upgrade";
  id: string;
  payload: WebSocketUpgradePayload;
}

export interface WebSocketUpgradeResponsePayload {
  accepted: boolean;
  statusCode: number;
  headers?: Record<string, string>;
  reason?: string;
}

export interface WebSocketUpgradeResponseMessage extends BaseMessage {
  type: "websocket_upgrade_response";
  id: string;
  payload: WebSocketUpgradeResponsePayload;
}

export interface WebSocketFramePayload {
  opcode: number; // 1=text, 2=binary, 9=ping, 10=pong
  data: string; // Plain text for opcode 1, base64 for others
  final: boolean;
}

export interface WebSocketFrameMessage extends BaseMessage {
  type: "websocket_frame";
  id: string;
  direction: "client_to_server" | "server_to_client";
  payload: WebSocketFramePayload;
}

export interface WebSocketClosePayload {
  code: number;
  reason: string;
  initiator: "client" | "server" | "tunnel";
}

export interface WebSocketCloseMessage extends BaseMessage {
  type: "websocket_close";
  id: string;
  payload: WebSocketClosePayload;
}

/**
 * WebSocket raw byte data relay
 *
 * This message type is used for raw byte piping instead of frame parsing.
 * It replaces the frame-based approach to preserve WebSocket frame metadata
 * (RSV bits, masking keys, extension-specific data, frame boundaries).
 *
 * The data field contains base64-encoded raw TCP bytes from the underlying
 * socket connection, allowing transparent relay of all WebSocket protocol
 * frames including text, binary, ping, pong, and close frames.
 */
export interface WebSocketDataPayload {
  data: string; // Base64-encoded WebSocket message content
  binary?: boolean; // Whether the message is binary (default: false for text)
}

export interface WebSocketDataMessage extends BaseMessage {
  type: "websocket_data";
  id: string;
  payload: WebSocketDataPayload;
}

export type Message =
  | ConnectedMessage
  | ErrorMessage
  | DisconnectMessage
  | HeartbeatMessage
  | HeartbeatAckMessage
  | HttpRequestMessage
  | HttpResponseMessage
  | WebSocketUpgradeMessage
  | WebSocketUpgradeResponseMessage
  | WebSocketFrameMessage
  | WebSocketCloseMessage
  | WebSocketDataMessage;

// Connection state
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

// Tunnel client configuration
export interface TunnelClientConfig {
  serverUrl: string;
  bridgeKey: string;
  localPort: number;
  tunnelName?: string;
  ttlSeconds?: number;
  heartbeatInterval?: number;
  reconnectMaxAttempts?: number;
  reconnectBaseDelay?: number;
}

// Tunnel info returned after connection
export interface TunnelInfo {
  tunnelId: string;
  subdomain: string;
  url: string;
  localPort: number;
  expiresAt: Date;
}

// Event types for tunnel client
export interface TunnelClientEvents {
  connected: (info: TunnelInfo) => void;
  disconnected: (reason: string) => void;
  reconnecting: (attempt: number, maxAttempts: number) => void;
  error: (error: Error) => void;
  request: (method: string, path: string) => void;
}

// Connect options
export interface ConnectOptions {
  key?: string;
  server?: string;
  region?: string;
  name?: string;
  ttl?: string;
}

// Share options
export interface ShareOptions {
  key?: string;
  server?: string;
  ttl?: string;
  maxUses?: number;
}
