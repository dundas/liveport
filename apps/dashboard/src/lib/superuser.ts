/**
 * Superuser Utilities for Dashboard
 *
 * Helpers for checking and enforcing superuser access in the dashboard.
 */

import { NextResponse } from "next/server";
import { isSuperuser } from "@liveport/shared/auth";
import type { User } from "./auth";

/**
 * Check if a user has superuser access
 * @param user - User object from session
 * @returns true if the user is a superuser
 */
export function isUserSuperuser(user: User): boolean {
  if (!user.email) return false;

  // Check both role field and email hardcoded list
  const role = (user as any).role as string | undefined;
  return isSuperuser(user.email, role);
}

/**
 * Middleware helper to enforce superuser access on API routes
 * Returns an unauthorized response if the user is not a superuser
 *
 * @example
 * ```ts
 * export async function GET() {
 *   const session = await auth.api.getSession({ headers: await headers() });
 *   if (!session?.user) {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 *
 *   const superuserCheck = requireSuperuser(session.user);
 *   if (superuserCheck) return superuserCheck;
 *
 *   // User is a superuser, proceed with unlimited access...
 * }
 * ```
 */
export function requireSuperuser(user: User): NextResponse | null {
  if (!isUserSuperuser(user)) {
    return NextResponse.json(
      { error: "Forbidden: Superuser access required" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Check if a user should bypass billing/rate limits
 * Superusers get unlimited access
 */
export function hasBypassLimits(user: User): boolean {
  return isUserSuperuser(user);
}

/**
 * Get display info for superuser badge
 */
export function getSuperuserBadge(user: User): { show: boolean; text: string } {
  if (isUserSuperuser(user)) {
    return { show: true, text: "Superuser" };
  }
  return { show: false, text: "" };
}
