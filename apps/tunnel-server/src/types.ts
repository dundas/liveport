/**
 * Tunnel Server Types
 */

import type { WebSocket } from "ws";

// Message types for WebSocket protocol
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
  expiresAt: string | null;
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

// WebSocket Proxying Messages

/**
 * WebSocket upgrade request from tunnel server to CLI
 */
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

/**
 * WebSocket upgrade response from CLI to tunnel server
 */
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

/**
 * WebSocket frame relayed through tunnel
 *
 * Opcode values:
 * - 1: text frame
 * - 2: binary frame
 * - 8: close frame
 * - 9: ping frame
 * - 10: pong frame
 */
export interface WebSocketFramePayload {
  opcode: number;
  data: string; // Base64-encoded for binary, plain for text
  final: boolean;
  closeCode?: number; // Only for opcode 8 (close)
  closeReason?: string; // Only for opcode 8 (close)
}

export interface WebSocketFrameMessage extends BaseMessage {
  type: "websocket_frame";
  id: string;
  direction: "client_to_server" | "server_to_client";
  payload: WebSocketFramePayload;
}

/**
 * WebSocket connection closed
 */
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
  | "connecting"
  | "validating"
  | "active"
  | "closing"
  | "closed"
  | "failed"
  | "rejected"
  | "timeout";

// Tunnel connection
export interface TunnelConnection {
  id: string;
  subdomain: string;
  name?: string; // Optional custom tunnel name
  keyId: string;
  userId: string;
  localPort: number;
  socket: WebSocket;
  state: ConnectionState;
  createdAt: Date;
  lastHeartbeat: Date;
  requestCount: number;
  bytesTransferred: number; // Track total bytes for metering
  expiresAt: Date | null; // null means never expires
}

// Proxied WebSocket connection
export interface ProxiedWebSocket {
  id: string;
  subdomain: string;
  publicSocket: WebSocket; // The public-facing WebSocket connection
  createdAt: Date;
  frameCount: number;
  bytesTransferred: number;
}

// Pending request resolver
export interface PendingRequest {
  resolve: (response: HttpResponsePayload) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// Server configuration
export interface TunnelServerConfig {
  port: number;
  host: string;
  baseDomain: string;
  connectionTimeout: number;
  requestTimeout: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  maxConnectionsPerKey: number;
  maxRequestsPerMinute: number;
  maxRequestSize: number;
  reservedSubdomains: string[];
}

// WebSocket connection limits
export const MAX_WEBSOCKETS_PER_TUNNEL = 100;
export const MAX_FRAME_SIZE = 10 * 1024 * 1024; // 10MB

// Error codes
export const ErrorCodes = {
  INVALID_KEY: "INVALID_KEY",
  KEY_EXPIRED: "KEY_EXPIRED",
  KEY_REVOKED: "KEY_REVOKED",
  PORT_NOT_ALLOWED: "PORT_NOT_ALLOWED",
  RATE_LIMITED: "RATE_LIMITED",
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  REQUEST_ERROR: "REQUEST_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// WebSocket close codes
export const CloseCodes = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  UNEXPECTED_CONDITION: 1011,
  INVALID_KEY: 4001,
  KEY_EXPIRED: 4002,
  KEY_REVOKED: 4003,
  PORT_NOT_ALLOWED: 4004,
  RATE_LIMITED: 4029,
} as const;

export type CloseCode = (typeof CloseCodes)[keyof typeof CloseCodes];
