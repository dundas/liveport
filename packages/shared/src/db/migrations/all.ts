/**
 * All Migrations
 *
 * Central registry of all database migrations.
 * Add new migrations here as they are created.
 */

import type { Migration } from "./index.js";
import { migration as migration001 } from "./001_initial_schema.js";

/**
 * All registered migrations in order
 */
export const allMigrations: Migration[] = [
  migration001,
  // Add new migrations here:
  // import { migration as migration002 } from "./002_next_migration.js";
  // migration002,
];
