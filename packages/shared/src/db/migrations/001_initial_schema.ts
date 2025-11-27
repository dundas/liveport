/**
 * Migration: 001_initial_schema
 *
 * Creates the initial database schema for LivePort:
 * - Better Auth tables (user, session, account, verification)
 * - Bridge keys table
 * - Tunnels table
 */

import type { Migration } from "./index.js";
import {
  TABLE_NAMES,
  USER_COLUMNS,
  SESSION_COLUMNS,
  ACCOUNT_COLUMNS,
  VERIFICATION_COLUMNS,
  BRIDGE_KEYS_COLUMNS,
  TUNNELS_COLUMNS,
} from "../schema.js";

export const migration: Migration = {
  version: "001_initial_schema",
  description: "Create initial database schema with auth and LivePort tables",

  async up(db) {
    // Create Better Auth tables in order (respecting foreign key dependencies)
    await db.createTable(TABLE_NAMES.USER, USER_COLUMNS);
    await db.createTable(TABLE_NAMES.SESSION, SESSION_COLUMNS);
    await db.createTable(TABLE_NAMES.ACCOUNT, ACCOUNT_COLUMNS);
    await db.createTable(TABLE_NAMES.VERIFICATION, VERIFICATION_COLUMNS);

    // Create LivePort tables
    await db.createTable(TABLE_NAMES.BRIDGE_KEYS, BRIDGE_KEYS_COLUMNS);
    await db.createTable(TABLE_NAMES.TUNNELS, TUNNELS_COLUMNS);
  },

  async down(db) {
    // Drop in reverse order to respect foreign key constraints
    await db.dropTable(TABLE_NAMES.TUNNELS);
    await db.dropTable(TABLE_NAMES.BRIDGE_KEYS);
    await db.dropTable(TABLE_NAMES.VERIFICATION);
    await db.dropTable(TABLE_NAMES.ACCOUNT);
    await db.dropTable(TABLE_NAMES.SESSION);
    await db.dropTable(TABLE_NAMES.USER);
  },
};
