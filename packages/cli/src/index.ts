/**
 * LivePort CLI
 *
 * Command-line interface for creating secure localhost tunnels.
 */

import { Command } from "commander";
import { connectCommand } from "./commands/connect";
import { statusCommand } from "./commands/status";
import { disconnectCommand } from "./commands/disconnect";

const program = new Command();

program
  .name("liveport")
  .description("Secure localhost tunnels for AI agents")
  .version("0.1.0");

program
  .command("connect <port>")
  .description("Create a tunnel to expose a local port")
  .option("-k, --key <key>", "Bridge key for authentication")
  .option("-s, --server <url>", "Tunnel server URL")
  .option("-r, --region <region>", "Server region")
  .action(connectCommand);

program
  .command("status")
  .description("Show current tunnel status")
  .action(statusCommand);

program
  .command("disconnect")
  .description("Disconnect active tunnel")
  .option("-a, --all", "Disconnect all tunnels")
  .action(disconnectCommand);

program.parse();
