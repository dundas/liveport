/**
 * Tunnels API
 *
 * GET /api/tunnels - List active tunnels for the authenticated user
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getBridgeKeyRepository } from "@/lib/db";

// Tunnel server URL for internal API calls
const TUNNEL_SERVER_URL = process.env.TUNNEL_SERVER_URL || "http://localhost:8080";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * GET /api/tunnels - List active tunnels for the authenticated user
 */
export async function GET(request: NextRequest) {
  // Get session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Get all bridge keys for this user
    const repo = getBridgeKeyRepository();
    const { keys } = await repo.findByUserId(session.user.id);

    if (keys.length === 0) {
      return NextResponse.json({ tunnels: [] });
    }

    // Fetch tunnels for each key from tunnel server
    const allTunnels = await Promise.all(
      keys.map(async (key) => {
        try {
          const response = await fetch(
            `${TUNNEL_SERVER_URL}/api/tunnels/by-key/${key.id}`,
            {
              headers: {
                "X-API-Secret": INTERNAL_API_SECRET || "",
              },
            }
          );

          if (!response.ok) {
            return [];
          }

          const data = await response.json();
          // Add key name to each tunnel
          return (data.tunnels || []).map((t: Record<string, unknown>) => ({
            ...t,
            keyName: key.name,
          }));
        } catch {
          return [];
        }
      })
    );

    // Flatten and return
    const tunnels = allTunnels.flat();

    return NextResponse.json({
      tunnels: tunnels.map((t) => ({
        id: t.tunnelId,
        subdomain: t.subdomain,
        localPort: t.localPort,
        state: t.state,
        connectedAt: t.createdAt,
        requestCount: t.requestCount || 0,
        keyName: t.keyName,
      })),
    });
  } catch (error) {
    console.error("[TunnelsAPI] Error fetching tunnels:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
