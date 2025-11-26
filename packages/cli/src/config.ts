/**
 * CLI Configuration
 *
 * Handles loading and saving CLI configuration from ~/.liveport/config.json
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface LivePortConfig {
  /** Bridge key for authentication */
  key?: string;
  /** Tunnel server URL */
  server?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".liveport");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/**
 * Load configuration from disk
 */
export function loadConfig(): LivePortConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(content) as LivePortConfig;
    }
  } catch {
    // Ignore errors, return empty config
  }
  return {};
}

/**
 * Save configuration to disk
 */
export function saveConfig(config: LivePortConfig): void {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }

    // Write config file with restricted permissions
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
      mode: 0o600,
    });
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to save config: ${err.message}`);
  }
}

/**
 * Get configuration value with fallbacks
 * Priority: CLI option > env var > config file
 */
export function getConfigValue(
  key: keyof LivePortConfig,
  cliValue?: string,
  envKey?: string
): string | undefined {
  // CLI option takes priority
  if (cliValue) {
    return cliValue;
  }

  // Then environment variable
  if (envKey && process.env[envKey]) {
    return process.env[envKey];
  }

  // Finally, config file
  const config = loadConfig();
  return config[key];
}

/**
 * Get the config file path
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
