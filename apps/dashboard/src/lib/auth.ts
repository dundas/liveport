import { betterAuth } from "better-auth";
import { MechStorageClient, getEmailClient } from "@liveport/shared";
import { mechStorageAdapter } from "@liveport/shared/auth";

// Initialize database client
const db = new MechStorageClient({
  appId: process.env.MECH_APPS_APP_ID!,
  apiKey: process.env.MECH_APPS_API_KEY!,
  baseUrl: process.env.MECH_APPS_URL || "https://storage.mechdna.net/api",
});

// Build social providers config (only include if credentials are set)
const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  database: mechStorageAdapter(db),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: !!process.env.CIRCLEINBOX_API_KEY, // Enable if email is configured
    sendResetPassword: async ({ user, url }) => {
      if (!process.env.CIRCLEINBOX_API_KEY) {
        console.warn("CIRCLEINBOX_API_KEY not set, skipping password reset email");
        return;
      }
      try {
        const emailClient = getEmailClient();
        const result = await emailClient.sendPasswordReset(user.email, url);
        if (!result.success) {
          console.error("Failed to send password reset email:", result.error);
          throw new Error(result.error?.message || "Failed to send email");
        }
      } catch (error) {
        console.error("Email sending error:", error);
        throw error;
      }
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      if (!process.env.CIRCLEINBOX_API_KEY) {
        console.warn("CIRCLEINBOX_API_KEY not set, skipping verification email");
        return;
      }
      try {
        const emailClient = getEmailClient();
        const result = await emailClient.sendEmailConfirmation(user.email, url);
        if (!result.success) {
          console.error("Failed to send verification email:", result.error);
          throw new Error(result.error?.message || "Failed to send email");
        }
      } catch (error) {
        console.error("Email sending error:", error);
        throw error;
      }
    },
    sendOnSignUp: true,
  },
  socialProviders: Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
  },
});

export type Session = typeof auth.$Infer.Session;

/**
 * User type extended with role field
 */
export type User = typeof auth.$Infer.Session.user & {
  role?: "user" | "superuser";
};
