/**
 * Invoices API
 * 
 * Returns invoice history for the authenticated user.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { getInvoices } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/stripe";

export async function GET(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Billing not configured" },
      { status: 503 }
    );
  }

  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const invoices = await getInvoices(session.user.id, Math.min(limit, 100));

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("[Billing] Failed to get invoices:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get invoices" },
      { status: 500 }
    );
  }
}
