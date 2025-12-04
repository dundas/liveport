/**
 * Top-up API
 * 
 * Creates a Stripe Checkout session for purchasing credits.
 * Supports card and stablecoin payments (USDC, USDP, USDG).
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/billing";

// Credit amounts and their prices (in cents for Stripe)
const CREDIT_AMOUNTS = {
  10: 1000,   // $10
  25: 2500,   // $25
  50: 5000,   // $50
  100: 10000, // $100
};

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
    const { amount } = body;

    // Validate amount
    if (!amount || !CREDIT_AMOUNTS[amount as keyof typeof CREDIT_AMOUNTS]) {
      return NextResponse.json(
        { error: "Invalid amount. Valid amounts: $10, $25, $50, $100" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const priceInCents = CREDIT_AMOUNTS[amount as keyof typeof CREDIT_AMOUNTS];

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(
      session.user.id,
      session.user.email || "",
      session.user.name || undefined
    );

    // Create Checkout session for one-time payment
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `LivePort Credits - $${amount}`,
              description: `Add $${amount} in credits to your LivePort account. Credits never expire.`,
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: session.user.id,
        creditAmount: amount.toString(),
        type: "credit_topup",
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/billing?success=true&amount=${amount}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/billing?canceled=true`,
    });

    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
    });
  } catch (error) {
    console.error("[Billing] Failed to create top-up session:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
