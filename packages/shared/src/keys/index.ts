// Bridge key utilities - will be fully implemented in TASK-007
import { nanoid } from "nanoid";

const KEY_PREFIX = "lpk_";
const KEY_LENGTH = 32;

/**
 * Generate a new bridge key
 * Format: lpk_<32 random chars>
 */
export function generateBridgeKey(): string {
  return `${KEY_PREFIX}${nanoid(KEY_LENGTH)}`;
}

/**
 * Extract the prefix from a bridge key for display
 * Returns first 12 characters: lpk_xxxxxxxx
 */
export function getKeyPrefix(key: string): string {
  return key.substring(0, 12);
}

/**
 * Validate bridge key format
 */
export function isValidKeyFormat(key: string): boolean {
  if (!key.startsWith(KEY_PREFIX)) {
    return false;
  }
  // lpk_ + 32 chars = 36 total
  if (key.length !== KEY_PREFIX.length + KEY_LENGTH) {
    return false;
  }
  return true;
}

/**
 * Mask a key for safe display
 * Shows: lpk_xxxx...xxxx (first 8, last 4)
 */
export function maskKey(key: string): string {
  if (key.length < 16) return key;
  const prefix = key.substring(0, 8);
  const suffix = key.substring(key.length - 4);
  return `${prefix}...${suffix}`;
}
