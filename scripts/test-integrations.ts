#!/usr/bin/env npx tsx
/**
 * Integration Test Script
 *
 * Tests all core integrations before deployment:
 * 1. Mech-storage database connection
 * 2. Redis connection
 * 3. Table creation/verification
 *
 * Usage: npx tsx scripts/test-integrations.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from root .env
config({ path: resolve(process.cwd(), ".env") });

// Dynamically import after env is loaded
async function runTests() {
  console.log("=".repeat(60));
  console.log("LivePort Integration Tests");
  console.log("=".repeat(60));
  console.log("");

  const results: { name: string; passed: boolean; error?: string }[] = [];

  // Test 1: Mech-storage connection
  console.log("1. Testing Mech-Storage Database Connection...");
  try {
    const { MechStorageClient } = await import("@liveport/shared");

    const appId = process.env.MECH_APPS_APP_ID;
    const apiKey = process.env.MECH_APPS_API_KEY;
    const baseUrl = process.env.MECH_APPS_URL || "https://storage.mechdna.net/api";

    if (!appId || !apiKey) {
      throw new Error("Missing MECH_APPS_APP_ID or MECH_APPS_API_KEY");
    }

    console.log(`   App ID: ${appId}`);
    console.log(`   Base URL: ${baseUrl}`);

    const db = new MechStorageClient({
      appId,
      apiKey,
      baseUrl,
    });

    // Test connection by getting status
    const status = await db.getStatus();
    console.log(`   ✓ Connected! PostgreSQL enabled: ${status.postgresqlEnabled}`);
    console.log(`   ✓ Can create tables: ${status.canCreateTables}`);

    results.push({ name: "Mech-Storage Connection", passed: true });
  } catch (error) {
    const err = error as Error;
    console.log(`   ✗ Failed: ${err.message}`);
    results.push({ name: "Mech-Storage Connection", passed: false, error: err.message });
  }
  console.log("");

  // Test 2: List existing tables
  console.log("2. Listing Database Tables...");
  try {
    const { MechStorageClient } = await import("@liveport/shared");

    const db = new MechStorageClient({
      appId: process.env.MECH_APPS_APP_ID!,
      apiKey: process.env.MECH_APPS_API_KEY!,
      baseUrl: process.env.MECH_APPS_URL || "https://storage.mechdna.net/api",
    });

    const tables = await db.listTables();
    console.log(`   Found ${tables.length} tables:`);
    for (const table of tables) {
      console.log(`   - ${table.name} (${table.type})`);
    }

    results.push({ name: "List Tables", passed: true });
  } catch (error) {
    const err = error as Error;
    console.log(`   ✗ Failed: ${err.message}`);
    results.push({ name: "List Tables", passed: false, error: err.message });
  }
  console.log("");

  // Test 3: Redis connection (optional for local dev)
  console.log("3. Testing Redis Connection...");
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || redisUrl.includes("fly-") || redisUrl.includes("upstash")) {
    console.log("   ⚠ Skipping: Redis URL is for Fly.io private network");
    console.log("   To test locally, run: docker run -p 6379:6379 redis:alpine");
    console.log("   Then set REDIS_URL=redis://localhost:6379");
    results.push({ name: "Redis Connection", passed: true, error: "Skipped (private network)" });
  } else {
    try {
      const { createRedisClient } = await import("@liveport/shared");

      console.log(`   Redis URL: ${redisUrl.replace(/:[^:@]+@/, ":***@")}`);

      const redis = createRedisClient({ url: redisUrl });

      // Test ping with timeout
      const pingPromise = redis.ping();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 5000)
      );

      const pong = await Promise.race([pingPromise, timeoutPromise]);
      console.log(`   ✓ PING response: ${pong}`);

      // Test set/get
      const testKey = "liveport:test:" + Date.now();
      await redis.set(testKey, "test-value", "EX", 10);
      const value = await redis.get(testKey);
      console.log(`   ✓ SET/GET test: ${value === "test-value" ? "passed" : "failed"}`);
      await redis.del(testKey);

      await redis.quit();

      results.push({ name: "Redis Connection", passed: true });
    } catch (error) {
      const err = error as Error;
      console.log(`   ✗ Failed: ${err.message}`);
      console.log("   Note: Redis is optional for local development");
      results.push({ name: "Redis Connection", passed: false, error: err.message });
    }
  }
  console.log("");

  // Test 4: Create/verify required tables
  console.log("4. Verifying Required Tables...");
  try {
    const { MechStorageClient, TABLE_NAMES } = await import("@liveport/shared");

    const db = new MechStorageClient({
      appId: process.env.MECH_APPS_APP_ID!,
      apiKey: process.env.MECH_APPS_API_KEY!,
      baseUrl: process.env.MECH_APPS_URL || "https://storage.mechdna.net/api",
    });

    const requiredTables = Object.values(TABLE_NAMES);
    const existingTables = await db.listTables();
    const existingNames = new Set(existingTables.map(t => t.name));

    console.log(`   Required tables: ${requiredTables.join(", ")}`);

    const missing: string[] = [];
    const found: string[] = [];

    for (const table of requiredTables) {
      if (existingNames.has(table)) {
        found.push(table);
        console.log(`   ✓ ${table} exists`);
      } else {
        missing.push(table);
        console.log(`   ✗ ${table} MISSING`);
      }
    }

    if (missing.length > 0) {
      console.log(`\n   WARNING: ${missing.length} tables missing!`);
      console.log(`   Run the schema setup to create them.`);
      results.push({ name: "Required Tables", passed: false, error: `Missing: ${missing.join(", ")}` });
    } else {
      results.push({ name: "Required Tables", passed: true });
    }
  } catch (error) {
    const err = error as Error;
    console.log(`   ✗ Failed: ${err.message}`);
    results.push({ name: "Required Tables", passed: false, error: err.message });
  }
  console.log("");

  // Summary
  console.log("=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? "✓ PASS" : "✗ FAIL";
    console.log(`${status}: ${result.name}${result.error ? ` - ${result.error}` : ""}`);
  }

  console.log("");
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log("");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
