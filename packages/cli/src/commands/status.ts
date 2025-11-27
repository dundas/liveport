/**
 * Status Command
 *
 * Shows the current tunnel connection status.
 */

import { logger } from "../logger";
import { getActiveClient } from "./connect";

/**
 * Execute the status command
 */
export async function statusCommand(): Promise<void> {
  const client = getActiveClient();

  if (!client) {
    logger.info("No active tunnel connection");
    return;
  }

  const state = client.getState();
  const info = client.getTunnelInfo();

  logger.section("Tunnel Status");

  logger.status(state, `Connection: ${state}`);

  if (info) {
    logger.keyValue("Tunnel ID", info.tunnelId);
    logger.keyValue("Subdomain", info.subdomain);
    logger.keyValue("Public URL", info.url);
    logger.keyValue("Local Port", String(info.localPort));
    logger.keyValue("Expires", info.expiresAt.toLocaleString());
  }

  logger.blank();
}

export default statusCommand;
