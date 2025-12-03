/**
 * Create Subscription API
 * 
 * Creates a new metered subscription for the authenticated user.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { createSubscription } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/stripe";

export async function POST() {
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
    const result = await createSubscription(
      session.user.id,
      session.user.email,
      session.user.name || undefined
    );

    return NextResponse.json({
      subscriptionId: result.subscriptionId,
      clientSecret: result.clientSecret,
      status: result.status,
    });
  } catch (error) {
    console.error("[Billing] Failed to create subscription:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create subscription" },
      { status: 400 }
    );
  }
}
