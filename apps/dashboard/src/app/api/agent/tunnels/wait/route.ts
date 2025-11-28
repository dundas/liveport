/**
 * Agent Tunnels Wait API
 *
 * GET /api/agent/tunnels/wait - Long-poll for tunnel availability
 */

import { NextRequest, NextResponse } from "next/server";
import { validateBridgeKey } from "@/lib/bridge-key-auth";
import { getLogger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const logger = getLogger("dashboard:api:agent:tunnels:wait");

// Tunnel server URL for internal API calls
const TUNNEL_SERVER_URL = process.env.TUNNEL_SERVER_URL || "http://localhost:8080";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

// Default and max timeout for long-polling
const DEFAULT_TIMEOUT = 5000;
const MAX_TIMEOUT = 30000;
const POLL_INTERVAL = 1000;

/**
 * GET /api/agent/tunnels/wait - Long-poll for tunnel availability
 *
 * Query params:
 *   - timeout: Max time to wait in ms (default: 5000, max: 30000)
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

  // Rate limiting - 30 requests per minute per key (lower for long-polling)
  const rateLimit = await checkRateLimit(auth.keyId!, {
    maxRequests: 30,
    windowMs: 60_000,
    keyPrefix: "agent:tunnels:wait",
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

  // Parse timeout from query params
  const url = new URL(request.url);
  const timeoutParam = url.searchParams.get("timeout");
  const timeout = Math.min(
    Math.max(parseInt(timeoutParam || String(DEFAULT_TIMEOUT), 10) || DEFAULT_TIMEOUT, 1000),
    MAX_TIMEOUT
  );

  const startTime = Date.now();

  try {
    // Long-poll until tunnel is available or timeout
    while (Date.now() - startTime < timeout) {
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
      const tunnels = data.tunnels || [];

      // If we have an active tunnel, return it
      if (tunnels.length > 0) {
        const activeTunnel = tunnels.find((t: { state: string }) => t.state === "active");
        if (activeTunnel) {
          return NextResponse.json({
            tunnel: activeTunnel,
          });
        }
      }

      // Wait before next poll
      const remaining = timeout - (Date.now() - startTime);
      if (remaining > POLL_INTERVAL) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      } else {
        break;
      }
    }

    // Timeout - no tunnel available
    return NextResponse.json(
      { error: "No tunnel available", code: "TIMEOUT" },
      { status: 408 }
    );
  } catch (error) {
    logger.error({ err: error, keyId: auth.keyId }, "Error waiting for tunnel");
    return NextResponse.json(
      { error: "Internal error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
