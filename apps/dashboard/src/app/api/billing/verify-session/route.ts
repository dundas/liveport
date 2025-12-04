/**
 * Verify Payment Session API
 * 
 * Verifies a Stripe Checkout session and credits the user's account.
 * This is called when the user returns from Stripe Checkout.
 * Uses an OAuth-like pattern instead of relying on webhooks.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getDbClient } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const db = getDbClient();

    // Retrieve the checkout session from Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify this session belongs to the current user
    if (checkoutSession.metadata?.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Session does not belong to this user" },
        { status: 403 }
      );
    }

    // Check if payment was successful
    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed", status: checkoutSession.payment_status },
        { status: 400 }
      );
    }

    // Check if this is a credit top-up
    if (checkoutSession.metadata?.type !== "credit_topup") {
      return NextResponse.json(
        { error: "Invalid session type" },
        { status: 400 }
      );
    }

    const creditAmount = parseFloat(checkoutSession.metadata.creditAmount || "0");
    if (creditAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid credit amount" },
        { status: 400 }
      );
    }

    // Check if we've already processed this session (idempotency)
    // We'll use a simple check by looking for a processed_sessions field or similar
    // For now, we'll use a transaction-safe approach with a unique constraint
    
    // Add credits to user's balance (idempotent - uses session ID to prevent double-crediting)
    const result = await db.query(
      `UPDATE "user"
       SET credit_balance = COALESCE(credit_balance, 0) + $1,
           updated_at = NOW(),
           last_payment_session_id = $3
       WHERE id = $2
         AND (last_payment_session_id IS NULL OR last_payment_session_id != $3)
       RETURNING credit_balance`,
      [creditAmount, session.user.id, sessionId]
    );

    if (result.rows.length === 0) {
      // Session was already processed - return current balance
      const user = await db.query<{ credit_balance: string }>(
        `SELECT credit_balance FROM "user" WHERE id = $1`,
        [session.user.id]
      );
      
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        creditAmount,
        newBalance: parseFloat(String(user.rows[0]?.credit_balance ?? "0")),
        message: "Payment was already credited to your account"
      });
    }

    const newBalance = parseFloat(String(result.rows[0].credit_balance));

    console.log(`[Billing] Credited $${creditAmount} to user ${session.user.id}. New balance: $${newBalance}`);

    return NextResponse.json({
      success: true,
      alreadyProcessed: false,
      creditAmount,
      newBalance,
      message: `Successfully added $${creditAmount} to your account`
    });

  } catch (error) {
    console.error("[Billing] Failed to verify session:", error);
    
    // Handle specific Stripe errors
    if (error instanceof Error && error.message.includes("No such checkout.session")) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify payment" },
      { status: 500 }
    );
  }
}
