/**
 * Stripe Webhook Handler
 * 
 * Handles Stripe webhook events for subscription lifecycle management.
 */

import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getDbClient } from "@/lib/db";
import type Stripe from "stripe";

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const stripe = getStripe();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  const db = getDbClient();

  // Check for duplicate events (idempotency)
  // Store processed event IDs in database to prevent reprocessing
  try {
    const existing = await db.query(
      `SELECT 1 FROM stripe_webhook_events WHERE event_id = $1`,
      [event.id]
    ).catch(() => ({ rows: [] })); // Table may not exist yet
    
    if (existing.rows.length > 0) {
      console.log(`[Stripe Webhook] Duplicate event ${event.id}, skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    
    // Record this event (best effort - table may not exist)
    await db.query(
      `INSERT INTO stripe_webhook_events (event_id, event_type, processed_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (event_id) DO NOTHING`,
      [event.id, event.type]
    ).catch(() => {}); // Ignore if table doesn't exist
  } catch {
    // Continue processing even if dedup check fails
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" 
          ? subscription.customer 
          : subscription.customer.id;
        
        await db.query(
          `UPDATE "user" 
           SET subscription_status = $1, 
               stripe_subscription_id = $2,
               updated_at = NOW()
           WHERE stripe_customer_id = $3`,
          [subscription.status, subscription.id, customerId]
        );
        console.log(`[Stripe Webhook] Subscription ${subscription.id} updated: ${subscription.status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" 
          ? subscription.customer 
          : subscription.customer.id;
        
        await db.query(
          `UPDATE "user" 
           SET subscription_status = 'canceled', 
               stripe_subscription_id = NULL,
               updated_at = NOW()
           WHERE stripe_customer_id = $1`,
          [customerId]
        );
        console.log(`[Stripe Webhook] Subscription ${subscription.id} canceled`);
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Check if this is a credit top-up
        if (session.metadata?.type === "credit_topup" && session.metadata?.userId) {
          const userId = session.metadata.userId;
          const creditAmount = parseFloat(session.metadata.creditAmount || "0");
          
          if (creditAmount > 0) {
            // Add credits to user's balance
            await db.query(
              `UPDATE "user" 
               SET credit_balance = COALESCE(credit_balance, 0) + $1,
                   updated_at = NOW()
               WHERE id = $2`,
              [creditAmount, userId]
            );
            console.log(`[Stripe Webhook] Added $${creditAmount} credits to user ${userId}`);
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[Stripe Webhook] Payment succeeded for invoice ${invoice.id}`);
        // Could send receipt email here
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.error(`[Stripe Webhook] Payment failed for invoice ${invoice.id}`);
        // Could notify user about failed payment here
        break;
      }

      case "customer.created": {
        const customer = event.data.object as Stripe.Customer;
        console.log(`[Stripe Webhook] Customer created: ${customer.id}`);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
