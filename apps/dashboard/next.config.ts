import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@liveport/shared", "pino", "pino-pretty", "thread-stream", "ioredis"],

  // Empty turbopack config to acknowledge we're using Turbopack
  turbopack: {},

  // Security headers
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // CORS headers for agent API routes
        source: "/api/agent/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ];
  },
};

// Sentry configuration (only wraps when SENTRY_DSN is set)
const sentryWebpackPluginOptions = {
  // Suppress logs during build unless in CI
  silent: !process.env.CI,

  // Upload source maps for better error traces
  widenClientFileUpload: true,

  // Hide source maps from users
  hideSourceMaps: true,

  // Disable telemetry
  telemetry: false,

  // Don't fail build if Sentry is not configured
  disableLogger: true,
};

export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
