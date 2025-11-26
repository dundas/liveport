/**
 * CLI Logger
 *
 * Colored terminal output utilities for the CLI.
 */

import chalk from "chalk";

// ASCII art banner
const BANNER = `
  ╦  ╦╦  ╦╔═╗╔═╗╔═╗╦═╗╔╦╗
  ║  ║╚╗╔╝║╣ ╠═╝║ ║╠╦╝ ║
  ╩═╝╩ ╚╝ ╚═╝╩  ╚═╝╩╚═ ╩
`;

export const logger = {
  /**
   * Print banner
   */
  banner(): void {
    console.log(chalk.cyan(BANNER));
    console.log(chalk.dim("  Secure localhost tunnels for AI agents\n"));
  },

  /**
   * Info message
   */
  info(message: string): void {
    console.log(chalk.blue("ℹ"), message);
  },

  /**
   * Success message
   */
  success(message: string): void {
    console.log(chalk.green("✔"), message);
  },

  /**
   * Warning message
   */
  warn(message: string): void {
    console.log(chalk.yellow("⚠"), message);
  },

  /**
   * Error message
   */
  error(message: string): void {
    console.log(chalk.red("✖"), message);
  },

  /**
   * Debug message (only if DEBUG env is set)
   */
  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray("⚙"), chalk.gray(message));
    }
  },

  /**
   * Print connection info
   */
  connected(url: string, localPort: number): void {
    console.log();
    console.log(chalk.green.bold("  Tunnel established!"));
    console.log();
    console.log(chalk.dim("  Public URL:"), chalk.cyan.bold(url));
    console.log(chalk.dim("  Forwarding:"), `${chalk.cyan(url)} → ${chalk.yellow(`http://localhost:${localPort}`)}`);
    console.log();
    console.log(chalk.dim("  Press"), chalk.bold("Ctrl+C"), chalk.dim("to disconnect"));
    console.log();
  },

  /**
   * Print reconnection attempt
   */
  reconnecting(attempt: number, maxAttempts: number): void {
    console.log(
      chalk.yellow("↻"),
      `Reconnecting... (attempt ${attempt}/${maxAttempts})`
    );
  },

  /**
   * Print disconnected message
   */
  disconnected(reason: string): void {
    console.log();
    console.log(chalk.red("●"), chalk.red("Disconnected:"), reason);
  },

  /**
   * Print request log
   */
  request(method: string, path: string): void {
    const methodColor = getMethodColor(method);
    const timestamp = new Date().toLocaleTimeString();
    console.log(
      chalk.dim(timestamp),
      methodColor(method.padEnd(7)),
      chalk.white(path)
    );
  },

  /**
   * Print status line
   */
  status(state: string, message: string): void {
    const stateColor = getStateColor(state);
    console.log(stateColor("●"), message);
  },

  /**
   * Print blank line
   */
  blank(): void {
    console.log();
  },

  /**
   * Print a formatted key-value pair
   */
  keyValue(key: string, value: string): void {
    console.log(chalk.dim(`  ${key}:`), value);
  },

  /**
   * Print a section header
   */
  section(title: string): void {
    console.log();
    console.log(chalk.bold(title));
    console.log(chalk.dim("─".repeat(40)));
  },

  /**
   * Print raw message (no formatting)
   */
  raw(message: string): void {
    console.log(message);
  },
};

/**
 * Get color for HTTP method
 */
function getMethodColor(method: string): (text: string) => string {
  switch (method.toUpperCase()) {
    case "GET":
      return chalk.green;
    case "POST":
      return chalk.blue;
    case "PUT":
      return chalk.yellow;
    case "DELETE":
      return chalk.red;
    case "PATCH":
      return chalk.magenta;
    default:
      return chalk.white;
  }
}

/**
 * Get color for connection state
 */
function getStateColor(state: string): (text: string) => string {
  switch (state) {
    case "connected":
      return chalk.green;
    case "connecting":
    case "reconnecting":
      return chalk.yellow;
    case "disconnected":
    case "failed":
      return chalk.red;
    default:
      return chalk.white;
  }
}

export default logger;
