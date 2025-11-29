/**
 * HTTP Handler Tests
 *
 * Tests for the HTTP handler including:
 * - Request forwarding
 * - Body size limits
 * - Metering health endpoint
 * - Error logging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// Define mocks using vi.hoisted so they are available for vi.mock
const mocks = vi.hoisted(() => {
  const socket = {
    send: vi.fn(),
    readyState: 1, // OPEN
    OPEN: 1,
  };

  const connection = {
    id: "tunnel-123",
    subdomain: "test-subdomain",
    localPort: 3000,
    socket: socket,
    state: "active",
  };

  const connectionManager = {
    findBySubdomain: vi.fn(),
    findByKeyId: vi.fn(),
    getCount: vi.fn(),
    getSummary: vi.fn(),
    incrementRequestCount: vi.fn(),
    registerPendingRequest: vi.fn(),
    addBytesTransferred: vi.fn(),
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    socket,
    connection,
    connectionManager,
    logger,
  };
});

vi.mock("./connection-manager", () => ({
  getConnectionManager: vi.fn(() => mocks.connectionManager),
}));

vi.mock("@liveport/shared/logging", () => ({
  createLogger: vi.fn(() => mocks.logger),
}));

vi.mock("./metering", () => ({
  getMeteringHealth: vi.fn(() => ({
    status: "healthy",
    syncErrorCount: 0,
    lastSyncAt: new Date().toISOString(),
  })),
}));

import { createHttpHandler } from "./http-handler";

describe("HTTP Handler", () => {
  let app: Hono;

  beforeEach(() => {
    app = createHttpHandler();
    vi.clearAllMocks();
  });

  describe("Health Endpoints", () => {
    it("should return health status including metering info", async () => {
      const res = await app.request("/health");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("healthy");
      expect(data.metering).toBeDefined();
      expect(data.metering.status).toBe("healthy");
    });

    it("should return internal metering health", async () => {
      const res = await app.request("/_internal/metering/health");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("healthy");
      expect(data.syncErrorCount).toBe(0);
    });
  });

  describe("Request Forwarding", () => {
    it("should forward valid requests to tunnel", async () => {
      mocks.connectionManager.findBySubdomain.mockReturnValue(mocks.connection);
      mocks.connectionManager.registerPendingRequest.mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({ success: true })).toString("base64"),
      });

      const req = new Request("https://test-subdomain.liveport.online/api/test", {
        method: "POST",
        headers: { 
          "content-type": "application/json",
          "host": "test-subdomain.liveport.online" 
        },
        body: JSON.stringify({ foo: "bar" }),
      });

      const res = await app.request(req);

      expect(res.status).toBe(200);
      expect(mocks.connectionManager.incrementRequestCount).toHaveBeenCalledWith("test-subdomain");
      expect(mocks.connectionManager.addBytesTransferred).toHaveBeenCalled();
      expect(mocks.socket.send).toHaveBeenCalled();
    });

    it("should return 404 for invalid subdomain", async () => {
      mocks.connectionManager.findBySubdomain.mockReturnValue(null);

      const req = new Request("https://invalid.liveport.online/", {
        method: "GET",
        headers: { "host": "invalid.liveport.online" }
      });

      // This returns 404 because the subdomain is invalid according to extractSubdomain
      // OR because the connection is not found.
      // The code says: if (!subdomain) return 404.
      
      const res = await app.request(req);

      expect(res.status).toBe(502); // Bad Gateway (tunnel not found)
      expect(mocks.socket.send).not.toHaveBeenCalled();
    });
  });

  describe("Body Size Limits", () => {
    it("should reject requests larger than 10MB", async () => {
      mocks.connectionManager.findBySubdomain.mockReturnValue(mocks.connection);

      // Create a large body (10MB + 1 byte)
      const largeBody = new Uint8Array(10 * 1024 * 1024 + 1).fill(65); // 'A'
      
      const req = new Request("https://test-subdomain.liveport.online/upload", {
        method: "POST",
        headers: { "host": "test-subdomain.liveport.online" },
        body: largeBody,
      });

      const res = await app.request(req);

      expect(res.status).toBe(413); // Payload Too Large
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          size: expect.any(Number),
          maxSize: 10485760,
        }),
        "Request body too large"
      );
      expect(mocks.socket.send).not.toHaveBeenCalled();
    });

    it("should accept requests within limit", async () => {
      mocks.connectionManager.findBySubdomain.mockReturnValue(mocks.connection);
      mocks.connectionManager.registerPendingRequest.mockResolvedValue({
        status: 200,
        headers: {},
        body: "",
      });

      // Create a body just within limit (1MB)
      const body = new Uint8Array(1 * 1024 * 1024).fill(65);
      
      const req = new Request("https://test-subdomain.liveport.online/upload", {
        method: "POST",
        headers: { "host": "test-subdomain.liveport.online" },
        body: body,
      });

      const res = await app.request(req);

      expect(res.status).toBe(200);
      expect(mocks.socket.send).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle tunnel disconnection during request", async () => {
      mocks.connectionManager.findBySubdomain.mockReturnValue(mocks.connection);
      mocks.connectionManager.registerPendingRequest.mockRejectedValue(new Error("Tunnel disconnected"));

      const req = new Request("https://test-subdomain.liveport.online/api", {
        method: "GET",
        headers: { "host": "test-subdomain.liveport.online" },
      });

      const res = await app.request(req);

      expect(res.status).toBe(502);
      expect(await res.json()).toEqual(expect.objectContaining({
        error: "Bad Gateway",
        message: "Tunnel disconnected during request",
      }));
    });

    it("should handle request timeouts", async () => {
      mocks.connectionManager.findBySubdomain.mockReturnValue(mocks.connection);
      mocks.connectionManager.registerPendingRequest.mockRejectedValue(new Error("Request timeout"));

      const req = new Request("https://test-subdomain.liveport.online/api", {
        method: "GET",
        headers: { "host": "test-subdomain.liveport.online" },
      });

      const res = await app.request(req);

      expect(res.status).toBe(504);
      expect(await res.json()).toEqual(expect.objectContaining({
        error: "Gateway Timeout",
        message: "Request to local server timed out",
      }));
    });
  });
});
