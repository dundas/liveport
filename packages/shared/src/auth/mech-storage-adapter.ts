/**
 * Better Auth Adapter for Mech-Storage
 *
 * Implements the Better Auth database adapter interface using the mech-storage API.
 */

import type { Adapter, Where } from "better-auth";
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

// Build SQL WHERE clause from Better Auth Where conditions
function buildWhereClause(
  where: Where[],
  startIndex = 1
): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = startIndex;

  for (const condition of where) {
    const field = toSnakeCase(condition.field);

    if (condition.operator === "eq" || !condition.operator) {
      conditions.push(`${field} = $${paramIndex}`);
      params.push(condition.value);
      paramIndex++;
    } else if (condition.operator === "ne") {
      conditions.push(`${field} != $${paramIndex}`);
      params.push(condition.value);
      paramIndex++;
    } else if (condition.operator === "gt") {
      conditions.push(`${field} > $${paramIndex}`);
      params.push(condition.value);
      paramIndex++;
    } else if (condition.operator === "gte") {
      conditions.push(`${field} >= $${paramIndex}`);
      params.push(condition.value);
      paramIndex++;
    } else if (condition.operator === "lt") {
      conditions.push(`${field} < $${paramIndex}`);
      params.push(condition.value);
      paramIndex++;
    } else if (condition.operator === "lte") {
      conditions.push(`${field} <= $${paramIndex}`);
      params.push(condition.value);
      paramIndex++;
    } else if (condition.operator === "in") {
      const values = condition.value as unknown[];
      const placeholders = values.map(() => `$${paramIndex++}`);
      conditions.push(`${field} IN (${placeholders.join(", ")})`);
      params.push(...values);
    } else if (condition.operator === "contains") {
      conditions.push(`${field} LIKE $${paramIndex}`);
      params.push(`%${condition.value}%`);
      paramIndex++;
    } else if (condition.operator === "starts_with") {
      conditions.push(`${field} LIKE $${paramIndex}`);
      params.push(`${condition.value}%`);
      paramIndex++;
    } else if (condition.operator === "ends_with") {
      conditions.push(`${field} LIKE $${paramIndex}`);
      params.push(`%${condition.value}`);
      paramIndex++;
    }
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

/**
 * Create a Better Auth adapter for mech-storage
 */
export function mechStorageAdapter(db: MechStorageClient): Adapter {
  return {
    id: "mech-storage",

    create: async <T extends Record<string, unknown>, R = T>({ model, data }: { model: string; data: Omit<T, "id">; select?: string[]; forceAllowId?: boolean }): Promise<R> => {
      const table = TABLE_MAP[model] || model;
      const snakeData = keysToSnakeCase(data as Record<string, unknown>);

      const result = await db.insert(table, snakeData);
      if (result.length === 0) {
        throw new Error(`Failed to create ${model}`);
      }
      return keysToCamelCase(result[0] as Record<string, unknown>) as R;
    },

    findOne: async <T>({ model, where, select }: { model: string; where: Where[]; select?: string[] }): Promise<T | null> => {
      const table = TABLE_MAP[model] || model;
      const { clause, params } = buildWhereClause(where);

      const selectFields = select
        ? select.map(toSnakeCase).join(", ")
        : "*";

      const sql = `SELECT ${selectFields} FROM "${table}" ${clause} LIMIT 1`;
      const result = await db.query<Record<string, unknown>>(sql, params);

      if (result.rows.length === 0) {
        return null;
      }

      return keysToCamelCase(result.rows[0]) as T;
    },

    findMany: async <T>({ model, where, limit, offset, sortBy }: { model: string; where?: Where[]; limit?: number; offset?: number; sortBy?: { field: string; direction: "asc" | "desc" } }): Promise<T[]> => {
      const table = TABLE_MAP[model] || model;
      const { clause, params } = where ? buildWhereClause(where) : { clause: "", params: [] };

      let sql = `SELECT * FROM "${table}" ${clause}`;

      if (sortBy) {
        const direction = sortBy.direction === "desc" ? "DESC" : "ASC";
        sql += ` ORDER BY ${toSnakeCase(sortBy.field)} ${direction}`;
      }

      if (limit) {
        sql += ` LIMIT ${limit}`;
      }

      if (offset) {
        sql += ` OFFSET ${offset}`;
      }

      const result = await db.query<Record<string, unknown>>(sql, params);
      return result.rows.map((row) => keysToCamelCase(row)) as T[];
    },

    update: async <T>({ model, where, update: updateData }: { model: string; where: Where[]; update: Record<string, unknown> }): Promise<T | null> => {
      const table = TABLE_MAP[model] || model;
      const snakeData = keysToSnakeCase(updateData as Record<string, unknown>);

      // Build SET clause
      const setEntries = Object.entries(snakeData);
      const setClauses = setEntries.map((_, i) => `${setEntries[i][0]} = $${i + 1}`);
      const setParams = setEntries.map(([, value]) => value);

      // Build WHERE clause (starting from after SET params)
      const { clause, params: whereParams } = buildWhereClause(
        where,
        setEntries.length + 1
      );

      const sql = `UPDATE "${table}" SET ${setClauses.join(", ")} ${clause} RETURNING *`;
      const result = await db.query<Record<string, unknown>>(sql, [
        ...setParams,
        ...whereParams,
      ]);

      if (result.rows.length === 0) {
        return null;
      }

      return keysToCamelCase(result.rows[0]) as T;
    },

    updateMany: async ({ model, where, update: updateData }: { model: string; where: Where[]; update: Record<string, unknown> }): Promise<number> => {
      const table = TABLE_MAP[model] || model;
      const snakeData = keysToSnakeCase(updateData as Record<string, unknown>);

      // Build SET clause
      const setEntries = Object.entries(snakeData);
      const setClauses = setEntries.map((_, i) => `${setEntries[i][0]} = $${i + 1}`);
      const setParams = setEntries.map(([, value]) => value);

      // Build WHERE clause
      const { clause, params: whereParams } = buildWhereClause(
        where,
        setEntries.length + 1
      );

      const sql = `UPDATE "${table}" SET ${setClauses.join(", ")} ${clause}`;
      const result = await db.query(sql, [...setParams, ...whereParams]);

      return result.rowCount;
    },

    delete: async ({ model, where }: { model: string; where: Where[] }): Promise<void> => {
      const table = TABLE_MAP[model] || model;
      const { clause, params } = buildWhereClause(where);

      const sql = `DELETE FROM "${table}" ${clause}`;
      await db.query(sql, params);
    },

    deleteMany: async ({ model, where }: { model: string; where: Where[] }): Promise<number> => {
      const table = TABLE_MAP[model] || model;
      const { clause, params } = buildWhereClause(where);

      const sql = `DELETE FROM "${table}" ${clause}`;
      const result = await db.query(sql, params);

      return result.rowCount;
    },

    count: async ({ model, where }: { model: string; where?: Where[] }): Promise<number> => {
      const table = TABLE_MAP[model] || model;
      const { clause, params } = where ? buildWhereClause(where) : { clause: "", params: [] };

      const sql = `SELECT COUNT(*) as count FROM "${table}" ${clause}`;
      const result = await db.query<{ count: string }>(sql, params);

      return parseInt(result.rows[0]?.count || "0", 10);
    },

    // Transaction support - mech-storage doesn't support transactions,
    // so we execute operations sequentially
    transaction: async <T>(callback: (adapter: Adapter) => Promise<T>): Promise<T> => {
      // mech-storage doesn't support transactions, execute directly
      return callback(mechStorageAdapter(db));
    },
  };
}

export type { Adapter };
