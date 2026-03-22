/**
 * Connect Command Tests
 *
 * Tests for the connect command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
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

describe("connectCommand", () => {
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
    vi.mocked(getConfigValue).mockReturnValue("lpk_test");

    const { logger } = await import("../logger");
    const { connectCommand } = await import("./connect");

    await expect(connectCommand("invalid", {})).rejects.toThrow("exit1");

    expect(logger.error).toHaveBeenCalledWith("Invalid port number: invalid");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should reject port 0", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockReturnValue("lpk_test");

    const { logger } = await import("../logger");
    const { connectCommand } = await import("./connect");

    await expect(connectCommand("0", {})).rejects.toThrow("exit1");

    expect(logger.error).toHaveBeenCalledWith("Invalid port number: 0");
  });

  it("should reject port above 65535", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockReturnValue("lpk_test");

    const { logger } = await import("../logger");
    const { connectCommand } = await import("./connect");

    await expect(connectCommand("70000", {})).rejects.toThrow("exit1");

    expect(logger.error).toHaveBeenCalledWith("Invalid port number: 70000");
  });

  it("should require bridge key", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockReturnValue(undefined);

    const { logger } = await import("../logger");
    const { connectCommand } = await import("./connect");

    await expect(connectCommand("3000", {})).rejects.toThrow("exit1");

    expect(logger.error).toHaveBeenCalledWith(
      "Bridge key required. Use --key, set LIVEPORT_KEY, or run 'liveport config set key <your-key>'"
    );
  });

  it("should use CLI key option and pass correct config to TunnelClient", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockImplementation((key, cliValue) => {
      if (key === "key") return cliValue || "config_key";
      if (key === "server") return undefined;
      return undefined;
    });

    const { TunnelClient } = await import("../tunnel-client");
    const { connectCommand } = await import("./connect");

    // Start the connect command
    const promise = connectCommand("3000", { key: "cli_key" });

    // Verify TunnelClient was called with the correct bridge key
    expect(TunnelClient).toHaveBeenCalledWith(
      expect.objectContaining({
        bridgeKey: "cli_key",
        localPort: 3000,
      })
    );

    // Clean up - wait for promise to settle
    await promise.catch(() => {});
  });

  it("should accept valid port numbers", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockImplementation((key) => {
      if (key === "key") return "lpk_test";
      return undefined;
    });

    const { TunnelClient } = await import("../tunnel-client");
    const { connectCommand } = await import("./connect");

    // Test various valid ports
    for (const port of ["80", "443", "3000", "8080", "65535"]) {
      vi.clearAllMocks();
      const promise = connectCommand(port, {});
      expect(TunnelClient).toHaveBeenCalled();
      await promise.catch(() => {});
    }
  });
});

describe("getActiveClient", () => {
  it("should be exported as a function", async () => {
    const { getActiveClient } = await import("./connect");

    // Verify the function is exported and callable
    expect(typeof getActiveClient).toBe("function");
  });
});

describe("parseDuration", () => {
  it("should parse seconds", async () => {
    const { parseDuration } = await import("./connect");
    expect(parseDuration("30s")).toBe(30);
  });

  it("should parse minutes", async () => {
    const { parseDuration } = await import("./connect");
    expect(parseDuration("5m")).toBe(300);
  });

  it("should parse hours", async () => {
    const { parseDuration } = await import("./connect");
    expect(parseDuration("2h")).toBe(7200);
  });

  it("should parse days", async () => {
    const { parseDuration } = await import("./connect");
    expect(parseDuration("1d")).toBe(86400);
  });

  it("should return undefined for invalid format", async () => {
    const { parseDuration } = await import("./connect");
    expect(parseDuration("abc")).toBeUndefined();
    expect(parseDuration("30")).toBeUndefined();
    expect(parseDuration("m30")).toBeUndefined();
    expect(parseDuration("")).toBeUndefined();
    expect(parseDuration("2w")).toBeUndefined();
  });

  it("should return undefined for zero values", async () => {
    const { parseDuration } = await import("./connect");
    expect(parseDuration("0s")).toBeUndefined();
    expect(parseDuration("0m")).toBeUndefined();
    expect(parseDuration("0h")).toBeUndefined();
    expect(parseDuration("0d")).toBeUndefined();
  });

  it("should pass ttlSeconds to TunnelClient when valid TTL provided", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockImplementation((key, cliValue) => {
      if (key === "key") return cliValue || "lpk_test";
      return undefined;
    });

    const { TunnelClient } = await import("../tunnel-client");
    const { connectCommand } = await import("./connect");

    const promise = connectCommand("3000", { key: "lpk_test", ttl: "2h" });

    expect(TunnelClient).toHaveBeenCalledWith(
      expect.objectContaining({
        ttlSeconds: 7200,
      })
    );

    await promise.catch(() => {});
  });

  it("should warn and pass undefined ttlSeconds for invalid TTL", async () => {
    const { getConfigValue } = await import("../config");
    vi.mocked(getConfigValue).mockImplementation((key, cliValue) => {
      if (key === "key") return cliValue || "lpk_test";
      return undefined;
    });

    const { logger } = await import("../logger");
    const { TunnelClient } = await import("../tunnel-client");
    const { connectCommand } = await import("./connect");

    const promise = connectCommand("3000", { key: "lpk_test", ttl: "invalid" });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Invalid TTL format")
    );

    expect(TunnelClient).toHaveBeenCalledWith(
      expect.objectContaining({
        ttlSeconds: undefined,
      })
    );

    await promise.catch(() => {});
  });
});
