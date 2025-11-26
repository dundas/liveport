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
  USERS: "users",
  BRIDGE_KEYS: "bridge_keys",
  TUNNELS: "tunnels",
} as const;

/**
 * SQL Schema for Users table
 * Managed by Better Auth, but we define the structure
 */
export const USERS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  tier VARCHAR(20) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
`.trim();

/**
 * SQL Schema for Bridge Keys table
 */
export const BRIDGE_KEYS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bridge_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(12) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  allowed_port INTEGER,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
`.trim();

/**
 * SQL Schema for Tunnels table
 */
export const TUNNELS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tunnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  bridge_key_id UUID REFERENCES bridge_keys(id) ON DELETE SET NULL,
  subdomain VARCHAR(20) UNIQUE NOT NULL,
  local_port INTEGER NOT NULL,
  public_url VARCHAR(255) NOT NULL,
  region VARCHAR(50) DEFAULT 'us-east',
  connected_at TIMESTAMP DEFAULT NOW(),
  disconnected_at TIMESTAMP,
  request_count INTEGER DEFAULT 0,
  bytes_transferred BIGINT DEFAULT 0
);
`.trim();

/**
 * Column definitions for Users table (mech-storage API format)
 */
export const USERS_COLUMNS: ColumnDefinition[] = [
  { name: "id", type: "uuid", primaryKey: true, defaultValue: "gen_random_uuid()" },
  { name: "email", type: "text", nullable: false, unique: true },
  { name: "name", type: "text", nullable: true },
  { name: "tier", type: "text", nullable: true, defaultValue: "'free'" },
  { name: "created_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
  { name: "updated_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
];

/**
 * Column definitions for Bridge Keys table (mech-storage API format)
 */
export const BRIDGE_KEYS_COLUMNS: ColumnDefinition[] = [
  { name: "id", type: "uuid", primaryKey: true, defaultValue: "gen_random_uuid()" },
  { name: "user_id", type: "uuid", nullable: true },
  { name: "key_hash", type: "text", nullable: false },
  { name: "key_prefix", type: "text", nullable: false },
  { name: "expires_at", type: "timestamp", nullable: false },
  { name: "max_uses", type: "integer", nullable: true },
  { name: "current_uses", type: "integer", nullable: true, defaultValue: "0" },
  { name: "allowed_port", type: "integer", nullable: true },
  { name: "status", type: "text", nullable: true, defaultValue: "'active'" },
  { name: "created_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
  { name: "updated_at", type: "timestamp", nullable: true, defaultValue: "NOW()" },
];

/**
 * Column definitions for Tunnels table (mech-storage API format)
 */
export const TUNNELS_COLUMNS: ColumnDefinition[] = [
  { name: "id", type: "uuid", primaryKey: true, defaultValue: "gen_random_uuid()" },
  { name: "user_id", type: "uuid", nullable: true },
  { name: "bridge_key_id", type: "uuid", nullable: true },
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
 * Create the Users table
 * @param db - MechStorageClient instance
 */
export async function createUsersTable(db: MechStorageClient): Promise<void> {
  await createTable(db, TABLE_NAMES.USERS, USERS_COLUMNS);
}

/**
 * Create the Bridge Keys table
 * @param db - MechStorageClient instance
 */
export async function createBridgeKeysTable(db: MechStorageClient): Promise<void> {
  await createTable(db, TABLE_NAMES.BRIDGE_KEYS, BRIDGE_KEYS_COLUMNS);
}

/**
 * Create the Tunnels table
 * @param db - MechStorageClient instance
 */
export async function createTunnelsTable(db: MechStorageClient): Promise<void> {
  await createTable(db, TABLE_NAMES.TUNNELS, TUNNELS_COLUMNS);
}

/**
 * Create all tables in the correct order (respecting foreign key dependencies)
 * @param db - MechStorageClient instance
 */
export async function createAllTables(db: MechStorageClient): Promise<void> {
  // Create tables in order of dependencies
  await createUsersTable(db);
  await createBridgeKeysTable(db);
  await createTunnelsTable(db);
}

/**
 * Drop all tables in reverse order (to respect foreign key constraints)
 * @param db - MechStorageClient instance
 */
export async function dropAllTables(db: MechStorageClient): Promise<void> {
  // Drop in reverse order of dependencies
  await db.dropTable(TABLE_NAMES.TUNNELS);
  await db.dropTable(TABLE_NAMES.BRIDGE_KEYS);
  await db.dropTable(TABLE_NAMES.USERS);
}

/**
 * Check if all required tables exist
 * @param db - MechStorageClient instance
 * @returns Object with existence status for each table
 */
export async function checkTablesExist(
  db: MechStorageClient
): Promise<{
  users: boolean;
  bridgeKeys: boolean;
  tunnels: boolean;
  allExist: boolean;
}> {
  const tables = await db.listTables();
  const tableNames = new Set(tables.map((t) => t.name));

  const users = tableNames.has(TABLE_NAMES.USERS);
  const bridgeKeys = tableNames.has(TABLE_NAMES.BRIDGE_KEYS);
  const tunnels = tableNames.has(TABLE_NAMES.TUNNELS);

  return {
    users,
    bridgeKeys,
    tunnels,
    allExist: users && bridgeKeys && tunnels,
  };
}

/**
 * Initialize the database schema (create tables if they don't exist)
 * @param db - MechStorageClient instance
 * @returns Object indicating which tables were created
 */
export async function initializeSchema(
  db: MechStorageClient
): Promise<{
  usersCreated: boolean;
  bridgeKeysCreated: boolean;
  tunnelsCreated: boolean;
}> {
  const status = await checkTablesExist(db);
  const result = {
    usersCreated: false,
    bridgeKeysCreated: false,
    tunnelsCreated: false,
  };

  if (!status.users) {
    await createUsersTable(db);
    result.usersCreated = true;
  }

  if (!status.bridgeKeys) {
    await createBridgeKeysTable(db);
    result.bridgeKeysCreated = true;
  }

  if (!status.tunnels) {
    await createTunnelsTable(db);
    result.tunnelsCreated = true;
  }

  return result;
}
