/**
 * ClearAuth Client
 *
 * Client-side authentication utilities for React components.
 * Re-exports ClearAuth's React hooks and utilities.
 */

export {
  AuthProvider,
  useAuth,
  useUser,
  useIsAuthenticated,
} from "clearauth/react";

/**
 * Base URL for auth API endpoints
 * ClearAuth expects routes at /api/auth/[...clearauth]
 */
export const AUTH_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL
  ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth`
  : "/api/auth";
