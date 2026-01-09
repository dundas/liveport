/**
 * Tunnels API
 *
 * GET /api/tunnels - List active tunnels for the authenticated user
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getBridgeKeyRepository } from "@/lib/db";
import { getLogger } from "@/lib/logger";

const logger = getLogger("dashboard:api:tunnels");

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

    // Sanitize tunnel names to prevent XSS
    const sanitizeName = (name: string | undefined): string | undefined => {
      if (!name) return undefined;
      // Remove any HTML/script tags and escape special characters
      return name
        .replace(/[<>]/g, "") // Remove angle brackets
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .replace(/\//g, "&#x2F;")
        .substring(0, 100); // Ensure max length
    };

    return NextResponse.json({
      tunnels: tunnels.map((t) => ({
        id: t.tunnelId,
        subdomain: t.subdomain,
        url: t.url, // Full URL from tunnel server (includes correct domain)
        name: sanitizeName(t.name),
        localPort: t.localPort,
        state: t.state,
        connectedAt: t.createdAt,
        requestCount: t.requestCount || 0,
        keyName: t.keyName,
      })),
    });
  } catch (error) {
    logger.error({ err: error, userId: session.user.id }, "Failed to fetch tunnels");
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
