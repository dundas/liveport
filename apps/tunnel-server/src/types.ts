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
  | "http_response";

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

export type Message =
  | ConnectedMessage
  | ErrorMessage
  | DisconnectMessage
  | HeartbeatMessage
  | HeartbeatAckMessage
  | HttpRequestMessage
  | HttpResponseMessage;

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
  keyId: string;
  userId: string;
  localPort: number;
  socket: WebSocket;
  state: ConnectionState;
  createdAt: Date;
  lastHeartbeat: Date;
  requestCount: number;
  bytesTransferred: number; // Track total bytes for metering
  expiresAt: Date;
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
  UNEXPECTED_CONDITION: 1011,
  INVALID_KEY: 4001,
  KEY_EXPIRED: 4002,
  KEY_REVOKED: 4003,
  PORT_NOT_ALLOWED: 4004,
  RATE_LIMITED: 4029,
} as const;

export type CloseCode = (typeof CloseCodes)[keyof typeof CloseCodes];
