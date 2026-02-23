import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { isUserSuperuser } from "@/lib/superuser";

/**
 * Block a user (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isUserSuperuser(session.user)) {
    return NextResponse.json({ error: "Forbidden - Superuser access required" }, { status: 403 });
  }

  // TODO: Implement user blocking logic
  const { id: userId } = await params;

  return NextResponse.json(
    { message: "User blocking not yet implemented", userId },
    { status: 501 }
  );
}
