/**
 * Metering Service Tests
 *
 * Tests for the metering service that tracks tunnel usage for billing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the dependencies
vi.mock("./connection-manager", () => ({
  getConnectionManager: vi.fn(),
}));

vi.mock("@liveport/shared", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("@liveport/shared/logging", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { getConnectionManager } from "./connection-manager";
import { getDatabase } from "@liveport/shared";
import type { TunnelConnection } from "./types";

// We need to dynamically import the module to reset its state between tests
async function getMeteringModule() {
  // Reset the module to clear internal state
  vi.resetModules();
  
  // Re-mock after reset
  vi.doMock("./connection-manager", () => ({
    getConnectionManager: vi.fn(),
  }));
  vi.doMock("@liveport/shared", () => ({
    getDatabase: vi.fn(),
  }));
  vi.doMock("@liveport/shared/logging", () => ({
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  }));
  
  return await import("./metering");
}

describe("Metering Service", () => {
  let mockConnectionManager: {
    getAll: ReturnType<typeof vi.fn>;
  };
  let mockDb: {
    query: ReturnType<typeof vi.fn>;
  };
  let metering: Awaited<ReturnType<typeof getMeteringModule>>;

  beforeEach(async () => {
    vi.useFakeTimers();

    // Get fresh module instance
    metering = await getMeteringModule();

    // Setup mock connection manager
    mockConnectionManager = {
      getAll: vi.fn().mockReturnValue([]),
    };
    const { getConnectionManager: getConnMgr } = await import("./connection-manager");
    vi.mocked(getConnMgr).mockReturnValue(
      mockConnectionManager as unknown as ReturnType<typeof getConnectionManager>
    );

    // Setup mock database
    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const { getDatabase: getDb } = await import("@liveport/shared");
    vi.mocked(getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);
  });

  afterEach(() => {
    metering.stopMetering();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("syncMetrics", () => {
    it("should skip sync when no connections exist", async () => {
      mockConnectionManager.getAll.mockReturnValue([]);

      await metering.syncMetrics();

      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it("should sync metrics for active connections using UPSERT", async () => {
      const mockConnection: Partial<TunnelConnection> = {
        id: "tunnel-123",
        userId: "user-456",
        keyId: "key-789",
        subdomain: "test-subdomain",
        localPort: 3000,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        requestCount: 10,
        bytesTransferred: 1024,
      };

      mockConnectionManager.getAll.mockReturnValue([mockConnection]);

      await metering.syncMetrics();

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO tunnels"),
        expect.arrayContaining([
          "tunnel-123",
          "user-456",
          "key-789",
          "test-subdomain",
          3000,
        ])
      );
      // Verify UPSERT pattern is used
      expect(mockDb.query.mock.calls[0][0]).toContain("ON CONFLICT (id) DO UPDATE");
    });

    it("should take a snapshot of connections to avoid race conditions", async () => {
      const connections = [
        { id: "t1", userId: "u1", keyId: "k1", subdomain: "s1", localPort: 3000, createdAt: new Date(), requestCount: 1, bytesTransferred: 100 },
        { id: "t2", userId: "u2", keyId: "k2", subdomain: "s2", localPort: 3001, createdAt: new Date(), requestCount: 2, bytesTransferred: 200 },
      ];

      mockConnectionManager.getAll.mockReturnValue(connections);

      // Start sync
      const syncPromise = metering.syncMetrics();

      // Modify the original array (simulating a disconnect during sync)
      connections.pop();

      await syncPromise;

      // Should have synced both connections (from the snapshot)
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it("should continue syncing other tunnels if one fails", async () => {
      const connections = [
        { id: "t1", userId: "u1", keyId: "k1", subdomain: "s1", localPort: 3000, createdAt: new Date(), requestCount: 1, bytesTransferred: 100 },
        { id: "t2", userId: "u2", keyId: "k2", subdomain: "s2", localPort: 3001, createdAt: new Date(), requestCount: 2, bytesTransferred: 200 },
      ];

      mockConnectionManager.getAll.mockReturnValue(connections);

      // First call fails, second succeeds
      mockDb.query
        .mockRejectedValueOnce(new Error("DB error"))
        .mockResolvedValueOnce({ rows: [] });

      await metering.syncMetrics();

      // Should have attempted both
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe("finalizeTunnelMetrics", () => {
    it("should update tunnel with disconnected_at timestamp", async () => {
      await metering.finalizeTunnelMetrics("tunnel-123", 50, 5000);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE tunnels"),
        expect.arrayContaining([50, 5000, "tunnel-123"])
      );
      expect(mockDb.query.mock.calls[0][0]).toContain("disconnected_at = NOW()");
    });

    it("should use UPSERT when tunnel info is provided", async () => {
      const tunnelInfo = {
        userId: "user-456",
        keyId: "key-789",
        subdomain: "test-sub",
        localPort: 3000,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };

      await metering.finalizeTunnelMetrics("tunnel-123", 50, 5000, tunnelInfo);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO tunnels"),
        expect.arrayContaining([
          "tunnel-123",
          "user-456",
          "key-789",
          "test-sub",
          3000,
        ])
      );
      expect(mockDb.query.mock.calls[0][0]).toContain("ON CONFLICT (id) DO UPDATE");
    });

    it("should handle database errors gracefully", async () => {
      mockDb.query.mockRejectedValueOnce(new Error("DB error"));

      // Should not throw
      await expect(metering.finalizeTunnelMetrics("tunnel-123", 50, 5000)).resolves.not.toThrow();
    });
  });

  describe("startMetering / stopMetering", () => {
    it("should not throw when starting", () => {
      expect(() => metering.startMetering({ syncIntervalMs: 1000 })).not.toThrow();
    });

    it("should not throw when stopping", () => {
      metering.startMetering({ syncIntervalMs: 1000 });
      expect(() => metering.stopMetering()).not.toThrow();
    });

    it("should not throw when disabled", () => {
      expect(() => metering.startMetering({ enabled: false })).not.toThrow();
    });

    it("should be idempotent when stopping multiple times", () => {
      metering.startMetering({ syncIntervalMs: 1000 });
      expect(() => metering.stopMetering()).not.toThrow();
      expect(() => metering.stopMetering()).not.toThrow();
    });
  });

  describe("getMeteringHealth", () => {
    it("should return healthy status when no errors", () => {
      const health = metering.getMeteringHealth();

      expect(health.status).toBe("healthy");
      expect(health.syncErrorCount).toBe(0);
    });

    it("should return degraded status after some errors", async () => {
      mockConnectionManager.getAll.mockReturnValue([
        { id: "t1", userId: "u1", keyId: "k1", subdomain: "s1", localPort: 3000, createdAt: new Date(), requestCount: 1, bytesTransferred: 100 },
      ]);
      mockDb.query.mockRejectedValue(new Error("DB error"));

      // Trigger a sync that will fail
      try {
        await metering.syncMetrics();
      } catch {
        // Expected to throw
      }

      const health = metering.getMeteringHealth();
      expect(health.syncErrorCount).toBeGreaterThan(0);
    });
  });
});

describe("Connection Snapshot Behavior", () => {
  it("should not be affected by mutations to the original array during iteration", async () => {
    // This test verifies the fix for the race condition
    // where connections could disconnect during sync

    // Get fresh module
    vi.resetModules();
    vi.doMock("./connection-manager", () => ({ getConnectionManager: vi.fn() }));
    vi.doMock("@liveport/shared", () => ({ getDatabase: vi.fn() }));
    vi.doMock("@liveport/shared/logging", () => ({
      createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
    }));

    const metering = await import("./metering");
    const { getConnectionManager: getConnMgr } = await import("./connection-manager");
    const { getDatabase: getDb } = await import("@liveport/shared");

    const mockDb = {
      query: vi.fn().mockImplementation(async () => {
        // Simulate slow database operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { rows: [] };
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);

    const originalConnections = [
      { id: "t1", userId: "u1", keyId: "k1", subdomain: "s1", localPort: 3000, createdAt: new Date(), requestCount: 1, bytesTransferred: 100 },
      { id: "t2", userId: "u2", keyId: "k2", subdomain: "s2", localPort: 3001, createdAt: new Date(), requestCount: 2, bytesTransferred: 200 },
      { id: "t3", userId: "u3", keyId: "k3", subdomain: "s3", localPort: 3002, createdAt: new Date(), requestCount: 3, bytesTransferred: 300 },
    ];

    const mockConnectionManager = {
      getAll: vi.fn().mockReturnValue(originalConnections),
    };
    vi.mocked(getConnMgr).mockReturnValue(
      mockConnectionManager as unknown as ReturnType<typeof getConnectionManager>
    );

    // Start sync
    const syncPromise = metering.syncMetrics();

    // Simulate connections being removed during sync
    originalConnections.length = 0;

    // Use real timers for this async operation
    vi.useRealTimers();
    await syncPromise;
    vi.useFakeTimers();

    // Should have synced all 3 connections despite the mutation
    expect(mockDb.query).toHaveBeenCalledTimes(3);
  });
});

