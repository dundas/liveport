/**
 * Repository Classes for Database Operations
 *
 * Provides type-safe CRUD operations for Users, BridgeKeys, and Tunnels.
 * Uses mech-storage REST API instead of raw SQL for automatic table namespacing.
 */

import type { User, BridgeKey, Tunnel } from "../types/index.js";
import type { MechStorageClient } from "./index.js";
import { TABLE_NAMES } from "./schema.js";

// Database row types (snake_case as stored in mech-storage)
interface UserRow {
  id: string;
  email: string;
  name: string | null;
  tier: "free" | "pro" | "team" | "enterprise";
  email_verified?: boolean;
  image?: string;
  created_at: string;
  updated_at: string;
}

interface BridgeKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  allowed_port: number | null;
  status: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TunnelRow {
  id: string;
  user_id: string;
  bridge_key_id: string | null;
  subdomain: string;
  name: string | null;
  local_port: number;
  public_url: string;
  region: string;
  connected_at: string;
  disconnected_at: string | null;
  request_count: number;
  bytes_transferred: number;
}

// Input types for creating records
export interface CreateUserInput {
  email: string;
  name?: string;
  tier?: "free" | "pro" | "team" | "enterprise";
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  tier?: "free" | "pro" | "team" | "enterprise";
}

export interface CreateBridgeKeyInput {
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  expiresAt?: Date;
  maxUses?: number;
  allowedPort?: number;
}

export interface UpdateBridgeKeyInput {
  currentUses?: number;
  status?: "active" | "revoked" | "expired";
}

export interface CreateTunnelInput {
  userId: string;
  bridgeKeyId?: string;
  subdomain: string;
  name?: string;
  localPort: number;
  publicUrl: string;
  region?: string;
}

export interface UpdateTunnelInput {
  disconnectedAt?: Date;
  requestCount?: number;
  bytesTransferred?: number;
}

// Helper functions to convert between camelCase and snake_case
function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name || undefined,
    tier: row.tier as User["tier"],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToBridgeKey(row: BridgeKeyRow): BridgeKey {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    maxUses: row.max_uses || undefined,
    currentUses: row.current_uses,
    allowedPort: row.allowed_port || undefined,
    status: row.status as BridgeKey["status"],
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToTunnel(row: TunnelRow): Tunnel {
  return {
    id: row.id,
    userId: row.user_id,
    bridgeKeyId: row.bridge_key_id || undefined,
    subdomain: row.subdomain,
    name: row.name || undefined,
    localPort: row.local_port,
    publicUrl: row.public_url,
    region: row.region,
    connectedAt: new Date(row.connected_at),
    disconnectedAt: row.disconnected_at
      ? new Date(row.disconnected_at)
      : undefined,
    requestCount: row.request_count,
    bytesTransferred: row.bytes_transferred,
  };
}

/**
 * Repository for User operations
 */
export class UserRepository {
  constructor(private db: MechStorageClient) {}

  /**
   * Find a user by ID
   */
  async findById(id: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `SELECT * FROM "${TABLE_NAMES.USER}" WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return rowToUser(result.rows[0]);
  }

  /**
   * Find a user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `SELECT * FROM "${TABLE_NAMES.USER}" WHERE email = $1`,
      [email]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return rowToUser(result.rows[0]);
  }

  /**
   * Get all users with optional pagination
   */
  async findAll(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ users: User[]; total: number }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM "${TABLE_NAMES.USER}"`
    );
    const total = parseInt(countResult.rows[0]?.count || "0", 10);

    const result = await this.db.query<UserRow>(
      `SELECT * FROM "${TABLE_NAMES.USER}" ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      users: result.rows.map(rowToUser),
      total,
    };
  }

  /**
   * Create a new user
   */
  async create(input: CreateUserInput): Promise<User> {
    const result = await this.db.query<UserRow>(
      `INSERT INTO "${TABLE_NAMES.USER}" (email, name, tier)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.email, input.name || null, input.tier || "free"]
    );
    return rowToUser(result.rows[0]);
  }

  /**
   * Update a user
   */
  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(input.email);
    }
    if (input.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.tier !== undefined) {
      fields.push(`tier = $${paramIndex++}`);
      values.push(input.tier);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.db.query<UserRow>(
      `UPDATE "${TABLE_NAMES.USER}"
       SET ${fields.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }
    return rowToUser(result.rows[0]);
  }

  /**
   * Delete a user
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM "${TABLE_NAMES.USER}" WHERE id = $1`,
      [id]
    );
    return result.rowCount > 0;
  }
}

/**
 * Repository for BridgeKey operations
 * Uses mech-storage REST API for automatic table namespacing
 */
export class BridgeKeyRepository {
  constructor(private db: MechStorageClient) {}

  /**
   * Find a bridge key by ID
   */
  async findById(id: string): Promise<BridgeKey | null> {
    const record = await this.db.getRecord<BridgeKeyRow>(TABLE_NAMES.BRIDGE_KEYS, id);
    if (!record) {
      return null;
    }
    return rowToBridgeKey(record);
  }

  /**
   * Find a bridge key by its prefix (for validation)
   */
  async findByPrefix(keyPrefix: string): Promise<BridgeKey | null> {
    const { records } = await this.db.getRecords<BridgeKeyRow>(TABLE_NAMES.BRIDGE_KEYS, {
      limit: 100,
    });
    const record = records.find((r) => r.key_prefix === keyPrefix);
    if (!record) {
      return null;
    }
    return rowToBridgeKey(record);
  }

  /**
   * Find a bridge key by its hash (for legacy SHA-256 lookups)
   * @deprecated Use findByKeyPrefix + verifyKey for bcrypt hashes
   */
  async findByKeyHash(keyHash: string): Promise<BridgeKey | null> {
    const { records } = await this.db.getRecords<BridgeKeyRow>(TABLE_NAMES.BRIDGE_KEYS, {
      limit: 100,
    });
    const record = records.find((r) => r.key_hash === keyHash);
    if (!record) {
      return null;
    }
    return rowToBridgeKey(record);
  }

  /**
   * Find a bridge key by its prefix (for bcrypt verification)
   * The prefix is the first 8 characters of the key, used to narrow down
   * candidates before verifying with bcrypt.compare()
   */
  async findByKeyPrefix(keyPrefix: string): Promise<BridgeKey | null> {
    const { records } = await this.db.getRecords<BridgeKeyRow>(TABLE_NAMES.BRIDGE_KEYS, {
      limit: 100,
    });
    const record = records.find((r) => r.key_prefix === keyPrefix);
    if (!record) {
      return null;
    }
    return rowToBridgeKey(record);
  }

  /**
   * Update last used timestamp for a bridge key
   */
  async updateLastUsed(id: string): Promise<void> {
    await this.db.update<BridgeKeyRow>(TABLE_NAMES.BRIDGE_KEYS, id, {
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Find all bridge keys for a user
   */
  async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ keys: BridgeKey[]; total: number }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const { records, total } = await this.db.getRecords<BridgeKeyRow>(TABLE_NAMES.BRIDGE_KEYS, {
      limit: 100, // Get records for filtering (mech-storage may have limits)
      orderBy: "created_at",
      orderDir: "DESC",
    });

    // Filter by user_id client-side
    const userRecords = records.filter((r) => r.user_id === userId);
    const paginatedRecords = userRecords.slice(offset, offset + limit);

    return {
      keys: paginatedRecords.map(rowToBridgeKey),
      total: userRecords.length,
    };
  }

  /**
   * Find active bridge keys for a user
   */
  async findActiveByUserId(userId: string): Promise<BridgeKey[]> {
    const { records } = await this.db.getRecords<BridgeKeyRow>(TABLE_NAMES.BRIDGE_KEYS, {
      limit: 100,
      orderBy: "created_at",
      orderDir: "DESC",
    });

    const now = new Date();
    const activeRecords = records.filter((r) => {
      if (r.user_id !== userId) return false;
      if (r.status !== "active") return false;
      if (r.expires_at && new Date(r.expires_at) <= now) return false;
      return true;
    });

    return activeRecords.map(rowToBridgeKey);
  }

  /**
   * Create a new bridge key
   */
  async create(input: CreateBridgeKeyInput): Promise<BridgeKey> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const record: Partial<BridgeKeyRow> = {
      id,
      user_id: input.userId,
      name: input.name,
      key_hash: input.keyHash,
      key_prefix: input.keyPrefix,
      expires_at: input.expiresAt?.toISOString() || null,
      max_uses: input.maxUses || null,
      current_uses: 0,
      allowed_port: input.allowedPort || null,
      status: "active",
      last_used_at: null,
      created_at: now,
      updated_at: now,
    };

    const result = await this.db.insert<BridgeKeyRow>(TABLE_NAMES.BRIDGE_KEYS, record);
    if (!result || result.length === 0) {
      throw new Error("Failed to create bridge key");
    }
    return rowToBridgeKey(result[0]);
  }

  /**
   * Update a bridge key
   */
  async update(id: string, input: UpdateBridgeKeyInput): Promise<BridgeKey | null> {
    const updateData: Partial<BridgeKeyRow> = {
      updated_at: new Date().toISOString(),
    };

    if (input.currentUses !== undefined) {
      updateData.current_uses = input.currentUses;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    const result = await this.db.update<BridgeKeyRow>(TABLE_NAMES.BRIDGE_KEYS, id, updateData);
    if (!result) {
      return null;
    }
    return rowToBridgeKey(result);
  }

  /**
   * Increment the use count of a bridge key
   */
  async incrementUseCount(id: string): Promise<BridgeKey | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    return this.update(id, {
      currentUses: existing.currentUses + 1,
    });
  }

  /**
   * Revoke a bridge key
   */
  async revoke(id: string): Promise<BridgeKey | null> {
    return this.update(id, { status: "revoked" });
  }

  /**
   * Delete a bridge key
   */
  async delete(id: string): Promise<boolean> {
    try {
      await this.db.delete(TABLE_NAMES.BRIDGE_KEYS, id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Expire all bridge keys that have passed their expiration date
   * Note: This is less efficient with REST API, use sparingly
   */
  async expireOldKeys(): Promise<number> {
    const { records } = await this.db.getRecords<BridgeKeyRow>(TABLE_NAMES.BRIDGE_KEYS, {
      limit: 100,
    });

    const now = new Date();
    let expiredCount = 0;

    for (const record of records) {
      if (record.status === "active" && record.expires_at && new Date(record.expires_at) < now) {
        await this.update(record.id, { status: "expired" });
        expiredCount++;
      }
    }

    return expiredCount;
  }
}

/**
 * Repository for Tunnel operations
 */
export class TunnelRepository {
  constructor(private db: MechStorageClient) {}

  /**
   * Find a tunnel by ID
   */
  async findById(id: string): Promise<Tunnel | null> {
    const result = await this.db.query<TunnelRow>(
      `SELECT * FROM ${TABLE_NAMES.TUNNELS} WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return rowToTunnel(result.rows[0]);
  }

  /**
   * Find a tunnel by subdomain
   */
  async findBySubdomain(subdomain: string): Promise<Tunnel | null> {
    const result = await this.db.query<TunnelRow>(
      `SELECT * FROM ${TABLE_NAMES.TUNNELS} WHERE subdomain = $1`,
      [subdomain]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return rowToTunnel(result.rows[0]);
  }

  /**
   * Find all tunnels for a user
   */
  async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number; activeOnly?: boolean }
  ): Promise<{ tunnels: Tunnel[]; total: number }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const activeOnly = options?.activeOnly || false;

    const whereClause = activeOnly
      ? "WHERE user_id = $1 AND disconnected_at IS NULL"
      : "WHERE user_id = $1";

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${TABLE_NAMES.TUNNELS} ${whereClause}`,
      [userId]
    );
    const total = parseInt(countResult.rows[0]?.count || "0", 10);

    const result = await this.db.query<TunnelRow>(
      `SELECT * FROM ${TABLE_NAMES.TUNNELS}
       ${whereClause}
       ORDER BY connected_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return {
      tunnels: result.rows.map(rowToTunnel),
      total,
    };
  }

  /**
   * Find active tunnels for a user
   */
  async findActiveByUserId(userId: string): Promise<Tunnel[]> {
    const result = await this.db.query<TunnelRow>(
      `SELECT * FROM ${TABLE_NAMES.TUNNELS}
       WHERE user_id = $1 AND disconnected_at IS NULL
       ORDER BY connected_at DESC`,
      [userId]
    );
    return result.rows.map(rowToTunnel);
  }

  /**
   * Find tunnels by bridge key ID
   */
  async findByBridgeKeyId(bridgeKeyId: string): Promise<Tunnel[]> {
    const result = await this.db.query<TunnelRow>(
      `SELECT * FROM ${TABLE_NAMES.TUNNELS}
       WHERE bridge_key_id = $1
       ORDER BY connected_at DESC`,
      [bridgeKeyId]
    );
    return result.rows.map(rowToTunnel);
  }

  /**
   * Create a new tunnel
   */
  async create(input: CreateTunnelInput): Promise<Tunnel> {
    const result = await this.db.query<TunnelRow>(
      `INSERT INTO ${TABLE_NAMES.TUNNELS}
       (user_id, bridge_key_id, subdomain, name, local_port, public_url, region)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.userId,
        input.bridgeKeyId || null,
        input.subdomain,
        input.name || null,
        input.localPort,
        input.publicUrl,
        input.region || "us-east",
      ]
    );
    return rowToTunnel(result.rows[0]);
  }

  /**
   * Update a tunnel
   */
  async update(id: string, input: UpdateTunnelInput): Promise<Tunnel | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.disconnectedAt !== undefined) {
      fields.push(`disconnected_at = $${paramIndex++}`);
      values.push(input.disconnectedAt.toISOString());
    }
    if (input.requestCount !== undefined) {
      fields.push(`request_count = $${paramIndex++}`);
      values.push(input.requestCount);
    }
    if (input.bytesTransferred !== undefined) {
      fields.push(`bytes_transferred = $${paramIndex++}`);
      values.push(input.bytesTransferred);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = await this.db.query<TunnelRow>(
      `UPDATE ${TABLE_NAMES.TUNNELS}
       SET ${fields.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }
    return rowToTunnel(result.rows[0]);
  }

  /**
   * Disconnect a tunnel
   */
  async disconnect(id: string): Promise<Tunnel | null> {
    return this.update(id, { disconnectedAt: new Date() });
  }

  /**
   * Increment request count and bytes transferred
   */
  async incrementStats(
    id: string,
    requestCountDelta: number,
    bytesTransferredDelta: number
  ): Promise<Tunnel | null> {
    const result = await this.db.query<TunnelRow>(
      `UPDATE ${TABLE_NAMES.TUNNELS}
       SET request_count = request_count + $1,
           bytes_transferred = bytes_transferred + $2
       WHERE id = $3
       RETURNING *`,
      [requestCountDelta, bytesTransferredDelta, id]
    );

    if (result.rows.length === 0) {
      return null;
    }
    return rowToTunnel(result.rows[0]);
  }

  /**
   * Delete a tunnel
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM ${TABLE_NAMES.TUNNELS} WHERE id = $1`,
      [id]
    );
    return result.rowCount > 0;
  }

  /**
   * Check if a subdomain is available
   */
  async isSubdomainAvailable(subdomain: string): Promise<boolean> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${TABLE_NAMES.TUNNELS} WHERE subdomain = $1`,
      [subdomain]
    );
    return parseInt(result.rows[0]?.count || "0", 10) === 0;
  }

  /**
   * Get tunnel statistics for a user
   */
  async getUserStats(userId: string): Promise<{
    totalTunnels: number;
    activeTunnels: number;
    totalRequests: number;
    totalBytesTransferred: number;
  }> {
    const result = await this.db.query<{
      total_tunnels: string;
      active_tunnels: string;
      total_requests: string;
      total_bytes: string;
    }>(
      `SELECT
         COUNT(*) as total_tunnels,
         COUNT(*) FILTER (WHERE disconnected_at IS NULL) as active_tunnels,
         COALESCE(SUM(request_count), 0) as total_requests,
         COALESCE(SUM(bytes_transferred), 0) as total_bytes
       FROM ${TABLE_NAMES.TUNNELS}
       WHERE user_id = $1`,
      [userId]
    );

    const row = result.rows[0];
    return {
      totalTunnels: parseInt(row?.total_tunnels || "0", 10),
      activeTunnels: parseInt(row?.active_tunnels || "0", 10),
      totalRequests: parseInt(row?.total_requests || "0", 10),
      totalBytesTransferred: parseInt(row?.total_bytes || "0", 10),
    };
  }
}

/**
 * Factory function to create all repositories
 */
export function createRepositories(db: MechStorageClient): {
  users: UserRepository;
  bridgeKeys: BridgeKeyRepository;
  tunnels: TunnelRepository;
} {
  return {
    users: new UserRepository(db),
    bridgeKeys: new BridgeKeyRepository(db),
    tunnels: new TunnelRepository(db),
  };
}
