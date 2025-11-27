/**
 * Config Command
 *
 * Manage CLI configuration (key, server, etc.)
 */

import { logger } from "../logger";
import { loadConfig, saveConfig, getConfigPath, type LivePortConfig } from "../config";

type ConfigKey = keyof LivePortConfig;

const VALID_KEYS: ConfigKey[] = ["key", "server"];

/**
 * Set a config value
 */
export function configSetCommand(key: string, value: string): void {
  if (!VALID_KEYS.includes(key as ConfigKey)) {
    logger.error(`Invalid config key: ${key}`);
    logger.info(`Valid keys: ${VALID_KEYS.join(", ")}`);
    process.exit(1);
  }

  const config = loadConfig();
  config[key as ConfigKey] = value;

  try {
    saveConfig(config);
    logger.success(`Config saved: ${key} = ${key === "key" ? maskKey(value) : value}`);
    logger.keyValue("Config file", getConfigPath());
  } catch (error) {
    const err = error as Error;
    logger.error(err.message);
    process.exit(1);
  }
}

/**
 * Get a config value
 */
export function configGetCommand(key: string): void {
  if (!VALID_KEYS.includes(key as ConfigKey)) {
    logger.error(`Invalid config key: ${key}`);
    logger.info(`Valid keys: ${VALID_KEYS.join(", ")}`);
    process.exit(1);
  }

  const config = loadConfig();
  const value = config[key as ConfigKey];

  if (value) {
    // Mask key for security
    const displayValue = key === "key" ? maskKey(value) : value;
    logger.keyValue(key, displayValue);
  } else {
    logger.info(`${key} is not set`);
  }
}

/**
 * List all config values
 */
export function configListCommand(): void {
  const config = loadConfig();

  logger.section("Configuration");
  logger.keyValue("Config file", getConfigPath());
  logger.blank();

  if (Object.keys(config).length === 0) {
    logger.info("No configuration set");
    return;
  }

  for (const key of VALID_KEYS) {
    const value = config[key];
    if (value) {
      const displayValue = key === "key" ? maskKey(value) : value;
      logger.keyValue(key, displayValue);
    }
  }
}

/**
 * Delete a config value
 */
export function configDeleteCommand(key: string): void {
  if (!VALID_KEYS.includes(key as ConfigKey)) {
    logger.error(`Invalid config key: ${key}`);
    logger.info(`Valid keys: ${VALID_KEYS.join(", ")}`);
    process.exit(1);
  }

  const config = loadConfig();
  delete config[key as ConfigKey];

  try {
    saveConfig(config);
    logger.success(`Config deleted: ${key}`);
  } catch (error) {
    const err = error as Error;
    logger.error(err.message);
    process.exit(1);
  }
}

/**
 * Mask a key for display (show only prefix and last 4 chars)
 */
function maskKey(key: string): string {
  if (key.length <= 12) {
    return "****";
  }
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
