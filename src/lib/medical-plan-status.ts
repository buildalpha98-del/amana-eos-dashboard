/**
 * Whether a Reg 90 plan is actually current.
 *
 * Two independent expiries, and conflating them is the mistake:
 *
 *  • `planExpiryDate` — the PRACTITIONER'S review date, printed on the
 *    ASCIA action plan. An expired one is not a current medical
 *    management plan under Reg 90(1)(c)(i), no matter how recently the
 *    service looked at it.
 *  • `reviewDueAt` — the SERVICE'S own review cycle (annually, and after
 *    any incident). A service can be diligent and still be holding a
 *    two-year-old doctor's plan.
 *
 * Both are reported, because a plan can fail either one and the remedy
 * is different: one means ring the family for a new plan from their GP,
 * the other means sit down and re-read this one.
 */

export interface PlanDates {
  planExpiryDate?: Date | string | null;
  reviewDueAt?: Date | string | null;
  developedWithParentAt?: Date | string | null;
}

export type PlanIssue =
  | "practitioner_plan_expired"
  | "practitioner_plan_expiring"
  | "service_review_overdue"
  | "service_review_due"
  | "no_parent_consultation";

export interface PlanStatus {
  issues: PlanIssue[];
  /** Anything that makes the plan non-compliant right now. */
  urgent: boolean;
  /** Nothing outstanding at all. */
  ok: boolean;
}

/** Within this many days counts as "coming up" rather than fine. */
const SOON_DAYS = 30;
const DAY_MS = 86_400_000;

const toDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function assessPlan(plan: PlanDates, now: Date = new Date()): PlanStatus {
  const issues: PlanIssue[] = [];

  const practitioner = toDate(plan.planExpiryDate);
  if (practitioner) {
    const daysLeft = Math.floor(
      (practitioner.getTime() - now.getTime()) / DAY_MS,
    );
    if (daysLeft < 0) issues.push("practitioner_plan_expired");
    else if (daysLeft <= SOON_DAYS) issues.push("practitioner_plan_expiring");
  }

  const review = toDate(plan.reviewDueAt);
  if (review) {
    const daysLeft = Math.floor((review.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft < 0) issues.push("service_review_overdue");
    else if (daysLeft <= SOON_DAYS) issues.push("service_review_due");
  }

  /**
   * Reg 90(1)(c)(ii) requires the risk minimisation plan be developed IN
   * CONSULTATION with the family. An absent timestamp is a finding in
   * its own right, not merely missing metadata — so it is reported even
   * when every date is healthy.
   */
  if (!toDate(plan.developedWithParentAt)) {
    issues.push("no_parent_consultation");
  }

  const urgent = issues.some(
    (i) => i === "practitioner_plan_expired" || i === "service_review_overdue",
  );

  return { issues, urgent, ok: issues.length === 0 };
}

/** What to tell the person looking at it, in the order they'd act. */
export function describeIssue(issue: PlanIssue): string {
  switch (issue) {
    case "practitioner_plan_expired":
      return "The doctor's plan has expired — ask the family for a current one";
    case "practitioner_plan_expiring":
      return "The doctor's plan expires within a month";
    case "service_review_overdue":
      return "Our own review is overdue";
    case "service_review_due":
      return "Our own review is due within a month";
    case "no_parent_consultation":
      return "No record of developing this with the family (Reg 90 requires it)";
  }
}
