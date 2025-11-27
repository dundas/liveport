#!/usr/bin/env npx tsx
/**
 * Database Migration CLI
 *
 * Usage:
 *   pnpm migrate          # Run all pending migrations
 *   pnpm migrate:status   # Show migration status
 *   pnpm migrate:rollback # Rollback last migration
 *
 * Environment variables:
 *   MECH_APPS_APP_ID - mech-storage app ID
 *   MECH_APPS_API_KEY - mech-storage API key
 *   MECH_APPS_URL - mech-storage API URL (optional)
 */

import { MechStorageClient } from "@liveport/shared/db";
import {
  runMigrations,
  rollbackMigration,
  getMigrationStatus,
} from "@liveport/shared/db/migrations";
import { allMigrations } from "@liveport/shared/db/migrations/all";

async function main() {
  const command = process.argv[2] || "up";

  // Get database configuration from environment
  const appId = process.env.MECH_APPS_APP_ID;
  const apiKey = process.env.MECH_APPS_API_KEY;
  const baseUrl = process.env.MECH_APPS_URL || "https://api.mechdna.net";

  if (!appId || !apiKey) {
    console.error("Error: MECH_APPS_APP_ID and MECH_APPS_API_KEY are required");
    process.exit(1);
  }

  const db = new MechStorageClient({ appId, apiKey, baseUrl });

  try {
    switch (command) {
      case "up":
        await runUp(db);
        break;
      case "status":
        await showStatus(db);
        break;
      case "rollback":
        await runRollback(db);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error("Usage: migrate [up|status|rollback]");
        process.exit(1);
    }
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
}

async function runUp(db: MechStorageClient) {
  console.log("Running migrations...\n");

  const results = await runMigrations(db, allMigrations);

  let hasChanges = false;
  for (const result of results) {
    const icon =
      result.status === "applied"
        ? "\u2713"
        : result.status === "skipped"
          ? "-"
          : "\u2717";
    const status =
      result.status === "applied"
        ? "APPLIED"
        : result.status === "skipped"
          ? "skipped"
          : "FAILED";

    console.log(`${icon} ${result.version}: ${result.description} [${status}]`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    if (result.status === "applied") {
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    console.log("\nNo pending migrations.");
  } else {
    console.log("\nMigrations complete.");
  }
}

async function showStatus(db: MechStorageClient) {
  console.log("Migration Status\n");

  const status = await getMigrationStatus(db, allMigrations);

  const maxVersion = Math.max(...status.map((s) => s.version.length));

  for (const migration of status) {
    const icon = migration.applied ? "\u2713" : " ";
    const version = migration.version.padEnd(maxVersion);
    const appliedAt = migration.appliedAt
      ? ` (${new Date(migration.appliedAt).toLocaleString()})`
      : "";

    console.log(`[${icon}] ${version} - ${migration.description}${appliedAt}`);
  }

  const pending = status.filter((s) => !s.applied).length;
  const applied = status.filter((s) => s.applied).length;

  console.log(`\n${applied} applied, ${pending} pending`);
}

async function runRollback(db: MechStorageClient) {
  console.log("Rolling back last migration...\n");

  const result = await rollbackMigration(db, allMigrations);

  if (!result) {
    console.log("No migrations to rollback.");
    return;
  }

  const icon = result.status === "applied" ? "\u2713" : "\u2717";
  const status = result.status === "applied" ? "ROLLED BACK" : "FAILED";

  console.log(`${icon} ${result.version}: ${result.description} [${status}]`);

  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
}

main();
