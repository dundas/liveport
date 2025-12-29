import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isUserSuperuser } from "@/lib/superuser";

/**
 * Unblock a user (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isUserSuperuser(session.user)) {
    return NextResponse.json({ error: "Forbidden - Superuser access required" }, { status: 403 });
  }

  const { id: userId } = await params;

  return NextResponse.json(
    { message: "User unblocking not yet implemented", userId },
    { status: 501 }
  );
}
