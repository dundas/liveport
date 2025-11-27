/**
 * Agent Tunnels API
 *
 * GET /api/agent/tunnels - List active tunnels for a bridge key
 */

import { NextRequest, NextResponse } from "next/server";
import { validateBridgeKey } from "@/lib/bridge-key-auth";

// Tunnel server URL for internal API calls
const TUNNEL_SERVER_URL = process.env.TUNNEL_SERVER_URL || "http://localhost:8080";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * GET /api/agent/tunnels - List active tunnels for the authenticated bridge key
 */
export async function GET(request: NextRequest) {
  // Validate bridge key
  const auth = await validateBridgeKey(request);

  if (!auth.valid) {
    return NextResponse.json(
      { error: auth.error, code: auth.errorCode },
      { status: 401 }
    );
  }

  try {
    // Query tunnel server for active tunnels
    const tunnelResponse = await fetch(
      `${TUNNEL_SERVER_URL}/api/tunnels/by-key/${auth.keyId}`,
      {
        headers: {
          "X-API-Secret": INTERNAL_API_SECRET || "",
        },
      }
    );

    if (!tunnelResponse.ok) {
      console.error("[AgentAPI] Failed to fetch tunnels from tunnel server");
      return NextResponse.json(
        { error: "Failed to fetch tunnels", code: "TUNNEL_SERVER_ERROR" },
        { status: 502 }
      );
    }

    const data = await tunnelResponse.json();

    return NextResponse.json({
      tunnels: data.tunnels || [],
    });
  } catch (error) {
    console.error("[AgentAPI] Error fetching tunnels:", error);
    return NextResponse.json(
      { error: "Internal error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
