import { z } from "zod";

// User schema
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().optional(),
  tier: z.enum(["free", "pro", "team", "enterprise"]).default("free"),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof userSchema>;

// Bridge key schema
export const bridgeKeySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  keyHash: z.string(),
  keyPrefix: z.string().max(12),
  expiresAt: z.date().optional(),
  maxUses: z.number().int().positive().optional(),
  currentUses: z.number().int().nonnegative().default(0),
  allowedPort: z.number().int().min(1).max(65535).optional(),
  status: z.enum(["active", "revoked", "expired"]).default("active"),
  lastUsedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type BridgeKey = z.infer<typeof bridgeKeySchema>;

// Create bridge key input
export const createBridgeKeySchema = z.object({
  name: z.string().min(1).max(100).default("API Key"),
  expiresInDays: z.number().int().positive().optional(),
  maxUses: z.number().int().positive().optional(),
  allowedPort: z.number().int().min(1).max(65535).optional(),
});

export type CreateBridgeKeyInput = z.infer<typeof createBridgeKeySchema>;

// Tunnel schema
export const tunnelSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  bridgeKeyId: z.string().uuid().optional(),
  subdomain: z.string().max(20),
  name: z.string().max(100).optional(),
  localPort: z.number().int().min(1).max(65535),
  publicUrl: z.string().url(),
  region: z.string().default("us-east"),
  connectedAt: z.date(),
  disconnectedAt: z.date().optional(),
  requestCount: z.number().int().nonnegative().default(0),
  bytesTransferred: z.number().int().nonnegative().default(0),
});

export type Tunnel = z.infer<typeof tunnelSchema>;

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Expiration helper
export const expirationMap: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function getExpirationDate(expiresIn: string): Date {
  const ms = expirationMap[expiresIn] || expirationMap["6h"];
  return new Date(Date.now() + ms);
}
