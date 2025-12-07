import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";
import {
  getClientIP,
  checkRateLimitAsync,
  AuthRateLimits,
  rateLimitedResponse,
} from "@/lib/rate-limit";

const authHandler = toNextJsHandler(auth);

// Rate limit configuration for sensitive auth endpoints
const RATE_LIMITED_ENDPOINTS = {
  "forget-password": AuthRateLimits.passwordReset,
  "reset-password": AuthRateLimits.passwordReset,
  "sign-in": AuthRateLimits.login,
  "sign-up": AuthRateLimits.signup,
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

  return authHandler.POST(req);
}

export const GET = authHandler.GET;
