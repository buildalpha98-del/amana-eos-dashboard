/**
 * Make sure a staff member is enrolled in every PUBLISHED essential course
 * (The Amana Way, child safety, your first day, OWNA essentials …).
 *
 * 2026-10-07: the readiness check counted published essentials ("8 training
 * courses left") but nothing ever enrolled a new starter in them, so My
 * Training — which lists enrolments — was empty and the count pointed at
 * nothing. Enrolment used to happen only through the admin backfill.
 * This runs lazily wherever a learner looks (My Training, the My Portal
 * checklist), so newly published essentials reach everyone without a cron.
 *
 * Idempotent: createMany + skipDuplicates on the (userId, courseId) unique.
 * Skips the roles that are exempt from induction and shared centre mailboxes.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isInductionExemptRole } from "@/lib/induction-lock";

export async function ensureEssentialEnrolments(userId: string): Promise<number> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { active: true, role: true, isCentreAccount: true },
    });
    if (!user || !user.active || user.isCentreAccount || isInductionExemptRole(user.role)) {
      return 0;
    }
    const essentials = await prisma.lMSCourse.findMany({
      where: { track: "essential", status: "published", deleted: false },
      select: { id: true },
    });
    if (essentials.length === 0) return 0;
    const { count } = await prisma.lMSEnrollment.createMany({
      data: essentials.map((c) => ({ userId, courseId: c.id })),
      skipDuplicates: true,
    });
    return count;
  } catch (err) {
    // Never break My Training over this — log and show what exists.
    logger.error("ensureEssentialEnrolments failed", { userId, err });
    return 0;
  }
}
