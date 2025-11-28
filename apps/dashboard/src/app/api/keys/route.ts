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
import { generateBridgeKey, getKeyPrefix, hashKey, type BridgeKey } from "@liveport/shared";
import { getLogger } from "@/lib/logger";

const logger = getLogger("dashboard:api:keys");

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
      name: k.name,
      prefix: k.keyPrefix,
      status: k.status,
      expiresAt: k.expiresAt?.toISOString() || null,
      maxUses: k.maxUses,
      currentUses: k.currentUses,
      allowedPort: k.allowedPort,
      lastUsedAt: k.lastUsedAt?.toISOString() || null,
      createdAt: k.createdAt.toISOString(),
      updatedAt: k.updatedAt.toISOString(),
    }));

    return NextResponse.json({ keys: responseKeys });
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch bridge keys");
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
  let userId: string | undefined;
  
  try {
    // Get session
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    userId = session.user.id;

    // Parse request body
    const body = await request.json();
    const {
      name = "API Key",
      expiresInDays,
      maxUses,
      allowedPort,
    } = body as {
      name?: string;
      expiresInDays?: number;
      maxUses?: number;
      allowedPort?: number;
    };

    // Calculate expiration (optional - keys can be non-expiring)
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    // Generate the bridge key
    const rawKey = generateBridgeKey();
    const keyPrefix = getKeyPrefix(rawKey);
    const keyHash = await hashKey(rawKey);

    // Create in database
    const repo = getBridgeKeyRepository();
    const created = await repo.create({
      userId,
      name,
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
      name: created.name,
      prefix: created.keyPrefix,
      expiresAt: created.expiresAt?.toISOString() || null,
      maxUses: created.maxUses,
      allowedPort: created.allowedPort,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (error) {
    logger.error({ err: error, userId }, "Failed to create bridge key");
    return NextResponse.json(
      { error: "Failed to create key" },
      { status: 500 }
    );
  }
}
