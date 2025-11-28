/**
 * Database Schema Definitions
 *
 * SQL schema definitions for LivePort tables.
 * Uses mech-storage API to create tables.
 */

import type { MechStorageClient } from "./index.js";

// Column type definition for mech-storage
export type ColumnType =
  | "text"
  | "integer"
  | "bigint"
  | "decimal"
  | "boolean"
  | "timestamp"
  | "json"
  | "jsonb"
  | "uuid";

export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string;
}

// Table names as constants
export const TABLE_NAMES = {
  // Better Auth tables
  USER: "user",
  SESSION: "session",
  ACCOUNT: "account",
  VERIFICATION: "verification",
  // LivePort tables
  BRIDGE_KEYS: "bridge_keys",
  TUNNELS: "tunnels",
  STATIC_SUBDOMAINS: "static_subdomains",
} as const;

/**
 * SQL Schema for Better Auth User table
 */
export const USER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  image TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
`.trim();

/**
 * SQL Schema for Better Auth Session table
 */
export const SESSION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
`.trim();

/**
 * SQL Schema for Better Auth Account table (for OAuth)
 */
export const ACCOUNT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  scope TEXT,
  id_token TEXT,
  password TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
`.trim();

/**
 * SQL Schema for Better Auth Verification table
 */
export const VERIFICATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
`.trim();

/**
 * SQL Schema for Bridge Keys table
 */
export const BRIDGE_KEYS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bridge_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  expires_at TIMESTAMP,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  allowed_port INTEGER,
  status TEXT DEFAULT 'active',
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
`.trim();

/**
 * SQL Schema for Tunnels table
 */
export const TUNNELS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tunnels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  bridge_key_id TEXT REFERENCES bridge_keys(id) ON DELETE SET NULL,
  subdomain TEXT UNIQUE NOT NULL,
  local_port INTEGER NOT NULL,
  public_url TEXT NOT NULL,
  region TEXT DEFAULT 'us-east',
  connected_at TIMESTAMP DEFAULT NOW(),
  disconnected_at TIMESTAMP,
  request_count INTEGER DEFAULT 0,
  bytes_transferred BIGINT DEFAULT 0
);

-- Indexes for billing queries
CREATE INDEX IF NOT EXISTS idx_tunnels_user_id ON tunnels(user_id);
CREATE INDEX IF NOT EXISTS idx_tunnels_connected_at ON tunnels(connected_at);
CREATE INDEX IF NOT EXISTS idx_tunnels_bridge_key_id ON tunnels(bridge_key_id);
CREATE INDEX IF NOT EXISTS idx_tunnels_user_connected ON tunnels(user_id, connected_at);
-- Partial index for billing (completed tunnels)
CREATE INDEX IF NOT EXISTS idx_tunnels_billing ON tunnels(user_id, connected_at, disconnected_at) WHERE disconnected_at IS NOT NULL;
-- Partial index for finalization (active tunnels)
CREATE INDEX IF NOT EXISTS idx_tunnels_active ON tunnels(id) WHERE disconnected_at IS NULL;
`.trim();

/**
 * SQL Schema for Static Subdomains table (for $2.50/month premium feature)
 */
export const STATIC_SUBDOMAINS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS static_subdomains (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  subdomain TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  status TEXT DEFAULT 'active'
);
`.trim();

/**
 * Column definitions for Better Auth User table (mech-storage API format)
 */
export const USER_COLUMNS: ColumnDefinition[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "name", type: "text", nullable: true },
  { name: "email", type: "text", nullable: false, unique: true },
  { name: "email_verified", type: "boolean", nullable: true, defaultValue: "FALSE" },
  { name: "image", type: "text", nullable: true },
  { name: "created_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
  { name: "updated_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
];

/**
 * Column definitions for Better Auth Session table
 */
export const SESSION_COLUMNS: ColumnDefinition[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "user_id", type: "text", nullable: false },
  { name: "token", type: "text", nullable: false, unique: true },
  { name: "expires_at", type: "timestamp", nullable: false },
  { name: "ip_address", type: "text", nullable: true },
  { name: "user_agent", type: "text", nullable: true },
  { name: "created_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
  { name: "updated_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
];

/**
 * Column definitions for Better Auth Account table
 */
export const ACCOUNT_COLUMNS: ColumnDefinition[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "user_id", type: "text", nullable: false },
  { name: "account_id", type: "text", nullable: false },
  { name: "provider_id", type: "text", nullable: false },
  { name: "access_token", type: "text", nullable: true },
  { name: "refresh_token", type: "text", nullable: true },
  { name: "access_token_expires_at", type: "timestamp", nullable: true },
  { name: "refresh_token_expires_at", type: "timestamp", nullable: true },
  { name: "scope", type: "text", nullable: true },
  { name: "id_token", type: "text", nullable: true },
  { name: "password", type: "text", nullable: true },
  { name: "created_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
  { name: "updated_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
];

/**
 * Column definitions for Better Auth Verification table
 */
export const VERIFICATION_COLUMNS: ColumnDefinition[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "identifier", type: "text", nullable: false },
  { name: "value", type: "text", nullable: false },
  { name: "expires_at", type: "timestamp", nullable: false },
  { name: "created_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
  { name: "updated_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
];

/**
 * Column definitions for Bridge Keys table (mech-storage API format)
 */
export const BRIDGE_KEYS_COLUMNS: ColumnDefinition[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "user_id", type: "text", nullable: false },
  { name: "name", type: "text", nullable: false },
  { name: "key_hash", type: "text", nullable: false },
  { name: "key_prefix", type: "text", nullable: false },
  { name: "expires_at", type: "timestamp", nullable: true },
  { name: "max_uses", type: "integer", nullable: true },
  { name: "current_uses", type: "integer", nullable: true, defaultValue: "0" },
  { name: "allowed_port", type: "integer", nullable: true },
  { name: "status", type: "text", nullable: true, defaultValue: "'active'" },
  { name: "last_used_at", type: "timestamp", nullable: true },
  { name: "created_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
  { name: "updated_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
];

/**
 * Column definitions for Tunnels table (mech-storage API format)
 */
export const TUNNELS_COLUMNS: ColumnDefinition[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "user_id", type: "text", nullable: false },
  { name: "bridge_key_id", type: "text", nullable: true },
  { name: "subdomain", type: "text", nullable: false, unique: true },
  { name: "local_port", type: "integer", nullable: false },
  { name: "public_url", type: "text", nullable: false },
  { name: "region", type: "text", nullable: true, defaultValue: "'us-east'" },
  { name: "connected_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
  { name: "disconnected_at", type: "timestamp", nullable: true },
  { name: "request_count", type: "integer", nullable: true, defaultValue: "0" },
  { name: "bytes_transferred", type: "bigint", nullable: true, defaultValue: "0" },
];

/**
 * Column definitions for Static Subdomains table (mech-storage API format)
 */
export const STATIC_SUBDOMAINS_COLUMNS: ColumnDefinition[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "user_id", type: "text", nullable: false },
  { name: "subdomain", type: "text", nullable: false, unique: true },
  { name: "created_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
  { name: "deleted_at", type: "timestamp", nullable: true },
  { name: "status", type: "text", nullable: true, defaultValue: "'active'" },
];

/**
 * Create a single table using the mech-storage API
 * @param db - MechStorageClient instance
 * @param tableName - Name of the table to create
 * @param columns - Column definitions
 */
export async function createTable(
  db: MechStorageClient,
  tableName: string,
  columns: ColumnDefinition[]
): Promise<void> {
  await db.createTable(tableName, columns);
}

/**
 * Create the Better Auth User table
 */
export async function createUserTable(db: MechStorageClient): Promise<void> {
  await createTable(db, TABLE_NAMES.USER, USER_COLUMNS);
}

/**
 * Create the Better Auth Session table
 */
export async function createSessionTable(db: MechStorageClient): Promise<void> {
  await createTable(db, TABLE_NAMES.SESSION, SESSION_COLUMNS);
}

/**
 * Create the Better Auth Account table
 */
export async function createAccountTable(db: MechStorageClient): Promise<void> {
  await createTable(db, TABLE_NAMES.ACCOUNT, ACCOUNT_COLUMNS);
}

/**
 * Create the Better Auth Verification table
 */
export async function createVerificationTable(db: MechStorageClient): Promise<void> {
  await createTable(db, TABLE_NAMES.VERIFICATION, VERIFICATION_COLUMNS);
}

/**
 * Create the Bridge Keys table
 */
export async function createBridgeKeysTable(db: MechStorageClient): Promise<void> {
  await createTable(db, TABLE_NAMES.BRIDGE_KEYS, BRIDGE_KEYS_COLUMNS);
}

/**
 * Create the Tunnels table
 */
export async function createTunnelsTable(db: MechStorageClient): Promise<void> {
  await createTable(db, TABLE_NAMES.TUNNELS, TUNNELS_COLUMNS);
}

/**
 * Create the Static Subdomains table
 */
export async function createStaticSubdomainsTable(db: MechStorageClient): Promise<void> {
  await createTable(db, TABLE_NAMES.STATIC_SUBDOMAINS, STATIC_SUBDOMAINS_COLUMNS);
}

/**
 * Create all Better Auth tables
 */
export async function createAuthTables(db: MechStorageClient): Promise<void> {
  await createUserTable(db);
  await createSessionTable(db);
  await createAccountTable(db);
  await createVerificationTable(db);
}

/**
 * Create all tables in the correct order (respecting foreign key dependencies)
 */
export async function createAllTables(db: MechStorageClient): Promise<void> {
  // Create Better Auth tables first
  await createAuthTables(db);
  // Then create LivePort tables
  await createBridgeKeysTable(db);
  await createTunnelsTable(db);
  await createStaticSubdomainsTable(db);
}

/**
 * Drop all tables in reverse order (to respect foreign key constraints)
 */
export async function dropAllTables(db: MechStorageClient): Promise<void> {
  // Drop in reverse order of dependencies
  await db.dropTable(TABLE_NAMES.STATIC_SUBDOMAINS);
  await db.dropTable(TABLE_NAMES.TUNNELS);
  await db.dropTable(TABLE_NAMES.BRIDGE_KEYS);
  await db.dropTable(TABLE_NAMES.VERIFICATION);
  await db.dropTable(TABLE_NAMES.ACCOUNT);
  await db.dropTable(TABLE_NAMES.SESSION);
  await db.dropTable(TABLE_NAMES.USER);
}

/**
 * Check if all required tables exist
 */
export async function checkTablesExist(
  db: MechStorageClient
): Promise<{
  user: boolean;
  session: boolean;
  account: boolean;
  verification: boolean;
  bridgeKeys: boolean;
  tunnels: boolean;
  staticSubdomains: boolean;
  authTablesExist: boolean;
  allExist: boolean;
}> {
  const tables = await db.listTables();
  const tableNames = new Set(tables.map((t) => t.name));

  const user = tableNames.has(TABLE_NAMES.USER);
  const session = tableNames.has(TABLE_NAMES.SESSION);
  const account = tableNames.has(TABLE_NAMES.ACCOUNT);
  const verification = tableNames.has(TABLE_NAMES.VERIFICATION);
  const bridgeKeys = tableNames.has(TABLE_NAMES.BRIDGE_KEYS);
  const tunnels = tableNames.has(TABLE_NAMES.TUNNELS);
  const staticSubdomains = tableNames.has(TABLE_NAMES.STATIC_SUBDOMAINS);

  const authTablesExist = user && session && account && verification;

  return {
    user,
    session,
    account,
    verification,
    bridgeKeys,
    tunnels,
    staticSubdomains,
    authTablesExist,
    allExist: authTablesExist && bridgeKeys && tunnels && staticSubdomains,
  };
}

/**
 * Initialize the database schema (create tables if they don't exist)
 */
export async function initializeSchema(
  db: MechStorageClient
): Promise<{
  authTablesCreated: boolean;
  bridgeKeysCreated: boolean;
  tunnelsCreated: boolean;
  staticSubdomainsCreated: boolean;
}> {
  const status = await checkTablesExist(db);
  const result = {
    authTablesCreated: false,
    bridgeKeysCreated: false,
    tunnelsCreated: false,
    staticSubdomainsCreated: false,
  };

  if (!status.authTablesExist) {
    await createAuthTables(db);
    result.authTablesCreated = true;
  }

  if (!status.bridgeKeys) {
    await createBridgeKeysTable(db);
    result.bridgeKeysCreated = true;
  }

  if (!status.tunnels) {
    await createTunnelsTable(db);
    result.tunnelsCreated = true;
  }

  if (!status.staticSubdomains) {
    await createStaticSubdomainsTable(db);
    result.staticSubdomainsCreated = true;
  }

  return result;
}
