/**
 * Mech-Storage Database Client
 *
 * A client wrapper for the mech-storage PostgreSQL API.
 * Provides query, insert, update, and delete operations.
 */

export interface DatabaseConfig {
  apiKey: string;
  appId: string;
  baseUrl?: string;
}

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface MechStorageError {
  code: string;
  message: string;
  hints?: string[];
  possibleCauses?: string[];
  suggestedFixes?: string[];
}

export class DatabaseError extends Error {
  public readonly code: string;
  public readonly hints?: string[];
  public readonly possibleCauses?: string[];
  public readonly suggestedFixes?: string[];

  constructor(error: MechStorageError) {
    super(error.message);
    this.name = "DatabaseError";
    this.code = error.code;
    this.hints = error.hints;
    this.possibleCauses = error.possibleCauses;
    this.suggestedFixes = error.suggestedFixes;
  }
}

export class MechStorageClient {
  private config: Required<DatabaseConfig>;

  constructor(config: DatabaseConfig) {
    this.config = {
      apiKey: config.apiKey,
      appId: config.appId,
      baseUrl: config.baseUrl || "https://storage.mechdna.net/api",
    };
  }

  /**
   * Get the base URL for API requests
   */
  private getBaseUrl(): string {
    return `${this.config.baseUrl}/apps/${this.config.appId}/postgresql`;
  }

  /**
   * Get the headers for API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-API-Key": this.config.apiKey,
      "X-App-ID": this.config.appId,
    };
  }

  /**
   * Make an API request with error handling
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${path}`;
    const options: RequestInit = {
      method,
      headers: this.getHeaders(),
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({
        code: "UNKNOWN_ERROR",
        message: `Request failed with status ${response.status}`,
      }))) as MechStorageError;
      throw new DatabaseError(errorData);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Execute a custom SQL query with parameterized values
   * @param sql - SQL query with $1, $2, etc. placeholders
   * @param params - Array of parameter values
   * @returns Query result with rows and rowCount
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const result = await this.request<{ rows: T[]; rowCount: number }>(
      "POST",
      "/query",
      { sql, params }
    );
    return {
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
    };
  }

  /**
   * Get records from a table with optional pagination
   * @param table - Table name
   * @param options - Pagination and ordering options
   */
  async getRecords<T = Record<string, unknown>>(
    table: string,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDir?: "asc" | "desc";
    } = {}
  ): Promise<{ records: T[]; total: number }> {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.offset) params.set("offset", String(options.offset));
    if (options.orderBy) params.set("orderBy", options.orderBy);
    if (options.orderDir) params.set("orderDir", options.orderDir);

    const queryString = params.toString();
    const path = `/tables/${table}${queryString ? `?${queryString}` : ""}`;

    const result = await this.request<{ records: T[]; total: number }>(
      "GET",
      path
    );
    return {
      records: result.records || [],
      total: result.total || 0,
    };
  }

  /**
   * Get a single record by ID
   * @param table - Table name
   * @param id - Record ID
   */
  async getRecord<T = Record<string, unknown>>(
    table: string,
    id: string
  ): Promise<T | null> {
    try {
      return await this.request<T>("GET", `/tables/${table}/${id}`);
    } catch (error) {
      if (error instanceof DatabaseError && error.code === "NOT_FOUND") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Insert one or more records into a table
   * @param table - Table name
   * @param data - Single record or array of records to insert
   * @returns Inserted record(s)
   */
  async insert<T = Record<string, unknown>>(
    table: string,
    data: Partial<T> | Partial<T>[]
  ): Promise<T[]> {
    const records = Array.isArray(data) ? data : [data];
    const result = await this.request<{ records: T[] }>("POST", `/tables/${table}`, {
      records,
    });
    return result.records || [];
  }

  /**
   * Update a record by ID
   * @param table - Table name
   * @param id - Record ID
   * @param data - Fields to update
   * @returns Updated record
   */
  async update<T = Record<string, unknown>>(
    table: string,
    id: string,
    data: Partial<T>
  ): Promise<T> {
    return this.request<T>("PUT", `/tables/${table}/${id}`, data);
  }

  /**
   * Delete a record by ID
   * @param table - Table name
   * @param id - Record ID
   */
  async delete(table: string, id: string): Promise<void> {
    await this.request<void>("DELETE", `/tables/${table}/${id}`);
  }

  /**
   * Create a table with the specified columns
   * @param table - Table name
   * @param columns - Column definitions
   */
  async createTable(
    table: string,
    columns: Array<{
      name: string;
      type:
        | "text"
        | "integer"
        | "bigint"
        | "decimal"
        | "boolean"
        | "timestamp"
        | "json"
        | "jsonb"
        | "uuid";
      nullable?: boolean;
      primaryKey?: boolean;
      unique?: boolean;
      defaultValue?: string;
    }>
  ): Promise<void> {
    await this.request<void>("POST", `/tables/${table}`, { columns });
  }

  /**
   * Drop a table
   * @param table - Table name
   */
  async dropTable(table: string): Promise<void> {
    await this.request<void>("DELETE", `/tables/${table}`);
  }

  /**
   * List all tables in the app's schema
   */
  async listTables(): Promise<Array<{ name: string; schema: string; type: string }>> {
    const result = await this.request<
      Array<{ name: string; schema: string; type: string }>
    >("GET", "/tables");
    return result || [];
  }

  /**
   * Get the schema (columns and indexes) for a table
   * @param table - Table name
   */
  async getTableSchema(
    table: string
  ): Promise<{
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      defaultValue?: string;
    }>;
    indexes: Array<{ name: string; columns: string[] }>;
  }> {
    return this.request("GET", `/tables/${table}/schema`);
  }

  /**
   * Check if PostgreSQL is enabled and get service status
   */
  async getStatus(): Promise<{
    postgresqlEnabled: boolean;
    canCreateTables: boolean;
    architecture: string;
    endpoints: string[];
  }> {
    return this.request("GET", "/status");
  }
}

// Singleton instance management
let dbInstance: MechStorageClient | null = null;

/**
 * Get the database client instance
 * @param config - Database configuration (required on first call)
 * @throws Error if database not initialized
 */
export function getDatabase(config?: DatabaseConfig): MechStorageClient {
  if (!dbInstance) {
    if (!config) {
      throw new Error("Database not initialized. Call initDatabase first.");
    }
    dbInstance = new MechStorageClient(config);
  }
  return dbInstance;
}

/**
 * Initialize the database client
 * @param config - Database configuration
 * @returns The database client instance
 */
export function initDatabase(config: DatabaseConfig): MechStorageClient {
  dbInstance = new MechStorageClient(config);
  return dbInstance;
}

/**
 * Reset the database instance (useful for testing)
 */
export function resetDatabase(): void {
  dbInstance = null;
}

// Re-export schema and repositories
export * from "./schema.js";
export * from "./repositories.js";
