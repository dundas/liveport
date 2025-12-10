/**
 * Error Handling Example
 *
 * This example demonstrates proper error handling patterns
 * when using the LivePort Agent SDK.
 */

import {
  LivePortAgent,
  TunnelTimeoutError,
  ApiError,
} from "@liveport/agent-sdk";

async function robustTunnelAccess() {
  const agent = new LivePortAgent({
    key: process.env.LIVEPORT_KEY!,
    timeout: 30000,
  });

  try {
    console.log("⏳ Waiting for tunnel...");

    const tunnel = await agent.waitForTunnel({
      timeout: 30000,
      pollInterval: 2000,
    });

    console.log(`✓ Connected to ${tunnel.url}`);

    // Your application logic here
    await runTests(tunnel.url);
  } catch (error) {
    // Handle specific error types
    if (error instanceof TunnelTimeoutError) {
      console.error("\n❌ Tunnel Timeout");
      console.error("   No tunnel became available within the timeout period.");
      console.error("\n💡 Make sure to:");
      console.error("   1. Start your local server (e.g., npm run dev)");
      console.error("   2. Run: liveport connect <port>");
      console.error("   3. Wait for tunnel URL to appear");
      console.error("   4. Then run this script again");
      process.exit(1);
    } else if (error instanceof ApiError) {
      console.error(`\n❌ API Error [${error.code}]`);
      console.error(`   ${error.message}`);
      console.error(`   Status: ${error.statusCode}`);

      // Handle specific error codes
      switch (error.code) {
        case "INVALID_KEY":
          console.error("\n💡 Your bridge key is invalid or expired.");
          console.error("   Get a new key at: https://liveport.dev/keys");
          break;

        case "EXPIRED_KEY":
          console.error("\n💡 Your bridge key has expired.");
          console.error("   Create a new key at: https://liveport.dev/keys");
          break;

        case "REVOKED_KEY":
          console.error("\n💡 Your bridge key has been revoked.");
          console.error("   Create a new key at: https://liveport.dev/keys");
          break;

        case "USAGE_LIMIT_EXCEEDED":
          console.error("\n💡 Your bridge key has exceeded its usage limit.");
          console.error("   Create a new key or increase the limit at:");
          console.error("   https://liveport.dev/keys");
          break;

        case "RATE_LIMIT_EXCEEDED":
          console.error("\n💡 Too many requests. Please wait and try again.");
          break;

        default:
          console.error("\n💡 Please check your configuration and try again.");
      }

      process.exit(1);
    } else if (error instanceof Error) {
      console.error("\n❌ Unexpected Error");
      console.error(`   ${error.message}`);
      console.error("\n💡 Please report this issue at:");
      console.error("   https://github.com/dundas/liveport/issues");
      process.exit(1);
    } else {
      console.error("\n❌ Unknown Error");
      console.error(error);
      process.exit(1);
    }
  } finally {
    // Always clean up
    await agent.disconnect();
  }
}

async function runTests(tunnelUrl: string) {
  console.log("\n🧪 Running tests...");

  try {
    // Example test with retry logic
    const response = await fetchWithRetry(`${tunnelUrl}/api/health`, {
      maxRetries: 3,
      retryDelay: 1000,
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    console.log("✓ Health check passed");

    // More tests...
    console.log("✓ All tests passed!");
  } catch (error) {
    console.error("✗ Tests failed:", error);
    throw error;
  }
}

async function fetchWithRetry(
  url: string,
  options: { maxRetries?: number; retryDelay?: number } = {}
): Promise<Response> {
  const { maxRetries = 3, retryDelay = 1000 } = options;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });

      return response;
    } catch (error) {
      if (i === maxRetries) {
        throw error;
      }

      console.log(`   Retry ${i + 1}/${maxRetries} after ${retryDelay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  throw new Error("Max retries exceeded");
}

// Run with proper error handling
robustTunnelAccess();
