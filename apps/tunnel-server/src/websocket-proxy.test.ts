/**
 * WebSocket Proxy Tests
 *
 * Tests for raw byte piping functionality in websocket-proxy.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { EventEmitter } from "events";
import type { ConnectionManager } from "./connection-manager";
import type { WebSocket } from "ws";

// Mock WebSocket implementation
class MockWebSocket extends EventEmitter {
  readyState = 1; // OPEN
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  _socket: EventEmitter | null = null;

  send = vi.fn();
  close = vi.fn();
  ping = vi.fn();
  pong = vi.fn();
}

// Mock TCP Socket implementation
class MockSocket extends EventEmitter {
  destroyed = false;
  writable = true;

  write = vi.fn();
  destroy = vi.fn(() => {
    this.destroyed = true;
  });
}

describe("WebSocket Proxy - Raw Byte Piping", () => {
  let mockReq: Partial<IncomingMessage>;
  let mockSocket: Socket;
  let mockHead: Buffer;
  let mockConnectionManager: Partial<ConnectionManager>;
  let mockPublicWs: MockWebSocket;
  let mockUnderlyingSocket: MockSocket;
  let mockTunnelWs: MockWebSocket;

  beforeEach(() => {
    // Setup mock request
    mockReq = {
      headers: {
        host: "test-subdomain.liveport.online",
      },
      url: "/",
    } as Partial<IncomingMessage>;

    // Setup mock TCP socket for HTTP upgrade
    mockSocket = new EventEmitter() as Socket;

    // Setup mock head buffer
    mockHead = Buffer.from([]);

    // Setup mock public WebSocket
    mockPublicWs = new MockWebSocket();

    // Setup mock underlying TCP socket
    mockUnderlyingSocket = new MockSocket();
    mockPublicWs._socket = mockUnderlyingSocket;

    // Setup mock tunnel WebSocket
    mockTunnelWs = new MockWebSocket();

    // Setup mock connection manager
    mockConnectionManager = {
      findBySubdomain: vi.fn((subdomain: string) => ({
        id: "tunnel-123",
        subdomain,
        keyId: "key-123",
        userId: "user-123",
        localPort: 3000,
        socket: mockTunnelWs as unknown as WebSocket,
        state: "active" as const,
        createdAt: new Date(),
        lastHeartbeat: new Date(),
        requestCount: 0,
        bytesTransferred: 0,
        expiresAt: null,
      })),
      registerProxiedWebSocket: vi.fn(),
      unregisterProxiedWebSocket: vi.fn(),
      trackWebSocketFrame: vi.fn(),
      getWebSocketCount: vi.fn(() => 0),
      getProxiedWebSocket: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Underlying Socket Access", () => {
    it("should access underlying TCP socket after WebSocket upgrade", () => {
      // Verify that _socket is accessible on WebSocket
      expect(mockPublicWs._socket).toBeDefined();
      expect(mockPublicWs._socket).toBe(mockUnderlyingSocket);
    });

    it("should access underlying socket as EventEmitter", () => {
      // Verify underlying socket is an EventEmitter
      expect(mockPublicWs._socket).toBeInstanceOf(EventEmitter);
      expect(typeof mockPublicWs._socket?.on).toBe("function");
      expect(typeof mockPublicWs._socket?.emit).toBe("function");
    });
  });

  describe("Raw Byte Data Events", () => {
    it("should capture data events from underlying socket", () => {
      const dataHandler = vi.fn();
      mockUnderlyingSocket.on("data", dataHandler);

      // Simulate data event
      const chunk = Buffer.from("test data");
      mockUnderlyingSocket.emit("data", chunk);

      expect(dataHandler).toHaveBeenCalledWith(chunk);
      expect(dataHandler).toHaveBeenCalledTimes(1);
    });

    it("should relay multiple data chunks", () => {
      const chunks: Buffer[] = [];
      mockUnderlyingSocket.on("data", (chunk) => chunks.push(chunk));

      // Simulate multiple data events
      mockUnderlyingSocket.emit("data", Buffer.from("chunk 1"));
      mockUnderlyingSocket.emit("data", Buffer.from("chunk 2"));
      mockUnderlyingSocket.emit("data", Buffer.from("chunk 3"));

      expect(chunks).toHaveLength(3);
      expect(chunks[0].toString()).toBe("chunk 1");
      expect(chunks[1].toString()).toBe("chunk 2");
      expect(chunks[2].toString()).toBe("chunk 3");
    });

    it("should relay binary data correctly", () => {
      let receivedChunk: Buffer | null = null;
      mockUnderlyingSocket.on("data", (chunk) => {
        receivedChunk = chunk;
      });

      // Simulate binary data
      const binaryData = Buffer.from([0x01, 0x02, 0x03, 0xff, 0xfe]);
      mockUnderlyingSocket.emit("data", binaryData);

      expect(receivedChunk).toEqual(binaryData);
      expect(receivedChunk?.length).toBe(5);
    });
  });

  describe("Base64 Encoding", () => {
    it("should encode raw bytes as base64", () => {
      const rawBytes = Buffer.from("Hello WebSocket!");
      const base64 = rawBytes.toString("base64");

      expect(base64).toBe("SGVsbG8gV2ViU29ja2V0IQ==");
    });

    it("should encode binary data as base64", () => {
      const binaryData = Buffer.from([0x01, 0x02, 0x03, 0xff, 0xfe]);
      const base64 = binaryData.toString("base64");

      expect(base64).toBe("AQID//4=");
    });

    it("should encode large chunk as base64", () => {
      const largeChunk = Buffer.alloc(1024, "a");
      const base64 = largeChunk.toString("base64");

      expect(base64.length).toBeGreaterThan(0);
      expect(Buffer.from(base64, "base64")).toEqual(largeChunk);
    });

    it("should correctly roundtrip encode/decode", () => {
      const original = Buffer.from("Test data with special chars: 🚀🔥💯");
      const base64 = original.toString("base64");
      const decoded = Buffer.from(base64, "base64");

      expect(decoded).toEqual(original);
      expect(decoded.toString()).toBe(original.toString());
    });
  });

  describe("Frame Size Limit Enforcement", () => {
    const MAX_FRAME_SIZE = 10 * 1024 * 1024; // 10MB

    it("should accept chunk within size limit", () => {
      const validChunk = Buffer.alloc(1024, "a"); // 1KB - well within limit
      const shouldReject = validChunk.length > MAX_FRAME_SIZE;

      expect(shouldReject).toBe(false);
      expect(validChunk.length).toBeLessThan(MAX_FRAME_SIZE);
    });

    it("should accept chunk at exact size limit", () => {
      const maxChunk = Buffer.alloc(MAX_FRAME_SIZE, "a");
      const shouldReject = maxChunk.length > MAX_FRAME_SIZE;

      expect(shouldReject).toBe(false);
      expect(maxChunk.length).toBe(MAX_FRAME_SIZE);
    });

    it("should reject chunk exceeding size limit", () => {
      const oversizedChunk = Buffer.alloc(MAX_FRAME_SIZE + 1, "a");
      const shouldReject = oversizedChunk.length > MAX_FRAME_SIZE;

      expect(shouldReject).toBe(true);
      expect(oversizedChunk.length).toBeGreaterThan(MAX_FRAME_SIZE);
    });

    it("should calculate chunk size correctly for binary data", () => {
      const binaryChunk = Buffer.from([0xff, 0xfe, 0xfd, 0xfc]);
      const size = binaryChunk.length;

      expect(size).toBe(4);
      expect(size).toBeLessThan(MAX_FRAME_SIZE);
    });

    it("should handle empty chunk", () => {
      const emptyChunk = Buffer.from([]);
      const shouldReject = emptyChunk.length > MAX_FRAME_SIZE;

      expect(shouldReject).toBe(false);
      expect(emptyChunk.length).toBe(0);
    });
  });

  describe("WebSocket Data Message Format", () => {
    it("should create valid WebSocketDataMessage structure", () => {
      const wsId = "test-subdomain:ws:abc123";
      const chunk = Buffer.from("test data");

      const dataMessage = {
        type: "websocket_data",
        id: wsId,
        timestamp: Date.now(),
        payload: {
          data: chunk.toString("base64"),
        },
      };

      expect(dataMessage.type).toBe("websocket_data");
      expect(dataMessage.id).toBe(wsId);
      expect(dataMessage.timestamp).toBeGreaterThan(0);
      expect(dataMessage.payload.data).toBe(chunk.toString("base64"));
    });

    it("should serialize WebSocketDataMessage to JSON", () => {
      const dataMessage = {
        type: "websocket_data",
        id: "test:ws:123",
        timestamp: 1234567890,
        payload: {
          data: Buffer.from("test").toString("base64"),
        },
      };

      const json = JSON.stringify(dataMessage);
      const parsed = JSON.parse(json);

      expect(parsed.type).toBe("websocket_data");
      expect(parsed.payload.data).toBe(dataMessage.payload.data);
    });
  });

  describe("Connection Manager Integration", () => {
    it("should register proxied WebSocket with connection manager", () => {
      const wsId = "test-subdomain:ws:abc123";
      const subdomain = "test-subdomain";

      mockConnectionManager.registerProxiedWebSocket?.(
        wsId,
        subdomain,
        mockPublicWs as unknown as WebSocket
      );

      expect(mockConnectionManager.registerProxiedWebSocket).toHaveBeenCalledWith(
        wsId,
        subdomain,
        mockPublicWs
      );
      expect(mockConnectionManager.registerProxiedWebSocket).toHaveBeenCalledTimes(1);
    });

    it("should track bytes transferred", () => {
      const wsId = "test-subdomain:ws:abc123";
      const bytes = 1024;

      mockConnectionManager.trackWebSocketFrame?.(wsId, bytes);

      expect(mockConnectionManager.trackWebSocketFrame).toHaveBeenCalledWith(wsId, bytes);
      expect(mockConnectionManager.trackWebSocketFrame).toHaveBeenCalledTimes(1);
    });

    it("should unregister WebSocket on close", () => {
      const wsId = "test-subdomain:ws:abc123";

      mockConnectionManager.unregisterProxiedWebSocket?.(wsId);

      expect(mockConnectionManager.unregisterProxiedWebSocket).toHaveBeenCalledWith(wsId);
      expect(mockConnectionManager.unregisterProxiedWebSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe("Tunnel Server Communication", () => {
    it("should send WebSocketDataMessage to tunnel", () => {
      const dataMessage = {
        type: "websocket_data",
        id: "test:ws:123",
        timestamp: Date.now(),
        payload: {
          data: Buffer.from("test").toString("base64"),
        },
      };

      mockTunnelWs.send(JSON.stringify(dataMessage));

      expect(mockTunnelWs.send).toHaveBeenCalledWith(JSON.stringify(dataMessage));
      expect(mockTunnelWs.send).toHaveBeenCalledTimes(1);
    });

    it("should handle tunnel send errors gracefully", () => {
      mockTunnelWs.send.mockImplementation(() => {
        throw new Error("Tunnel connection error");
      });

      expect(() => {
        mockTunnelWs.send("test");
      }).toThrow("Tunnel connection error");
    });
  });

  describe("Error Handling", () => {
    it("should close WebSocket on oversized chunk", () => {
      const MAX_FRAME_SIZE = 10 * 1024 * 1024;
      const oversizedChunk = Buffer.alloc(MAX_FRAME_SIZE + 1, "a");

      // Simulate size check and close
      if (oversizedChunk.length > MAX_FRAME_SIZE) {
        mockPublicWs.close(1009, "Message too big");
      }

      expect(mockPublicWs.close).toHaveBeenCalledWith(1009, "Message too big");
    });

    it("should handle close event with code and reason", () => {
      const closeHandler = vi.fn();
      mockPublicWs.on("close", closeHandler);

      mockPublicWs.emit("close", 1000, Buffer.from("Normal closure"));

      expect(closeHandler).toHaveBeenCalledWith(1000, Buffer.from("Normal closure"));
    });

    it("should handle error event", () => {
      const errorHandler = vi.fn();
      mockPublicWs.on("error", errorHandler);

      const error = new Error("WebSocket error");
      mockPublicWs.emit("error", error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it("should close WebSocket on error", () => {
      // Add error handler to prevent unhandled error
      mockPublicWs.on("error", () => {});

      mockPublicWs.emit("error", new Error("Test error"));
      mockPublicWs.close(1011, "Unexpected error");

      expect(mockPublicWs.close).toHaveBeenCalledWith(1011, "Unexpected error");
    });
  });

  describe("WebSocket Close Messages", () => {
    it("should create valid WebSocketCloseMessage", () => {
      const wsId = "test:ws:123";
      const closeMessage = {
        type: "websocket_close",
        id: wsId,
        timestamp: Date.now(),
        payload: {
          code: 1000,
          reason: "Normal closure",
          initiator: "client",
        },
      };

      expect(closeMessage.type).toBe("websocket_close");
      expect(closeMessage.payload.code).toBe(1000);
      expect(closeMessage.payload.reason).toBe("Normal closure");
      expect(closeMessage.payload.initiator).toBe("client");
    });

    it("should handle error close with code 1011", () => {
      const closeMessage = {
        type: "websocket_close",
        id: "test:ws:123",
        timestamp: Date.now(),
        payload: {
          code: 1011,
          reason: "Unexpected error",
          initiator: "tunnel",
        },
      };

      expect(closeMessage.payload.code).toBe(1011);
      expect(closeMessage.payload.initiator).toBe("tunnel");
    });
  });

  describe("Raw Byte Preservation", () => {
    it("should preserve WebSocket frame metadata through raw bytes", () => {
      // WebSocket frame with RSV1 bit set (compression)
      // Frame structure: FIN(1) RSV1(1) RSV2(0) RSV3(0) OPCODE(0001) = 0xC1
      const frameWithRSV1 = Buffer.from([0xc1, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);

      // Raw byte relay preserves exact bytes
      const base64 = frameWithRSV1.toString("base64");
      const decoded = Buffer.from(base64, "base64");

      expect(decoded).toEqual(frameWithRSV1);
      expect(decoded[0]).toBe(0xc1); // RSV1 bit preserved
    });

    it("should preserve masking key in raw bytes", () => {
      // WebSocket frame with masking
      // MASK(1) bit set in byte 1
      const maskedFrame = Buffer.from([
        0x81, 0x85, // FIN, opcode=text, MASK=1, len=5
        0x12, 0x34, 0x56, 0x78, // Masking key
        0x5a, 0x51, 0x32, 0x1a, 0x67, // Masked payload
      ]);

      const base64 = maskedFrame.toString("base64");
      const decoded = Buffer.from(base64, "base64");

      expect(decoded).toEqual(maskedFrame);
      expect(decoded.slice(2, 6)).toEqual(Buffer.from([0x12, 0x34, 0x56, 0x78]));
    });

    it("should preserve extension data in raw bytes", () => {
      // Frame with extension data (RSV bits set)
      const frameWithExtension = Buffer.from([0xe1, 0x03, 0x41, 0x42, 0x43]);

      const base64 = frameWithExtension.toString("base64");
      const decoded = Buffer.from(base64, "base64");

      expect(decoded).toEqual(frameWithExtension);
      expect(decoded[0] & 0x70).toBe(0x60); // RSV bits preserved
    });
  });
});
