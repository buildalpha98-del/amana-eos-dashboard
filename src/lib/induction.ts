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

export type Blocker = { kind: string; label: string; href: string };

/** Path prefixes a locked (new_starter / in_training-without-grace) user may reach. */
export const INDUCTION_ALLOWED_PREFIXES = [
  "/my-training",
  "/learn",
  "/profile",
  "/handbook",
  "/policies",
] as const;

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
 * Middleware/sidebar helper: is this user in locked (restricted-nav) mode?
 * `now` is injectable so callers/tests stay deterministic.
 */
export function isInductionLocked(
  status: string | undefined | null,
  graceUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== "new_starter" && status !== "in_training") return false;
  if (graceUntil && new Date(graceUntil) > now) return false; // backfilled w/ active grace
  return true;
}
