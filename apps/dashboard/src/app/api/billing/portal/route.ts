/**
 * Billing Portal API
 * 
 * Creates a Stripe billing portal session for subscription management.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { createBillingPortalSession } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/stripe";

export async function POST(req: Request) {
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
    // Get return URL from request or use default
    const body = await req.json().catch(() => ({}));
    const returnUrl = body.returnUrl || `${req.headers.get("origin")}/billing`;

    const portalUrl = await createBillingPortalSession(
      session.user.id,
      returnUrl
    );

    return NextResponse.json({ url: portalUrl });
  } catch (error) {
    console.error("[Billing] Failed to create portal session:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create portal session" },
      { status: 400 }
    );
  }
}
