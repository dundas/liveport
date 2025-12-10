/**
 * Testing Integration Example
 *
 * This example shows how to integrate LivePort Agent SDK
 * into your automated test suite (Vitest, Jest, etc.)
 */

import { LivePortAgent, TunnelTimeoutError } from "@liveport/agent-sdk";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("API Integration Tests", () => {
  let agent: LivePortAgent;
  let tunnelUrl: string;

  beforeAll(async () => {
    // Initialize agent
    agent = new LivePortAgent({
      key: process.env.LIVEPORT_KEY!,
      timeout: 60000, // 60 second timeout
    });

    try {
      // Wait for developer to start their local server
      console.log("⏳ Waiting for tunnel...");
      const tunnel = await agent.waitForTunnel({ timeout: 60000 });
      tunnelUrl = tunnel.url;
      console.log(`✓ Connected to ${tunnelUrl}`);
    } catch (error) {
      if (error instanceof TunnelTimeoutError) {
        throw new Error(
          "Tunnel not available. Make sure the developer has started " +
          "'liveport connect <port>' before running tests."
        );
      }
      throw error;
    }
  });

  afterAll(async () => {
    await agent?.disconnect();
  });

  it("should return healthy status", async () => {
    const response = await fetch(`${tunnelUrl}/api/health`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe("healthy");
  });

  it("should list users", async () => {
    const response = await fetch(`${tunnelUrl}/api/users`);
    expect(response.ok).toBe(true);

    const users = await response.json();
    expect(Array.isArray(users)).toBe(true);
  });

  it("should create a new user", async () => {
    const response = await fetch(`${tunnelUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
      }),
    });

    expect(response.status).toBe(201);

    const user = await response.json();
    expect(user.name).toBe("Test User");
    expect(user.email).toBe("test@example.com");
  });
});
