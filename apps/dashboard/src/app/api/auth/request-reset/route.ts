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
import { auth } from "@/lib/auth";
import { getEmailClient } from "@liveport/shared/email";
import {
  getClientIP,
  checkRateLimitAsync,
  AuthRateLimits,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit
  const ip = getClientIP(req);
  const rateLimitResult = await checkRateLimitAsync(ip, AuthRateLimits.passwordReset);
  if (!rateLimitResult.success) {
    return rateLimitedResponse(rateLimitResult);
  }

  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      // Return success anyway to prevent email enumeration
      return NextResponse.json({
        success: true,
        message: "If your email is registered, you will receive a password reset link.",
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || "http://localhost:3001";

    // Use ClearAuth's requestPasswordReset with the email callback
    const { requestPasswordReset } = await import("clearauth");

    await requestPasswordReset(
      auth.database,
      email,
      async (userEmail: string, token: string) => {
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;
        const emailClient = getEmailClient();
        const result = await emailClient.sendPasswordReset(userEmail, resetUrl);
        if (!result.success) {
          console.error("[PasswordReset] Failed to send email:", result.error);
        }
      }
    );

    return NextResponse.json({
      success: true,
      message: "If your email is registered, you will receive a password reset link.",
    });
  } catch (error) {
    console.error("[PasswordReset] Error:", error);
    // Always return success to prevent email enumeration
    return NextResponse.json({
      success: true,
      message: "If your email is registered, you will receive a password reset link.",
    });
  }
}
