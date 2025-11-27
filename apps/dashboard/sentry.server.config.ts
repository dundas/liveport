// Sentry server-side configuration
// This file configures Sentry for Node.js server runtime

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

    // Capture unhandled promise rejections
    integrations: [
      Sentry.captureConsoleIntegration({ levels: ["error"] }),
    ],

    // Before sending, scrub sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
        delete event.request.headers["x-api-key"];
      }
      return event;
    },
  });
}
