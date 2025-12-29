import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",

  // Enable instrumentation for startup validation
  experimental: {
    instrumentationHook: true,
  },

  // Externalize Node.js packages that shouldn't be bundled
  serverExternalPackages: [
    "@liveport/shared",
    "pino",
    "pino-pretty",
    "thread-stream",
    "ioredis",
    "sonic-boom",
  ],

  // Empty turbopack config to acknowledge we're using Turbopack
  turbopack: {},

  // Webpack config to handle pino and other Node.js modules
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize pino and related packages to avoid bundling issues
      config.externals = config.externals || [];
      config.externals.push({
        'pino': 'commonjs pino',
        'pino-pretty': 'commonjs pino-pretty',
        'thread-stream': 'commonjs thread-stream',
        'sonic-boom': 'commonjs sonic-boom',
      });
    }

    // Ignore test files from node_modules
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.test\.(js|ts)$/,
      loader: 'ignore-loader',
    });

    return config;
  },

  // Rewrites for clean URLs
  async rewrites() {
    return [
      {
        // Allow curl -fsSL https://liveport.dev/cli | sh
        source: "/cli",
        destination: "/api/cli",
      },
      {
        // Alternative install path
        source: "/install",
        destination: "/api/cli",
      },
    ];
  },

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
