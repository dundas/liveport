import { createClearAuthNode } from "clearauth/node";

// Lazy-initialize auth to avoid throwing during Next.js build (page data collection).
// Env vars are only available at runtime on Vercel, not at build time.
let _auth: ReturnType<typeof createClearAuthNode> | null = null;

function createAuth() {
  if (!process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET is required for ClearAuth");
  }
  if (!process.env.MECH_APPS_APP_ID || !process.env.MECH_APPS_API_KEY) {
    throw new Error("MECH_APPS_APP_ID and MECH_APPS_API_KEY are required for database connection");
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || "http://localhost:3001";

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

  return createClearAuthNode({
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
  });
}

export const auth = new Proxy({} as ReturnType<typeof createClearAuthNode>, {
  get(_target, prop, receiver) {
    if (!_auth) _auth = createAuth();
    return Reflect.get(_auth, prop, receiver);
  },
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
