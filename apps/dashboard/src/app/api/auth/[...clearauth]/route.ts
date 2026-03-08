import { auth } from "@/lib/auth";
import { handleClearAuthRequest } from "clearauth";
import { NextRequest } from "next/server";
import {
  getClientIP,
  checkRateLimitAsync,
  AuthRateLimits,
  rateLimitedResponse,
} from "@/lib/rate-limit";

// Rate limit configuration for sensitive auth endpoints
const RATE_LIMITED_ENDPOINTS = {
  "/register": AuthRateLimits.signup,
  "/login": AuthRateLimits.login,
  "/reset-password": AuthRateLimits.passwordReset,
  "/request-reset": AuthRateLimits.passwordReset,
} as const;

export async function POST(req: NextRequest) {
  const pathname = new URL(req.url).pathname;

  // Check if this is a rate-limited endpoint
  for (const [endpoint, config] of Object.entries(RATE_LIMITED_ENDPOINTS)) {
    if (pathname.includes(endpoint)) {
      const ip = getClientIP(req);
      const rateLimitResult = await checkRateLimitAsync(ip, config);

      if (!rateLimitResult.success) {
        return rateLimitedResponse(rateLimitResult);
      }
      break;
    }
  }

  return handleClearAuthRequest(req, auth);
}

export async function GET(req: NextRequest) {
  const response = await handleClearAuthRequest(req, auth);

  // ClearAuth hardcodes post-OAuth redirect to "/". Rewrite to "/dashboard".
  if (response.status === 302) {
    const location = response.headers.get("Location");
    if (location === "/") {
      const headers = new Headers(response.headers);
      headers.set("Location", "/dashboard");
      return new Response(null, { status: 302, headers });
    }
  }

  return response;
}
