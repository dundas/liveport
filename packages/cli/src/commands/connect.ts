/**
 * Connect Command
 *
 * Creates a tunnel to expose a local port to the internet.
 */

import ora from "ora";
import { TunnelClient } from "../tunnel-client";
import { logger } from "../logger";
import { getConfigValue } from "../config";
import type { ConnectOptions } from "../types";

// Default server URL
const DEFAULT_SERVER_URL = "https://tunnel.liveport.dev";

// Active client reference for graceful shutdown
let activeClient: TunnelClient | null = null;

/**
 * Execute the connect command
 */
export async function connectCommand(
  port: string,
  options: ConnectOptions
): Promise<void> {
  const localPort = parseInt(port, 10);

  // Validate port
  if (isNaN(localPort) || localPort < 1 || localPort > 65535) {
    logger.error(`Invalid port number: ${port}`);
    process.exit(1);
  }

  // Get bridge key (priority: CLI option > env var > config file)
  const bridgeKey = getConfigValue("key", options.key, "LIVEPORT_KEY");
  if (!bridgeKey) {
    logger.error("Bridge key required. Use --key, set LIVEPORT_KEY, or run 'liveport config set key <your-key>'");
    logger.blank();
    logger.info("Get a bridge key at: https://app.liveport.dev/keys");
    process.exit(1);
  }

  // Get server URL (priority: CLI option > env var > config file > default)
  const serverUrl = getConfigValue("server", options.server, "LIVEPORT_SERVER_URL") || DEFAULT_SERVER_URL;

  // Print banner
  logger.banner();

  // Show connecting spinner
  const spinner = ora({
    text: `Connecting to tunnel server...`,
    color: "cyan",
  }).start();

  // Create tunnel client
  const client = new TunnelClient({
    serverUrl,
    bridgeKey,
    localPort,
  });

  // Store for graceful shutdown
  activeClient = client;

  // Set up event handlers
  client.on("connected", (info) => {
    spinner.stop();
    logger.connected(info.url, info.localPort);
  });

  client.on("disconnected", (reason) => {
    spinner.stop();
    logger.disconnected(reason);
    activeClient = null;
    process.exit(0);
  });

  client.on("reconnecting", (attempt, max) => {
    spinner.stop();
    logger.reconnecting(attempt, max);
    spinner.start("Reconnecting...");
  });

  client.on("error", (error) => {
    spinner.stop();
    const errorWithCode = error as Error & { code?: string };
    if (errorWithCode.code) {
      logger.error(`${errorWithCode.code}: ${error.message}`);
    } else {
      logger.error(error.message);
    }
  });

  client.on("request", (method, path) => {
    logger.request(method, path);
  });

  // Set up graceful shutdown
  setupGracefulShutdown(client);

  // Connect
  try {
    await client.connect();
  } catch (error) {
    spinner.stop();
    const err = error as Error & { code?: string };
    if (err.code) {
      logger.error(`${err.code}: ${err.message}`);
    } else {
      logger.error(`Connection failed: ${err.message}`);
    }
    process.exit(1);
  }
}

/**
 * Set up graceful shutdown handlers
 */
function setupGracefulShutdown(client: TunnelClient): void {
  const shutdown = (signal: string) => {
    logger.blank();
    logger.info(`Received ${signal}, disconnecting...`);
    client.disconnect(`${signal} received`);
    activeClient = null;
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    logger.error(`Uncaught error: ${error.message}`);
    client.disconnect("Uncaught error");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
    client.disconnect("Unhandled rejection");
    process.exit(1);
  });
}

/**
 * Get the active client (for status/disconnect commands)
 */
export function getActiveClient(): TunnelClient | null {
  return activeClient;
}

export default connectCommand;
