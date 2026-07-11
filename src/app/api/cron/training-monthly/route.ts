import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/cron/training-monthly
 *
 * Monthly cron (1st of month, 8 AM AEST) — enrols every cleared active user
 * into the current month's scheduled monthly-track courses.
 *
 * For the current calendar month (AEST), reads the active TrainingCalendarSlot
 * rows, resolves them to published + monthly + non-deleted courses, and enrols
 * every active user whose induction is `cleared` — skipping anyone already
 * enrolled. dueDate is the last day of the current month.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("training-monthly", "monthly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    // Current month number (1–12) in AEST.
    const now = new Date();
    const month = Number(
      new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Sydney",
        month: "numeric",
      }).format(now),
    );
    // Last day of the current month (day 0 of the next month).
    const dueDate = new Date(now.getFullYear(), month, 0);

    let enrolled = 0;

    // Active calendar slots for this month → their courseIds.
    const slots = await prisma.trainingCalendarSlot.findMany({
      where: { month, active: true },
      select: { courseId: true },
    });
    const slotCourseIds = Array.from(new Set(slots.map((s) => s.courseId)));

    if (slotCourseIds.length > 0) {
      // Only published, monthly-track, non-deleted courses count.
      const courses = await prisma.lMSCourse.findMany({
        where: {
          id: { in: slotCourseIds },
          status: "published",
          track: "monthly",
          deleted: false,
        },
        select: { id: true },
      });

      if (courses.length > 0) {
        // Every cleared, active user.
        const users = await prisma.user.findMany({
          where: { active: true, inductionStatus: "cleared" },
          select: { id: true },
        });

        // Existing enrollments for these courses to avoid duplicates.
        const existing = await prisma.lMSEnrollment.findMany({
          where: { courseId: { in: courses.map((c) => c.id) } },
          select: { userId: true, courseId: true },
        });
        const enrollmentSet = new Set(
          existing.map((e) => `${e.userId}:${e.courseId}`),
        );

        for (const course of courses) {
          for (const user of users) {
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
              enrolled++;
            } catch (err) {
              // Skip unique constraint violations (raced enrollment).
              if (!(err instanceof Error && err.message.includes("Unique"))) {
                throw err;
              }
            }
          }
        }
      }
    }

    await guard.complete({ enrolled });

    return NextResponse.json({
      message: "Monthly training enrolment complete",
      month,
      enrolled,
    });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
