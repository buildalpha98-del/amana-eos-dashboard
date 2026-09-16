/**
 * The casual staff pool — shared vocabulary for the funnel.
 *
 * 2026-09-15. Recruitment used to mean "an application to one advertised
 * vacancy". Amana's real need is a standing pool: people register interest,
 * sit in the pool, and get drawn on when Holiday Quest comes round, a new
 * centre opens, or a centre needs cover. Everything here is what a
 * coordinator needs to answer one question without picking up the phone:
 * "who can work Tuesday afternoon near this centre, and are they cleared to
 * start?"
 *
 * `stage` was previously unvalidated free text — the convert route wrote
 * "hired", the schema comment listed a different set again, and nothing
 * checked either. These constants are now the single source of truth; the
 * API validates writes against them and the UI renders from them.
 */

/** Funnel stages, in the order they appear on the board. */
export const POOL_STAGES = [
  "applied",
  "screening",
  "interviewed",
  "reference_check",
  "available",
  "hired",
  "not_suitable",
  "withdrawn",
] as const;
export type PoolStage = (typeof POOL_STAGES)[number];

export function isPoolStage(value: string): value is PoolStage {
  return (POOL_STAGES as readonly string[]).includes(value);
}

export const POOL_STAGE_LABELS: Record<PoolStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interviewed: "Interviewed",
  reference_check: "Reference check",
  available: "In the pool",
  hired: "Hired",
  not_suitable: "Not suitable",
  withdrawn: "Withdrew",
};

/**
 * Stage values written before the rework. Rows still carry them, so every
 * display path maps through here rather than showing a raw token. New writes
 * are validated against POOL_STAGES, so this only ever shrinks.
 */
export const LEGACY_STAGE_ALIASES: Record<string, PoolStage> = {
  screened: "screening",
  offered: "interviewed",
  accepted: "hired",
  rejected: "not_suitable",
};

/** Canonical stage for any stored value, legacy or current. */
export function normaliseStage(value: string | null | undefined): PoolStage {
  if (!value) return "applied";
  if (isPoolStage(value)) return value;
  return LEGACY_STAGE_ALIASES[value] ?? "applied";
}

export function stageLabel(value: string | null | undefined): string {
  return POOL_STAGE_LABELS[normaliseStage(value)];
}

/** Stages that mean "still worth contacting about a shift". */
export const ACTIVE_POOL_STAGES: readonly PoolStage[] = [
  "applied",
  "screening",
  "interviewed",
  "reference_check",
  "available",
];

// ── Availability ────────────────────────────────────────────────────────
// Session names follow the Amana programme names used with families.

export const POOL_SESSIONS = ["bsc", "asc", "vacation_care"] as const;
export type PoolSession = (typeof POOL_SESSIONS)[number];
export const POOL_SESSION_LABELS: Record<PoolSession, string> = {
  bsc: "Before school",
  asc: "After school",
  vacation_care: "Vacation care",
};

export const POOL_DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
export type PoolDay = (typeof POOL_DAYS)[number];
export const POOL_DAY_LABELS: Record<PoolDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};

// ── Eligibility ─────────────────────────────────────────────────────────

export const RIGHT_TO_WORK = [
  "citizen",
  "permanent_resident",
  "visa",
  "unknown",
] as const;
export type RightToWork = (typeof RIGHT_TO_WORK)[number];
export const RIGHT_TO_WORK_LABELS: Record<RightToWork, string> = {
  citizen: "Australian citizen",
  permanent_resident: "Permanent resident",
  visa: "Visa with work rights",
  unknown: "Not stated",
};

/** Where a candidate came from. `website` covers both public intake forms. */
export const POOL_SOURCES = [
  "website",
  "indeed",
  "seek",
  "referral",
  "community",
  "university",
  "walkin",
  "other",
] as const;
export type PoolSource = (typeof POOL_SOURCES)[number];
export const POOL_SOURCE_LABELS: Record<PoolSource, string> = {
  website: "Website",
  indeed: "Indeed",
  seek: "Seek",
  referral: "Staff referral",
  community: "Community",
  university: "University",
  walkin: "Walk-in",
  other: "Other",
};

export function sourceLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return (
    POOL_SOURCE_LABELS[value as PoolSource] ?? value.replace(/_/g, " ")
  );
}

// ── Readiness ───────────────────────────────────────────────────────────

/**
 * Whether someone could actually be rostered today.
 *
 * A WWCC is the legal floor for child-facing work, so a missing or expired
 * one is the difference between "call them" and "can't use them yet".
 * Deliberately a pure function of the candidate row — no DB, no dates beyond
 * the one passed in — so the list, the detail panel and any future cron all
 * agree.
 */
export interface PoolReadinessInput {
  wwccNumber: string | null;
  wwccExpiry: Date | string | null;
  hasFirstAid: boolean;
}

export type PoolReadiness = "ready" | "expiring" | "blocked";

export function poolReadiness(
  c: PoolReadinessInput,
  now: Date = new Date(),
): { status: PoolReadiness; reason: string } {
  if (!c.wwccNumber) {
    return { status: "blocked", reason: "No WWCC recorded" };
  }
  if (c.wwccExpiry) {
    const expiry = new Date(c.wwccExpiry);
    if (!Number.isNaN(expiry.getTime())) {
      if (expiry.getTime() < now.getTime()) {
        return { status: "blocked", reason: "WWCC expired" };
      }
      const days = (expiry.getTime() - now.getTime()) / 86_400_000;
      if (days <= 60) {
        return { status: "expiring", reason: "WWCC expires soon" };
      }
    }
  }
  if (!c.hasFirstAid) {
    return { status: "expiring", reason: "No first aid recorded" };
  }
  return { status: "ready", reason: "Cleared to start" };
}

/** Days since anyone contacted them; null when never contacted. */
export function daysSinceContact(
  lastContactedAt: Date | string | null,
  now: Date = new Date(),
): number | null {
  if (!lastContactedAt) return null;
  const then = new Date(lastContactedAt);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

/** A pool nobody touches goes stale; this is the threshold the UI flags. */
export const STALE_CONTACT_DAYS = 90;

// ── Outcomes ────────────────────────────────────────────────────────────

/**
 * Why someone wasn't hired.
 *
 * 2026-09-16. Half the point of keeping the people you didn't hire is seeing
 * the pattern: a run of "couldn't do afternoons" is an advertising problem,
 * a run of "no WWCC" is an intake problem. A free-text note can't be counted,
 * so the reason is a code and the detail goes in `notHiredNote`.
 *
 * Deliberately separates OUR decision from THEIRS — someone who took another
 * job is worth re-contacting next holidays; someone we judged unsuitable is
 * not. The two look identical if both just read "not hired".
 */
export const NOT_HIRED_REASONS = [
  "no_wwcc",
  "availability_mismatch",
  "location",
  "experience",
  "qualification",
  "interview_concerns",
  "reference_check",
  "withdrew",
  "took_other_role",
  "no_response",
  "role_filled",
  "other",
] as const;
export type NotHiredReason = (typeof NOT_HIRED_REASONS)[number];

export const NOT_HIRED_REASON_LABELS: Record<NotHiredReason, string> = {
  no_wwcc: "No WWCC / not cleared",
  availability_mismatch: "Availability didn't match",
  location: "Too far from our centres",
  experience: "Not enough experience",
  qualification: "Qualification didn't suit",
  interview_concerns: "Concerns at interview",
  reference_check: "Reference check",
  withdrew: "They withdrew",
  took_other_role: "Took another job",
  no_response: "Stopped responding",
  role_filled: "Role filled by someone else",
  other: "Other",
};

/** Reasons that are THEIR decision, not ours — still worth re-contacting. */
export const REAPPROACHABLE_REASONS: readonly NotHiredReason[] = [
  "withdrew",
  "took_other_role",
  "role_filled",
  "availability_mismatch",
];

export function notHiredReasonLabel(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  return (
    NOT_HIRED_REASON_LABELS[value as NotHiredReason] ?? value.replace(/_/g, " ")
  );
}

// ── Interviews ──────────────────────────────────────────────────────────

export const INTERVIEW_MODES = ["in_person", "phone", "video"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];
export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = {
  in_person: "In person",
  phone: "Phone",
  video: "Video call",
};

/** The interviewer's recommendation — not the final decision. */
export const INTERVIEW_OUTCOMES = ["progress", "hold", "decline"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];
export const INTERVIEW_OUTCOME_LABELS: Record<InterviewOutcome, string> = {
  progress: "Progress",
  hold: "Hold / maybe",
  decline: "Decline",
};
