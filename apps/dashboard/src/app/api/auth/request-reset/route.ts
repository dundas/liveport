/**
 * Custom password reset request route
 *
 * ClearAuth v0.3.2's built-in handler doesn't pass the onTokenGenerated
 * callback, so emails never get sent. This route calls requestPasswordReset
 * directly with a callback that sends the reset email via CircleInbox.
 *
 * NOTE: Depends on auth.database (Kysely instance) from ClearAuth internals.
 * If ClearAuth is upgraded, verify that auth.database is still accessible.
 * Remove this route if a future ClearAuth version supports email callbacks in config.
 */

import { NextRequest, NextResponse } from "next/server";
import { requestPasswordReset } from "clearauth";
import { auth } from "@/lib/auth";
import { getEmailClient } from "@liveport/shared/email";
import {
  getClientIP,
  checkRateLimitAsync,
  AuthRateLimits,
  rateLimitedResponse,
} from "@/lib/rate-limit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUCCESS_RESPONSE = {
  success: true,
  message: "If your email is registered, you will receive a password reset link.",
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limit
  const ip = getClientIP(req);
  const rateLimitResult = await checkRateLimitAsync(ip, AuthRateLimits.passwordReset);
  if (!rateLimitResult.success) {
    return rateLimitedResponse(rateLimitResult);
  }

  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      // Return success anyway to prevent email enumeration
      return NextResponse.json(SUCCESS_RESPONSE);
    }

    const baseUrl = process.env.BASE_URL || req.nextUrl.origin;

    // Use ClearAuth's requestPasswordReset with the email callback
    // TODO: Remove this route once ClearAuth supports onTokenGenerated in config

    await requestPasswordReset(
      auth.database,
      email,
      async (userEmail: string, token: string) => {
        const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
        const emailClient = getEmailClient();
        const result = await emailClient.sendPasswordReset(userEmail, resetUrl);
        if (!result.success) {
          console.error("[PasswordReset] Failed to send email:", result.error);
        }
      }
    );

    return NextResponse.json(SUCCESS_RESPONSE);
  } catch (error) {
    console.error("[PasswordReset] Error:", error);
    // Always return success to prevent email enumeration
    return NextResponse.json(SUCCESS_RESPONSE);
  }
}
