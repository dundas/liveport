/**
 * Better Auth Adapter for Mech-Storage
 *
 * Implements the Better Auth database adapter interface using the mech-storage REST API.
 * Uses createAdapterFactory for proper integration with Better Auth.
 */

import { createAdapterFactory } from "better-auth/adapters";
import type { MechStorageClient } from "../db/index.js";

// Map Better Auth table names to our table names
const TABLE_MAP: Record<string, string> = {
  user: "user",
  session: "session",
  account: "account",
  verification: "verification",
};

// Convert camelCase to snake_case
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Convert snake_case to camelCase
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert object keys from camelCase to snake_case
function keysToSnakeCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCase(key)] = value;
  }
  return result;
}

// Convert object keys from snake_case to camelCase
function keysToCamelCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toCamelCase(key)] = value;
  }
  return result;
}

interface WhereClause {
  field: string;
  value: unknown;
  operator?: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "contains" | "starts_with" | "ends_with";
  connector?: "AND" | "OR";
}

// Check if a record matches where conditions
function matchesWhere(record: Record<string, unknown>, where: WhereClause[]): boolean {
  if (!where || where.length === 0) return true;

  let result = evaluateClause(record, where[0]);

  for (let i = 1; i < where.length; i++) {
    const clause = where[i];
    const clauseResult = evaluateClause(record, clause);

    if (clause.connector === "OR") {
      result = result || clauseResult;
    } else {
      result = result && clauseResult;
    }
  }

  return result;
}

function evaluateClause(record: Record<string, unknown>, clause: WhereClause): boolean {
  const field = toSnakeCase(clause.field);
  const value = record[field];

  switch (clause.operator) {
    case "in":
      if (!Array.isArray(clause.value)) return false;
      return (clause.value as unknown[]).includes(value);
    case "not_in":
      if (!Array.isArray(clause.value)) return false;
      return !(clause.value as unknown[]).includes(value);
    case "contains":
      return String(value).includes(String(clause.value));
    case "starts_with":
      return String(value).startsWith(String(clause.value));
    case "ends_with":
      return String(value).endsWith(String(clause.value));
    case "ne":
      return value !== clause.value;
    case "gt":
      return clause.value != null && (value as number) > (clause.value as number);
    case "gte":
      return clause.value != null && (value as number) >= (clause.value as number);
    case "lt":
      return clause.value != null && (value as number) < (clause.value as number);
    case "lte":
      return clause.value != null && (value as number) <= (clause.value as number);
    default: // "eq" or undefined
      return value === clause.value;
  }
}

interface MechStorageAdapterConfig {
  debugLogs?: boolean;
}

/**
 * Create a Better Auth adapter for mech-storage
 */
export const mechStorageAdapter = (db: MechStorageClient, config?: MechStorageAdapterConfig) => {
  const adapterCreator = createAdapterFactory({
    config: {
      adapterId: "mech-storage",
      adapterName: "Mech Storage Adapter",
      usePlural: false,
      debugLogs: config?.debugLogs ?? false,
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      supportsNumericIds: false,
    },
    adapter: ({ getModelName }) => {
      const getTable = (model: string): string => {
        const modelName = getModelName(model);
        return TABLE_MAP[modelName] || modelName;
      };

      return {
        create: async ({ model, data }) => {
          const table = getTable(model);
          const snakeData = keysToSnakeCase(data as Record<string, unknown>);

          // Generate ID if not provided
          if (!snakeData.id) {
            snakeData.id = crypto.randomUUID();
          }

          const result = await db.insert(table, snakeData);
          if (!result || result.length === 0) {
            throw new Error(`Failed to create record in ${model}`);
          }
          // The factory handles type transformation
          return keysToCamelCase(result[0] as Record<string, unknown>) as typeof data;
        },

        findOne: async ({ model, where }) => {
          const table = getTable(model);
          const whereArr = where as WhereClause[];

          // Check if we're searching by ID
          const idCondition = whereArr.find(
            (w) => w.field === "id" && (w.operator === "eq" || !w.operator)
          );

          if (idCondition) {
            // Use SQL query instead of REST API (workaround for mech-storage bug)
            const result = await db.query(
              `SELECT * FROM "${table}" WHERE id = $1 LIMIT 1`,
              [String(idCondition.value)]
            );
            if (result.rows.length === 0) return null;
            return keysToCamelCase(result.rows[0] as Record<string, unknown>) as any;
          }

          // Otherwise, fetch all and filter using SQL
          const result = await db.query(`SELECT * FROM "${table}" LIMIT 100`);

          for (const record of result.rows) {
            if (matchesWhere(record as Record<string, unknown>, whereArr)) {
              return keysToCamelCase(record as Record<string, unknown>) as any;
            }
          }

          return null;
        },

        findMany: async ({ model, where, limit, offset, sortBy }) => {
          const table = getTable(model);
          const whereArr = (where || []) as WhereClause[];

          // Use SQL query instead of REST API (workaround for mech-storage bug)
          const orderByClause = sortBy
            ? `ORDER BY ${toSnakeCase(sortBy.field)} ${sortBy.direction?.toUpperCase() || "ASC"}`
            : "";
          const limitClause = `LIMIT ${limit || 100} OFFSET ${offset || 0}`;

          const result = await db.query(
            `SELECT * FROM "${table}" ${orderByClause} ${limitClause}`
          );

          let filtered = result.rows as Record<string, unknown>[];

          // Apply where filters if present
          if (whereArr.length > 0) {
            filtered = filtered.filter((record) => matchesWhere(record, whereArr));
          }

          return filtered.map((row) => keysToCamelCase(row)) as any[];
        },

        update: async ({ model, where, update }) => {
          const table = getTable(model);
          const whereArr = where as WhereClause[];
          const snakeData = keysToSnakeCase(update as Record<string, unknown>);

          // Find the record to update
          const idCondition = whereArr.find(
            (w) => w.field === "id" && (w.operator === "eq" || !w.operator)
          );

          if (idCondition) {
            // Direct ID update
            const updated = await db.update(table, String(idCondition.value), snakeData);
            return keysToCamelCase(updated as Record<string, unknown>) as typeof update;
          }

          // Find by other criteria first
          const { records } = await db.getRecords(table, { limit: 100 });
          const existing = records.find((r) =>
            matchesWhere(r as Record<string, unknown>, whereArr)
          );

          if (!existing) return null;

          const id = (existing as Record<string, unknown>).id as string;
          const updated = await db.update(table, id, snakeData);
          return keysToCamelCase(updated as Record<string, unknown>) as typeof update;
        },

        updateMany: async ({ model, where, update }) => {
          const table = getTable(model);
          const whereArr = (where || []) as WhereClause[];
          const snakeData = keysToSnakeCase(update as Record<string, unknown>);

          const { records } = await db.getRecords(table, { limit: 1000 });
          const matching = records.filter((r) =>
            matchesWhere(r as Record<string, unknown>, whereArr)
          );

          let count = 0;
          for (const record of matching) {
            const id = (record as Record<string, unknown>).id as string;
            await db.update(table, id, snakeData);
            count++;
          }

          return count;
        },

        delete: async ({ model, where }) => {
          const table = getTable(model);
          const whereArr = where as WhereClause[];

          const idCondition = whereArr.find(
            (w) => w.field === "id" && (w.operator === "eq" || !w.operator)
          );

          if (idCondition) {
            await db.delete(table, String(idCondition.value));
            return;
          }

          // Find by other criteria first
          const { records } = await db.getRecords(table, { limit: 100 });
          const existing = records.find((r) =>
            matchesWhere(r as Record<string, unknown>, whereArr)
          );

          if (existing) {
            await db.delete(table, (existing as Record<string, unknown>).id as string);
          }
        },

        deleteMany: async ({ model, where }) => {
          const table = getTable(model);
          const whereArr = (where || []) as WhereClause[];

          const { records } = await db.getRecords(table, { limit: 1000 });
          const matching = records.filter((r) =>
            matchesWhere(r as Record<string, unknown>, whereArr)
          );

          let count = 0;
          for (const record of matching) {
            await db.delete(table, (record as Record<string, unknown>).id as string);
            count++;
          }

          return count;
        },

        count: async ({ model, where }) => {
          const table = getTable(model);
          const whereArr = (where || []) as WhereClause[];

          if (whereArr.length === 0) {
            const { total } = await db.getRecords(table, { limit: 1 });
            return total;
          }

          // Get all and filter
          const { records } = await db.getRecords(table, { limit: 1000 });
          return records.filter((r) =>
            matchesWhere(r as Record<string, unknown>, whereArr)
          ).length;
        },
      };
    },
  });

  return adapterCreator;
};

export type { MechStorageAdapterConfig };
