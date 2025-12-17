import { NextRequest, NextResponse } from "next/server";
import { validateBridgeKey } from "@/lib/bridge-key-auth";
import { getLogger } from "@/lib/logger";
import { checkRateLimitAsync } from "@/lib/rate-limit";

const logger = getLogger("dashboard:api:agent:proxy:token");

const TUNNEL_SERVER_URL = process.env.TUNNEL_SERVER_URL || "http://localhost:8080";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;
const PROXY_GATEWAY_URL = process.env.PROXY_GATEWAY_URL || TUNNEL_SERVER_URL;

export async function POST(request: NextRequest) {
  const auth = await validateBridgeKey(request);

  if (!auth.valid) {
    return NextResponse.json({ error: auth.error, code: auth.errorCode }, { status: 401 });
  }

  const rateLimit = await checkRateLimitAsync(auth.keyId!, {
    maxRequests: 30,
    windowMs: 60_000,
    keyPrefix: "agent:proxy:token",
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
        },
      }
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const bridgeKey = match?.[1];

  const body = (await request.json().catch(() => null)) as
    | {
        provider?: string;
        providerOptions?: Record<string, unknown>;
        ttlSeconds?: number;
      }
    | null;

  try {
    const tokenResponse = await fetch(`${TUNNEL_SERVER_URL}/api/proxy/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Secret": INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({
        keyId: auth.keyId,
        provider: body?.provider,
        providerOptions: body?.providerOptions,
        ttlSeconds: body?.ttlSeconds,
      }),
    });

    if (!tokenResponse.ok) {
      logger.error({ status: tokenResponse.status, keyId: auth.keyId }, "Failed to mint proxy token");
      return NextResponse.json(
        { error: "Failed to mint proxy token", code: "TUNNEL_SERVER_ERROR" },
        { status: 502 }
      );
    }

    const data = (await tokenResponse.json().catch(() => null)) as
      | { token?: string; expiresAt?: string; provider?: string }
      | null;

    if (!data?.token || !data.expiresAt) {
      return NextResponse.json(
        { error: "Invalid response from tunnel server", code: "TUNNEL_SERVER_ERROR" },
        { status: 502 }
      );
    }

    if (!bridgeKey) {
      return NextResponse.json(
        { error: "Missing bridge key", code: "INVALID_AUTH" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      proxy: {
        server: PROXY_GATEWAY_URL,
        username: bridgeKey,
        password: data.token,
        expiresAt: data.expiresAt,
        provider: data.provider,
      },
    });
  } catch (error) {
    logger.error({ err: error, keyId: auth.keyId }, "Error minting proxy token");
    return NextResponse.json(
      { error: "Internal error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
