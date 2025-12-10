/**
 * Multiple Tunnels Example
 *
 * This example shows how to work with multiple tunnels
 * when testing microservices or multi-service architectures.
 */

import { LivePortAgent } from "@liveport/agent-sdk";

async function main() {
  const agent = new LivePortAgent({
    key: process.env.LIVEPORT_KEY!,
  });

  console.log("🔍 Checking for available tunnels...\n");

  try {
    // List all active tunnels for this bridge key
    const tunnels = await agent.listTunnels();

    if (tunnels.length === 0) {
      console.log("No tunnels available.");
      console.log("Start one or more tunnels with:");
      console.log("  liveport connect 3000  # API server");
      console.log("  liveport connect 3001  # Web server");
      console.log("  liveport connect 5432  # Database");
      return;
    }

    console.log(`Found ${tunnels.length} active tunnel(s):\n`);

    // Display tunnel information
    for (const tunnel of tunnels) {
      console.log(`📍 ${tunnel.subdomain}`);
      console.log(`   URL: ${tunnel.url}`);
      console.log(`   Local Port: ${tunnel.localPort}`);
      console.log(`   Created: ${tunnel.createdAt.toLocaleString()}`);
      console.log(`   Expires: ${tunnel.expiresAt.toLocaleString()}`);
      console.log();
    }

    // Example: Test each tunnel
    console.log("Testing each tunnel...\n");

    for (const tunnel of tunnels) {
      try {
        const response = await fetch(tunnel.url, {
          signal: AbortSignal.timeout(5000),
        });

        console.log(
          `✓ ${tunnel.subdomain.padEnd(30)} [${response.status}] ${response.statusText}`
        );
      } catch (error) {
        console.log(`✗ ${tunnel.subdomain.padEnd(30)} [ERROR] ${error}`);
      }
    }

    // Example: Find specific service by port
    const apiTunnel = tunnels.find((t) => t.localPort === 3000);
    if (apiTunnel) {
      console.log(`\n🎯 Found API server at ${apiTunnel.url}`);

      // Run API-specific tests
      const health = await fetch(`${apiTunnel.url}/health`);
      console.log(`   Health check: ${health.status}`);
    }

    const webTunnel = tunnels.find((t) => t.localPort === 3001);
    if (webTunnel) {
      console.log(`\n🎯 Found web server at ${webTunnel.url}`);

      // Run web-specific tests
      const homepage = await fetch(webTunnel.url);
      console.log(`   Homepage: ${homepage.status}`);
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await agent.disconnect();
  }
}

main();
