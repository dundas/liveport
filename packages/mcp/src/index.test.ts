import { describe, it, expect, afterEach, vi } from "vitest";
import { formatTunnel, getKey, maskKey, extractMessage } from "./helpers.js";

/**
 * Unit tests for @liveport/mcp MCP server helpers.
 *
 * Full E2E MCP protocol tests require a live bridge key and tunnel server.
 * These tests cover the logic that doesn't require network access.
 */

// ─── Key masking ──────────────────────────────────────────────────────────────

describe("bridge key masking", () => {
  it("shows last 4 chars only", () => {
    const key = "lpk_live_abcdef1234567890xyz_9876";
    const masked = maskKey(key);
    expect(masked).toBe("...9876");
    // Does not leak the prefix or body of the key
    expect(masked).not.toContain("lpk_");
    expect(masked).not.toContain("abcdef");
  });

  it("handles short keys without crashing", () => {
    const key = "abc";
    const masked = maskKey(key);
    expect(masked).toBe("****");
  });
});

// ─── formatTunnel output ──────────────────────────────────────────────────────

describe("tunnel formatting", () => {
  it("includes port and URL", () => {
    const tunnel = {
      tunnelId: "tun_abc123",
      subdomain: "abc123",
      url: "https://abc123.tunnel.liveport.online",
      localPort: 3000,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h from now
    };

    const formatted = formatTunnel(tunnel);

    expect(formatted).toContain("Port 3000");
    expect(formatted).toContain("https://abc123.tunnel.liveport.online");
    expect(formatted).toContain("tun_abc123");
    expect(formatted).toMatch(/in \d+ min/);
  });

  it("marks expired tunnels correctly", () => {
    const tunnel = {
      tunnelId: "tun_expired",
      subdomain: "expired",
      url: "https://expired.tunnel.liveport.online",
      localPort: 8080,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 1000), // already expired
    };

    const formatted = formatTunnel(tunnel);
    expect(formatted).toContain("expired");
    expect(formatted).not.toMatch(/in \d+ min/);
  });

  it("shows < 1 min for tunnels that are still valid but nearly expired", () => {
    const tunnel = {
      tunnelId: "tun_soon",
      subdomain: "soon",
      url: "https://soon.tunnel.liveport.online",
      localPort: 9090,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 20 * 1000), // 20s from now
    };

    const formatted = formatTunnel(tunnel);
    expect(formatted).toContain("< 1 min");
  });
});

// ─── Environment variable handling ───────────────────────────────────────────

describe("LIVEPORT_BRIDGE_KEY env var", () => {
  const original = process.env.LIVEPORT_BRIDGE_KEY;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.LIVEPORT_BRIDGE_KEY;
    } else {
      process.env.LIVEPORT_BRIDGE_KEY = original;
    }
  });

  it("throws when key is missing", () => {
    delete process.env.LIVEPORT_BRIDGE_KEY;
    expect(() => getKey()).toThrow("LIVEPORT_BRIDGE_KEY");
  });

  it("returns key when set", () => {
    process.env.LIVEPORT_BRIDGE_KEY = "lpk_test_key";
    expect(getKey()).toBe("lpk_test_key");
  });

  it("trims key when env var has trailing newline/whitespace", () => {
    process.env.LIVEPORT_BRIDGE_KEY = "  lpk_test_key_with_newline\n";
    expect(getKey()).toBe("lpk_test_key_with_newline");
  });

  it("throws when env var is only whitespace", () => {
    process.env.LIVEPORT_BRIDGE_KEY = "   \n\t ";
    expect(() => getKey()).toThrow("LIVEPORT_BRIDGE_KEY");
  });
});

describe("extractMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns Error.message and logs stack/error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    const message = extractMessage(err);
    expect(message).toBe("boom");
    expect(spy).toHaveBeenCalled();
  });

  it("handles non-Error values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = extractMessage("badness");
    expect(message).toBe("badness");
    expect(spy).toHaveBeenCalledWith("badness");
  });
});
