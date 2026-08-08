import type { PrismaClient } from "@prisma/client";

/**
 * Weekly marketing-email frequency cap, backed by the MarketingSendRecipient
 * ledger. Mirrors how suppression works: a local table written at EVERY
 * marketing send path (campaign both branches, cowork, nurture, resend) and
 * consulted at bulk-send time. A missed write site is a test failure, not a
 * silent leak — never write ledger rows inline; go through
 * `recordMarketingSends`.
 *
 * Enforcement applies only to BULK paths (campaign / cowork). Nurture and
 * enquiry sends are 1:1 lifecycle mail — recorded (they count toward a
 * parent's weekly volume) but never blocked.
 *
 * NOTE (deliberately conservative): ledger rows written for a <50 SCHEDULED
 * send persist even if that send is later cancelled — the cap can over-count
 * but never under-count. Do not "fix" this as a bug.
 */

/**
 * Bulk-send guardrail: recipients at or above this many marketing emails in
 * the rolling window are skipped by bulk sends. Org-settings configurability
 * is deferred (Phase 7 backlog) — a hard constant for now.
 */
export const MARKETING_EMAIL_WEEKLY_CAP = 3;
/** Rolling window (days) the cap is measured over. */
export const CAP_WINDOW_DAYS = 7;

export type MarketingSendSource = "campaign" | "cowork" | "nurture" | "resend";

/** Structural slice of PrismaClient the ledger needs — keeps the lib testable. */
type LedgerDb = Pick<PrismaClient, "marketingSendRecipient">;

/**
 * Record one ledger row per recipient of a marketing send. Emails are ALWAYS
 * lowercased on write (compare lowercase to lowercase or the cap filter
 * silently matches nothing — same convention as getSuppressedEmails).
 * Single createMany; empty input is a no-op.
 */
export async function recordMarketingSends(
  db: LedgerDb,
  entries: Array<{ email: string; contactId?: string }>,
  meta: { deliveryLogId?: string; source: MarketingSendSource },
): Promise<void> {
  if (entries.length === 0) return;
  await db.marketingSendRecipient.createMany({
    data: entries.map((e) => ({
      email: e.email.toLowerCase(),
      contactId: e.contactId ?? null,
      deliveryLogId: meta.deliveryLogId ?? null,
      source: meta.source,
    })),
  });
}

/**
 * Return the (lowercased) subset of `emails` that has hit the weekly cap —
 * i.e. received >= MARKETING_EMAIL_WEEKLY_CAP marketing emails in the last
 * CAP_WINDOW_DAYS. ONE indexed groupBy (@@index([email, sentAt])), safe
 * inside withApiAuth's 55s budget.
 */
export async function getFrequencyCapped(
  db: LedgerDb,
  emails: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  const lowered = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (lowered.length === 0) return new Set();

  const since = new Date(now.getTime() - CAP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.marketingSendRecipient.groupBy({
    by: ["email"],
    where: { email: { in: lowered }, sentAt: { gte: since } },
    _count: true,
  });

  return new Set(
    rows
      .filter((r) => r._count >= MARKETING_EMAIL_WEEKLY_CAP)
      .map((r) => r.email),
  );
}
