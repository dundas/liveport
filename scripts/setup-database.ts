#!/usr/bin/env npx tsx
/**
 * Database Setup Script
 *
 * Creates all required tables in mech-storage database.
 *
 * Usage: npx tsx scripts/setup-database.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from root .env
config({ path: resolve(process.cwd(), ".env") });

async function setup() {
  console.log("=".repeat(60));
  console.log("LivePort Database Setup");
  console.log("=".repeat(60));
  console.log("");

  const { MechStorageClient, initializeSchema, checkTablesExist } = await import(
    "@liveport/shared"
  );

  const appId = process.env.MECH_APPS_APP_ID;
  const apiKey = process.env.MECH_APPS_API_KEY;
  const baseUrl = process.env.MECH_APPS_URL || "https://storage.mechdna.net/api";

  if (!appId || !apiKey) {
    console.error("Error: Missing MECH_APPS_APP_ID or MECH_APPS_API_KEY");
    process.exit(1);
  }

  console.log(`App ID: ${appId}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log("");

  const db = new MechStorageClient({
    appId,
    apiKey,
    baseUrl,
  });

  // Check current status
  console.log("Checking existing tables...");
  const beforeStatus = await checkTablesExist(db);
  console.log(`  user: ${beforeStatus.user ? "✓" : "✗"}`);
  console.log(`  session: ${beforeStatus.session ? "✓" : "✗"}`);
  console.log(`  account: ${beforeStatus.account ? "✓" : "✗"}`);
  console.log(`  verification: ${beforeStatus.verification ? "✓" : "✗"}`);
  console.log(`  bridge_keys: ${beforeStatus.bridgeKeys ? "✓" : "✗"}`);
  console.log(`  tunnels: ${beforeStatus.tunnels ? "✓" : "✗"}`);
  console.log("");

  if (beforeStatus.allExist) {
    console.log("All tables already exist! Nothing to do.");
    return;
  }

  // Create missing tables
  console.log("Creating missing tables...");
  try {
    const result = await initializeSchema(db);

    if (result.authTablesCreated) {
      console.log("  ✓ Created auth tables (user, session, account, verification)");
    }
    if (result.bridgeKeysCreated) {
      console.log("  ✓ Created bridge_keys table");
    }
    if (result.tunnelsCreated) {
      console.log("  ✓ Created tunnels table");
    }

    if (
      !result.authTablesCreated &&
      !result.bridgeKeysCreated &&
      !result.tunnelsCreated
    ) {
      console.log("  No new tables created");
    }
  } catch (error) {
    console.error("Error creating tables:", error);
    process.exit(1);
  }

  console.log("");

  // Verify
  console.log("Verifying tables...");
  const afterStatus = await checkTablesExist(db);
  console.log(`  user: ${afterStatus.user ? "✓" : "✗"}`);
  console.log(`  session: ${afterStatus.session ? "✓" : "✗"}`);
  console.log(`  account: ${afterStatus.account ? "✓" : "✗"}`);
  console.log(`  verification: ${afterStatus.verification ? "✓" : "✗"}`);
  console.log(`  bridge_keys: ${afterStatus.bridgeKeys ? "✓" : "✗"}`);
  console.log(`  tunnels: ${afterStatus.tunnels ? "✓" : "✗"}`);
  console.log("");

  if (afterStatus.allExist) {
    console.log("✓ Database setup complete!");
  } else {
    console.log("✗ Some tables are still missing");
    process.exit(1);
  }
}

setup().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
