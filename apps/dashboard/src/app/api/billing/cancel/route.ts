/**
 * Cancel Subscription API
 * 
 * Cancels the user's subscription (at period end or immediately).
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { cancelSubscription, resumeSubscription } from "@/lib/billing";
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
    const body = await req.json().catch(() => ({}));
    const immediately = body.immediately === true;

    const result = await cancelSubscription(session.user.id, immediately);

    return NextResponse.json({
      status: result.status,
      cancelAt: result.cancelAt?.toISOString() || null,
      message: immediately 
        ? "Subscription canceled immediately" 
        : "Subscription will be canceled at the end of the billing period",
    });
  } catch (error) {
    console.error("[Billing] Failed to cancel subscription:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel subscription" },
      { status: 400 }
    );
  }
}

// Resume a canceled subscription
export async function DELETE() {
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
    const result = await resumeSubscription(session.user.id);

    return NextResponse.json({
      status: result.status,
      message: "Subscription resumed",
    });
  } catch (error) {
    console.error("[Billing] Failed to resume subscription:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resume subscription" },
      { status: 400 }
    );
  }
}
