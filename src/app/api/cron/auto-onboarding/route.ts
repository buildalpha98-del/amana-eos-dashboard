import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/auto-onboarding
 *
 * Daily cron (7:30 AM AEST) — two-part automation:
 *
 * Part A: Auto-assign default onboarding packs to new users
 * Part B: Auto-enrol users in required LMS courses
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("auto-onboarding", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const dueDate = new Date(now.getTime() + 30 * 86400000); // 30 days from now
    let onboardingAssigned = 0;
    let lmsEnrolled = 0;
    const errors: string[] = [];

    // ── Part A: Onboarding Pack Assignment ────────────────────

    // Find all active users who have no StaffOnboarding records
    const usersWithoutOnboarding = await prisma.user.findMany({
      where: {
        active: true,
        onboardings: { none: {} },
      },
      select: { id: true, name: true, serviceId: true },
    });

    if (usersWithoutOnboarding.length > 0) {
      // Get all default onboarding packs
      const defaultPacks = await prisma.onboardingPack.findMany({
        where: { isDefault: true, deleted: false },
        select: { id: true, serviceId: true },
      });

      for (const user of usersWithoutOnboarding) {
        try {
          // Find matching pack: service-specific first, then org-wide (null service)
          const matchingPack =
            defaultPacks.find((p) => p.serviceId === user.serviceId) ||
            defaultPacks.find((p) => p.serviceId === null);

          if (matchingPack) {
            await prisma.staffOnboarding.create({
              data: {
                userId: user.id,
                packId: matchingPack.id,
                status: "not_started",
                dueDate,
              },
            });
            onboardingAssigned++;
          }
        } catch (err) {
          // Skip if already exists (unique constraint)
          if (!(err instanceof Error && err.message.includes("Unique"))) {
            errors.push(`Onboarding ${user.name}: ${err instanceof Error ? err.message : "Unknown"}`);
          }
        }
      }
    }

    // ── Part B: LMS Auto-Enrollment ──────────────────────────

    // Find all published required courses
    const requiredCourses = await prisma.lMSCourse.findMany({
      where: {
        isRequired: true,
        status: "published",
        deleted: false,
      },
      select: { id: true, title: true, serviceId: true },
    });

    if (requiredCourses.length > 0) {
      // Get all active users
      const activeUsers = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, serviceId: true },
      });

      // Get existing enrollments to avoid duplicates
      const existingEnrollments = await prisma.lMSEnrollment.findMany({
        select: { userId: true, courseId: true },
      });
      const enrollmentSet = new Set(
        existingEnrollments.map((e) => `${e.userId}:${e.courseId}`)
      );

      for (const course of requiredCourses) {
        for (const user of activeUsers) {
          // Service-scoped course: only enroll users in that service
          if (course.serviceId && course.serviceId !== user.serviceId) continue;

          // Skip if already enrolled
          const key = `${user.id}:${course.id}`;
          if (enrollmentSet.has(key)) continue;

          try {
            await prisma.lMSEnrollment.create({
              data: {
                userId: user.id,
                courseId: course.id,
                status: "enrolled",
                dueDate,
              },
            });
            enrollmentSet.add(key);
            lmsEnrolled++;
          } catch (err) {
            // Skip unique constraint violations
            if (!(err instanceof Error && err.message.includes("Unique"))) {
              errors.push(`LMS enroll ${user.id}→${course.id}: ${err instanceof Error ? err.message : "Unknown"}`);
            }
          }
        }
      }
    }

    await guard.complete({
      onboardingAssigned,
      lmsEnrolled,
      errorCount: errors.length,
    });

    return NextResponse.json({
      message: "Auto-onboarding complete",
      onboardingAssigned,
      lmsEnrolled,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    logger.error("Auto-onboarding cron failed", { err });
    await guard.fail(err);
    throw err;
  }
});
