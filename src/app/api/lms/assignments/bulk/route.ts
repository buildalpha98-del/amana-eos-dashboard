/**
 * POST /api/lms/assignments/bulk
 *
 * Remove an assignment from several people at once.
 *
 * The case this exists for: a course auto-enrols everyone — the monthly
 * cron enrols every cleared user, the induction backfill enrols every
 * active staffer missing the essential track — and a handful of those
 * accounts should never have had it. Head-office admins who don't work
 * on the floor, a relief educator who only covers one centre. Removing
 * them one at a time through the single-enrolment DELETE means opening
 * a dozen rows.
 *
 * Deliberately delete-only. There is no bulk "assign" here because one
 * already exists — `POST /api/lms/enrollments` takes a `userIds` array —
 * and having two ways to create enrolments is how the two drift.
 *
 * Completed enrolments are skipped rather than deleted. Someone who has
 * finished the training has a training record, and a bulk tidy-up of
 * who "needs" a course must not quietly destroy evidence that others
 * did it. Removing a completed one is still possible individually,
 * where the intent is unambiguous.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const bulkSchema = z.object({
  /** The specific assignments to drop. */
  enrollmentIds: z.array(z.string().min(1)).min(1).max(500),
});

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bulkSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid request", parsed.error.flatten());
    }
    const { enrollmentIds } = parsed.data;

    const found = await prisma.lMSEnrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: {
        id: true,
        status: true,
        user: { select: { id: true, name: true } },
        course: { select: { id: true, title: true } },
      },
    });

    const completed = found.filter((e) => e.status === "completed");
    const removable = found.filter((e) => e.status !== "completed");

    if (removable.length > 0) {
      // Cascade handles moduleProgress and quizAttempts.
      await prisma.lMSEnrollment.deleteMany({
        where: { id: { in: removable.map((e) => e.id) } },
      });

      // One log row per removal: "who took this off whom" is the
      // question asked afterwards, and a single row saying "removed 12"
      // cannot answer it.
      await prisma.activityLog.createMany({
        data: removable.map((e) => ({
          userId: session!.user.id,
          action: "unenrol_lms",
          entityType: "LMSEnrollment",
          entityId: e.id,
          details: {
            userName: e.user.name,
            courseName: e.course.title,
            bulk: true,
          },
        })),
      });
    }

    return NextResponse.json({
      removed: removable.length,
      /**
       * Reported rather than silently dropped, so the UI can say "3 were
       * already completed and were kept" instead of the count simply not
       * matching what was selected.
       */
      skippedCompleted: completed.length,
      notFound: enrollmentIds.length - found.length,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
