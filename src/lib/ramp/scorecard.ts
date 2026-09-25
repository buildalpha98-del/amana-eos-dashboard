/**
 * Ramp scorecard — computed live from source data (no stored rows), so it
 * is always accurate and needs no backfill. `buildRampScorecard` is pure
 * and unit-tested; `loadRampScorecard` gathers the inputs from Prisma.
 */
import type { Prisma, PrismaClient, RampCheckIn, RampCheckpoint, StaffRamp } from "@prisma/client";
import { REQUIRED_POLICY_TITLES } from "@/lib/induction";
import {
  RAMP_COMPETENCY_KEYS,
  RAMP_LENGTH_DAYS,
  RAMP_PUNCTUALITY_GRACE_MIN,
  RAMP_SCORECARD_ROWS,
  type RampCheckpointStage,
  type RampScorecardRowKey,
} from "./constants";
import { rampDay } from "./dates";

type Db = PrismaClient | Prisma.TransactionClient;

export type RampRowStatus = "met" | "behind" | "pending";
export type RampOverall = "on_track" | "needs_support" | "at_risk";

export interface RampScorecardRow {
  key: RampScorecardRowKey;
  label: string;
  hint: string;
  format: "percent" | "boolean" | "count" | "score";
  value: number | null;
  target: number;
  targets: Record<RampCheckpointStage, number>;
  status: RampRowStatus;
}

export interface RampScorecard {
  day: number;
  lengthDays: number;
  stage: RampCheckpointStage;
  rows: RampScorecardRow[];
  overall: RampOverall;
  lastMood: number | null;
  recentFlags: number;
  latestCheckpoint: { day: number; recommendation: string | null; average: number | null } | null;
}

export interface RampScorecardInputs {
  ramp: Pick<StaffRamp, "startDate" | "endDate" | "status">;
  checkIns: Pick<RampCheckIn, "weekNumber" | "sentAt" | "skipped" | "submittedAt" | "mood" | "flaggedAt">[];
  checkpoints: Pick<RampCheckpoint, "day" | "submittedAt" | "ratings" | "recommendation">[];
  essentialCourses: number;
  essentialCompleted: number;
  wwccOnFile: boolean;
  requiredPolicies: number;
  policiesAcked: number;
  /** Published shifts up to yesterday. */
  shiftsWorked: number;
  /** Shifts with a clock-in, and how many were on time. */
  clockedShifts: number;
  onTimeShifts: number;
}

export function ratingAverage(ratings: unknown): number | null {
  if (!ratings || typeof ratings !== "object") return null;
  const vals = RAMP_COMPETENCY_KEYS.map((k) => (ratings as Record<string, unknown>)[k]).filter(
    (v): v is number => typeof v === "number" && v >= 1 && v <= 5,
  );
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

export function stageForDay(day: number): RampCheckpointStage {
  if (day >= 90) return 90;
  if (day >= 60) return 60;
  return 30;
}

function pct(num: number, den: number): number | null {
  if (den === 0) return null;
  return Math.round((num / den) * 100);
}

export function buildRampScorecard(inputs: RampScorecardInputs, now: Date = new Date()): RampScorecard {
  const day = Math.max(0, rampDay(inputs.ramp.startDate, now));
  const stage = stageForDay(day);
  // Before day 30 nothing is "behind" yet — the first target is due at 30.
  const stageReached = day >= 30;

  const submitted = inputs.checkIns.filter((c) => c.submittedAt && c.mood != null);
  const sentCount = inputs.checkIns.filter((c) => c.sentAt && !c.skipped).length;
  const moods = submitted
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((c) => c.mood as number);
  const lastThree = moods.slice(-3);
  const moodAvg = lastThree.length ? Math.round((lastThree.reduce((a, b) => a + b, 0) / lastThree.length) * 100) / 100 : null;

  const submittedCheckpoints = inputs.checkpoints
    .filter((c) => c.submittedAt)
    .sort((a, b) => b.day - a.day);
  const latest = submittedCheckpoints[0] ?? null;
  const latestAvg = latest ? ratingAverage(latest.ratings) : null;

  const values: Record<RampScorecardRowKey, number | null> = {
    training: inputs.essentialCourses === 0 ? 100 : pct(inputs.essentialCompleted, inputs.essentialCourses),
    wwcc: inputs.wwccOnFile ? 1 : 0,
    policies: inputs.requiredPolicies === 0 ? 100 : pct(inputs.policiesAcked, inputs.requiredPolicies),
    shifts: inputs.shiftsWorked,
    punctuality: pct(inputs.onTimeShifts, inputs.clockedShifts),
    checkins: pct(submitted.length, sentCount),
    mood: moodAvg,
    manager: latestAvg,
  };

  const rows: RampScorecardRow[] = RAMP_SCORECARD_ROWS.map((def) => {
    const value = values[def.key];
    const target = def.targets[stage];
    let status: RampRowStatus;
    if (value != null && value >= target) status = "met";
    else if (!stageReached) status = "pending";
    else if (def.key === "manager" && !latest) status = "pending";
    else status = "behind";
    return { key: def.key, label: def.label, hint: def.hint, format: def.format, value, target, targets: def.targets, status };
  });

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
  const recentFlags = inputs.checkIns.filter((c) => c.flaggedAt && c.flaggedAt >= fourteenDaysAgo).length;
  const behind = rows.filter((r) => r.status === "behind").length;
  const rec = latest?.recommendation ?? null;

  let overall: RampOverall = "on_track";
  if (recentFlags > 0 || rec === "at_risk" || rec === "end") overall = "at_risk";
  else if (rec === "needs_support" || rec === "extend" || behind >= 2) overall = "needs_support";

  return {
    day,
    lengthDays: RAMP_LENGTH_DAYS,
    stage,
    rows,
    overall,
    lastMood: moods.length ? moods[moods.length - 1] : null,
    recentFlags,
    latestCheckpoint: latest ? { day: latest.day, recommendation: rec, average: latestAvg } : null,
  };
}

function isOnTime(shiftStart: string, actualStart: Date): boolean {
  const [h, m] = shiftStart.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return true;
  // Compare in Sydney local time — shifts are rostered in local HH:mm.
  const local = new Date(actualStart.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
  const actualMin = local.getHours() * 60 + local.getMinutes();
  return actualMin <= h * 60 + m + RAMP_PUNCTUALITY_GRACE_MIN;
}

export async function loadRampScorecardInputs(
  db: Db,
  ramp: StaffRamp & { checkIns: RampCheckIn[]; checkpoints: RampCheckpoint[] },
  now: Date = new Date(),
): Promise<RampScorecardInputs> {
  const userId = ramp.userId;

  const essential = await db.lMSCourse.findMany({
    where: { track: "essential", status: "published", deleted: false },
    select: { id: true },
  });
  const essentialIds = essential.map((c) => c.id);
  const completed = essentialIds.length
    ? await db.lMSEnrollment.count({ where: { userId, courseId: { in: essentialIds }, status: "completed" } })
    : 0;

  const wwcc = await db.complianceCertificate.findFirst({
    where: { userId, type: "wwcc", supersededAt: null },
    select: { id: true },
  });

  const policies = await db.policyDocument.findMany({
    where: { title: { in: [...REQUIRED_POLICY_TITLES] }, isArchived: false },
    select: { currentVersionId: true },
  });
  const versionIds = policies.map((p) => p.currentVersionId).filter((v): v is string => Boolean(v));
  const acked = versionIds.length
    ? await db.policyDocumentAcknowledgement.count({ where: { userId, versionId: { in: versionIds } } })
    : 0;

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const shifts = await db.rosterShift.findMany({
    where: { userId, status: "published", date: { gte: ramp.startDate, lt: today } },
    select: { shiftStart: true, actualStart: true },
  });
  const clocked = shifts.filter((s) => s.actualStart);
  const onTime = clocked.filter((s) => isOnTime(s.shiftStart, s.actualStart as Date));

  return {
    ramp,
    checkIns: ramp.checkIns,
    checkpoints: ramp.checkpoints,
    essentialCourses: essentialIds.length,
    essentialCompleted: completed,
    wwccOnFile: !!wwcc,
    requiredPolicies: policies.length,
    policiesAcked: acked,
    shiftsWorked: shifts.length,
    clockedShifts: clocked.length,
    onTimeShifts: onTime.length,
  };
}

export async function loadRampScorecard(
  db: Db,
  ramp: StaffRamp & { checkIns: RampCheckIn[]; checkpoints: RampCheckpoint[] },
  now: Date = new Date(),
): Promise<RampScorecard> {
  return buildRampScorecard(await loadRampScorecardInputs(db, ramp, now), now);
}
