import { betterAuth } from "better-auth";
import { MechStorageClient, mechStorageAdapter } from "@liveport/shared";

// Initialize database client
const db = new MechStorageClient({
  appId: process.env.MECH_APPS_APP_ID!,
  apiKey: process.env.MECH_APPS_API_KEY!,
  baseUrl: process.env.MECH_APPS_URL || "https://mech-apps.fly.dev",
});

export const auth = betterAuth({
  database: mechStorageAdapter(db),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Disable for MVP
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
