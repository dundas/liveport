/**
 * TEMPORARY debug endpoint — remove after diagnosing production registration errors.
 * Tests ClearAuth register flow and returns the actual error details.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { registerUser } from "clearauth";

export async function POST(req: NextRequest) {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    envCheck: {
      hasAuthSecret: !!process.env.AUTH_SECRET,
      hasMechAppId: !!process.env.MECH_APPS_APP_ID,
      hasMechApiKey: !!process.env.MECH_APPS_API_KEY,
      hasMechUrl: !!process.env.MECH_APPS_URL,
      mechUrl: process.env.MECH_APPS_URL ? process.env.MECH_APPS_URL.replace(/apiKey=.*/, "apiKey=***") : "not set",
    },
  };

  try {
    const body = await req.json();
    diagnostics.bodyParsed = true;
    diagnostics.email = body.email;

    // Test database access
    try {
      const db = auth.database;
      diagnostics.dbAccessible = !!db;
      diagnostics.dbType = typeof db;

      // Try a simple query to check DB connectivity
      const testResult = await db.query("SELECT 1 as test");
      diagnostics.dbQueryWorks = true;
      diagnostics.dbQueryResult = testResult;
    } catch (dbErr: unknown) {
      diagnostics.dbAccessible = false;
      diagnostics.dbError = dbErr instanceof Error ? dbErr.message : String(dbErr);
      diagnostics.dbErrorStack = dbErr instanceof Error ? dbErr.stack?.split("\n").slice(0, 5) : undefined;
    }

    // Try listing tables
    try {
      const tables = await auth.database.listTables();
      diagnostics.tables = tables;
    } catch (tableErr: unknown) {
      diagnostics.tablesError = tableErr instanceof Error ? tableErr.message : String(tableErr);
    }

    // Try the actual register
    try {
      const result = await registerUser(auth.database, body.email, body.password, {
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      });
      diagnostics.registerSuccess = true;
      diagnostics.registerResult = { userId: result.user.id, sessionId: result.sessionId };
    } catch (regErr: unknown) {
      diagnostics.registerSuccess = false;
      diagnostics.registerError = regErr instanceof Error ? regErr.message : String(regErr);
      diagnostics.registerErrorStack = regErr instanceof Error ? regErr.stack?.split("\n").slice(0, 8) : undefined;
      diagnostics.registerErrorName = regErr instanceof Error ? regErr.constructor.name : typeof regErr;
    }

    return NextResponse.json(diagnostics, { status: 200 });
  } catch (err: unknown) {
    diagnostics.topLevelError = err instanceof Error ? err.message : String(err);
    diagnostics.topLevelStack = err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined;
    return NextResponse.json(diagnostics, { status: 500 });
  }
}
