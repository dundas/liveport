/**
 * API Documentation Endpoint
 *
 * GET /api/docs - Returns the OpenAPI specification
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getLogger } from "@/lib/logger";

const logger = getLogger("dashboard:api:docs");

export async function GET() {
  try {
    // Read the OpenAPI spec from the public folder
    const specPath = path.join(process.cwd(), "public/openapi.yaml");

    // Check if file exists
    if (!fs.existsSync(specPath)) {
      logger.warn("OpenAPI specification not found at public/openapi.yaml");
      return NextResponse.json(
        { error: "OpenAPI specification not found" },
        { status: 404 }
      );
    }

    const spec = fs.readFileSync(specPath, "utf-8");

    return new NextResponse(spec, {
      headers: {
        "Content-Type": "application/yaml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to load API documentation");
    return NextResponse.json(
      { error: "Failed to load API documentation" },
      { status: 500 }
    );
  }
}
