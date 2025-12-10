/**
 * Basic Usage Example
 *
 * This example shows the simplest way to use the LivePort Agent SDK
 * to wait for a tunnel and access a local development server.
 */

import { LivePortAgent } from "@liveport/agent-sdk";

async function main() {
  // Create agent instance with your bridge key
  const agent = new LivePortAgent({
    key: process.env.LIVEPORT_KEY || "lpk_your_bridge_key_here",
  });

  console.log("Waiting for tunnel to become available...");

  try {
    // Wait for tunnel (default 30 second timeout)
    const tunnel = await agent.waitForTunnel();

    console.log("✓ Tunnel established!");
    console.log(`  URL: ${tunnel.url}`);
    console.log(`  Local Port: ${tunnel.localPort}`);
    console.log(`  Subdomain: ${tunnel.subdomain}`);

    // Now you can make requests to the tunnel URL
    const response = await fetch(`${tunnel.url}/api/health`);
    const data = await response.json();

    console.log("Health check response:", data);
  } catch (error) {
    console.error("Failed to get tunnel:", error);
  } finally {
    // Clean up
    await agent.disconnect();
  }
}

main();
