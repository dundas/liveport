/**
 * Billing Operations
 * 
 * Handles Stripe subscription management, usage reporting, and billing operations.
 */

import { getStripe, PRICE_IDS, PRICING, isStripeConfigured } from "./stripe";
import { getDbClient } from "./db";
import type Stripe from "stripe";

// User billing fields interface
export interface UserBillingInfo {
  id: string;
  email: string;
  name?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
}

// Usage report interface
export interface UsageReport {
  tunnelSeconds: number;
  bandwidthBytes: number;
  bandwidthGB: number;
  tunnelCount: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Get or create a Stripe customer for a user
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  name?: string
): Promise<string> {
  const stripe = getStripe();
  const db = getDbClient();

  // Check if user already has a Stripe customer ID
  const user = await db.getRecord<UserBillingInfo>("user", userId);
  if (user?.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      userId,
    },
  });

  // Store customer ID in database
  await db.update("user", userId, {
    stripeCustomerId: customer.id,
  });

  return customer.id;
}

/**
 * Create a metered subscription for a user
 */
export async function createSubscription(
  userId: string,
  email: string,
  name?: string
): Promise<{
  subscriptionId: string;
  clientSecret: string | null;
  status: string;
}> {
  const stripe = getStripe();
  const db = getDbClient();

  // Get or create customer
  const customerId = await getOrCreateStripeCustomer(userId, email, name);

  // Check if user already has an active subscription
  const user = await db.getRecord<UserBillingInfo>("user", userId);
  if (user?.stripeSubscriptionId && user.subscriptionStatus === "active") {
    throw new Error("User already has an active subscription");
  }

  // Build subscription items
  const items: Stripe.SubscriptionCreateParams.Item[] = [];
  
  if (PRICE_IDS.tunnelSeconds) {
    items.push({ price: PRICE_IDS.tunnelSeconds });
  }
  if (PRICE_IDS.bandwidth) {
    items.push({ price: PRICE_IDS.bandwidth });
  }

  if (items.length === 0) {
    throw new Error("No price IDs configured. Please set STRIPE_PRICE_ID_* environment variables.");
  }

  // Create subscription with metered pricing
  // Supports both card and crypto (stablecoins: USDC, USDP, USDG)
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items,
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
      payment_method_types: ["card", "crypto"], // Enable stablecoin payments
    },
    expand: ["latest_invoice.payment_intent"],
  });

  // Store subscription ID
  await db.update("user", userId, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
  });

  // Get client secret for payment
  // In Stripe SDK v20+, payment_intent is accessed via invoice.payments[].payment.payment_intent
  let clientSecret: string | null = null;
  const invoice = subscription.latest_invoice;
  
  if (invoice && typeof invoice === 'object' && 'payments' in invoice) {
    const invoiceObj = invoice as Stripe.Invoice;
    const payments = invoiceObj.payments?.data;
    if (payments && payments.length > 0) {
      const invoicePayment = payments[0];
      const paymentIntentRef = invoicePayment.payment?.payment_intent;
      if (paymentIntentRef) {
        if (typeof paymentIntentRef === 'string') {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentRef);
          clientSecret = paymentIntent.client_secret;
        } else {
          clientSecret = paymentIntentRef.client_secret;
        }
      }
    }
  }

  return {
    subscriptionId: subscription.id,
    clientSecret,
    status: subscription.status,
  };
}

/**
 * Cancel a user's subscription
 */
export async function cancelSubscription(
  userId: string,
  immediately: boolean = false
): Promise<{
  status: string;
  cancelAt: Date | null;
}> {
  const stripe = getStripe();
  const db = getDbClient();

  const user = await db.getRecord<UserBillingInfo>("user", userId);
  if (!user?.stripeSubscriptionId) {
    throw new Error("User has no active subscription");
  }

  let subscription: Stripe.Subscription;

  if (immediately) {
    // Cancel immediately
    subscription = await stripe.subscriptions.cancel(user.stripeSubscriptionId);
  } else {
    // Cancel at end of billing period
    subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  // Update database
  await db.update("user", userId, {
    subscriptionStatus: subscription.status,
  });

  return {
    status: subscription.status,
    cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
  };
}

/**
 * Resume a cancelled subscription (if cancelled at period end)
 */
export async function resumeSubscription(userId: string): Promise<{
  status: string;
}> {
  const stripe = getStripe();
  const db = getDbClient();

  const user = await db.getRecord<UserBillingInfo>("user", userId);
  if (!user?.stripeSubscriptionId) {
    throw new Error("User has no subscription");
  }

  const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });

  await db.update("user", userId, {
    subscriptionStatus: subscription.status,
  });

  return {
    status: subscription.status,
  };
}

/**
 * Get subscription status for a user
 */
export async function getSubscriptionStatus(userId: string): Promise<{
  hasSubscription: boolean;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
} | null> {
  if (!isStripeConfigured()) {
    return null;
  }

  const stripe = getStripe();
  const db = getDbClient();

  const user = await db.getRecord<UserBillingInfo>("user", userId);
  if (!user?.stripeSubscriptionId) {
    return {
      hasSubscription: false,
      status: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      cancelAt: null,
    };
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(
      user.stripeSubscriptionId,
      { expand: ["items"] }
    );
    
    // Get current period end from the first subscription item
    const firstItem = subscription.items?.data?.[0];
    const currentPeriodEnd = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000)
      : null;
    
    return {
      hasSubscription: true,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd,
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
    };
  } catch {
    // Subscription may have been deleted
    return {
      hasSubscription: false,
      status: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      cancelAt: null,
    };
  }
}

/**
 * Create a Stripe billing portal session for subscription management
 */
export async function createBillingPortalSession(
  userId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();
  const db = getDbClient();

  const user = await db.getRecord<UserBillingInfo>("user", userId);
  if (!user?.stripeCustomerId) {
    throw new Error("User has no Stripe customer ID");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Calculate usage for a billing period
 */
export async function calculateUsage(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<UsageReport> {
  const db = getDbClient();

  // Query tunnels for this user in the billing period
  const result = await db.query<{
    total_seconds: string;
    total_bytes: string;
    tunnel_count: string;
  }>(`
    SELECT 
      COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(disconnected_at, NOW()) - connected_at))), 0) as total_seconds,
      COALESCE(SUM(bytes_transferred), 0) as total_bytes,
      COUNT(*) as tunnel_count
    FROM tunnels
    WHERE user_id = $1
      AND connected_at >= $2
      AND connected_at < $3
  `, [userId, startDate.toISOString(), endDate.toISOString()]);

  const row = result.rows[0];
  const tunnelSeconds = parseFloat(row?.total_seconds || "0");
  const bandwidthBytes = parseInt(row?.total_bytes || "0", 10);
  const tunnelCount = parseInt(row?.tunnel_count || "0", 10);

  return {
    tunnelSeconds,
    bandwidthBytes,
    bandwidthGB: bandwidthBytes / (1024 * 1024 * 1024),
    tunnelCount,
    periodStart: startDate,
    periodEnd: endDate,
  };
}

/**
 * Report usage to Stripe for a user
 */
export async function reportUsageToStripe(
  userId: string,
  usage: UsageReport
): Promise<void> {
  const stripe = getStripe();
  const db = getDbClient();

  const user = await db.getRecord<UserBillingInfo>("user", userId);
  if (!user?.stripeSubscriptionId) {
    throw new Error("User has no active subscription");
  }

  // Get subscription items
  const subscription = await stripe.subscriptions.retrieve(
    user.stripeSubscriptionId,
    { expand: ["items"] }
  );

  // Find subscription items for tunnel seconds and bandwidth
  const tunnelSecondsItem = subscription.items.data.find(
    (item) => item.price.id === PRICE_IDS.tunnelSeconds
  );
  const bandwidthItem = subscription.items.data.find(
    (item) => item.price.id === PRICE_IDS.bandwidth
  );

  const errors: Error[] = [];

  // Report tunnel usage (in 1000-second blocks for Stripe)
  // Note: In Stripe SDK v20+, usage records are created via billing.meterEvents
  if (tunnelSecondsItem && usage.tunnelSeconds > 0) {
    const blocks = Math.ceil(usage.tunnelSeconds / PRICING.tunnelSecondsBlockSize);
    try {
      await stripe.billing.meterEvents.create({
        event_name: 'tunnel_seconds',
        payload: {
          stripe_customer_id: user.stripeCustomerId!,
          value: String(blocks),
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[Billing] FAILED to report tunnel usage for user ${userId}:`, error.message);
      errors.push(error);
    }
  }

  // Report bandwidth usage (in 0.01 GB units)
  if (bandwidthItem && usage.bandwidthGB > 0) {
    try {
      await stripe.billing.meterEvents.create({
        event_name: 'bandwidth_gb',
        payload: {
          stripe_customer_id: user.stripeCustomerId!,
          value: String(Math.round(usage.bandwidthGB * 100)),
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[Billing] FAILED to report bandwidth usage for user ${userId}:`, error.message);
      errors.push(error);
    }
  }

  // Log any errors for alerting/monitoring
  if (errors.length > 0) {
    console.error(`[Billing] Usage reporting had ${errors.length} error(s) for user ${userId}`);
    // In production, send to error tracking (Sentry, etc.)
  }

  console.log(`[Billing] Reported usage for user ${userId}:`, {
    tunnelSeconds: usage.tunnelSeconds,
    bandwidthGB: usage.bandwidthGB,
  });
}

/**
 * Get invoices for a user
 */
export async function getInvoices(
  userId: string,
  limit: number = 10
): Promise<Array<{
  id: string;
  amount: number;
  status: string;
  created: Date;
  pdfUrl: string | null;
}>> {
  const stripe = getStripe();
  const db = getDbClient();

  const user = await db.getRecord<UserBillingInfo>("user", userId);
  if (!user?.stripeCustomerId) {
    return [];
  }

  const invoices = await stripe.invoices.list({
    customer: user.stripeCustomerId,
    limit,
  });

  return invoices.data.map((invoice) => ({
    id: invoice.id,
    amount: (invoice.amount_paid || 0) / 100,
    status: invoice.status || "unknown",
    created: new Date(invoice.created * 1000),
    pdfUrl: invoice.invoice_pdf || null,
  }));
}
