/**
 * Centre Avatar freshness classifier — used by both the index page and the
 * Sprint 2 cockpit tile.
 *
 *   ≤30 days  → fresh
 *   31–60 days → aging
 *   >60 days   → stale
 */

export type AvatarFreshness = "fresh" | "aging" | "stale";

export function classifyFreshness(lastUpdatedAt: Date, now: Date = new Date()): AvatarFreshness {
  const days = Math.floor((now.getTime() - lastUpdatedAt.getTime()) / 86_400_000);
  if (days <= 30) return "fresh";
  if (days <= 60) return "aging";
  return "stale";
}

export function daysSince(from: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Gate is satisfied when the Avatar was opened by the acting user in the last
 * 7 days. This matches the "read in the context of this planning cycle" idea.
 */
export function isGateOpen(
  lastOpenedAt: Date | null,
  lastOpenedById: string | null,
  currentUserId: string,
  now: Date = new Date(),
): boolean {
  if (!lastOpenedAt || !lastOpenedById) return false;
  if (lastOpenedById !== currentUserId) return false;
  const diffMs = now.getTime() - lastOpenedAt.getTime();
  return diffMs <= 7 * 86_400_000;
}
