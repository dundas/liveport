import { createClearAuthNode } from "clearauth/node";

// Validate required environment variables
if (!process.env.AUTH_SECRET) {
  throw new Error("AUTH_SECRET is required for ClearAuth");
}

if (!process.env.MECH_APPS_APP_ID || !process.env.MECH_APPS_API_KEY) {
  throw new Error("MECH_APPS_APP_ID and MECH_APPS_API_KEY are required for database connection");
}

// Get base URL for OAuth redirects
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || "http://localhost:3001";

// Build OAuth providers config
const oauthProviders: {
  github?: { clientId: string; clientSecret: string; redirectUri: string };
  google?: { clientId: string; clientSecret: string; redirectUri: string };
} = {};

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  oauthProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectUri: `${baseUrl}/api/auth/callback/github`,
  };
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauthProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${baseUrl}/api/auth/callback/google`,
  };
}

export const auth = createClearAuthNode({
  secret: process.env.AUTH_SECRET,
  baseUrl,
  database: {
    appId: process.env.MECH_APPS_APP_ID,
    apiKey: process.env.MECH_APPS_API_KEY,
    baseUrl: process.env.MECH_APPS_URL,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
  },
  oauth: Object.keys(oauthProviders).length > 0 ? oauthProviders : undefined,
  // TODO: Add email verification support for ClearAuth
  // ClearAuth handles email verification differently than Better Auth
});

/**
 * Session type from ClearAuth
 */
export type Session = {
  id: string;
  userId: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * User type from ClearAuth with LivePort extensions
 */
export type User = {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
  githubId?: string;
  googleId?: string;
  role?: "user" | "superuser";
};
