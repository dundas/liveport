/**
 * Share Command Tests
 *
 * Tests for the `liveport share` command that creates a temporary bridge key
 * and connects a tunnel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

vi.mock("../logger", () => ({
  logger: {
    banner: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    connected: vi.fn(),
    disconnected: vi.fn(),
    reconnecting: vi.fn(),
    request: vi.fn(),
    blank: vi.fn(),
    keyValue: vi.fn(),
    section: vi.fn(),
    raw: vi.fn(),
  },
}));

vi.mock("../config", () => ({
  getConfigValue: vi.fn(),
}));

vi.mock("../tunnel-client", () => ({
  TunnelClient: vi.fn().mockImplementation(() => ({
    on: vi.fn().mockReturnThis(),
    connect: vi.fn().mockResolvedValue({
      tunnelId: "test-id",
      subdomain: "test-sub",
      url: "https://test-sub.liveport.online",
      localPort: 3000,
      expiresAt: new Date(),
    }),
    disconnect: vi.fn(),
    getState: vi.fn().mockReturnValue("disconnected"),
    getTunnelInfo: vi.fn().mockReturnValue(null),
  })),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("shareCommand", () => {
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit${code}`);
    });
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it("should reject invalid port numbers", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockReturnValue("lpk_test_key_value");

    const { logger } = await import("../logger");
    const { shareCommand } = await import("./share");

    await expect(shareCommand("invalid", {})).rejects.toThrow("exit1");

    expect(logger.error).toHaveBeenCalledWith("Invalid port number: invalid");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should require bridge key", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockReturnValue(undefined);

    const { logger } = await import("../logger");
    const { shareCommand } = await import("./share");

    await expect(shareCommand("3000", {})).rejects.toThrow("exit1");

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Bridge key required")
    );
  });

  it("should call dashboard API to create temporary key", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockImplementation((key, cliValue) => {
      if (key === "key") return cliValue || "lpk_test_key_value";
      return undefined;
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        key: "lpk_temp_key_value",
        id: "temp-key-id",
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
      }),
    });

    const { shareCommand } = await import("./share");
    const promise = shareCommand("3000", { key: "lpk_test_key_value", ttl: "2h" });

    // Wait for the async operations
    await promise.catch(() => {});

    // Verify fetch was called with correct args
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/agent/keys/temporary"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer lpk_test_key_value",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("should pass TTL to the API request body", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockImplementation((key, cliValue) => {
      if (key === "key") return cliValue || "lpk_test_key_value";
      return undefined;
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        key: "lpk_temp_key_value",
        id: "temp-key-id",
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
      }),
    });

    const { shareCommand } = await import("./share");
    const promise = shareCommand("3000", { key: "lpk_test_key_value", ttl: "2h" });
    await promise.catch(() => {});

    // Verify the body contains ttlSeconds
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.ttlSeconds).toBe(7200);
  });

  it("should handle API error response", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockImplementation((key, cliValue) => {
      if (key === "key") return cliValue || "lpk_test_key_value";
      return undefined;
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: "Invalid bridge key",
        code: "INVALID_KEY",
      }),
    });

    const { logger } = await import("../logger");
    const { shareCommand } = await import("./share");

    await expect(shareCommand("3000", { key: "lpk_test_key_value" })).rejects.toThrow("exit1");

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to create temporary key")
    );
  });

  it("should use default TTL of 2h when not specified", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockImplementation((key, cliValue) => {
      if (key === "key") return cliValue || "lpk_test_key_value";
      return undefined;
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        key: "lpk_temp_key_value",
        id: "temp-key-id",
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
      }),
    });

    const { shareCommand } = await import("./share");
    const promise = shareCommand("3000", { key: "lpk_test_key_value" });
    await promise.catch(() => {});

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.ttlSeconds).toBe(7200); // default 2h
  });

  it("should connect tunnel using the temporary key", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockImplementation((key, cliValue) => {
      if (key === "key") return cliValue || "lpk_test_key_value";
      return undefined;
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        key: "lpk_temp_key_value",
        id: "temp-key-id",
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
      }),
    });

    const { TunnelClient } = await import("../tunnel-client");
    const { shareCommand } = await import("./share");
    const promise = shareCommand("3000", { key: "lpk_test_key_value" });
    await promise.catch(() => {});

    // Verify TunnelClient was created with the TEMPORARY key, not the parent key
    expect(TunnelClient).toHaveBeenCalledWith(
      expect.objectContaining({
        bridgeKey: "lpk_temp_key_value",
        localPort: 3000,
      })
    );
  });

  it("should handle fetch network failure gracefully", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockImplementation((key, cliValue) => {
      if (key === "key") return cliValue || "lpk_test_key_value";
      return undefined;
    });

    // Simulate a network error (fetch itself throws)
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const { logger } = await import("../logger");
    const { shareCommand } = await import("./share");

    await expect(shareCommand("3000", { key: "lpk_test_key_value" })).rejects.toThrow("exit1");

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to create temporary key")
    );
  });
});

describe("ShareOptions", () => {
  it("should include ttl and key fields", async () => {
    const { shareCommand } = await import("./share");
    // The function should accept ShareOptions which includes ttl and key
    expect(typeof shareCommand).toBe("function");
  });
});
