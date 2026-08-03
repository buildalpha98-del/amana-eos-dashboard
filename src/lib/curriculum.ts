/**
 * Curriculum frameworks used to tag parent posts and observations.
 *
 * MTOP (My Time, Our Place) is the school-age framework — the right one
 * for OSHC. EYLF is the birth-to-five framework and deliberately NOT
 * offered here; tagging an OSHC post with EYLF outcomes would be wrong,
 * and offering both invites exactly that mistake.
 *
 * Stored as plain strings rather than enums so a framework revision
 * doesn't require a migration on historical records — a post tagged
 * against the 2022 wording stays readable after an update.
 */

export const MTOP_OUTCOMES = [
  {
    code: "1",
    label: "Identity",
    description:
      "Children have a strong sense of identity — they feel safe, secure and supported.",
  },
  {
    code: "2",
    label: "Community",
    description:
      "Children are connected with and contribute to their world.",
  },
  {
    code: "3",
    label: "Wellbeing",
    description:
      "Children have a strong sense of wellbeing, socially, emotionally and physically.",
  },
  {
    code: "4",
    label: "Learning",
    description:
      "Children are confident and involved learners — curious, cooperative and persistent.",
  },
  {
    code: "5",
    label: "Communication",
    description: "Children are effective communicators.",
  },
] as const;

/** The seven NQS Quality Areas. */
export const NQS_AREAS = [
  { code: "QA1", label: "Educational program and practice" },
  { code: "QA2", label: "Children's health and safety" },
  { code: "QA3", label: "Physical environment" },
  { code: "QA4", label: "Staffing arrangements" },
  { code: "QA5", label: "Relationships with children" },
  { code: "QA6", label: "Collaborative partnerships with families and communities" },
  { code: "QA7", label: "Governance and leadership" },
] as const;

export type MtopOutcome = (typeof MTOP_OUTCOMES)[number]["label"];
export type NqsArea = (typeof NQS_AREAS)[number]["code"];

export function isMtopOutcome(v: string): boolean {
  return MTOP_OUTCOMES.some((o) => o.label === v);
}

export function isNqsArea(v: string): boolean {
  return NQS_AREAS.some((a) => a.code === v);
}

/** "QA1" → "QA1 · Educational program and practice" */
export function nqsLabel(code: string): string {
  const a = NQS_AREAS.find((x) => x.code === code);
  return a ? `${a.code} · ${a.label}` : code;
}

// ---------------------------------------------------------------------------
// Post scheduling
// ---------------------------------------------------------------------------

export const POST_STATUSES = ["draft", "scheduled", "published"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export function isPostStatus(v: unknown): v is PostStatus {
  return typeof v === "string" && (POST_STATUSES as readonly string[]).includes(v);
}

/**
 * Is a post visible to families right now?
 *
 * Deliberately time-based rather than relying on a cron to flip a flag.
 * A cron that fails or lags means a scheduled post silently never
 * appears; evaluating `publishAt <= now` at read time can't drift, and a
 * post scheduled for 3pm appears at 3pm even if nothing ran.
 */
export function isPubliclyVisible(
  status: string | null | undefined,
  publishAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status === "draft") return false;
  if (!publishAt) return status !== "scheduled";
  const at = publishAt instanceof Date ? publishAt : new Date(publishAt);
  if (Number.isNaN(at.getTime())) return status === "published";
  return at.getTime() <= now.getTime();
}
