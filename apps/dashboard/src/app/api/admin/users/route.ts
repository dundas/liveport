import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isUserSuperuser } from "@/lib/superuser";

/**
 * List all users (admin only)
 */
export async function GET(request: NextRequest) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isUserSuperuser(session.user)) {
    return NextResponse.json({ error: "Forbidden - Superuser access required" }, { status: 403 });
  }

  return NextResponse.json(
    { message: "User listing not yet implemented", users: [] },
    { status: 501 }
  );
}
