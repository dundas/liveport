import { cookies } from "next/headers";
import { auth } from "./auth";

/**
 * Get the current session from cookies
 * Returns null if no valid session exists
 */
export async function getServerSession() {
  const cookieStore = await cookies();

  // Get session cookie (may have __Secure- prefix in production)
  const sessionCookie =
    cookieStore.get("__Secure-session") || cookieStore.get("session");

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    // Validate session by querying database directly
    const session = await auth.database
      .selectFrom("sessions")
      .where("id", "=", sessionCookie.value)
      .where("expires_at", ">", new Date())
      .select(["id", "user_id", "expires_at", "ip_address", "user_agent", "created_at"])
      .executeTakeFirst();

    if (!session) {
      return null;
    }

    // Get user data
    const user = await auth.database
      .selectFrom("users")
      .where("id", "=", session.user_id)
      .select(["id", "email", "email_verified", "name", "avatar_url", "github_id", "google_id"])
      .executeTakeFirst();

    if (!user) {
      return null;
    }

    return {
      session: {
        id: session.id,
        userId: session.user_id,
        expiresAt: session.expires_at,
        ipAddress: session.ip_address || undefined,
        userAgent: session.user_agent || undefined,
      },
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified,
        name: user.name || undefined,
        avatarUrl: user.avatar_url || undefined,
        githubId: user.github_id || undefined,
        googleId: user.google_id || undefined,
      },
    };
  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
}

/**
 * Require authentication - throws if no valid session
 * Use in server actions or API routes that require auth
 */
export async function requireAuth() {
  const session = await getServerSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

/**
 * Get current user from session
 * Returns null if not authenticated
 */
export async function getCurrentUser() {
  const session = await getServerSession();
  return session?.user ?? null;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null;
}
