// CLI entry point - will be implemented in TASK-013
import { Command } from "commander";

const program = new Command();

program
  .name("liveport")
  .description("Secure localhost tunnels for AI agents")
  .version("0.1.0");

program
  .command("connect <port>")
  .description("Create a tunnel to expose a local port")
  .option("-k, --key <key>", "Bridge key for authentication")
  .option("-r, --region <region>", "Server region", "us-east")
  .action((_port, _options) => {
    console.log("Connect command - will be implemented in TASK-013");
  });

program
  .command("status")
  .description("Show active tunnels")
  .action(() => {
    console.log("Status command - will be implemented in TASK-013");
  });

program
  .command("disconnect")
  .description("Disconnect active tunnels")
  .option("-a, --all", "Disconnect all tunnels")
  .action((_options) => {
    console.log("Disconnect command - will be implemented in TASK-013");
  });

program.parse();
