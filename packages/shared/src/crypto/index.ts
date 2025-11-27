/**
 * Cryptographic Utilities
 *
 * Secure hashing functions for passwords and API keys.
 * Uses bcryptjs for password-style hashing with configurable cost factor.
 * bcryptjs is a pure JS implementation that works in all environments
 * including serverless (Next.js, Cloudflare Workers, etc).
 */

import bcrypt from "bcryptjs";

// Cost factor for bcrypt (10-12 is recommended for production)
const BCRYPT_ROUNDS = 12;

/**
 * Hash a key/password using bcrypt
 *
 * @param plaintext - The plaintext key to hash
 * @param rounds - Optional cost factor (defaults to 12)
 * @returns The bcrypt hash
 */
export async function hashKey(plaintext: string, rounds: number = BCRYPT_ROUNDS): Promise<string> {
  return bcrypt.hash(plaintext, rounds);
}

/**
 * Verify a plaintext key against a bcrypt hash
 *
 * @param plaintext - The plaintext key to verify
 * @param hash - The bcrypt hash to compare against
 * @returns True if the key matches the hash
 */
export async function verifyKey(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Legacy SHA-256 hash function for backwards compatibility
 * This should only be used for migrating existing keys.
 *
 * @deprecated Use hashKey() for new keys
 */
export async function legacySha256Hash(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check if a hash is a bcrypt hash (starts with $2)
 */
export function isBcryptHash(hash: string): boolean {
  return hash.startsWith("$2");
}
