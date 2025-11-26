/**
 * Disconnect Command
 *
 * Disconnects the active tunnel connection.
 */

import { logger } from "../logger";
import { getActiveClient } from "./connect";

export interface DisconnectOptions {
  all?: boolean;
}

/**
 * Execute the disconnect command
 */
export async function disconnectCommand(
  options: DisconnectOptions
): Promise<void> {
  const client = getActiveClient();

  if (!client) {
    logger.info("No active tunnel connection to disconnect");
    return;
  }

  const info = client.getTunnelInfo();
  const subdomain = info?.subdomain || "unknown";

  logger.info(`Disconnecting tunnel: ${subdomain}...`);

  client.disconnect("User requested disconnect");

  logger.success("Tunnel disconnected");
}

export default disconnectCommand;
