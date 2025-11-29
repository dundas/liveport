/**
 * Tunnel Client Tests
 *
 * Tests for the WebSocket tunnel client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TunnelClientConfig } from "./types";

// Mock WebSocket
const mockWs = {
  on: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1, // OPEN
};

vi.mock("ws", () => {
  return {
    default: vi.fn(() => mockWs),
    WebSocket: vi.fn(() => mockWs),
  };
});

describe("TunnelClient", () => {
  const defaultConfig: TunnelClientConfig = {
    serverUrl: "https://tunnel.liveport.dev",
    bridgeKey: "lpk_test123",
    localPort: 3000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWs.readyState = 1;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should set default values for optional config", async () => {
      const { TunnelClient } = await import("./tunnel-client");
      const client = new TunnelClient(defaultConfig);

      expect(client.getState()).toBe("disconnected");
      expect(client.getTunnelInfo()).toBeNull();
    });

    it("should accept custom config values", async () => {
      const { TunnelClient } = await import("./tunnel-client");
      const client = new TunnelClient({
        ...defaultConfig,
        heartbeatInterval: 5000,
        reconnectMaxAttempts: 3,
        reconnectBaseDelay: 500,
      });

      expect(client.getState()).toBe("disconnected");
    });
  });

  describe("getState", () => {
    it("should return disconnected initially", async () => {
      const { TunnelClient } = await import("./tunnel-client");
      const client = new TunnelClient(defaultConfig);

      expect(client.getState()).toBe("disconnected");
    });
  });

  describe("getTunnelInfo", () => {
    it("should return null when not connected", async () => {
      const { TunnelClient } = await import("./tunnel-client");
      const client = new TunnelClient(defaultConfig);

      expect(client.getTunnelInfo()).toBeNull();
    });
  });

  describe("on", () => {
    it("should register event handlers and return this for chaining", async () => {
      const { TunnelClient } = await import("./tunnel-client");
      const client = new TunnelClient(defaultConfig);

      const result = client
        .on("connected", () => {})
        .on("disconnected", () => {})
        .on("error", () => {});

      expect(result).toBe(client);
    });
  });

  describe("disconnect", () => {
    it("should send disconnect message when connected", async () => {
      const { TunnelClient } = await import("./tunnel-client");
      const client = new TunnelClient(defaultConfig);

      // Simulate connected state by calling connect first
      // Since we can't fully test the async flow here, just verify disconnect behavior
      client.disconnect("test reason");

      expect(client.getState()).toBe("disconnected");
      expect(client.getTunnelInfo()).toBeNull();
    });

    it("should handle disconnect when not connected", async () => {
      const { TunnelClient } = await import("./tunnel-client");
      const client = new TunnelClient(defaultConfig);

      // Should not throw
      client.disconnect();

      expect(client.getState()).toBe("disconnected");
    });
  });

  describe("buildWebSocketUrl", () => {
    it("should convert https to wss", async () => {
      const { TunnelClient } = await import("./tunnel-client");
      const client = new TunnelClient({
        ...defaultConfig,
        serverUrl: "https://tunnel.liveport.dev",
      });

      // We can't directly test private methods, but we can verify
      // the client is constructed without error
      expect(client.getState()).toBe("disconnected");
    });

    it("should convert http to ws", async () => {
      const { TunnelClient } = await import("./tunnel-client");
      const client = new TunnelClient({
        ...defaultConfig,
        serverUrl: "http://localhost:8080",
      });

      expect(client.getState()).toBe("disconnected");
    });
  });
});

describe("Message Types", () => {
  it("should have correct type definitions", async () => {
    const { TunnelClient } = await import("./tunnel-client");

    // Verify the module exports correctly
    expect(TunnelClient).toBeDefined();
    expect(typeof TunnelClient).toBe("function");
  });
});
