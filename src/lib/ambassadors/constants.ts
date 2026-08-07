/**
 * Amana Ambassadors pilot — policy constants.
 *
 * These encode the pilot's incentive policy exactly; they are not tunables.
 * Change only when the policy document changes.
 */

/** Paid sessions required inside the window for a qualified enrolment. */
export const QUALIFYING_PAID_SESSIONS = 4;

/** Days in the qualification window, counted from first attendance (inclusive). */
export const WINDOW_DAYS = 28;

/** Incentive when the child attends ≥3 regular sessions per week. */
export const TIER_HIGH = 50;

/** Incentive when the child attends 1–2 regular sessions per week. */
export const TIER_LOW = 30;

/** Qualified enrolments an educator needs for the one-off milestone kicker. */
export const MILESTONE_THRESHOLD = 5;

/** Milestone kicker amount. */
export const MILESTONE_AMOUNT = 100;

/** Superannuation rate shown alongside gross in cost summaries + payroll CSV. */
export const SUPER_RATE = 0.12;

/** Months of no-enrolment history required for a child to count as new. */
export const NEW_CHILD_LOOKBACK_MONTHS = 6;

/** AmbassadorAdjustment.type for the milestone kicker. */
export const ADJUSTMENT_MILESTONE_KICKER = "milestone_kicker";

/** Payroll CSV line-item label. */
export const PAYROLL_LINE_ITEM = "Ambassador Incentive";

/**
 * The "How did you hear about us?" option that triggers the conditional
 * "Which educator spoke with you?" question and form_field attribution.
 * Must match the option rendered in AgreementStep exactly.
 */
export const REFERRAL_EDUCATOR_OPTION = "One of our educators";
