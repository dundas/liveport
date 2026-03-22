/**
 * Connection Manager Tests
 *
 * Tests for the connection manager including:
 * - Tunnel registration/unregistration
 * - Lookup functions
 * - Byte tracking for metering
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSocket } from "ws";
import { ConnectionManager } from "./connection-manager";

describe("Connection Manager", () => {
  let manager: ConnectionManager;
  let mockSocket: WebSocket;

  beforeEach(() => {
    manager = new ConnectionManager();
    mockSocket = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN,
    } as unknown as WebSocket;
  });

  describe("Byte Tracking", () => {
    it("should track bytes transferred for a tunnel", () => {
      const tunnelId = "tunnel-123";
      const keyId = "key-456";
      const userId = "user-789";
      
      // Register tunnel
      const subdomain = manager.register(
        mockSocket,
        tunnelId,
        keyId,
        userId,
        3000,
        new Date()
      );

      expect(subdomain).toBeTruthy();
      
      // Initial bytes should be 0
      let conn = manager.findBySubdomain(subdomain!);
      expect(conn?.bytesTransferred).toBe(0);

      // Add bytes
      manager.addBytesTransferred(subdomain!, 1024);
      conn = manager.findBySubdomain(subdomain!);
      expect(conn?.bytesTransferred).toBe(1024);

      // Add more bytes
      manager.addBytesTransferred(subdomain!, 2048);
      conn = manager.findBySubdomain(subdomain!);
      expect(conn?.bytesTransferred).toBe(3072);
    });

    it("should update request count", () => {
      const subdomain = manager.register(
        mockSocket,
        "t-1",
        "k-1",
        "u-1",
        3000,
        new Date()
      );

      expect(manager.findBySubdomain(subdomain!)?.requestCount).toBe(0);

      manager.incrementRequestCount(subdomain!);
      expect(manager.findBySubdomain(subdomain!)?.requestCount).toBe(1);

      manager.incrementRequestCount(subdomain!);
      expect(manager.findBySubdomain(subdomain!)?.requestCount).toBe(2);
    });
  });

  describe("Access Token Validation", () => {
    it("should return true for tunnels with no access token (open tunnel)", () => {
      const subdomain = manager.register(
        mockSocket,
        "t-1",
        "k-1",
        "u-1",
        3000,
        new Date()
      );

      // No access token set — any request should pass
      expect(manager.validateAccessToken(subdomain!, null)).toBe(true);
      expect(manager.validateAccessToken(subdomain!, "lpa_anything")).toBe(true);
    });

    it("should return true when token matches", () => {
      const accessToken = "lpa_test1234567890abcdefghij1234";
      const subdomain = manager.register(
        mockSocket,
        "t-2",
        "k-2",
        "u-2",
        3000,
        new Date(),
        undefined,
        accessToken
      );

      expect(manager.validateAccessToken(subdomain!, accessToken)).toBe(true);
    });

    it("should return false when token does not match", () => {
      const accessToken = "lpa_test1234567890abcdefghij1234";
      const subdomain = manager.register(
        mockSocket,
        "t-3",
        "k-3",
        "u-3",
        3000,
        new Date(),
        undefined,
        accessToken
      );

      expect(manager.validateAccessToken(subdomain!, "lpa_wrong_token_value_here_abc")).toBe(false);
    });

    it("should return false when token required but not provided", () => {
      const accessToken = "lpa_test1234567890abcdefghij1234";
      const subdomain = manager.register(
        mockSocket,
        "t-4",
        "k-4",
        "u-4",
        3000,
        new Date(),
        undefined,
        accessToken
      );

      expect(manager.validateAccessToken(subdomain!, null)).toBe(false);
    });

    it("should return false for non-existent subdomain", () => {
      expect(manager.validateAccessToken("nonexistent", "lpa_token")).toBe(false);
    });

    it("should store access token on connection record", () => {
      const accessToken = "lpa_stored_token_value_abc12345";
      const subdomain = manager.register(
        mockSocket,
        "t-5",
        "k-5",
        "u-5",
        3000,
        new Date(),
        undefined,
        accessToken
      );

      const conn = manager.findBySubdomain(subdomain!);
      expect(conn?.accessToken).toBe(accessToken);
    });

    it("should not set accessToken when not provided", () => {
      const subdomain = manager.register(
        mockSocket,
        "t-6",
        "k-6",
        "u-6",
        3000,
        new Date()
      );

      const conn = manager.findBySubdomain(subdomain!);
      expect(conn?.accessToken).toBeUndefined();
    });
  });

  describe("Lifecycle", () => {
    it("should register and unregister tunnels correctly", () => {
      const subdomain = manager.register(
        mockSocket,
        "t-1",
        "k-1",
        "u-1",
        3000,
        new Date()
      );

      expect(subdomain).toBeTruthy();
      expect(manager.getCount()).toBe(1);
      expect(manager.findBySubdomain(subdomain!)).toBeDefined();

      manager.unregister(subdomain!);
      expect(manager.getCount()).toBe(0);
      expect(manager.findBySubdomain(subdomain!)).toBeNull();
    });

    it("should clean up indexes on unregister", () => {
      const keyId = "k-1";
      const subdomain = manager.register(
        mockSocket,
        "t-1",
        keyId,
        "u-1",
        3000,
        new Date()
      );

      expect(manager.findByKeyId(keyId)).toHaveLength(1);

      manager.unregister(subdomain!);
      expect(manager.findByKeyId(keyId)).toHaveLength(0);
    });
  });
});

