/**
 * Billing Operations
 * 
 * Handles Stripe subscription management, usage reporting, and billing operations.
 */

import { getStripe, PRICE_IDS, PRICING, isStripeConfigured } from "./stripe";
import { getDbClient } from "./db";
import type Stripe from "stripe";

// User billing fields interface (matches database snake_case columns)
export interface UserBillingInfo {
  id: string;
  email: string;
  name?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  subscription_status?: string;
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
  if (user?.stripe_customer_id) {
    // Verify the customer exists in Stripe (handles live/test mode mismatch)
    try {
      await stripe.customers.retrieve(user.stripe_customer_id);
      return user.stripe_customer_id;
    } catch (error) {
      // Customer doesn't exist (likely mode mismatch), clear and create new
      console.log(`[Billing] Customer ${user.stripe_customer_id} not found, creating new one`);
      await db.update("user", userId, {
        stripe_customer_id: null,
      });
    }
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
    stripe_customer_id: customer.id,
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
  if (user?.stripe_subscription_id && user.subscription_status === "active") {
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
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
  });

  // Get client secret for payment confirmation
  // In Stripe SDK v20+, client_secret is in confirmation_secret
  let clientSecret: string | null = null;
  const invoice = subscription.latest_invoice;
  
  if (invoice && typeof invoice === 'object') {
    const invoiceObj = invoice as Stripe.Invoice;
    
    // Get client_secret from confirmation_secret (Stripe SDK v20+)
    if (invoiceObj.confirmation_secret?.client_secret) {
      clientSecret = invoiceObj.confirmation_secret.client_secret;
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
  if (!user?.stripe_subscription_id) {
    throw new Error("User has no active subscription");
  }

  let subscription: Stripe.Subscription;

  if (immediately) {
    // Cancel immediately
    subscription = await stripe.subscriptions.cancel(user.stripe_subscription_id);
  } else {
    // Cancel at end of billing period
    subscription = await stripe.subscriptions.update(user.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  }

  // Update database
  await db.update("user", userId, {
    subscription_status: subscription.status,
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
  if (!user?.stripe_subscription_id) {
    throw new Error("User has no subscription");
  }

  const subscription = await stripe.subscriptions.update(user.stripe_subscription_id, {
    cancel_at_period_end: false,
  });

  await db.update("user", userId, {
    subscription_status: subscription.status,
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
  if (!user?.stripe_subscription_id) {
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
      user.stripe_subscription_id,
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
  } catch (err) {
    // Subscription may have been deleted or Stripe error
    console.error(`[Billing] Error fetching subscription for user ${userId}:`, 
      err instanceof Error ? err.message : err
    );
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
  if (!user?.stripe_customer_id) {
    throw new Error("User has no Stripe customer ID");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Calculate usage for a billing period
 * Only counts completed tunnels to avoid double-counting active tunnels
 */
export async function calculateUsage(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<UsageReport> {
  const db = getDbClient();

  // Validate date parameters
  if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
    throw new Error("Invalid date parameters");
  }
  if (startDate >= endDate) {
    throw new Error("Start date must be before end date");
  }

  // Query completed tunnels for this user in the billing period
  // Only count tunnels that have disconnected to avoid double-counting
  const result = await db.query<{
    total_seconds: string;
    total_bytes: string;
    tunnel_count: string;
  }>(`
    SELECT 
      COALESCE(SUM(EXTRACT(EPOCH FROM (disconnected_at - connected_at))), 0) as total_seconds,
      COALESCE(SUM(bytes_transferred), 0) as total_bytes,
      COUNT(*) as tunnel_count
    FROM tunnels
    WHERE user_id = $1
      AND connected_at >= $2
      AND connected_at < $3
      AND disconnected_at IS NOT NULL
      AND disconnected_at <= $3
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
  if (!user?.stripe_subscription_id) {
    throw new Error("User has no active subscription");
  }

  // Get subscription items
  const subscription = await stripe.subscriptions.retrieve(
    user.stripe_subscription_id,
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
          stripe_customer_id: user.stripe_customer_id!,
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
          stripe_customer_id: user.stripe_customer_id!,
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
  if (!user?.stripe_customer_id) {
    return [];
  }

  const invoices = await stripe.invoices.list({
    customer: user.stripe_customer_id,
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
