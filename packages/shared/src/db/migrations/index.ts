/**
 * Database Migrations System
 *
 * Simple, file-based migrations for mech-storage.
 * Tracks applied migrations in a `_migrations` table.
 */

import type { MechStorageClient } from "../index.js";

export interface Migration {
  /** Unique migration version (e.g., "001_initial_schema") */
  version: string;
  /** Human-readable description */
  description: string;
  /** Apply the migration (up) */
  up: (db: MechStorageClient) => Promise<void>;
  /** Revert the migration (down) - optional */
  down?: (db: MechStorageClient) => Promise<void>;
}

export interface MigrationRecord {
  version: string;
  applied_at: string;
}

export interface MigrationResult {
  version: string;
  description: string;
  status: "applied" | "skipped" | "failed";
  error?: string;
}

const MIGRATIONS_TABLE = "_migrations";

/**
 * Ensure the migrations tracking table exists
 */
async function ensureMigrationsTable(db: MechStorageClient): Promise<void> {
  const tables = await db.listTables();
  const exists = tables.some((t) => t.name === MIGRATIONS_TABLE);

  if (!exists) {
    await db.createTable(MIGRATIONS_TABLE, [
      { name: "version", type: "text", primaryKey: true },
      { name: "applied_at", type: "timestamp", defaultValue: "NOW()" },
    ]);
  }
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(
  db: MechStorageClient
): Promise<Set<string>> {
  const result = await db.getRecords<MigrationRecord>(MIGRATIONS_TABLE);
  return new Set(result.records.map((r) => r.version));
}

/**
 * Record that a migration was applied
 */
async function recordMigration(
  db: MechStorageClient,
  version: string
): Promise<void> {
  await db.insert(MIGRATIONS_TABLE, {
    version,
    applied_at: new Date().toISOString(),
  });
}

/**
 * Remove migration record (for rollback)
 */
async function removeMigrationRecord(
  db: MechStorageClient,
  version: string
): Promise<void> {
  await db.delete(MIGRATIONS_TABLE, version);
}

/**
 * Run pending migrations
 *
 * @param db - Database client
 * @param migrations - Array of migrations to check/run
 * @returns Results for each migration
 */
export async function runMigrations(
  db: MechStorageClient,
  migrations: Migration[]
): Promise<MigrationResult[]> {
  await ensureMigrationsTable(db);
  const applied = await getAppliedMigrations(db);
  const results: MigrationResult[] = [];

  // Sort migrations by version
  const sortedMigrations = [...migrations].sort((a, b) =>
    a.version.localeCompare(b.version)
  );

  for (const migration of sortedMigrations) {
    if (applied.has(migration.version)) {
      results.push({
        version: migration.version,
        description: migration.description,
        status: "skipped",
      });
      continue;
    }

    try {
      await migration.up(db);
      await recordMigration(db, migration.version);
      results.push({
        version: migration.version,
        description: migration.description,
        status: "applied",
      });
    } catch (error) {
      results.push({
        version: migration.version,
        description: migration.description,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      // Stop on first failure
      break;
    }
  }

  return results;
}

/**
 * Rollback the last applied migration
 *
 * @param db - Database client
 * @param migrations - Array of all migrations
 * @returns Result of the rollback
 */
export async function rollbackMigration(
  db: MechStorageClient,
  migrations: Migration[]
): Promise<MigrationResult | null> {
  await ensureMigrationsTable(db);
  const applied = await getAppliedMigrations(db);

  if (applied.size === 0) {
    return null;
  }

  // Find the last applied migration
  const sortedMigrations = [...migrations]
    .filter((m) => applied.has(m.version))
    .sort((a, b) => b.version.localeCompare(a.version));

  const lastMigration = sortedMigrations[0];
  if (!lastMigration) {
    return null;
  }

  if (!lastMigration.down) {
    return {
      version: lastMigration.version,
      description: lastMigration.description,
      status: "failed",
      error: "Migration does not have a rollback function",
    };
  }

  try {
    await lastMigration.down(db);
    await removeMigrationRecord(db, lastMigration.version);
    return {
      version: lastMigration.version,
      description: lastMigration.description,
      status: "applied",
    };
  } catch (error) {
    return {
      version: lastMigration.version,
      description: lastMigration.description,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get migration status
 *
 * @param db - Database client
 * @param migrations - Array of all migrations
 * @returns Status of each migration
 */
export async function getMigrationStatus(
  db: MechStorageClient,
  migrations: Migration[]
): Promise<
  Array<{
    version: string;
    description: string;
    applied: boolean;
    appliedAt?: string;
  }>
> {
  await ensureMigrationsTable(db);
  const result = await db.getRecords<MigrationRecord>(MIGRATIONS_TABLE);
  const appliedMap = new Map(result.records.map((r) => [r.version, r.applied_at]));

  return migrations
    .sort((a, b) => a.version.localeCompare(b.version))
    .map((m) => ({
      version: m.version,
      description: m.description,
      applied: appliedMap.has(m.version),
      appliedAt: appliedMap.get(m.version),
    }));
}
