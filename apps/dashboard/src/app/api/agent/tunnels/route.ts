/**
 * Agent Tunnels API
 *
 * GET /api/agent/tunnels - List active tunnels for a bridge key
 */

import { NextRequest, NextResponse } from "next/server";
import { validateBridgeKey } from "@/lib/bridge-key-auth";
import { getLogger } from "@liveport/shared/logging";
import { checkRateLimit } from "@/lib/rate-limit";

const logger = getLogger("dashboard:api:agent:tunnels");

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

  // Rate limiting - 60 requests per minute per key
  const rateLimit = await checkRateLimit(auth.keyId!, {
    maxRequests: 60,
    windowMs: 60_000,
    keyPrefix: "agent:tunnels",
  });

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" },
      { 
        status: 429,
        headers: {
          "X-RateLimit-Limit": rateLimit.limit.toString(),
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Reset": rateLimit.resetAt.toString(),
        }
      }
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
      logger.error({ keyId: auth.keyId, status: tunnelResponse.status }, "Failed to fetch tunnels from tunnel server");
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
    logger.error({ err: error, keyId: auth.keyId }, "Error fetching tunnels");
    return NextResponse.json(
      { error: "Internal error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
