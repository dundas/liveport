// Sentry edge runtime configuration
// This file configures Sentry for Edge/Middleware runtime

import * as Sentry from "@sentry/nextjs";

// Only initialize if DSN is available
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Environment
    environment: process.env.NODE_ENV,

    // Only enable in production or when explicitly configured
    enabled: process.env.NODE_ENV === "production" || !!process.env.SENTRY_DSN,
  });
}
