import type { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";

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
 * the rolling window are skipped by bulk sends. Since Phase 7 the cap is
 * org-configurable (`email.marketingWeeklyCap` in OrgSettings, edited at
 * Settings → Organisation → Outbound email sender) — CALLERS resolve it via
 * `getOrgSettings()` and pass `opts.cap`; this constant is the fallback when
 * no cap is passed, and it mirrors the org-settings schema default.
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
 *
 * SWALLOWS errors (logged, never thrown): the ledger is advisory guardrail
 * data written AFTER a successful dispatch — a DB hiccup here must never 500
 * a send that already went out, nor flip a nurture execution back to pending
 * and re-send the email. Same design as the notify helpers.
 */
export async function recordMarketingSends(
  db: LedgerDb,
  entries: Array<{ email: string; contactId?: string }>,
  meta: { deliveryLogId?: string; source: MarketingSendSource },
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await db.marketingSendRecipient.createMany({
      data: entries.map((e) => ({
        email: e.email.toLowerCase(),
        contactId: e.contactId ?? null,
        deliveryLogId: meta.deliveryLogId ?? null,
        source: meta.source,
      })),
    });
  } catch (err) {
    logger.error("Marketing send ledger write failed — cap will under-count", {
      err,
      count: entries.length,
      source: meta.source,
      deliveryLogId: meta.deliveryLogId,
    });
  }
}

/**
 * Return the (lowercased) subset of `emails` that has hit the weekly cap —
 * i.e. received >= `opts.cap` (default MARKETING_EMAIL_WEEKLY_CAP) marketing
 * emails in the last CAP_WINDOW_DAYS. ONE indexed groupBy
 * (@@index([email, sentAt])), safe inside withApiAuth's 55s budget.
 *
 * This lib deliberately does NOT call getOrgSettings() itself (stays
 * prisma-singleton-free and trivially testable) — bulk-send callers resolve
 * the org-configured cap and pass it via `opts.cap`.
 */
export async function getFrequencyCapped(
  db: LedgerDb,
  emails: string[],
  opts: { cap?: number; now?: Date } = {},
): Promise<Set<string>> {
  const cap = opts.cap ?? MARKETING_EMAIL_WEEKLY_CAP;
  const now = opts.now ?? new Date();
  const lowered = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (lowered.length === 0) return new Set();

  const since = new Date(now.getTime() - CAP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.marketingSendRecipient.groupBy({
    by: ["email"],
    where: { email: { in: lowered }, sentAt: { gte: since } },
    _count: true,
  });

  return new Set(rows.filter((r) => r._count >= cap).map((r) => r.email));
}
