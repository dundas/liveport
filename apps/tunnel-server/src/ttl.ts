/**
 * TTL Computation
 *
 * Computes the effective tunnel expiry based on tier limits,
 * client-requested TTL, and bridge key expiry.
 */

/** Maximum TTL in seconds per user tier */
export const TIER_MAX_TTL: Record<string, number> = {
  free: 7200, // 2 hours
  pro: 86400, // 24 hours
  team: 86400,
  enterprise: 86400,
};

/**
 * Compute the effective tunnel expiry date.
 *
 * The result is the earliest of:
 * - now + tier max TTL (always applied)
 * - now + client-requested TTL (if provided and > 0)
 * - key expiry (if the key has an expiry date)
 */
export function computeEffectiveExpiry(
  keyExpiresAt: Date | undefined | null,
  clientTtlSeconds: number | undefined,
  userTier: string,
  now: Date = new Date()
): Date {
  const tierMaxSeconds = TIER_MAX_TTL[userTier] ?? TIER_MAX_TTL.free;

  const candidates: Date[] = [
    new Date(now.getTime() + tierMaxSeconds * 1000),
  ];

  if (clientTtlSeconds && clientTtlSeconds > 0) {
    candidates.push(new Date(now.getTime() + clientTtlSeconds * 1000));
  }

  if (keyExpiresAt) {
    candidates.push(new Date(keyExpiresAt.getTime()));
  }

  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}
