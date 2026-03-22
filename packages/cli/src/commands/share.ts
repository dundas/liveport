/**
 * Share Command
 *
 * Creates a temporary bridge key via the dashboard API, then connects a tunnel
 * using that key. Designed for quick sharing with teammates or agents.
 */

import ora from "ora";
import { TunnelClient } from "../tunnel-client";
import { logger } from "../logger";
import { getConfigValue } from "../config";
import { parseDuration } from "./connect";
import type { ShareOptions } from "../types";

// Default server URL (production tunnel server)
const DEFAULT_SERVER_URL = "https://tunnel.liveport.online";

// Default dashboard API URL
const DEFAULT_API_URL = "https://liveport.dev";

// Default TTL for temporary keys (2 hours)
const DEFAULT_TTL_SECONDS = 7200;

// Temp key naming convention
const TEMPORARY_KEY_NAME = "Temporary (liveport share)";

/**
 * Create a temporary bridge key via the dashboard API
 */
async function createTemporaryKey(
  apiUrl: string,
  parentKey: string,
  ttlSeconds: number,
  maxUses: number
): Promise<{ key: string; id: string; expiresAt: string }> {
  const response = await fetch(`${apiUrl}/api/agent/keys/temporary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${parentKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ttlSeconds,
      maxUses,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Execute the share command
 */
export async function shareCommand(
  port: string,
  options: ShareOptions
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
    logger.info("Get a bridge key at: https://liveport.dev/keys");
    process.exit(1);
  }

  // Get server URL for the tunnel connection
  const serverUrl = getConfigValue("server", options.server, "LIVEPORT_SERVER_URL") || DEFAULT_SERVER_URL;

  // Get dashboard API URL
  const apiUrl = process.env.LIVEPORT_API_URL || DEFAULT_API_URL;

  // Parse TTL (default 2h)
  let ttlSeconds = DEFAULT_TTL_SECONDS;
  if (options.ttl) {
    const parsed = parseDuration(options.ttl);
    if (parsed === undefined) {
      logger.warn(`Invalid TTL format "${options.ttl}" (expected e.g., 30m, 2h, 1d). Using default 2h.`);
    } else {
      ttlSeconds = parsed;
    }
  }

  const maxUses = options.maxUses ?? 1;

  // Print banner
  logger.banner();

  // Step 1: Create temporary key
  const spinner = ora({
    text: "Creating temporary bridge key...",
    color: "cyan",
  }).start();

  let tempKeyData: { key: string; id: string; expiresAt: string; maxUses: number; effectiveTtlSeconds: number };
  try {
    tempKeyData = await createTemporaryKey(apiUrl, bridgeKey, ttlSeconds, maxUses);
    spinner.stop();
    logger.success("Temporary bridge key created");
  } catch (error) {
    spinner.stop();
    const err = error as Error;
    logger.error(`Failed to create temporary key: ${err.message}`);
    process.exit(1);
  }

  // Display key info
  logger.blank();
  logger.info(`Temp Key: ${tempKeyData.key}`);
  logger.info(`Expires:  ${new Date(tempKeyData.expiresAt).toLocaleString()}`);
  logger.info(`Max Uses: ${tempKeyData.maxUses}`);
  logger.blank();

  // Step 2: Connect tunnel using the temporary key
  const connectSpinner = ora({
    text: "Connecting to tunnel server...",
    color: "cyan",
  }).start();

  const client = new TunnelClient({
    serverUrl,
    bridgeKey: tempKeyData.key,
    localPort,
    ttlSeconds,
  });

  // Set up event handlers
  client.on("connected", (info) => {
    connectSpinner.stop();
    logger.connected(info.url, info.localPort);
    if (info.expiresAt) {
      const remainingSecs = Math.round((info.expiresAt.getTime() - Date.now()) / 1000);
      if (remainingSecs < 120) {
        logger.info(`Tunnel expires in ${remainingSecs} seconds`);
      } else if (remainingSecs < 7200) {
        const mins = Math.round(remainingSecs / 60);
        logger.info(`Tunnel expires in ${mins} minute${mins === 1 ? "" : "s"}`);
      } else {
        const hours = Math.round(remainingSecs / 3600);
        logger.info(`Tunnel expires in ${hours} hour${hours === 1 ? "" : "s"}`);
      }
    }
  });

  client.on("disconnected", (reason) => {
    connectSpinner.stop();
    logger.disconnected(reason);
    process.exit(0);
  });

  client.on("reconnecting", (attempt, max) => {
    connectSpinner.stop();
    logger.reconnecting(attempt, max);
    connectSpinner.start("Reconnecting...");
  });

  client.on("error", (error) => {
    connectSpinner.stop();
    const err = error as Error & { code?: string };
    if (err.code) {
      logger.error(`${err.code}: ${err.message}`);
    } else {
      logger.error(err.message);
    }
  });

  client.on("request", (method, path) => {
    logger.request(method, path);
  });

  // Set up graceful shutdown
  const shutdown = (signal: string) => {
    logger.blank();
    logger.info(`Received ${signal}, disconnecting...`);
    client.disconnect(`${signal} received`);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  // Connect
  try {
    await client.connect();
  } catch (error) {
    connectSpinner.stop();
    const err = error as Error & { code?: string };
    const message = err.code ? `${err.code}: ${err.message}` : err.message;
    logger.error(`Connection failed: ${message}`);
    process.exit(1);
  }
}

export default shareCommand;
