/**
 * API Documentation Endpoint
 *
 * GET /api/docs - Returns the OpenAPI specification
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    // Read the OpenAPI spec from the docs folder
    const specPath = path.join(process.cwd(), "../../docs/api/openapi.yaml");

    // Check if file exists
    if (!fs.existsSync(specPath)) {
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
    console.error("[API] GET /api/docs error:", error);
    return NextResponse.json(
      { error: "Failed to load API documentation" },
      { status: 500 }
    );
  }
}
