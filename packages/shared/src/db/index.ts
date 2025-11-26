// Database client placeholder - will be implemented in TASK-002
// This will use mech-storage API

export interface DatabaseConfig {
  apiKey: string;
  appId: string;
  baseUrl?: string;
}

export class DatabaseClient {
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || "https://storage.mechdna.net/api",
    };
  }

  // Placeholder methods - will be implemented in TASK-002
  async query<T>(_sql: string, _params?: unknown[]): Promise<T[]> {
    throw new Error("Not implemented - see TASK-002");
  }

  async insert<T>(_table: string, _data: Partial<T>): Promise<T> {
    throw new Error("Not implemented - see TASK-002");
  }

  async update<T>(
    _table: string,
    _data: Partial<T>,
    _where: Record<string, unknown>
  ): Promise<T> {
    throw new Error("Not implemented - see TASK-002");
  }

  async delete(_table: string, _where: Record<string, unknown>): Promise<void> {
    throw new Error("Not implemented - see TASK-002");
  }
}

// Factory function
let dbInstance: DatabaseClient | null = null;

export function getDatabase(config?: DatabaseConfig): DatabaseClient {
  if (!dbInstance) {
    if (!config) {
      throw new Error("Database not initialized. Call initDatabase first.");
    }
    dbInstance = new DatabaseClient(config);
  }
  return dbInstance;
}

export function initDatabase(config: DatabaseConfig): DatabaseClient {
  dbInstance = new DatabaseClient(config);
  return dbInstance;
}
