import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  LivePortAgent,
  TunnelTimeoutError,
  ApiError,
  ConnectionError,
  type AgentTunnel,
  type WaitForReadyOptions,
  type Tunnel,
} from "./index";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("LivePortAgent", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should throw error if key is missing", () => {
      expect(() => new LivePortAgent({ key: "" })).toThrow("Bridge key is required");
    });

    it("should use default config values", () => {
      const agent = new LivePortAgent({ key: "lpk_test123" });
      expect(agent).toBeInstanceOf(LivePortAgent);
    });

    it("should accept custom config", () => {
      const agent = new LivePortAgent({
        key: "lpk_test123",
        apiUrl: "https://custom.api",
        timeout: 60000,
      });
      expect(agent).toBeInstanceOf(LivePortAgent);
    });
  });

  describe("waitForTunnel", () => {
    it("should return tunnel when available immediately", async () => {
      const mockTunnel = {
        tunnelId: "tun_abc123",
        subdomain: "test-app",
        url: "https://test-app.liveport.online",
        localPort: 3000,
        createdAt: "2027-01-01T10:00:00Z",
        expiresAt: "2027-01-01T11:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tunnel: mockTunnel }),
      });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const tunnel = await agent.waitForTunnel({ timeout: 5000 });

      expect(tunnel).toMatchObject({
        tunnelId: "tun_abc123",
        subdomain: "test-app",
        url: "https://test-app.liveport.online",
        localPort: 3000,
      });
      expect(tunnel.createdAt).toBeInstanceOf(Date);
      expect(tunnel.expiresAt).toBeInstanceOf(Date);
    });

    it("should poll until tunnel becomes available", async () => {
      vi.useFakeTimers();

      const mockTunnel = {
        tunnelId: "tun_abc123",
        subdomain: "test-app",
        url: "https://test-app.liveport.online",
        localPort: 3000,
        createdAt: "2027-01-01T10:00:00Z",
        expiresAt: "2027-01-01T11:00:00Z",
      };

      // First call returns 408 (timeout), second call returns tunnel
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 408,
          json: async () => ({ error: "Timeout", code: "TIMEOUT" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ tunnel: mockTunnel }),
        });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const promise = agent.waitForTunnel({ timeout: 10000, pollInterval: 1000 });

      // Advance time to trigger retry
      await vi.advanceTimersByTimeAsync(1000);

      const tunnel = await promise;
      expect(tunnel.tunnelId).toBe("tun_abc123");
    });

    it("should throw TunnelTimeoutError when timeout is reached", async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue({
        ok: false,
        status: 408,
        json: async () => ({ error: "Timeout", code: "TIMEOUT" }),
      });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const promise = agent.waitForTunnel({ timeout: 2000, pollInterval: 500 }).catch((e) => e);

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(3000);

      const error = await promise;
      expect(error).toBeInstanceOf(TunnelTimeoutError);
      expect(error.message).toBe("Tunnel not available within 2000ms timeout");
    });

    it("should throw ApiError on non-408 error responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: "Invalid bridge key",
          code: "INVALID_KEY",
        }),
      });

      const agent = new LivePortAgent({ key: "lpk_invalid" });

      await expect(agent.waitForTunnel({ timeout: 5000 })).rejects.toThrow(ApiError);
    });

    it("should include Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tunnel: {
            tunnelId: "tun_abc123",
            subdomain: "test",
            url: "https://test.liveport.online",
            localPort: 3000,
            createdAt: "2027-01-01T10:00:00Z",
            expiresAt: "2027-01-01T11:00:00Z",
          },
        }),
      });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      await agent.waitForTunnel();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/agent/tunnels/wait"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer lpk_test123",
          }),
        })
      );
    });

    it("should handle abort signal when disconnected", async () => {
      let rejectFetch: (reason: Error) => void;

      mockFetch.mockImplementation(() => {
        return new Promise((resolve, reject) => {
          rejectFetch = reject;
        });
      });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const promise = agent.waitForTunnel({ timeout: 30000 });

      // Disconnect immediately
      await agent.disconnect();

      // Simulate AbortError
      rejectFetch!(Object.assign(new Error("AbortError"), { name: "AbortError" }));

      await expect(promise).rejects.toThrow("Wait cancelled");
    }, 10000);
  });

  describe("listTunnels", () => {
    it("should return array of tunnels", async () => {
      const mockTunnels = [
        {
          tunnelId: "tun_abc123",
          subdomain: "test-app-1",
          url: "https://test-app-1.liveport.online",
          localPort: 3000,
          createdAt: "2027-01-01T10:00:00Z",
          expiresAt: "2027-01-01T11:00:00Z",
        },
        {
          tunnelId: "tun_def456",
          subdomain: "test-app-2",
          url: "https://test-app-2.liveport.online",
          localPort: 3001,
          createdAt: "2027-01-01T10:05:00Z",
          expiresAt: "2027-01-01T11:05:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tunnels: mockTunnels }),
      });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const tunnels = await agent.listTunnels();

      expect(tunnels).toHaveLength(2);
      expect(tunnels[0].tunnelId).toBe("tun_abc123");
      expect(tunnels[1].tunnelId).toBe("tun_def456");
    });

    it("should return empty array when no tunnels", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tunnels: [] }),
      });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const tunnels = await agent.listTunnels();

      expect(tunnels).toEqual([]);
    });

    it("should throw ApiError on error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: "Invalid bridge key",
          code: "INVALID_KEY",
        }),
      });

      const agent = new LivePortAgent({ key: "lpk_invalid" });

      await expect(agent.listTunnels()).rejects.toThrow(ApiError);
    });

    it("should include Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tunnels: [] }),
      });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      await agent.listTunnels();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/agent/tunnels"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer lpk_test123",
          }),
        })
      );
    });
  });

  describe("disconnect", () => {
    it("should cancel pending waitForTunnel calls", async () => {
      let rejectFetch: (reason: Error) => void;

      mockFetch.mockImplementation(() => {
        return new Promise((resolve, reject) => {
          rejectFetch = reject;
        });
      });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const promise = agent.waitForTunnel({ timeout: 30000 });

      // Disconnect immediately
      await agent.disconnect();

      // Simulate AbortError
      rejectFetch!(Object.assign(new Error("AbortError"), { name: "AbortError" }));

      await expect(promise).rejects.toThrow("Wait cancelled");
    }, 10000);

    it("should be safe to call multiple times", async () => {
      const agent = new LivePortAgent({ key: "lpk_test123" });

      await agent.disconnect();
      await agent.disconnect();
      await agent.disconnect();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("Tunnel type", () => {
    it("should export a Tunnel type with required fields", () => {
      // Verify the Tunnel type is usable and has the expected shape
      const tunnel: Tunnel = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        userId: "550e8400-e29b-41d4-a716-446655440001",
        subdomain: "test-app",
        localPort: 3000,
        publicUrl: "https://test-app.liveport.online",
        region: "us-east",
        connectedAt: new Date(),
        requestCount: 0,
        bytesTransferred: 0,
      };

      expect(tunnel.id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(tunnel.userId).toBe("550e8400-e29b-41d4-a716-446655440001");
      expect(tunnel.subdomain).toBe("test-app");
      expect(tunnel.localPort).toBe(3000);
      expect(tunnel.publicUrl).toBe("https://test-app.liveport.online");
      expect(tunnel.region).toBe("us-east");
      expect(tunnel.connectedAt).toBeInstanceOf(Date);
      expect(tunnel.requestCount).toBe(0);
      expect(tunnel.bytesTransferred).toBe(0);
    });

    it("should allow optional Tunnel fields", () => {
      const tunnel: Tunnel = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        userId: "550e8400-e29b-41d4-a716-446655440001",
        subdomain: "test-app",
        localPort: 3000,
        publicUrl: "https://test-app.liveport.online",
        region: "us-east",
        connectedAt: new Date(),
        requestCount: 0,
        bytesTransferred: 0,
        bridgeKeyId: "550e8400-e29b-41d4-a716-446655440002",
        name: "My Tunnel",
        disconnectedAt: new Date(),
      };

      expect(tunnel.bridgeKeyId).toBe("550e8400-e29b-41d4-a716-446655440002");
      expect(tunnel.name).toBe("My Tunnel");
      expect(tunnel.disconnectedAt).toBeInstanceOf(Date);
    });
  });

  describe("Error classes", () => {
    it("TunnelTimeoutError should have correct name and message", () => {
      const error = new TunnelTimeoutError(30000);

      expect(error.name).toBe("TunnelTimeoutError");
      expect(error.message).toBe("Tunnel not available within 30000ms timeout");
      expect(error).toBeInstanceOf(Error);
    });

    it("ApiError should have statusCode and code", () => {
      const error = new ApiError(401, "INVALID_KEY", "Invalid bridge key");

      expect(error.name).toBe("ApiError");
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe("INVALID_KEY");
      expect(error.message).toBe("Invalid bridge key");
      expect(error).toBeInstanceOf(Error);
    });

    it("ConnectionError should have correct name and message", () => {
      const error = new ConnectionError("Connection refused");

      expect(error.name).toBe("ConnectionError");
      expect(error.message).toBe("Connection refused");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("connect", () => {
    it("should open a WebSocket and return AgentTunnel on connected message", async () => {
      // We mock the ws module at the module level
      const { MockWebSocket, setInstance } = createMockWebSocket();

      const agent = new LivePortAgent({ key: "lpk_test123" });

      const connectPromise = agent.connect(3000, {
        serverUrl: "https://tunnel.liveport.online",
        _WebSocketClass: MockWebSocket as unknown as typeof import("ws").default,
      });

      // The mock WebSocket should have been created
      const ws = setInstance.lastInstance!;
      expect(ws).toBeTruthy();

      // Simulate server sending "connected" message
      ws.simulateOpen();
      ws.simulateMessage(JSON.stringify({
        type: "connected",
        timestamp: Date.now(),
        payload: {
          tunnelId: "tun_ws_001",
          subdomain: "agent-test",
          url: "https://agent-test.liveport.online",
          expiresAt: "2027-01-01T11:00:00Z",
        },
      }));

      const tunnel = await connectPromise;

      expect(tunnel.tunnelId).toBe("tun_ws_001");
      expect(tunnel.subdomain).toBe("agent-test");
      expect(tunnel.url).toBe("https://agent-test.liveport.online");
      expect(tunnel.localPort).toBe(3000);
      expect(tunnel.expiresAt).toBeInstanceOf(Date);
      expect(tunnel.createdAt).toBeInstanceOf(Date);

      await agent.disconnect();
    });

    it("should send X-Bridge-Key and X-Local-Port headers", async () => {
      const { MockWebSocket, setInstance } = createMockWebSocket();

      const agent = new LivePortAgent({ key: "lpk_header_test" });

      const connectPromise = agent.connect(8080, {
        serverUrl: "https://tunnel.liveport.online",
        _WebSocketClass: MockWebSocket as unknown as typeof import("ws").default,
      });

      const ws = setInstance.lastInstance!;

      // Verify headers were passed to WebSocket constructor
      expect(ws.constructorArgs.headers).toMatchObject({
        "X-Bridge-Key": "lpk_header_test",
        "X-Local-Port": "8080",
      });

      // Complete connection
      ws.simulateOpen();
      ws.simulateMessage(JSON.stringify({
        type: "connected",
        timestamp: Date.now(),
        payload: {
          tunnelId: "tun_hdr",
          subdomain: "hdr-test",
          url: "https://hdr-test.liveport.online",
          expiresAt: "2027-01-01T11:00:00Z",
        },
      }));

      await connectPromise;
      await agent.disconnect();
    });

    it("should use wss:// protocol for https:// server URL", async () => {
      const { MockWebSocket, setInstance } = createMockWebSocket();

      const agent = new LivePortAgent({ key: "lpk_test" });

      const connectPromise = agent.connect(3000, {
        serverUrl: "https://tunnel.liveport.online",
        _WebSocketClass: MockWebSocket as unknown as typeof import("ws").default,
      });

      const ws = setInstance.lastInstance!;
      expect(ws.constructorArgs.url).toBe("wss://tunnel.liveport.online/connect");

      // Complete connection
      ws.simulateOpen();
      ws.simulateMessage(JSON.stringify({
        type: "connected",
        timestamp: Date.now(),
        payload: {
          tunnelId: "tun_x",
          subdomain: "x",
          url: "https://x.liveport.online",
          expiresAt: "2027-01-01T11:00:00Z",
        },
      }));

      await connectPromise;
      await agent.disconnect();
    });

    it("should throw ConnectionError on server error message", async () => {
      const { MockWebSocket, setInstance } = createMockWebSocket();

      const agent = new LivePortAgent({ key: "lpk_test" });

      const connectPromise = agent.connect(3000, {
        serverUrl: "https://tunnel.liveport.online",
        _WebSocketClass: MockWebSocket as unknown as typeof import("ws").default,
      });

      const ws = setInstance.lastInstance!;
      ws.simulateOpen();
      ws.simulateMessage(JSON.stringify({
        type: "error",
        timestamp: Date.now(),
        payload: {
          code: "INVALID_KEY",
          message: "Bridge key is invalid",
          fatal: true,
        },
      }));

      await expect(connectPromise).rejects.toThrow(
        expect.objectContaining({
          name: "ConnectionError",
          message: "Bridge key is invalid",
        })
      );
    });

    it("should throw ConnectionError on connection timeout", async () => {
      vi.useFakeTimers();

      const { MockWebSocket, setInstance } = createMockWebSocket();

      const agent = new LivePortAgent({ key: "lpk_test" });

      const connectPromise = agent.connect(3000, {
        serverUrl: "https://tunnel.liveport.online",
        timeout: 5000,
        _WebSocketClass: MockWebSocket as unknown as typeof import("ws").default,
      }).catch((e) => e);

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(6000);

      const error = await connectPromise;
      expect(error).toBeInstanceOf(ConnectionError);
      expect(error.message).toMatch(/timeout/i);
    });

    it("should throw ConnectionError on WebSocket error event", async () => {
      const { MockWebSocket, setInstance } = createMockWebSocket();

      const agent = new LivePortAgent({ key: "lpk_test" });

      const connectPromise = agent.connect(3000, {
        serverUrl: "https://tunnel.liveport.online",
        _WebSocketClass: MockWebSocket as unknown as typeof import("ws").default,
      });

      const ws = setInstance.lastInstance!;
      ws.simulateError(new Error("ECONNREFUSED"));

      await expect(connectPromise).rejects.toThrow(ConnectionError);
    });

    it("should forward http_request messages to localhost", async () => {
      const { MockWebSocket, setInstance } = createMockWebSocket();

      // Mock fetch for the local HTTP request forwarding
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/json"]]),
        arrayBuffer: async () => new TextEncoder().encode('{"ok":true}').buffer,
      });

      const agent = new LivePortAgent({ key: "lpk_test" });

      const connectPromise = agent.connect(3000, {
        serverUrl: "https://tunnel.liveport.online",
        _WebSocketClass: MockWebSocket as unknown as typeof import("ws").default,
      });

      const ws = setInstance.lastInstance!;
      ws.simulateOpen();
      ws.simulateMessage(JSON.stringify({
        type: "connected",
        timestamp: Date.now(),
        payload: {
          tunnelId: "tun_proxy",
          subdomain: "proxy-test",
          url: "https://proxy-test.liveport.online",
          expiresAt: "2027-01-01T11:00:00Z",
        },
      }));

      await connectPromise;

      // Now simulate an http_request from the tunnel server
      ws.simulateMessage(JSON.stringify({
        type: "http_request",
        id: "req_001",
        timestamp: Date.now(),
        payload: {
          method: "GET",
          path: "/api/health",
          headers: { "host": "proxy-test.liveport.online" },
        },
      }));

      // Give async handler time to process
      await new Promise((r) => setTimeout(r, 50));

      // Verify that fetch was called to forward to localhost
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/health",
        expect.objectContaining({
          method: "GET",
        })
      );

      // Verify response was sent back through WebSocket
      const sentMessages = ws.getSentMessages();
      const responseMsg = sentMessages.find((m: { type: string }) => m.type === "http_response");
      expect(responseMsg).toBeTruthy();
      expect(responseMsg.id).toBe("req_001");
      expect(responseMsg.payload.status).toBe(200);

      await agent.disconnect();
    });
  });

  describe("waitForReady", () => {
    it("should resolve when health endpoint returns 2xx", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const tunnel: AgentTunnel = {
        tunnelId: "tun_ready",
        subdomain: "ready-test",
        url: "https://ready-test.liveport.online",
        localPort: 3000,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      await agent.waitForReady(tunnel);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://ready-test.liveport.online/",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("should poll until health endpoint becomes available", async () => {
      vi.useFakeTimers();

      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const tunnel: AgentTunnel = {
        tunnelId: "tun_poll",
        subdomain: "poll-test",
        url: "https://poll-test.liveport.online",
        localPort: 3000,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      const promise = agent.waitForReady(tunnel, { pollInterval: 500 });

      // Advance through the poll intervals
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(500);

      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should use custom healthPath", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const tunnel: AgentTunnel = {
        tunnelId: "tun_path",
        subdomain: "path-test",
        url: "https://path-test.liveport.online",
        localPort: 3000,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      await agent.waitForReady(tunnel, { healthPath: "/health" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://path-test.liveport.online/health",
        expect.anything()
      );
    });

    it("should throw TunnelTimeoutError when timeout is exceeded", async () => {
      vi.useFakeTimers();

      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const agent = new LivePortAgent({ key: "lpk_test123" });
      const tunnel: AgentTunnel = {
        tunnelId: "tun_timeout",
        subdomain: "timeout-test",
        url: "https://timeout-test.liveport.online",
        localPort: 3000,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      const promise = agent
        .waitForReady(tunnel, { timeout: 3000, pollInterval: 500 })
        .catch((e) => e);

      await vi.advanceTimersByTimeAsync(4000);

      const error = await promise;
      expect(error).toBeInstanceOf(TunnelTimeoutError);
    });
  });

  describe("disconnect with WebSocket", () => {
    it("should close WebSocket connection created by connect()", async () => {
      const { MockWebSocket, setInstance } = createMockWebSocket();

      const agent = new LivePortAgent({ key: "lpk_test" });

      const connectPromise = agent.connect(3000, {
        serverUrl: "https://tunnel.liveport.online",
        _WebSocketClass: MockWebSocket as unknown as typeof import("ws").default,
      });

      const ws = setInstance.lastInstance!;
      ws.simulateOpen();
      ws.simulateMessage(JSON.stringify({
        type: "connected",
        timestamp: Date.now(),
        payload: {
          tunnelId: "tun_dc",
          subdomain: "dc-test",
          url: "https://dc-test.liveport.online",
          expiresAt: "2027-01-01T11:00:00Z",
        },
      }));

      await connectPromise;

      // Verify WebSocket is open
      expect(ws.readyState).toBe(1); // OPEN

      await agent.disconnect();

      // Verify close was called
      expect(ws.closeCalled).toBe(true);
    });

    it("should throw ConnectionError if already connected", async () => {
      const { MockWebSocket, setInstance } = createMockWebSocket();

      const agent = new LivePortAgent({ key: "lpk_test" });

      const connectPromise = agent.connect(3000, {
        serverUrl: "https://tunnel.liveport.online",
        _WebSocketClass: MockWebSocket as unknown as typeof import("ws").default,
      });

      const ws = setInstance.lastInstance!;
      ws.simulateOpen();
      ws.simulateMessage(JSON.stringify({
        type: "connected",
        timestamp: Date.now(),
        payload: {
          tunnelId: "tun_double",
          subdomain: "double-test",
          url: "https://double-test.liveport.online",
          expiresAt: "2027-01-01T11:00:00Z",
        },
      }));

      await connectPromise;

      // Second call should throw (pass mock to avoid real network call)
      await expect(agent.connect(3000, {
        serverUrl: "https://tunnel.liveport.online",
        _WebSocketClass: MockWebSocket as unknown as typeof import("ws").default,
      })).rejects.toThrow(/Already connected/);

      await agent.disconnect();
    });
  });
});

// --- Mock WebSocket helper ---

function createMockWebSocket() {
  let lastInstance: MockWS | null = null;

  class MockWS {
    public constructorArgs: { url: string; headers: Record<string, string> };
    public readyState = 0; // CONNECTING
    public closeCalled = false;
    private listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    private sentData: string[] = [];

    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url: string, options?: { headers?: Record<string, string>; perMessageDeflate?: boolean }) {
      this.constructorArgs = {
        url,
        headers: options?.headers || {},
      };
      lastInstance = this;
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(handler);
    }

    send(data: string) {
      this.sentData.push(data);
    }

    close(code?: number, reason?: string) {
      this.closeCalled = true;
      this.readyState = MockWS.CLOSED;
      this.emit("close", code || 1000, reason || "");
    }

    private emit(event: string, ...args: unknown[]) {
      const handlers = this.listeners[event] || [];
      for (const handler of handlers) {
        handler(...args);
      }
    }

    simulateOpen() {
      this.readyState = MockWS.OPEN;
      this.emit("open");
    }

    simulateMessage(data: string) {
      this.emit("message", Buffer.from(data));
    }

    simulateError(err: Error) {
      this.emit("error", err);
    }

    simulateClose(code = 1000, reason = "") {
      this.readyState = MockWS.CLOSED;
      this.emit("close", code, reason);
    }

    getSentMessages(): Array<{ type: string; id?: string; payload?: Record<string, unknown>; [key: string]: unknown }> {
      return this.sentData.map((d) => JSON.parse(d));
    }
  }

  return {
    MockWebSocket: MockWS,
    setInstance: {
      get lastInstance() {
        return lastInstance;
      },
    },
  };
}
