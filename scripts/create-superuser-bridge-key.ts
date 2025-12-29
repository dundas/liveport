#!/usr/bin/env bun
/**
 * Create a Bridge Key for Superuser
 *
 * This script creates a bridge key for git@davidddundas.com
 * that can be used for unlimited tunnel access in tests.
 *
 * Usage: bun scripts/create-superuser-bridge-key.ts
 */

import { MechStorageClient, generateBridgeKey, getKeyPrefix, hashKey } from "@liveport/shared";

async function main() {
  console.log("🔑 Creating bridge key for superuser\n");

  // Initialize database client
  const db = new MechStorageClient({
    appId: process.env.MECH_APPS_APP_ID!,
    apiKey: process.env.MECH_APPS_API_KEY!,
    baseUrl: process.env.MECH_APPS_URL || "https://storage.mechdna.net/api",
  });

  try {
    // Step 1: Find the superuser
    console.log("1️⃣  Finding superuser account...");
    const userResult = await db.query(
      `SELECT id, email, role FROM "user" WHERE email = $1`,
      ["git@davidddundas.com"]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      console.error("❌ User git@davidddundas.com not found");
      console.log("   Please sign up first at the LivePort dashboard");
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log("✅ Found user:");
    console.log("   User ID:", user.id);
    console.log("   Email:", user.email);
    console.log("   Role:", user.role || "user");

    if (user.role !== "superuser") {
      console.log("\n⚠️  User is not a superuser. Setting role...");
      await db.query(
        `UPDATE "user" SET role = 'superuser', updated_at = NOW() WHERE id = $1`,
        [user.id]
      );
      console.log("✅ Role updated to superuser");
    }

    // Step 2: Generate bridge key
    console.log("\n2️⃣  Generating bridge key...");
    const rawKey = generateBridgeKey();
    const keyPrefix = getKeyPrefix(rawKey);
    const keyHash = await hashKey(rawKey);

    console.log("✅ Key generated");
    console.log("   Prefix:", keyPrefix);

    // Step 3: Save to database
    console.log("\n3️⃣  Saving to database...");

    // Generate a unique ID
    const keyId = `bk_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    await db.query(
      `INSERT INTO bridge_keys (
        id, user_id, name, key_hash, key_prefix,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [
        keyId,
        user.id,
        "Superuser Testing Key",
        keyHash,
        keyPrefix,
        "active"
      ]
    );

    console.log("✅ Bridge key created successfully\n");
    console.log("=".repeat(70));
    console.log("\n🎉 SUCCESS! Your superuser bridge key:\n");
    console.log(`   ${rawKey}\n`);
    console.log("=".repeat(70));
    console.log("\n📝 Next steps:");
    console.log("   1. Copy the key above");
    console.log("   2. Add it to your .env file:");
    console.log(`      LIVEPORT_KEY=${rawKey}`);
    console.log("   3. Re-run your test - it will now have unlimited access!\n");
    console.log("⚠️  Keep this key secure - it has unlimited access!");
    console.log("   This key was shown only once. If lost, create a new one.\n");

  } catch (error) {
    console.error("❌ Failed to create bridge key:", error);
    process.exit(1);
  }
}

main();
