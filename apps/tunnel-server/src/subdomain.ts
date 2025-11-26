/**
 * Subdomain Generator
 *
 * Generates unique, memorable subdomains using adjective-noun-hex format.
 * Example: brave-panda-7f3a
 */

import { nanoid } from "nanoid";

// Positive, memorable adjectives
const ADJECTIVES = [
  "able", "bold", "calm", "dark", "easy",
  "fair", "glad", "good", "happy", "jolly",
  "keen", "kind", "lively", "lucky", "merry",
  "neat", "nice", "noble", "odd", "open",
  "plain", "proud", "quick", "quiet", "rapid",
  "ready", "rich", "round", "safe", "sharp",
  "short", "simple", "slim", "smart", "smooth",
  "soft", "solid", "sound", "spare", "square",
  "steady", "steep", "stiff", "still", "straight",
  "strange", "strict", "strong", "sudden", "sunny",
  "super", "sure", "sweet", "swift", "tall",
  "thick", "thin", "tight", "tiny", "tough",
  "true", "vast", "warm", "weak", "wide",
  "wild", "wise", "young", "agile", "alert",
  "ample", "azure", "basic", "blank", "blunt",
  "brave", "brisk", "brown", "cheap", "chief",
  "civil", "clean", "clear", "close", "cold",
  "cool", "coral", "crisp", "crude", "cruel",
  "damp", "dear", "deep", "dense", "dirty",
  "dizzy", "dry", "dull", "dusty", "eager",
];

// Animals, nature, and common objects
const NOUNS = [
  "ant", "ape", "bat", "bear", "bee",
  "bird", "boar", "bug", "bull", "cat",
  "claw", "cod", "cow", "crab", "crow",
  "deer", "dog", "dove", "duck", "eagle",
  "eel", "elk", "emu", "fawn", "fish",
  "fly", "fox", "frog", "goat", "goose",
  "gull", "hare", "hawk", "hen", "horse",
  "jay", "kite", "lark", "lion", "lynx",
  "mole", "moth", "mouse", "mule", "newt",
  "owl", "ox", "panda", "pig", "pike",
  "pony", "pug", "ram", "rat", "ray",
  "seal", "shark", "sheep", "slug", "snail",
  "snake", "swan", "tiger", "toad", "trout",
  "vole", "wasp", "whale", "wolf", "worm",
  "wren", "yak", "zebra", "bass", "bison",
  "crane", "coral", "dingo", "finch", "gecko",
  "hippo", "hyena", "koala", "lemur", "llama",
  "macaw", "moose", "otter", "perch", "quail",
  "raven", "robin", "salmon", "sloth", "squid",
  "stork", "tapir", "viper", "walrus", "ferret",
];

// Reserved subdomains that cannot be used
const RESERVED = new Set([
  "www",
  "api",
  "app",
  "admin",
  "dashboard",
  "tunnel",
  "connect",
  "auth",
  "login",
  "signup",
  "register",
  "account",
  "billing",
  "support",
  "help",
  "docs",
  "blog",
  "status",
  "health",
  "mail",
  "email",
  "smtp",
  "ftp",
  "ssh",
  "cdn",
  "static",
  "assets",
  "media",
  "images",
  "files",
  "download",
  "upload",
  "ws",
  "wss",
  "socket",
  "websocket",
]);

/**
 * Generate a random 4-character hex string
 */
function randomHex(): string {
  return nanoid(4).toLowerCase().replace(/[^a-z0-9]/g, "0").substring(0, 4);
}

/**
 * Pick a random element from an array
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random subdomain in adjective-noun-hex format
 */
export function generateSubdomain(): string {
  const adjective = pickRandom(ADJECTIVES);
  const noun = pickRandom(NOUNS);
  const hex = randomHex();
  return `${adjective}-${noun}-${hex}`;
}

/**
 * Check if a subdomain is reserved
 */
export function isReservedSubdomain(subdomain: string): boolean {
  return RESERVED.has(subdomain.toLowerCase());
}

/**
 * Validate subdomain format
 */
export function isValidSubdomain(subdomain: string): boolean {
  // Must be lowercase alphanumeric with hyphens
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    return false;
  }

  // Must be between 3 and 63 characters (DNS label limit)
  if (subdomain.length < 3 || subdomain.length > 63) {
    return false;
  }

  // Cannot be reserved
  if (isReservedSubdomain(subdomain)) {
    return false;
  }

  return true;
}

/**
 * Generate a unique subdomain with collision detection
 *
 * @param existingSubdomains Set of currently active subdomains
 * @param maxAttempts Maximum attempts before giving up
 * @returns Generated subdomain or null if all attempts failed
 */
export function generateUniqueSubdomain(
  existingSubdomains: Set<string>,
  maxAttempts = 5
): string | null {
  for (let i = 0; i < maxAttempts; i++) {
    const subdomain = generateSubdomain();

    if (!existingSubdomains.has(subdomain) && !isReservedSubdomain(subdomain)) {
      return subdomain;
    }
  }

  return null;
}
