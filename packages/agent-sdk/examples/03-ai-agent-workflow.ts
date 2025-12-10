/**
 * AI Agent Workflow Example
 *
 * This example demonstrates how an AI agent might use the SDK
 * to interact with a developer's local application.
 */

import { LivePortAgent, ApiError } from "@liveport/agent-sdk";

interface TestResult {
  endpoint: string;
  status: "pass" | "fail";
  responseTime: number;
  statusCode?: number;
  error?: string;
}

class AIAgentTester {
  private agent: LivePortAgent;
  private results: TestResult[] = [];

  constructor(bridgeKey: string) {
    this.agent = new LivePortAgent({
      key: bridgeKey,
      timeout: 120000, // 2 minute timeout for tunnel
    });
  }

  async run(): Promise<void> {
    console.log("🤖 AI Agent Test Runner Starting...\n");

    try {
      // Step 1: Wait for tunnel
      console.log("⏳ Waiting for developer to start tunnel...");
      const tunnel = await this.agent.waitForTunnel({
        timeout: 120000,
      });

      console.log(`✓ Tunnel established: ${tunnel.url}`);
      console.log(`  Port: ${tunnel.localPort}`);
      console.log(`  Expires: ${tunnel.expiresAt.toLocaleString()}\n`);

      // Step 2: Discover available endpoints
      console.log("🔍 Discovering API endpoints...");
      const baseUrl = tunnel.url;

      // Test common endpoints
      const endpoints = [
        "/",
        "/api/health",
        "/api/users",
        "/api/products",
        "/api/auth/login",
      ];

      // Step 3: Test each endpoint
      for (const endpoint of endpoints) {
        await this.testEndpoint(baseUrl, endpoint);
      }

      // Step 4: Report results
      this.printResults();

      // Step 5: Analyze and provide recommendations
      this.analyzeResults();
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(`❌ API Error [${error.code}]: ${error.message}`);
      } else {
        console.error("❌ Error:", error);
      }
    } finally {
      await this.agent.disconnect();
    }
  }

  private async testEndpoint(
    baseUrl: string,
    endpoint: string
  ): Promise<void> {
    const start = Date.now();

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        signal: AbortSignal.timeout(5000), // 5 second timeout per request
      });

      const responseTime = Date.now() - start;

      this.results.push({
        endpoint,
        status: response.ok ? "pass" : "fail",
        responseTime,
        statusCode: response.status,
      });

      const emoji = response.ok ? "✓" : "✗";
      console.log(
        `  ${emoji} ${endpoint.padEnd(20)} [${response.status}] ${responseTime}ms`
      );
    } catch (error) {
      const responseTime = Date.now() - start;

      this.results.push({
        endpoint,
        status: "fail",
        responseTime,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      console.log(`  ✗ ${endpoint.padEnd(20)} [ERROR] ${error}`);
    }
  }

  private printResults(): void {
    console.log("\n📊 Test Results Summary");
    console.log("=" .repeat(50));

    const passed = this.results.filter((r) => r.status === "pass").length;
    const failed = this.results.filter((r) => r.status === "fail").length;
    const avgTime =
      this.results.reduce((sum, r) => sum + r.responseTime, 0) /
      this.results.length;

    console.log(`Total Endpoints: ${this.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Average Response Time: ${avgTime.toFixed(0)}ms`);
  }

  private analyzeResults(): void {
    console.log("\n💡 AI Analysis & Recommendations");
    console.log("=" .repeat(50));

    const slowEndpoints = this.results.filter((r) => r.responseTime > 1000);
    if (slowEndpoints.length > 0) {
      console.log("\n⚠️  Slow Endpoints (>1000ms):");
      slowEndpoints.forEach((r) => {
        console.log(`  - ${r.endpoint}: ${r.responseTime}ms`);
      });
      console.log("  💡 Consider optimizing database queries or adding caching");
    }

    const failedEndpoints = this.results.filter((r) => r.status === "fail");
    if (failedEndpoints.length > 0) {
      console.log("\n❌ Failed Endpoints:");
      failedEndpoints.forEach((r) => {
        console.log(`  - ${r.endpoint}: ${r.statusCode || r.error}`);
      });
      console.log("  💡 Review error handling and endpoint implementations");
    }

    const avgTime =
      this.results.reduce((sum, r) => sum + r.responseTime, 0) /
      this.results.length;
    if (avgTime < 100) {
      console.log("\n✨ Great performance! All endpoints responding quickly.");
    }
  }
}

// Run the AI agent
async function main() {
  const bridgeKey = process.env.LIVEPORT_KEY;

  if (!bridgeKey) {
    console.error("Error: LIVEPORT_KEY environment variable not set");
    process.exit(1);
  }

  const tester = new AIAgentTester(bridgeKey);
  await tester.run();
}

main();
