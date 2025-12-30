/**
 * WebSocket Handler Tests
 *
 * Tests for the WebSocketHandler class that manages local WebSocket connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketHandler } from "./websocket-handler";
import type {
  WebSocketUpgradeMessage,
  WebSocketFrameMessage,
  WebSocketCloseMessage,
} from "./types";
import WebSocket from "ws";

// Mock WebSocket for testing
vi.mock("ws", () => {
  const mockWs = vi.fn();
  return {
    default: mockWs,
    WebSocket: mockWs,
  };
});

describe("WebSocketHandler", () => {
  let handler: WebSocketHandler;
  let mockSendToTunnel: ReturnType<typeof vi.fn>;
  let mockLocalSocket: any;
  let eventHandlers: Map<string, Function>;
  const TEST_PORT = 3000;

  beforeEach(() => {
    mockSendToTunnel = vi.fn();
    handler = new WebSocketHandler(mockSendToTunnel, TEST_PORT);
    eventHandlers = new Map();

    // Create mock local WebSocket
    mockLocalSocket = {
      readyState: 1, // OPEN
      send: vi.fn(),
      ping: vi.fn(),
      pong: vi.fn(),
      close: vi.fn(),
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers.set(event, handler);
      }),
    };

    // Mock WebSocket constructor to immediately trigger 'open' event
    (WebSocket as any).mockImplementation(() => {
      // Trigger open event on next tick
      process.nextTick(() => {
        const openHandler = eventHandlers.get("open");
        if (openHandler) openHandler();
      });
      return mockLocalSocket;
    });
    (WebSocket as any).OPEN = 1;
    (WebSocket as any).CONNECTING = 0;
    (WebSocket as any).CLOSING = 2;
    (WebSocket as any).CLOSED = 3;
  });

  afterEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
  });

  describe("handleUpgrade", () => {
    it("should connect to local WebSocket server on upgrade request", async () => {
      const upgradeMsg: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "ws-123",
        timestamp: Date.now(),
        payload: {
          path: "/chat",
          headers: { "user-agent": "test" },
          subprotocol: "chat-protocol",
        },
      };

      await handler.handleUpgrade(upgradeMsg);

      // Verify WebSocket was created with correct URL
      expect(WebSocket).toHaveBeenCalledWith(
        `ws://localhost:${TEST_PORT}/chat`,
        expect.objectContaining({
          headers: { "user-agent": "test" },
          protocol: "chat-protocol",
        })
      );

      // Verify success response sent to tunnel
      expect(mockSendToTunnel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "websocket_upgrade_response",
          id: "ws-123",
          payload: expect.objectContaining({
            accepted: true,
            statusCode: 101,
          }),
        })
      );
    });

    it("should send error response on connection failure", async () => {
      // Override mock to trigger error instead of open
      (WebSocket as any).mockImplementation(() => {
        process.nextTick(() => {
          const errorHandler = eventHandlers.get("error");
          if (errorHandler) errorHandler(new Error("Connection refused"));
        });
        return mockLocalSocket;
      });

      const upgradeMsg: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "ws-456",
        timestamp: Date.now(),
        payload: {
          path: "/chat",
          headers: {},
        },
      };

      await handler.handleUpgrade(upgradeMsg);

      // Verify error response sent to tunnel
      expect(mockSendToTunnel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "websocket_upgrade_response",
          id: "ws-456",
          payload: expect.objectContaining({
            accepted: false,
            statusCode: 502,
            reason: expect.stringContaining("Connection refused"),
          }),
        })
      );
    });

    it("should timeout if connection takes too long", async () => {
      vi.useFakeTimers();

      // Override mock to not trigger any event (simulating timeout)
      (WebSocket as any).mockImplementation(() => {
        // Don't trigger open or error - let it timeout
        return mockLocalSocket;
      });

      const upgradeMsg: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "ws-789",
        timestamp: Date.now(),
        payload: {
          path: "/chat",
          headers: {},
        },
      };

      const upgradePromise = handler.handleUpgrade(upgradeMsg);

      // Fast-forward past 5 second timeout
      await vi.advanceTimersByTimeAsync(6000);

      await upgradePromise;

      // Verify timeout error response
      expect(mockSendToTunnel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "websocket_upgrade_response",
          id: "ws-789",
          payload: expect.objectContaining({
            accepted: false,
            statusCode: 502,
            reason: expect.stringContaining("timeout"),
          }),
        })
      );

      vi.useRealTimers();
    });
  });

  describe("handleFrame", () => {
    beforeEach(async () => {
      // Set up a connection first
      const upgradeMsg: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "ws-frame-test",
        timestamp: Date.now(),
        payload: {
          path: "/test",
          headers: {},
        },
      };

      await handler.handleUpgrade(upgradeMsg);
      mockSendToTunnel.mockClear();
    });

    it("should relay text frames to local server", () => {
      const frameMsg: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "ws-frame-test",
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 1, // Text frame
          data: "Hello, world!",
          final: true,
        },
      };

      handler.handleFrame(frameMsg);

      expect(mockLocalSocket.send).toHaveBeenCalledWith("Hello, world!", {
        binary: false,
        fin: true,
      });
    });

    it("should relay binary frames to local server (base64 decoded)", () => {
      const binaryData = Buffer.from("binary data").toString("base64");
      const frameMsg: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "ws-frame-test",
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 2, // Binary frame
          data: binaryData,
          final: true,
        },
      };

      handler.handleFrame(frameMsg);

      expect(mockLocalSocket.send).toHaveBeenCalledWith(
        expect.any(Buffer),
        {
          binary: true,
          fin: true,
        }
      );

      // Verify decoded data
      const sentData = mockLocalSocket.send.mock.calls[0][0];
      expect(sentData.toString()).toBe("binary data");
    });

    it("should relay ping frames to local server", () => {
      const pingData = Buffer.from("ping").toString("base64");
      const frameMsg: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "ws-frame-test",
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 9, // Ping
          data: pingData,
          final: true,
        },
      };

      handler.handleFrame(frameMsg);

      expect(mockLocalSocket.ping).toHaveBeenCalledWith(expect.any(Buffer));
      const sentData = mockLocalSocket.ping.mock.calls[0][0];
      expect(sentData.toString()).toBe("ping");
    });

    it("should relay pong frames to local server", () => {
      const pongData = Buffer.from("pong").toString("base64");
      const frameMsg: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "ws-frame-test",
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 10, // Pong
          data: pongData,
          final: true,
        },
      };

      handler.handleFrame(frameMsg);

      expect(mockLocalSocket.pong).toHaveBeenCalledWith(expect.any(Buffer));
      const sentData = mockLocalSocket.pong.mock.calls[0][0];
      expect(sentData.toString()).toBe("pong");
    });

    it("should ignore frames for non-existent connections", () => {
      const frameMsg: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "non-existent",
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 1,
          data: "test",
          final: true,
        },
      };

      // Should not throw
      expect(() => handler.handleFrame(frameMsg)).not.toThrow();
      expect(mockLocalSocket.send).not.toHaveBeenCalled();
    });

    it("should not relay if local socket is not open", () => {
      mockLocalSocket.readyState = 3; // CLOSED

      const frameMsg: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "ws-frame-test",
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 1,
          data: "test",
          final: true,
        },
      };

      handler.handleFrame(frameMsg);

      expect(mockLocalSocket.send).not.toHaveBeenCalled();
    });
  });

  describe("handleClose", () => {
    beforeEach(async () => {
      // Set up a connection first
      const upgradeMsg: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "ws-close-test",
        timestamp: Date.now(),
        payload: {
          path: "/test",
          headers: {},
        },
      };

      await handler.handleUpgrade(upgradeMsg);
      mockSendToTunnel.mockClear();
    });

    it("should close local WebSocket on close message", () => {
      const closeMsg: WebSocketCloseMessage = {
        type: "websocket_close",
        id: "ws-close-test",
        timestamp: Date.now(),
        payload: {
          code: 1000,
          reason: "Normal closure",
          initiator: "client",
        },
      };

      handler.handleClose(closeMsg);

      expect(mockLocalSocket.close).toHaveBeenCalledWith(1000, "Normal closure");
    });

    it("should handle close for non-existent connection gracefully", () => {
      const closeMsg: WebSocketCloseMessage = {
        type: "websocket_close",
        id: "non-existent",
        timestamp: Date.now(),
        payload: {
          code: 1000,
          reason: "Normal closure",
          initiator: "client",
        },
      };

      // Should not throw
      expect(() => handler.handleClose(closeMsg)).not.toThrow();
    });
  });

  describe("closeAll", () => {
    beforeEach(async () => {
      // Set up multiple connections
      for (let i = 0; i < 3; i++) {
        const upgradeMsg: WebSocketUpgradeMessage = {
          type: "websocket_upgrade",
          id: `ws-${i}`,
          timestamp: Date.now(),
          payload: {
            path: `/test${i}`,
            headers: {},
          },
        };

        await handler.handleUpgrade(upgradeMsg);
      }
      mockSendToTunnel.mockClear();
      mockLocalSocket.close.mockClear();
    });

    it("should close all WebSocket connections", () => {
      handler.closeAll(1000, "Tunnel closing");

      // Should have called close 3 times (once per connection)
      expect(mockLocalSocket.close).toHaveBeenCalledTimes(3);
      expect(mockLocalSocket.close).toHaveBeenCalledWith(1000, "Tunnel closing");
    });

    it("should handle empty connection list gracefully", () => {
      handler.closeAll(1000, "Test");
      mockLocalSocket.close.mockClear();

      // Create new handler with no connections
      const newHandler = new WebSocketHandler(mockSendToTunnel, TEST_PORT);

      // Should not throw
      expect(() => newHandler.closeAll(1000, "Test")).not.toThrow();
      expect(mockLocalSocket.close).not.toHaveBeenCalled();
    });
  });

  describe("getConnectionCount", () => {
    it("should return 0 initially", () => {
      expect(handler.getConnectionCount()).toBe(0);
    });

    it("should return correct count after connections", async () => {
      // Add 2 connections
      for (let i = 0; i < 2; i++) {
        const upgradeMsg: WebSocketUpgradeMessage = {
          type: "websocket_upgrade",
          id: `ws-${i}`,
          timestamp: Date.now(),
          payload: {
            path: `/test${i}`,
            headers: {},
          },
        };

        await handler.handleUpgrade(upgradeMsg);
      }

      expect(handler.getConnectionCount()).toBe(2);
    });
  });

  describe("getStats", () => {
    it("should return correct stats", async () => {
      // Set up a connection
      const upgradeMsg: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "ws-stats",
        timestamp: Date.now(),
        payload: {
          path: "/test",
          headers: {},
        },
      };

      await handler.handleUpgrade(upgradeMsg);

      const stats = handler.getStats();

      expect(stats).toEqual({
        connectionCount: 1,
        totalFrames: 0,
        totalBytes: 0,
      });
    });
  });
});
