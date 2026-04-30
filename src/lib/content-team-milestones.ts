import { ContentTeamRole, ContentTeamStatus } from "@prisma/client";

/** Roles considered "hired" for milestone purposes. */
const HIRED_STATUSES: ContentTeamStatus[] = [
  ContentTeamStatus.hired,
  ContentTeamStatus.onboarding,
  ContentTeamStatus.active,
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The reset start date is when the marketing reset plan officially began.
 * Read from `MARKETING_RESET_START_DATE` env var; falls back to a sensible
 * default (the first Monday of November 2025 — when the cockpit work began).
 */
export function getResetStartDate(): Date {
  const envValue = process.env.MARKETING_RESET_START_DATE;
  if (envValue) {
    const parsed = new Date(envValue);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(Date.UTC(2025, 10, 3, 0, 0, 0)); // 2025-11-03
}

export type MilestoneStatus = "on_track" | "at_risk" | "overdue" | "complete";

export interface MilestoneSpec {
  key: "day60" | "day90" | "day120";
  label: string;
  daysFromReset: number;
  /** Roles required for this milestone to be "complete". */
  requiredRoles: ContentTeamRole[];
}

/**
 * Per Doc 3 / Sprint 7 brief.
 * - Day 60: a video editor + a designer
 * - Day 90: a copywriter
 * - Day 120: a community manager
 *
 * Note: existing schema enum uses `designer` (not `graphic_designer`); both
 * map to the same role for milestone purposes.
 */
export const MILESTONES: MilestoneSpec[] = [
  {
    key: "day60",
    label: "Day 60 — Editor + Designer",
    daysFromReset: 60,
    requiredRoles: [ContentTeamRole.video_editor, ContentTeamRole.designer],
  },
  {
    key: "day90",
    label: "Day 90 — Copywriter",
    daysFromReset: 90,
    requiredRoles: [ContentTeamRole.copywriter],
  },
  {
    key: "day120",
    label: "Day 120 — Community Manager",
    daysFromReset: 120,
    requiredRoles: [ContentTeamRole.community_manager],
  },
];

export interface ResolvedMilestone {
  key: MilestoneSpec["key"];
  label: string;
  daysFromReset: number;
  targetDate: string; // ISO date
  daysUntilTarget: number;
  requiredRoles: ContentTeamRole[];
  hiredRoles: ContentTeamRole[];
  missingRoles: ContentTeamRole[];
  status: MilestoneStatus;
}

interface TeamMemberLite {
  contentTeamRole: ContentTeamRole | null;
  contentTeamStatus: ContentTeamStatus | null;
}

export function resolveMilestone(
  spec: MilestoneSpec,
  members: TeamMemberLite[],
  resetStart: Date,
  now: Date = new Date(),
): ResolvedMilestone {
  const target = new Date(resetStart.getTime() + spec.daysFromReset * DAY_MS);
  const daysUntilTarget = Math.floor((target.getTime() - now.getTime()) / DAY_MS);

  const hiredRoles = new Set<ContentTeamRole>();
  for (const m of members) {
    if (m.contentTeamRole && m.contentTeamStatus && HIRED_STATUSES.includes(m.contentTeamStatus)) {
      hiredRoles.add(m.contentTeamRole);
    }
  }
  const missing = spec.requiredRoles.filter((r) => !hiredRoles.has(r));

  let status: MilestoneStatus;
  if (missing.length === 0) {
    status = "complete";
  } else if (daysUntilTarget < 0) {
    status = "overdue";
  } else if (daysUntilTarget <= 14) {
    status = "at_risk";
  } else {
    status = "on_track";
  }

  return {
    key: spec.key,
    label: spec.label,
    daysFromReset: spec.daysFromReset,
    targetDate: target.toISOString().slice(0, 10),
    daysUntilTarget,
    requiredRoles: spec.requiredRoles,
    hiredRoles: spec.requiredRoles.filter((r) => hiredRoles.has(r)),
    missingRoles: missing,
    status,
  };
}

export function resolveAllMilestones(
  members: TeamMemberLite[],
  now: Date = new Date(),
): { resetStartDate: string; milestones: Record<MilestoneSpec["key"], ResolvedMilestone> } {
  const resetStart = getResetStartDate();
  const out = {} as Record<MilestoneSpec["key"], ResolvedMilestone>;
  for (const m of MILESTONES) {
    out[m.key] = resolveMilestone(m, members, resetStart, now);
  }
  return { resetStartDate: resetStart.toISOString().slice(0, 10), milestones: out };
}

/**
 * Pick the "current" milestone for the cockpit tile — the next one not yet
 * complete. If all complete, returns the last one.
 */
export function pickCurrentMilestone(
  resolved: Record<MilestoneSpec["key"], ResolvedMilestone>,
): ResolvedMilestone {
  for (const m of MILESTONES) {
    const r = resolved[m.key];
    if (r.status !== "complete") return r;
  }
  return resolved[MILESTONES[MILESTONES.length - 1].key];
}
