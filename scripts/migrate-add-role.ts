#!/usr/bin/env bun
/**
 * Migration Script: Add Role Column and Set Superuser
 *
 * This script:
 * 1. Adds the 'role' column to the user table
 * 2. Sets the role to 'superuser' for git@davidddundas.com
 *
 * Usage: bun scripts/migrate-add-role.ts
 */

import { MechStorageClient, runRoleMigration } from "@liveport/shared";

async function main() {
  console.log("🔧 Running role migration...\n");

  // Initialize database client
  const db = new MechStorageClient({
    appId: process.env.MECH_APPS_APP_ID!,
    apiKey: process.env.MECH_APPS_API_KEY!,
    baseUrl: process.env.MECH_APPS_URL || "https://storage.mechdna.net/api",
  });

  try {
    // Step 1: Add role column
    console.log("1️⃣  Adding 'role' column to user table...");
    await runRoleMigration(db);
    console.log("✅ Role column added successfully\n");

    // Step 2: Set superuser role for git@davidddundas.com
    console.log("2️⃣  Setting superuser role for git@davidddundas.com...");
    const result = await db.query(
      `UPDATE "user" SET role = 'superuser', updated_at = NOW() WHERE email = $1 RETURNING id, email, role`,
      ["git@davidddundas.com"]
    );

    if (result.rows && result.rows.length > 0) {
      console.log("✅ Superuser role set successfully");
      console.log("   User ID:", result.rows[0].id);
      console.log("   Email:", result.rows[0].email);
      console.log("   Role:", result.rows[0].role);
    } else {
      console.log("⚠️  User with email git@davidddundas.com not found");
      console.log("   The role will be automatically set to 'superuser' when this user signs up");
    }

    console.log("\n🎉 Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

main();
