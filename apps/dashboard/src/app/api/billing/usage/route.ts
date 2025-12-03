/**
 * Usage API
 * 
 * Returns current billing period usage for the authenticated user.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { calculateUsage, getSubscriptionStatus } from "@/lib/billing";
import { calculateCost, isStripeConfigured } from "@/lib/stripe";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Get current billing period (start of month to now)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const usage = await calculateUsage(session.user.id, startOfMonth, now);
    const costs = calculateCost(usage.tunnelSeconds, usage.bandwidthBytes);

    // Get subscription status if Stripe is configured
    let subscription = null;
    if (isStripeConfigured()) {
      subscription = await getSubscriptionStatus(session.user.id);
    }

    return NextResponse.json({
      usage: {
        tunnelSeconds: usage.tunnelSeconds,
        tunnelHours: usage.tunnelSeconds / 3600,
        bandwidthBytes: usage.bandwidthBytes,
        bandwidthGB: usage.bandwidthGB,
        tunnelCount: usage.tunnelCount,
      },
      costs: {
        tunnelCost: costs.tunnelCost,
        bandwidthCost: costs.bandwidthCost,
        totalCost: costs.totalCost,
      },
      period: {
        start: startOfMonth.toISOString(),
        end: now.toISOString(),
      },
      subscription,
    });
  } catch (error) {
    console.error("[Billing] Failed to get usage:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get usage" },
      { status: 500 }
    );
  }
}
