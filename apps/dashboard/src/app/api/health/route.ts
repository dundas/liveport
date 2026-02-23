/**
 * Health Check API Route
 *
 * GET /api/health - Basic health check
 * GET /api/health?detailed=true - Detailed health check with dependency status
 */

import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks?: {
    database?: {
      status: "up" | "down";
      latencyMs?: number;
      error?: string;
    };
    redis?: {
      status: "up" | "down" | "skipped";
      latencyMs?: number;
      error?: string;
    };
  };
}

// Track server start time for uptime calculation
const startTime = Date.now();

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<{ status: "up" | "down"; latencyMs?: number; error?: string }> {
  const startMs = Date.now();

  try {
    const db = getDbClient();
    // Simple query to check connectivity
    await db.query("SELECT 1 as health_check");
    return {
      status: "up",
      latencyMs: Date.now() - startMs,
    };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - startMs,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check Redis connectivity
 * Uses direct ioredis to avoid pulling in the full shared package
 */
async function checkRedis(): Promise<{ status: "up" | "down" | "skipped"; latencyMs?: number; error?: string }> {
  const startMs = Date.now();
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return {
      status: "skipped",
      error: "REDIS_URL not configured",
    };
  }

  try {
    // Dynamic import to avoid bundling issues
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
    });

    await redis.connect();
    await redis.ping();
    await redis.quit();

    return {
      status: "up",
      latencyMs: Date.now() - startMs,
    };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - startMs,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get("detailed") === "true";

  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  // If detailed check requested, check dependencies
  if (detailed) {
    const [dbCheck, redisCheck] = await Promise.all([
      checkDatabase(),
      checkRedis(),
    ]);

    health.checks = {
      database: dbCheck,
      redis: redisCheck,
    };

    // Determine overall status based on checks
    const dbUp = dbCheck.status === "up";

    if (!dbUp && redisCheck.status === "down") {
      health.status = "unhealthy";
    } else if (!dbUp || redisCheck.status === "down") {
      health.status = "degraded";
    }
  }

  // Return appropriate status code
  const statusCode = health.status === "unhealthy" ? 503 : 200;

  return NextResponse.json(health, {
    status: statusCode,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
