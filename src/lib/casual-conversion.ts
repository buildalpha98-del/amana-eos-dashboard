/**
 * Casual conversion eligibility — Closing Loopholes No. 2 Act 2024
 * (employee-choice model, in force Aug 2024).
 *
 * Two thresholds in the Fair Work Act:
 *   - Small business employer (<15 employees nationally): 12 months
 *   - All other employers: 6 months
 *
 * Amana OSHC's headcount oscillates around the small-business
 * threshold so we encode both. Default to 6 months (the safer side
 * — staff become eligible earlier, which lowers the org's risk of
 * missing an election window). Owner can override via env or, later,
 * an org-settings flag.
 *
 * In addition to tenure, eligibility considers:
 *   - Current contract type is `casual` (PR / FT staff already
 *     converted; fixed-term is a separate path)
 *   - User is `active`
 *   - No PENDING election currently open
 *   - No DECLINED election in the last 6 months (cooldown — the Act
 *     prevents repeat elections immediately after a refusal)
 */

import { prisma } from "@/lib/prisma";

const MS_PER_DAY = 86400000;
const DAY_30 = 30 * MS_PER_DAY;

/**
 * Months as a fractional number (with 30-day months for simplicity —
 * the legal text is "6 months" / "12 months" of service, and FWC
 * has accepted calendar-month interpretation as reasonable).
 */
function monthsBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / DAY_30;
}

export type EligibilityReason =
  | "eligible"
  | "not_casual"
  | "inactive"
  | "insufficient_tenure"
  | "pending_election"
  | "recent_decline_cooldown";

export interface ConversionEligibility {
  eligible: boolean;
  reason: EligibilityReason;
  tenureMonths: number;
  thresholdMonths: number;
  /** When `recent_decline_cooldown` — the date the 6-month cooldown ends. */
  cooldownUntil?: Date | null;
  /** When `pending_election` — the existing pending election id. */
  pendingElectionId?: string | null;
}

const SMALL_BUSINESS_THRESHOLD_MONTHS = 12;
const REGULAR_THRESHOLD_MONTHS = 6;
const DECLINE_COOLDOWN_MONTHS = 6;

function thresholdMonths(): number {
  // If we ever want to flag the org as small-business via env, here's
  // the hook. Default to the more inclusive 6-month rule.
  return process.env.EH_PAYROLL_SMALL_BUSINESS === "true"
    ? SMALL_BUSINESS_THRESHOLD_MONTHS
    : REGULAR_THRESHOLD_MONTHS;
}

/**
 * Computes whether `userId` is eligible to lodge a casual conversion
 * election right now. Three DB queries (user, contracts, elections).
 */
export async function computeEligibility(
  userId: string,
  asOf: Date = new Date(),
): Promise<ConversionEligibility> {
  const threshold = thresholdMonths();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, active: true, startDate: true, createdAt: true },
  });
  if (!user) {
    return {
      eligible: false,
      reason: "inactive",
      tenureMonths: 0,
      thresholdMonths: threshold,
    };
  }
  if (!user.active) {
    return {
      eligible: false,
      reason: "inactive",
      tenureMonths: 0,
      thresholdMonths: threshold,
    };
  }

  // Current contract: most recent active one. If they're not casual
  // they're not eligible (already permanent / fixed-term has its own
  // separate end-of-contract conversion path).
  const latest = await prisma.employmentContract.findFirst({
    where: { userId, status: "active" },
    orderBy: { startDate: "desc" },
    select: { contractType: true, startDate: true },
  });
  // ContractType enum is prefixed `ct_` in the schema.
  if (!latest || latest.contractType !== "ct_casual") {
    return {
      eligible: false,
      reason: "not_casual",
      tenureMonths: 0,
      thresholdMonths: threshold,
    };
  }

  // Tenure = earliest of (latest contract start, user start, user
  // createdAt) up to asOf. We use the earliest because "continuous
  // service as a casual" is the legal test, and contract chains in
  // our system aren't always perfectly back-to-back even when the
  // employment continued.
  const tenureStart = [
    user.startDate,
    user.createdAt,
    latest.startDate,
  ]
    .filter((d): d is Date => d instanceof Date)
    .reduce((min, d) => (d < min ? d : min));

  const months = monthsBetween(tenureStart, asOf);
  if (months < threshold) {
    return {
      eligible: false,
      reason: "insufficient_tenure",
      tenureMonths: months,
      thresholdMonths: threshold,
    };
  }

  // Existing pending election?
  const pending = await prisma.casualConversionElection.findFirst({
    where: {
      userId,
      deleted: false,
      respondedAt: null,
    },
    orderBy: { electedAt: "desc" },
    select: { id: true },
  });
  if (pending) {
    return {
      eligible: false,
      reason: "pending_election",
      tenureMonths: months,
      thresholdMonths: threshold,
      pendingElectionId: pending.id,
    };
  }

  // Recent decline cooldown? Last declined within 6 months blocks a
  // new election.
  const lastDecline = await prisma.casualConversionElection.findFirst({
    where: {
      userId,
      deleted: false,
      response: "declined",
    },
    orderBy: { respondedAt: "desc" },
    select: { respondedAt: true },
  });
  if (lastDecline?.respondedAt) {
    const cooldownEnd = new Date(
      lastDecline.respondedAt.getTime() +
        DECLINE_COOLDOWN_MONTHS * 30 * MS_PER_DAY,
    );
    if (cooldownEnd > asOf) {
      return {
        eligible: false,
        reason: "recent_decline_cooldown",
        tenureMonths: months,
        thresholdMonths: threshold,
        cooldownUntil: cooldownEnd,
      };
    }
  }

  return {
    eligible: true,
    reason: "eligible",
    tenureMonths: months,
    thresholdMonths: threshold,
  };
}

/**
 * Days remaining in the 21-day employer response window. Negative
 * when the deadline has passed. Used by the UI countdown ticker and
 * by a future cron to nudge admins when the deadline approaches.
 */
export function daysUntilResponseDeadline(
  electedAt: Date,
  asOf: Date = new Date(),
): number {
  const deadline = new Date(electedAt.getTime() + 21 * MS_PER_DAY);
  return Math.ceil((deadline.getTime() - asOf.getTime()) / MS_PER_DAY);
}
