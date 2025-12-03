/**
 * Stripe Client Configuration
 * 
 * Server-side Stripe client for billing operations.
 */

import Stripe from "stripe";

// Lazy initialization to avoid errors when env vars aren't set
let stripeInstance: Stripe | null = null;

/**
 * Get the Stripe client instance
 * Throws if STRIPE_SECRET_KEY is not configured
 */
export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is required for billing operations");
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-11-17.clover",
      typescript: true,
    });
  }
  return stripeInstance;
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Stripe Price IDs for metered billing
 * These should be created in Stripe Dashboard and configured via env vars
 */
export const PRICE_IDS = {
  // Tunnel time: $0.005 per 1000 seconds (Stripe minimum is $0.50)
  tunnelSeconds: process.env.STRIPE_PRICE_ID_TUNNEL_SECONDS || "",
  // Bandwidth: $0.05 per GB
  bandwidth: process.env.STRIPE_PRICE_ID_BANDWIDTH || "",
  // Static subdomain: $2.50/month
  staticSubdomain: process.env.STRIPE_PRICE_ID_STATIC_SUBDOMAIN || "",
};

/**
 * Supported payment methods
 * Stablecoins: USDC (Ethereum, Solana, Polygon, Base), USDP, USDG
 * Enable in Stripe Dashboard: https://dashboard.stripe.com/settings/payment_methods
 */
export const PAYMENT_METHODS = {
  card: true,
  crypto: true, // Stablecoins (USDC, USDP, USDG)
};

/**
 * Pricing constants (for display purposes)
 */
export const PRICING = {
  // $0.000005 per second = $0.005 per 1000 seconds
  tunnelSecondsPerBlock: 0.005, // Price per 1000 seconds
  tunnelSecondsBlockSize: 1000, // Seconds per block
  tunnelPerSecond: 0.000005,
  tunnelPerHour: 0.018,
  tunnelPerDay: 0.43,
  tunnelPerMonth: 13, // 24/7 usage
  
  // $0.05 per GB
  bandwidthPerGB: 0.05,
  
  // $2.50 per month for static subdomain
  staticSubdomainPerMonth: 2.50,
  staticSubdomainPerDay: 2.50 / 30, // ~$0.083
};

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

/**
 * Calculate estimated cost from usage
 */
export function calculateCost(tunnelSeconds: number, bandwidthBytes: number): {
  tunnelCost: number;
  bandwidthCost: number;
  totalCost: number;
} {
  const tunnelCost = tunnelSeconds * PRICING.tunnelPerSecond;
  const bandwidthGB = bandwidthBytes / (1024 * 1024 * 1024);
  const bandwidthCost = bandwidthGB * PRICING.bandwidthPerGB;
  
  return {
    tunnelCost,
    bandwidthCost,
    totalCost: tunnelCost + bandwidthCost,
  };
}
