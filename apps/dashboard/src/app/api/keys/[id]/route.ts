/**
 * Bridge Key API Routes - Single Key Operations
 * 
 * DELETE /api/keys/[id] - Revoke a bridge key
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getBridgeKeyRepository } from "@/lib/db";

/**
 * DELETE /api/keys/[id] - Revoke a bridge key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get session
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Key ID required" }, { status: 400 });
    }

    const repo = getBridgeKeyRepository();

    // First, verify the key belongs to this user
    const existingKey = await repo.findById(id);

    if (!existingKey) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    if (existingKey.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Revoke the key
    const revokedKey = await repo.revoke(id);

    if (!revokedKey) {
      return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
    }

    return NextResponse.json({
      id: revokedKey.id,
      status: revokedKey.status,
      message: "Key revoked successfully",
    });
  } catch (error) {
    console.error("[API] DELETE /api/keys/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to revoke key" },
      { status: 500 }
    );
  }
}
