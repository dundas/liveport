/**
 * Bridge Key API Routes
 * 
 * GET  /api/keys - List all bridge keys for the current user
 * POST /api/keys - Create a new bridge key
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getBridgeKeyRepository } from "@/lib/db";
import { generateBridgeKey, getKeyPrefix, type BridgeKey } from "@liveport/shared";

// Simple hash function for bridge keys (in production, use bcrypt/argon2)
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * GET /api/keys - List user's bridge keys
 */
export async function GET() {
  try {
    // Get session
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repo = getBridgeKeyRepository();
    const { keys } = await repo.findByUserId(session.user.id);

    // Transform keys for response (never expose key_hash)
    const responseKeys = keys.map((k: BridgeKey) => ({
      id: k.id,
      name: k.keyPrefix, // Use prefix as display name for now
      prefix: k.keyPrefix,
      status: k.status,
      expiresAt: k.expiresAt.toISOString(),
      maxUses: k.maxUses,
      currentUses: k.currentUses,
      allowedPort: k.allowedPort,
      createdAt: k.createdAt.toISOString(),
      updatedAt: k.updatedAt.toISOString(),
    }));

    return NextResponse.json({ keys: responseKeys });
  } catch (error) {
    console.error("[API] GET /api/keys error:", error);
    return NextResponse.json(
      { error: "Failed to fetch keys" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/keys - Create a new bridge key
 */
export async function POST(request: NextRequest) {
  try {
    // Get session
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const {
      expiresIn = "6h", // 1h, 6h, 24h, 7d
      maxUses,
      allowedPort,
    } = body as {
      expiresIn?: "1h" | "6h" | "24h" | "7d";
      maxUses?: number;
      allowedPort?: number;
    };

    // Calculate expiration
    const expirationMap: Record<string, number> = {
      "1h": 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
    };
    const expiresAt = new Date(Date.now() + (expirationMap[expiresIn] || expirationMap["6h"]));

    // Generate the bridge key
    const rawKey = generateBridgeKey();
    const keyPrefix = getKeyPrefix(rawKey);
    const keyHash = await hashKey(rawKey);

    // Create in database
    const repo = getBridgeKeyRepository();
    const created = await repo.create({
      userId: session.user.id,
      keyHash,
      keyPrefix,
      expiresAt,
      maxUses: maxUses || undefined,
      allowedPort: allowedPort || undefined,
    });

    // Return the full key ONCE (it will never be shown again)
    return NextResponse.json({
      key: rawKey, // Only returned on creation!
      id: created.id,
      prefix: created.keyPrefix,
      expiresAt: created.expiresAt.toISOString(),
      maxUses: created.maxUses,
      allowedPort: created.allowedPort,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[API] POST /api/keys error:", error);
    return NextResponse.json(
      { error: "Failed to create key" },
      { status: 500 }
    );
  }
}
