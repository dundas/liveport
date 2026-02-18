/**
 * WebSocket Handler Tests
 *
 * Unit tests for CLI WebSocket handler - WebSocket connection handling and message relay.
 * The implementation uses the 'ws' library, so we mock that module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { WebSocketHandler } from "./websocket-handler";
import type {
  WebSocketUpgradeMessage,
  WebSocketDataMessage,
  WebSocketCloseMessage,
} from "./types";

// Use vi.hoisted so MockWebSocket is available before vi.mock is hoisted
const { MockWebSocket } = vi.hoisted(() => {
  const { EventEmitter } = require("events");

  class MockWebSocket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = 1; // OPEN
    url: string;
    protocol: string;

    send = vi.fn();
    close = vi.fn();
    terminate = vi.fn();
    ping = vi.fn();
    pong = vi.fn();

    constructor(url: string, protocols?: string | string[], options?: any) {
      super();
      this.url = url;
      this.protocol = "";
      // Store construction args for assertion
      MockWebSocket._lastConstructorArgs = { url, protocols, options };
      MockWebSocket._instances.push(this);
    }

    // Track instances for multi-connection tests
    static _instances: MockWebSocket[] = [];
    static _lastConstructorArgs: {
      url: string;
      protocols?: string | string[];
      options?: any;
    } | null = null;

    static resetTracking() {
      MockWebSocket._instances = [];
      MockWebSocket._lastConstructorArgs = null;
    }
  }

  return { MockWebSocket };
});

// Mock the 'ws' module so WebSocketHandler gets our MockWebSocket
vi.mock("ws", () => {
  return {
    default: MockWebSocket,
    WebSocket: MockWebSocket,
  };
});

describe("WebSocket Handler - WebSocket Connection and Message Relay", () => {
  let handler: WebSocketHandler;
  let sendToTunnel: ReturnType<typeof vi.fn>;
  let mockWs: MockWebSocket;

  /**
   * Helper: create handler.handleUpgrade(...) and have the mock emit "open"
   * so the connection is established. Returns the MockWebSocket instance.
   */
  async function establishConnection(
    id: string,
    path = "/ws",
    headers: Record<string, string> = {},
    subprotocol?: string
  ): Promise<MockWebSocket> {
    const upgradeMessage: WebSocketUpgradeMessage = {
      type: "websocket_upgrade",
      id,
      timestamp: Date.now(),
      payload: { path, headers, subprotocol },
    };

    const promise = handler.handleUpgrade(upgradeMessage);

    // The constructor was called synchronously; grab the instance
    const ws = MockWebSocket._instances[MockWebSocket._instances.length - 1];

    // Emit "open" in next tick so the handler's promise resolves
    setImmediate(() => ws.emit("open"));

    await promise;
    return ws;
  }

  beforeEach(() => {
    MockWebSocket.resetTracking();
    sendToTunnel = vi.fn();
    handler = new WebSocketHandler(sendToTunnel, 3000);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("WebSocket Connection Creation", () => {
    it("should create WebSocket connection with correct URL and port", async () => {
      const upgradeMessage: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "test-ws-123",
        timestamp: Date.now(),
        payload: {
          path: "/ws",
          headers: {},
        },
      };

      const promise = handler.handleUpgrade(upgradeMessage);
      const ws = MockWebSocket._instances[0];
      setImmediate(() => ws.emit("open"));
      await promise;

      expect(ws.url).toBe("ws://localhost:3000/ws");
    });

    it("should wait for connection establishment", async () => {
      const upgradeMessage: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "test-ws-456",
        timestamp: Date.now(),
        payload: {
          path: "/ws",
          headers: {},
        },
      };

      const promise = handler.handleUpgrade(upgradeMessage);
      const ws = MockWebSocket._instances[0];

      // Delay the "open" event to verify waiting behavior
      setTimeout(() => ws.emit("open"), 100);

      const start = Date.now();
      await promise;
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some margin
    });

    it("should handle connection errors", async () => {
      const upgradeMessage: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "test-ws-error",
        timestamp: Date.now(),
        payload: {
          path: "/ws",
          headers: {},
        },
      };

      const promise = handler.handleUpgrade(upgradeMessage);
      const ws = MockWebSocket._instances[0];

      // Emit error in next tick
      setImmediate(() => ws.emit("error", new Error("ECONNREFUSED")));

      await promise;

      // Should send error response
      expect(sendToTunnel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "websocket_upgrade_response",
          payload: expect.objectContaining({
            accepted: false,
            statusCode: 502,
            reason: expect.stringContaining("ECONNREFUSED"),
          }),
        })
      );
    });
  });

  describe("WebSocket Construction Options", () => {
    it("should connect to the correct path", async () => {
      await establishConnection("test-ws-path", "/socket");

      expect(MockWebSocket._lastConstructorArgs!.url).toBe("ws://localhost:3000/socket");
    });

    it("should pass custom headers (excluding protocol headers)", async () => {
      await establishConnection("test-ws-headers", "/ws", {
        "X-Custom-Header": "custom-value",
        "Authorization": "Bearer token123",
      });

      const opts = MockWebSocket._lastConstructorArgs!.options;
      expect(opts.headers["X-Custom-Header"]).toBe("custom-value");
      expect(opts.headers["Authorization"]).toBe("Bearer token123");
    });

    it("should skip protocol headers from custom headers", async () => {
      await establishConnection("test-ws-skip-headers", "/ws", {
        "Host": "should-be-ignored",
        "Upgrade": "should-be-ignored",
        "Connection": "should-be-ignored",
        "Sec-WebSocket-Key": "should-be-ignored",
        "X-Custom": "should-be-included",
      });

      const opts = MockWebSocket._lastConstructorArgs!.options;
      expect(opts.headers["X-Custom"]).toBe("should-be-included");
      // Protocol headers should have been filtered out
      expect(opts.headers["Host"]).toBeUndefined();
      expect(opts.headers["Upgrade"]).toBeUndefined();
      expect(opts.headers["Connection"]).toBeUndefined();
      expect(opts.headers["Sec-WebSocket-Key"]).toBeUndefined();
    });

    it("should include subprotocol if specified", async () => {
      await establishConnection("test-ws-subprotocol", "/ws", {}, "chat");

      const args = MockWebSocket._lastConstructorArgs!;
      expect(args.protocols).toEqual(["chat"]);
    });

    it("should disable per-message deflate", async () => {
      await establishConnection("test-ws-deflate", "/ws");

      const opts = MockWebSocket._lastConstructorArgs!.options;
      expect(opts.perMessageDeflate).toBe(false);
    });
  });

  describe("Upgrade Response", () => {
    it("should send success response on successful connection", async () => {
      await establishConnection("test-ws-101");

      expect(sendToTunnel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "websocket_upgrade_response",
          payload: expect.objectContaining({
            accepted: true,
            statusCode: 101,
          }),
        })
      );
    });

    it("should send error response on connection failure", async () => {
      const upgradeMessage: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "test-ws-fail",
        timestamp: Date.now(),
        payload: {
          path: "/ws",
          headers: {},
        },
      };

      const promise = handler.handleUpgrade(upgradeMessage);
      const ws = MockWebSocket._instances[0];
      setImmediate(() => ws.emit("error", new Error("Connection refused")));
      await promise;

      expect(sendToTunnel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "websocket_upgrade_response",
          payload: expect.objectContaining({
            accepted: false,
            statusCode: 502,
            reason: expect.stringContaining("Connection refused"),
          }),
        })
      );
    });
  });

  describe("Message Relay - Local to Tunnel", () => {
    let ws: MockWebSocket;

    beforeEach(async () => {
      ws = await establishConnection("test-ws-relay");
      // Clear sendToTunnel calls from setup
      sendToTunnel.mockClear();
    });

    it("should relay messages from local server as WebSocketDataMessage", () => {
      const testData = Buffer.from("Hello from local server!");
      // The ws library emits "message" with (data, isBinary)
      ws.emit("message", testData, false);

      expect(sendToTunnel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "websocket_data",
          id: "test-ws-relay",
          payload: expect.objectContaining({
            data: testData.toString("base64"),
          }),
        })
      );
    });

    it("should encode message data as base64", () => {
      const binaryData = Buffer.from([0x01, 0x02, 0x03, 0xff, 0xfe]);
      ws.emit("message", binaryData, true);

      const call = sendToTunnel.mock.calls[0][0] as WebSocketDataMessage;
      expect(call.payload.data).toBe(binaryData.toString("base64"));

      // Verify roundtrip
      const decoded = Buffer.from(call.payload.data, "base64");
      expect(decoded).toEqual(binaryData);
    });

    it("should enforce chunk size limit (10MB)", () => {
      const MAX_FRAME_SIZE = 10 * 1024 * 1024;
      const oversizedChunk = Buffer.alloc(MAX_FRAME_SIZE + 1, "a");

      ws.emit("message", oversizedChunk, true);

      // Should not send message
      expect(sendToTunnel).not.toHaveBeenCalled();

      // Should terminate WebSocket
      expect(ws.terminate).toHaveBeenCalled();

      // Connection should be cleaned up
      expect(handler.getConnectionCount()).toBe(0);
    });

    it("should accept chunk at size limit", () => {
      const MAX_FRAME_SIZE = 10 * 1024 * 1024;
      const maxChunk = Buffer.alloc(MAX_FRAME_SIZE, "a");

      ws.emit("message", maxChunk, true);

      // Should send message
      expect(sendToTunnel).toHaveBeenCalled();

      // Should not terminate WebSocket
      expect(ws.terminate).not.toHaveBeenCalled();
    });

    it("should update stats on message relay", () => {
      const chunk1 = Buffer.from("First chunk");
      const chunk2 = Buffer.from("Second chunk");

      ws.emit("message", chunk1, false);
      ws.emit("message", chunk2, false);

      const stats = handler.getStats();
      expect(stats.totalFrames).toBe(2);
      expect(stats.totalBytes).toBe(chunk1.length + chunk2.length);
    });

    it("should handle string messages from local server", () => {
      const textData = "Hello text message";
      ws.emit("message", textData, false);

      expect(sendToTunnel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "websocket_data",
          id: "test-ws-relay",
          payload: expect.objectContaining({
            data: Buffer.from(textData).toString("base64"),
          }),
        })
      );
    });
  });

  describe("Message Relay - Tunnel to Local", () => {
    let ws: MockWebSocket;

    beforeEach(async () => {
      ws = await establishConnection("test-ws-data");
      // Clear send calls from setup
      ws.send.mockClear();
    });

    it("should decode base64 and send to local WebSocket", () => {
      const rawBytes = Buffer.from("Hello from tunnel!");
      const base64 = rawBytes.toString("base64");

      const dataMessage: WebSocketDataMessage = {
        type: "websocket_data",
        id: "test-ws-data",
        timestamp: Date.now(),
        payload: {
          data: base64,
        },
      };

      handler.handleData(dataMessage);

      expect(ws.send).toHaveBeenCalledWith(
        rawBytes,
        expect.objectContaining({ binary: false, compress: false })
      );
    });

    it("should preserve binary data through base64 roundtrip", () => {
      const binaryData = Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0x00, 0x01]);
      const base64 = binaryData.toString("base64");

      const dataMessage: WebSocketDataMessage = {
        type: "websocket_data",
        id: "test-ws-data",
        timestamp: Date.now(),
        payload: {
          data: base64,
        },
      };

      handler.handleData(dataMessage);

      const sentBuffer = ws.send.mock.calls[0][0] as Buffer;
      expect(sentBuffer).toEqual(binaryData);
    });

    it("should not send to non-open WebSocket", () => {
      ws.readyState = MockWebSocket.CLOSED;

      const dataMessage: WebSocketDataMessage = {
        type: "websocket_data",
        id: "test-ws-data",
        timestamp: Date.now(),
        payload: {
          data: Buffer.from("test").toString("base64"),
        },
      };

      handler.handleData(dataMessage);

      // Should not send
      expect(ws.send).not.toHaveBeenCalled();
    });

    it("should not send to closing WebSocket", () => {
      ws.readyState = MockWebSocket.CLOSING;

      const dataMessage: WebSocketDataMessage = {
        type: "websocket_data",
        id: "test-ws-data",
        timestamp: Date.now(),
        payload: {
          data: Buffer.from("test").toString("base64"),
        },
      };

      handler.handleData(dataMessage);

      // Should not send
      expect(ws.send).not.toHaveBeenCalled();
    });

    it("should handle data for non-existent connection", () => {
      const dataMessage: WebSocketDataMessage = {
        type: "websocket_data",
        id: "nonexistent-ws",
        timestamp: Date.now(),
        payload: {
          data: Buffer.from("test").toString("base64"),
        },
      };

      // Should not throw
      expect(() => handler.handleData(dataMessage)).not.toThrow();

      // Should not send
      expect(ws.send).not.toHaveBeenCalled();
    });

    it("should update stats on data received", () => {
      const data1 = Buffer.from("First");
      const data2 = Buffer.from("Second");

      handler.handleData({
        type: "websocket_data",
        id: "test-ws-data",
        timestamp: Date.now(),
        payload: { data: data1.toString("base64") },
      });

      handler.handleData({
        type: "websocket_data",
        id: "test-ws-data",
        timestamp: Date.now(),
        payload: { data: data2.toString("base64") },
      });

      const stats = handler.getStats();
      expect(stats.totalFrames).toBe(2);
      expect(stats.totalBytes).toBe(data1.length + data2.length);
    });
  });

  describe("WebSocket Event Handlers", () => {
    let ws: MockWebSocket;

    beforeEach(async () => {
      ws = await establishConnection("test-ws-events");
      // Clear calls from setup
      sendToTunnel.mockClear();
    });

    it("should send WebSocketCloseMessage on close event", () => {
      // ws library emits "close" with (code, reason) where reason is a Buffer
      ws.emit("close", 1000, Buffer.from("Connection closed"));

      expect(sendToTunnel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "websocket_close",
          id: "test-ws-events",
          payload: expect.objectContaining({
            code: 1000,
            reason: "Connection closed",
            initiator: "server",
          }),
        })
      );
    });

    it("should send WebSocketCloseMessage with code 1011 on error", () => {
      ws.emit("error", new Error("Socket error"));

      expect(sendToTunnel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "websocket_close",
          id: "test-ws-events",
          payload: expect.objectContaining({
            code: 1011,
            reason: "Socket error",
            initiator: "server",
          }),
        })
      );
    });

    it("should cleanup connection on close", () => {
      expect(handler.getConnectionCount()).toBe(1);

      ws.emit("close", 1000, Buffer.from("bye"));

      expect(handler.getConnectionCount()).toBe(0);
    });

    it("should cleanup connection on error", () => {
      expect(handler.getConnectionCount()).toBe(1);

      ws.emit("error", new Error("Test error"));

      expect(handler.getConnectionCount()).toBe(0);
    });
  });

  describe("Connection Management", () => {
    it("should track connection count", async () => {
      expect(handler.getConnectionCount()).toBe(0);

      // Create first connection
      await establishConnection("ws-1");
      expect(handler.getConnectionCount()).toBe(1);

      // Create second connection
      await establishConnection("ws-2");
      expect(handler.getConnectionCount()).toBe(2);
    });

    it("should close all connections", async () => {
      // Create two connections
      const ws1 = await establishConnection("ws-1");
      const ws2 = await establishConnection("ws-2");

      expect(handler.getConnectionCount()).toBe(2);

      // Close all
      handler.closeAll(1000, "Shutting down");

      expect(ws1.close).toHaveBeenCalledWith(1000, "Shutting down");
      expect(ws2.close).toHaveBeenCalledWith(1000, "Shutting down");
      expect(handler.getConnectionCount()).toBe(0);
    });

    it("should get stats across all connections", async () => {
      // Create connection
      const ws = await establishConnection("ws-stats");

      // Emit some messages from local server
      ws.emit("message", Buffer.from("chunk1"), false);
      ws.emit("message", Buffer.from("chunk2"), false);

      const stats = handler.getStats();
      expect(stats.connectionCount).toBe(1);
      expect(stats.totalFrames).toBe(2);
      expect(stats.totalBytes).toBe(12); // "chunk1" + "chunk2"
    });

    it("should handle close for non-existent connection", () => {
      const closeMessage: WebSocketCloseMessage = {
        type: "websocket_close",
        id: "nonexistent-ws",
        timestamp: Date.now(),
        payload: {
          code: 1000,
          reason: "Normal close",
          initiator: "client",
        },
      };

      // Should not throw
      expect(() => handler.handleClose(closeMessage)).not.toThrow();
    });
  });

  describe("Base64 Encoding/Decoding", () => {
    it("should correctly encode text data", () => {
      const text = "Hello WebSocket!";
      const buffer = Buffer.from(text);
      const base64 = buffer.toString("base64");

      expect(base64).toBe("SGVsbG8gV2ViU29ja2V0IQ==");
    });

    it("should correctly encode binary data", () => {
      const binary = Buffer.from([0x01, 0x02, 0x03, 0xff, 0xfe]);
      const base64 = binary.toString("base64");

      expect(base64).toBe("AQID//4=");
    });

    it("should correctly roundtrip encode/decode", () => {
      const original = Buffer.from("Test data with special chars: \u{1F680}\u{1F525}\u{1F4AF}");
      const base64 = original.toString("base64");
      const decoded = Buffer.from(base64, "base64");

      expect(decoded).toEqual(original);
      expect(decoded.toString()).toBe(original.toString());
    });

    it("should preserve WebSocket frame bytes through base64", () => {
      // WebSocket text frame: FIN=1, opcode=1 (text), unmasked, payload="Hi"
      const frame = Buffer.from([0x81, 0x02, 0x48, 0x69]);
      const base64 = frame.toString("base64");
      const decoded = Buffer.from(base64, "base64");

      expect(decoded).toEqual(frame);
      expect(decoded[0]).toBe(0x81); // FIN + opcode preserved
    });
  });
});
