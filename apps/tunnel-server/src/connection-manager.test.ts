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

