import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  LivePortAgent,
  TunnelTimeoutError,
  ApiError,
  type AgentTunnel,
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
        createdAt: "2025-12-10T10:00:00Z",
        expiresAt: "2025-12-10T11:00:00Z",
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
        createdAt: "2025-12-10T10:00:00Z",
        expiresAt: "2025-12-10T11:00:00Z",
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
            createdAt: "2025-12-10T10:00:00Z",
            expiresAt: "2025-12-10T11:00:00Z",
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
          createdAt: "2025-12-10T10:00:00Z",
          expiresAt: "2025-12-10T11:00:00Z",
        },
        {
          tunnelId: "tun_def456",
          subdomain: "test-app-2",
          url: "https://test-app-2.liveport.online",
          localPort: 3001,
          createdAt: "2025-12-10T10:05:00Z",
          expiresAt: "2025-12-10T11:05:00Z",
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
  });
});
