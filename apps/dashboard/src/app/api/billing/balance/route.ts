/**
 * Balance API
 * 
 * Returns the user's credit balance and free tier remaining.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { getDbClient } from "@/lib/db";
import { calculateUsage } from "@/lib/billing";
import { PRICING } from "@/lib/stripe";

// Free tier limits per month
const FREE_TIER = {
  tunnelHours: 5,        // 5 hours of tunnel time
  bandwidthGB: 1,        // 1 GB of bandwidth
  tunnelSeconds: 5 * 3600, // 5 hours in seconds
  bandwidthBytes: 1 * 1024 * 1024 * 1024, // 1 GB in bytes
};

// Calculate free tier value in dollars
const FREE_TIER_VALUE = 
  (FREE_TIER.tunnelHours * PRICING.tunnelPerHour) + 
  (FREE_TIER.bandwidthGB * PRICING.bandwidthPerGB);

interface UserBalance {
  id: string;
  credit_balance?: number;
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const db = getDbClient();

    // Get user's credit balance from database
    const user = await db.getRecord<UserBalance>("user", session.user.id);
    // Parse credit_balance as float (may come as string from database)
    const creditBalance = parseFloat(String(user?.credit_balance ?? 0)) || 0;

    // Calculate current month's usage
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    let usage;
    try {
      usage = await calculateUsage(session.user.id, startOfMonth, now);
    } catch {
      // If usage calculation fails, default to zero
      usage = {
        tunnelSeconds: 0,
        bandwidthBytes: 0,
        bandwidthGB: 0,
        tunnelCount: 0,
      };
    }

    // Calculate remaining free tier
    const freeTierRemaining = {
      tunnelSeconds: Math.max(0, FREE_TIER.tunnelSeconds - usage.tunnelSeconds),
      tunnelHours: Math.max(0, FREE_TIER.tunnelHours - (usage.tunnelSeconds / 3600)),
      bandwidthBytes: Math.max(0, FREE_TIER.bandwidthBytes - usage.bandwidthBytes),
      bandwidthGB: Math.max(0, FREE_TIER.bandwidthGB - usage.bandwidthGB),
    };

    // Calculate remaining free tier value in dollars
    const freeTierRemainingValue = 
      (freeTierRemaining.tunnelHours * PRICING.tunnelPerHour) + 
      (freeTierRemaining.bandwidthGB * PRICING.bandwidthPerGB);

    // Calculate usage that exceeds free tier (billable usage)
    const billableUsage = {
      tunnelSeconds: Math.max(0, usage.tunnelSeconds - FREE_TIER.tunnelSeconds),
      bandwidthBytes: Math.max(0, usage.bandwidthBytes - FREE_TIER.bandwidthBytes),
    };

    // Calculate billable cost
    const billableCost = 
      (billableUsage.tunnelSeconds * PRICING.tunnelPerSecond) + 
      ((billableUsage.bandwidthBytes / (1024 * 1024 * 1024)) * PRICING.bandwidthPerGB);

    return NextResponse.json({
      creditBalance,
      freeTier: {
        total: FREE_TIER_VALUE,
        remaining: freeTierRemainingValue,
        used: FREE_TIER_VALUE - freeTierRemainingValue,
        limits: {
          tunnelHours: FREE_TIER.tunnelHours,
          bandwidthGB: FREE_TIER.bandwidthGB,
        },
        remainingLimits: {
          tunnelHours: freeTierRemaining.tunnelHours,
          bandwidthGB: freeTierRemaining.bandwidthGB,
        },
      },
      totalAvailable: creditBalance + freeTierRemainingValue,
      currentPeriodBillable: billableCost,
      effectiveBalance: creditBalance - billableCost,
    });
  } catch (error) {
    console.error("[Billing] Failed to get balance:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get balance" },
      { status: 500 }
    );
  }
}
