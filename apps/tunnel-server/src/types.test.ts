/**
 * Type Tests for WebSocket Message Types
 *
 * These tests verify TypeScript type inference and discriminated union behavior.
 */

import { describe, test, expect, expectTypeOf } from "vitest";
import type {
  WebSocketUpgradeMessage,
  WebSocketUpgradeResponseMessage,
  WebSocketFrameMessage,
  WebSocketCloseMessage,
  Message,
} from "./types";

describe("WebSocket Message Types", () => {
  describe("WebSocketUpgradeMessage", () => {
    test("should have correct structure", () => {
      const message: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "ws-123",
        timestamp: Date.now(),
        payload: {
          path: "/ws",
          headers: {
            "sec-websocket-key": "test-key",
            "sec-websocket-version": "13",
          },
          subprotocol: "chat",
        },
      };

      expect(message.type).toBe("websocket_upgrade");
      expect(message.id).toBe("ws-123");
      expect(message.payload.path).toBe("/ws");
      expect(message.payload.subprotocol).toBe("chat");
    });

    test("should allow optional subprotocol", () => {
      const message: WebSocketUpgradeMessage = {
        type: "websocket_upgrade",
        id: "ws-123",
        timestamp: Date.now(),
        payload: {
          path: "/",
          headers: {},
        },
      };

      expect(message.payload.subprotocol).toBeUndefined();
    });

    test("should enforce required fields", () => {
      expectTypeOf<WebSocketUpgradeMessage>().toHaveProperty("type");
      expectTypeOf<WebSocketUpgradeMessage>().toHaveProperty("id");
      expectTypeOf<WebSocketUpgradeMessage>().toHaveProperty("timestamp");
      expectTypeOf<WebSocketUpgradeMessage>().toHaveProperty("payload");
    });
  });

  describe("WebSocketUpgradeResponseMessage", () => {
    test("should have correct structure for successful upgrade", () => {
      const message: WebSocketUpgradeResponseMessage = {
        type: "websocket_upgrade_response",
        id: "ws-123",
        timestamp: Date.now(),
        payload: {
          accepted: true,
          statusCode: 101,
          headers: {
            "sec-websocket-accept": "accept-key",
          },
        },
      };

      expect(message.type).toBe("websocket_upgrade_response");
      expect(message.payload.accepted).toBe(true);
      expect(message.payload.statusCode).toBe(101);
    });

    test("should have correct structure for failed upgrade", () => {
      const message: WebSocketUpgradeResponseMessage = {
        type: "websocket_upgrade_response",
        id: "ws-123",
        timestamp: Date.now(),
        payload: {
          accepted: false,
          statusCode: 502,
          reason: "Failed to connect to local server",
        },
      };

      expect(message.payload.accepted).toBe(false);
      expect(message.payload.reason).toBeDefined();
    });
  });

  describe("WebSocketFrameMessage", () => {
    test("should have correct structure for text frame", () => {
      const message: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "ws-123",
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 1, // text
          data: "Hello, World!",
          final: true,
        },
      };

      expect(message.payload.opcode).toBe(1);
      expect(message.payload.data).toBe("Hello, World!");
      expect(message.payload.final).toBe(true);
    });

    test("should have correct structure for binary frame", () => {
      const message: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "ws-123",
        direction: "server_to_client",
        timestamp: Date.now(),
        payload: {
          opcode: 2, // binary
          data: "AQIDBA==", // base64
          final: true,
        },
      };

      expect(message.payload.opcode).toBe(2);
    });

    test("should have correct structure for close frame", () => {
      const message: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "ws-123",
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 8, // close
          data: "",
          final: true,
          closeCode: 1000,
          closeReason: "Normal closure",
        },
      };

      expect(message.payload.opcode).toBe(8);
      expect(message.payload.closeCode).toBe(1000);
      expect(message.payload.closeReason).toBe("Normal closure");
    });

    test("should allow ping/pong opcodes", () => {
      const ping: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "ws-123",
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: {
          opcode: 9, // ping
          data: "",
          final: true,
        },
      };

      const pong: WebSocketFrameMessage = {
        type: "websocket_frame",
        id: "ws-123",
        direction: "server_to_client",
        timestamp: Date.now(),
        payload: {
          opcode: 10, // pong
          data: "",
          final: true,
        },
      };

      expect(ping.payload.opcode).toBe(9);
      expect(pong.payload.opcode).toBe(10);
    });
  });

  describe("WebSocketCloseMessage", () => {
    test("should have correct structure", () => {
      const message: WebSocketCloseMessage = {
        type: "websocket_close",
        id: "ws-123",
        timestamp: Date.now(),
        payload: {
          code: 1000,
          reason: "Normal closure",
          initiator: "client",
        },
      };

      expect(message.type).toBe("websocket_close");
      expect(message.payload.code).toBe(1000);
      expect(message.payload.initiator).toBe("client");
    });

    test("should allow all initiator types", () => {
      const types: Array<"client" | "server" | "tunnel"> = [
        "client",
        "server",
        "tunnel",
      ];

      types.forEach((initiator) => {
        const message: WebSocketCloseMessage = {
          type: "websocket_close",
          id: "ws-123",
          timestamp: Date.now(),
          payload: {
            code: 1000,
            reason: "Test",
            initiator,
          },
        };

        expect(message.payload.initiator).toBe(initiator);
      });
    });
  });

  describe("Message Discriminated Union", () => {
    test("should narrow type based on message type", () => {
      const message: Message = {
        type: "websocket_upgrade",
        id: "ws-123",
        timestamp: Date.now(),
        payload: {
          path: "/ws",
          headers: {},
        },
      } as Message;

      if (message.type === "websocket_upgrade") {
        // TypeScript should narrow the type here
        expectTypeOf(message).toEqualTypeOf<WebSocketUpgradeMessage>();
        expect(message.payload.path).toBeDefined();
      }
    });

    test("should include all WebSocket message types in union", () => {
      const upgrade: Message = {
        type: "websocket_upgrade",
        id: "ws-1",
        timestamp: Date.now(),
        payload: { path: "/", headers: {} },
      };

      const upgradeResponse: Message = {
        type: "websocket_upgrade_response",
        id: "ws-1",
        timestamp: Date.now(),
        payload: { accepted: true, statusCode: 101 },
      };

      const frame: Message = {
        type: "websocket_frame",
        id: "ws-1",
        direction: "client_to_server",
        timestamp: Date.now(),
        payload: { opcode: 1, data: "test", final: true },
      };

      const close: Message = {
        type: "websocket_close",
        id: "ws-1",
        timestamp: Date.now(),
        payload: { code: 1000, reason: "Done", initiator: "client" },
      };

      // All should be valid Message types
      expect(upgrade.type).toBe("websocket_upgrade");
      expect(upgradeResponse.type).toBe("websocket_upgrade_response");
      expect(frame.type).toBe("websocket_frame");
      expect(close.type).toBe("websocket_close");
    });
  });
});
