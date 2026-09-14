/**
 * 90-Day Ramp — shared constants (browser-safe, no Prisma imports).
 * Design: docs/superpowers/specs/2026-09-14-ninety-day-ramp-design.md
 */

export const RAMP_LENGTH_DAYS = 90;
export const RAMP_EXTENSION_DAYS = 30;
export const RAMP_WEEKS = 13;
export const RAMP_CHECKPOINT_DAYS = [30, 60, 90] as const;

/** Weekly check-in day — Friday (JS getDay()). */
export const RAMP_CHECKIN_WEEKDAY = 5;

/** A check-in older than this at ramp creation is marked `skipped` (backfill). */
export const RAMP_SKIP_PAST_DAYS = 3;

/** Remind the manager about an unsubmitted checkpoint every N days. */
export const RAMP_CHECKPOINT_REMIND_DAYS = 7;

/** Mood at or below this on a weekly check-in alerts the manager. */
export const RAMP_MOOD_ALERT_THRESHOLD = 2;

export const RAMP_COMPETENCIES = [
  { key: "child_safety", label: "Child safety & supervision" },
  { key: "ratios", label: "Ratios & compliance awareness" },
  { key: "programming", label: "Programming & engagement" },
  { key: "families", label: "Family communication" },
  { key: "teamwork", label: "Teamwork & communication" },
  { key: "reliability", label: "Reliability & punctuality" },
] as const;

export type RampCompetencyKey = (typeof RAMP_COMPETENCIES)[number]["key"];
export const RAMP_COMPETENCY_KEYS = RAMP_COMPETENCIES.map((c) => c.key) as RampCompetencyKey[];

export const RAMP_RATING_LABELS: Record<number, string> = {
  1: "Needs significant support",
  2: "Developing",
  3: "Meeting expectations",
  4: "Strong",
  5: "Exceptional",
};

export const RAMP_MOOD_LABELS: Record<number, string> = {
  1: "Struggling",
  2: "Not great",
  3: "Okay",
  4: "Good",
  5: "Great",
};

export type RampCheckpointStage = 30 | 60 | 90;

/** Recommendation options per checkpoint stage. */
export const RAMP_INTERIM_RECOMMENDATIONS = ["on_track", "needs_support", "at_risk"] as const;
export const RAMP_FINAL_RECOMMENDATIONS = ["pass", "extend", "end"] as const;

export const RAMP_RECOMMENDATION_LABELS: Record<string, string> = {
  on_track: "On track",
  needs_support: "Needs support",
  at_risk: "At risk",
  pass: "Pass probation",
  extend: "Extend probation (+30 days)",
  end: "End employment",
};

/** Scorecard rows with targets at each checkpoint stage. */
export type RampScorecardRowKey =
  | "training"
  | "wwcc"
  | "policies"
  | "shifts"
  | "punctuality"
  | "checkins"
  | "mood"
  | "manager";

export interface RampScorecardRowDef {
  key: RampScorecardRowKey;
  label: string;
  /** How the value is displayed. */
  format: "percent" | "boolean" | "count" | "score";
  /** Target per stage; the stage in force is the latest one whose day <= ramp day. */
  targets: Record<RampCheckpointStage, number>;
  /** Whether higher is better (all rows today). */
  hint: string;
}

export const RAMP_SCORECARD_ROWS: RampScorecardRowDef[] = [
  { key: "training", label: "Essential training", format: "percent", targets: { 30: 100, 60: 100, 90: 100 }, hint: "Published essential LMS courses completed" },
  { key: "wwcc", label: "WWCC on file", format: "boolean", targets: { 30: 1, 60: 1, 90: 1 }, hint: "A current Working With Children Check uploaded" },
  { key: "policies", label: "Policies acknowledged", format: "percent", targets: { 30: 100, 60: 100, 90: 100 }, hint: "Required policy acknowledgements signed" },
  { key: "shifts", label: "Shifts worked", format: "count", targets: { 30: 8, 60: 16, 90: 24 }, hint: "Published roster shifts to date" },
  { key: "punctuality", label: "Punctuality", format: "percent", targets: { 30: 85, 60: 90, 90: 90 }, hint: "Clock-ins within 5 minutes of shift start" },
  { key: "checkins", label: "Check-in response", format: "percent", targets: { 30: 75, 60: 75, 90: 75 }, hint: "Weekly check-ins answered" },
  { key: "mood", label: "Mood trend", format: "score", targets: { 30: 3.5, 60: 3.5, 90: 3.5 }, hint: "Average of the last three check-in moods" },
  { key: "manager", label: "Manager rating", format: "score", targets: { 30: 3.0, 60: 3.5, 90: 4.0 }, hint: "Average competency rating at the latest checkpoint" },
];

/** Punctuality grace in minutes. */
export const RAMP_PUNCTUALITY_GRACE_MIN = 5;
