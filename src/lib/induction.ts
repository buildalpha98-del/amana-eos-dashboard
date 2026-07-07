/**
 * Induction gate — the single source of truth for "may this user be rostered
 * or clock in?".
 *
 * A new starter cannot work until they have completed the essential training
 * track, have a WWCC on file, have acknowledged the required policies, and
 * have a complete profile — and (for genuine new hires) a State Manager/Admin
 * has signed off their week-1 practical.
 *
 * Enforcement points call `assertUserCleared`. The learner UI and the
 * middleware call `getInductionReadiness` / `isInductionLocked`.
 *
 * Rollout safety: `getInductionReadiness` only counts PUBLISHED essential
 * courses, so the gate stays inert until content is published, and an empty
 * essential curriculum never blocks.
 */
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

// Pure, edge-safe helpers live in induction-lock.ts (imported by middleware).
// Re-exported here so server code can import everything from "@/lib/induction".
export {
  INDUCTION_ALLOWED_PREFIXES,
  isInductionLocked,
  isInductionAllowedPath,
} from "@/lib/induction-lock";

export type Blocker = { kind: string; label: string; href: string };

const WWCC_TYPE = "wwcc";

/** Policies a new starter must acknowledge before clearing (matched by title). */
export const REQUIRED_POLICY_TITLES = [
  "Child Safe Code of Conduct",
  "Privacy Policy",
];

export async function getInductionReadiness(
  userId: string,
): Promise<{ ready: boolean; blockers: Blocker[] }> {
  const blockers: Blocker[] = [];

  // 1. Essential courses — only PUBLISHED ones count (gradual rollout).
  const essential = await prisma.lMSCourse.findMany({
    where: { track: "essential", status: "published", deleted: false },
    select: { id: true, title: true },
  });
  if (essential.length > 0) {
    const enrollments = await prisma.lMSEnrollment.findMany({
      where: { userId, courseId: { in: essential.map((c) => c.id) } },
      select: { courseId: true, status: true },
    });
    const doneCourseIds = new Set(
      enrollments
        .filter((e) => e.status === "completed")
        .map((e) => e.courseId),
    );
    const remaining = essential.filter((c) => !doneCourseIds.has(c.id));
    if (remaining.length > 0) {
      blockers.push({
        kind: "courses",
        label: `${remaining.length} training course${remaining.length > 1 ? "s" : ""} left`,
        href: "/my-training",
      });
    }
  }

  // 2. WWCC on file (any current, non-superseded cert of type wwcc).
  const wwcc = await prisma.complianceCertificate.findFirst({
    where: { userId, type: WWCC_TYPE, supersededAt: null },
    select: { id: true },
  });
  if (!wwcc) {
    blockers.push({ kind: "wwcc", label: "WWCC not uploaded", href: "/profile" });
  }

  // 3. Required policy acknowledgements (current version of each).
  const policies = await prisma.policyDocument.findMany({
    where: { title: { in: REQUIRED_POLICY_TITLES }, isArchived: false },
    select: { title: true, currentVersionId: true },
  });
  if (policies.length > 0) {
    const currentVersionIds = policies
      .map((p) => p.currentVersionId)
      .filter((v): v is string => Boolean(v));
    const acks = await prisma.policyDocumentAcknowledgement.findMany({
      where: { userId, versionId: { in: currentVersionIds } },
      select: { versionId: true },
    });
    const ackedVersions = new Set(acks.map((a) => a.versionId));
    const unacked = policies.filter(
      (p) => !p.currentVersionId || !ackedVersions.has(p.currentVersionId),
    );
    if (unacked.length > 0) {
      blockers.push({
        kind: "policies",
        label: `${unacked.length} policy acknowledgement${unacked.length > 1 ? "s" : ""} outstanding`,
        href: "/policies",
      });
    }
  }

  // 4. Profile completeness — photo, phone, at least one emergency contact.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatar: true,
      phone: true,
      _count: { select: { emergencyContacts: true } },
    },
  });
  if (
    !user?.avatar ||
    !user?.phone ||
    (user?._count?.emergencyContacts ?? 0) === 0
  ) {
    blockers.push({ kind: "profile", label: "Profile incomplete", href: "/profile" });
  }

  return { ready: blockers.length === 0, blockers };
}

/** Throws unless the user may be rostered / clock in right now. */
export async function assertUserCleared(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      inductionStatus: true,
      inductionGraceUntil: true,
      inductionOverrideUntil: true,
    },
  });
  if (!user) throw ApiError.notFound("User not found");

  if (user.inductionStatus === "cleared") return;

  const now = new Date();
  if (user.inductionOverrideUntil && user.inductionOverrideUntil > now) return;
  if (user.inductionGraceUntil && user.inductionGraceUntil > now) return;

  const { blockers } = await getInductionReadiness(userId);
  const summary =
    blockers.map((b) => b.label).join(", ") || "induction incomplete";
  throw ApiError.forbidden(
    `Induction not complete — cannot roster or clock in. Outstanding: ${summary}. Finish at /my-training.`,
  );
}

/**
 * Re-evaluate a user's induction status after something changed (a module
 * completed, a policy acknowledged, a course published). Idempotent.
 *
 * - cleared → untouched.
 * - ready + backfilled (grace set) → cleared (backfill skips the practical).
 * - ready + genuine new hire → awaiting_signoff (waiting on the practical).
 * - not-ready + awaiting_signoff → back to in_training (readiness regressed,
 *   e.g. a newly published essential course).
 * - not-ready + new_starter/in_training → no change.
 *
 * Returns the resulting status.
 */
export async function recomputeInductionState(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { inductionStatus: true, inductionGraceUntil: true },
  });
  if (!user) throw ApiError.notFound("User not found");
  if (user.inductionStatus === "cleared") return "cleared";

  const { ready } = await getInductionReadiness(userId);
  const isBackfilled = Boolean(user.inductionGraceUntil);

  if (ready) {
    if (isBackfilled) {
      await prisma.user.update({
        where: { id: userId },
        data: { inductionStatus: "cleared", inductionClearedAt: new Date() },
      });
      return "cleared";
    }
    if (user.inductionStatus !== "awaiting_signoff") {
      await prisma.user.update({
        where: { id: userId },
        data: { inductionStatus: "awaiting_signoff" },
      });
    }
    return "awaiting_signoff";
  }

  // Not ready: only meaningful transition is regressing out of awaiting_signoff.
  if (user.inductionStatus === "awaiting_signoff") {
    await prisma.user.update({
      where: { id: userId },
      data: { inductionStatus: "in_training" },
    });
    return "in_training";
  }
  return user.inductionStatus;
}

/**
 * Single choke-point called whenever a learner makes course progress (a module
 * completed, a quiz passed). Bumps a brand-new starter into `in_training` on
 * first interaction, then recomputes state. Called by BOTH the quiz-submit and
 * module-progress endpoints so the transition can never be skipped.
 */
export async function onModuleProgressed(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { inductionStatus: true },
  });
  if (user?.inductionStatus === "new_starter") {
    await prisma.user.update({
      where: { id: userId },
      data: { inductionStatus: "in_training" },
    });
  }
  return recomputeInductionState(userId);
}
