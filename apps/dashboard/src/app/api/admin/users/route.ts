import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { isUserSuperuser } from "@/lib/superuser";

/**
 * List all users (admin only)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession();

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
