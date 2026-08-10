/**
 * GET/POST /api/lms/courses/publish-readiness
 *
 * The pre-flight for arming the induction gate, and the bulk publish it
 * guards.
 *
 * Publishing an essential course is the rollout switch, not a visibility
 * toggle: `getInductionReadiness` counts published essential courses
 * only. Flip them all at once with a broken one in the set and you have
 * staff who cannot clock in and no obvious reason why.
 *
 * GET answers two questions a human needs before deciding:
 *   1. Is each course actually completable? (see course-readiness.ts —
 *      a quiz with no questions is a permanent wall, not an annoyance)
 *   2. What happens to real people if I do this? — how many staff are
 *      currently gate-eligible, and how many outstanding enrolments
 *      would start appearing in Compliance and the weekly emails.
 *
 * POST publishes, and REFUSES any course with blockers unless `force`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  assessCourses,
  type ReadinessCourse,
} from "@/lib/course-readiness";

const TRACKS = ["essential", "monthly", "library"] as const;
type Track = (typeof TRACKS)[number];

const publishSchema = z.object({
  courseIds: z.array(z.string().min(1)).min(1).max(50),
  /**
   * Publish despite blockers. Deliberately explicit — the caller has to
   * have seen the blockers and decided anyway.
   */
  force: z.boolean().optional(),
});

/** Load courses in the shape the readiness check wants. */
async function loadForAssessment(
  track: Track,
  onlyDrafts: boolean,
): Promise<ReadinessCourse[]> {
  const courses = await prisma.lMSCourse.findMany({
    where: {
      track,
      deleted: false,
      ...(onlyDrafts ? { status: "draft" } : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      modules: {
        select: {
          id: true,
          title: true,
          type: true,
          content: true,
          resourceUrl: true,
          documentId: true,
          // Only ACTIVE questions count — an inactive one can't be
          // answered, so a quiz of nothing but inactive questions is
          // just as much a wall as an empty one.
          _count: { select: { quizQuestions: { where: { active: true } } } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    modules: c.modules.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      content: m.content,
      resourceUrl: m.resourceUrl,
      documentId: m.documentId,
      activeQuestionCount: m._count.quizQuestions,
    })),
  }));
}

export const GET = withApiAuth(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const trackParam = params.get("track") ?? "essential";
    if (!(TRACKS as readonly string[]).includes(trackParam)) {
      throw ApiError.badRequest(`Unknown track "${trackParam}"`);
    }
    const track = trackParam as Track;

    const courses = await loadForAssessment(track, true);
    const readiness = assessCourses(courses);

    /**
     * Who the gate would actually bite.
     *
     * Only `new_starter` and `in_training` are gated — everyone else is
     * `cleared` and unaffected by publishing. Counting the whole staff
     * list here would overstate the blast radius and scare someone out
     * of a safe change.
     */
    const gateEligible = await prisma.user.count({
      where: {
        active: true,
        inductionStatus: { in: ["new_starter", "in_training"] },
      },
    });

    /**
     * Enrolments that would start counting as outstanding — the ones
     * that appear in Compliance and trigger the weekly reminder emails.
     */
    const wouldBecomeOutstanding =
      courses.length === 0
        ? 0
        : await prisma.lMSEnrollment.count({
            where: {
              status: { not: "completed" },
              user: { active: true },
              courseId: { in: courses.map((c) => c.id) },
            },
          });

    return NextResponse.json({
      track,
      courses: readiness,
      impact: {
        draftCourses: courses.length,
        publishable: readiness.filter((r) => r.publishable).length,
        blocked: readiness.filter((r) => !r.publishable).length,
        /** Staff currently in a state the gate applies to. */
        gateEligibleStaff: gateEligible,
        /** Enrolments that would newly show as outstanding. */
        wouldBecomeOutstanding,
      },
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = publishSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid request", parsed.error.flatten());
    }
    const { courseIds, force } = parsed.data;

    const courses = await prisma.lMSCourse.findMany({
      where: { id: { in: courseIds }, deleted: false },
      select: {
        id: true,
        title: true,
        status: true,
        modules: {
          select: {
            id: true,
            title: true,
            type: true,
            content: true,
            resourceUrl: true,
            documentId: true,
            _count: { select: { quizQuestions: { where: { active: true } } } },
          },
        },
      },
    });

    if (courses.length === 0) throw ApiError.notFound("No courses found");

    const readiness = assessCourses(
      courses.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        modules: c.modules.map((m) => ({
          id: m.id,
          title: m.title,
          type: m.type,
          content: m.content,
          resourceUrl: m.resourceUrl,
          documentId: m.documentId,
          activeQuestionCount: m._count.quizQuestions,
        })),
      })),
    );

    const blocked = readiness.filter((r) => !r.publishable);
    if (blocked.length > 0 && !force) {
      // 409 rather than 400: the request is well-formed, the state isn't
      // ready. Returned rather than thrown so the blockers travel with
      // it — the UI needs to show exactly what to fix, not a bare
      // refusal the admin has to go hunting to explain.
      return NextResponse.json(
        {
          error: `${blocked.length} ${blocked.length === 1 ? "course is" : "courses are"} not ready to publish`,
          blocked,
        },
        { status: 409 },
      );
    }

    const toPublish = force
      ? readiness.map((r) => r.courseId)
      : readiness.filter((r) => r.publishable).map((r) => r.courseId);

    await prisma.lMSCourse.updateMany({
      where: { id: { in: toPublish } },
      data: { status: "published" },
    });

    // One row per course: arming the gate is exactly the sort of change
    // someone asks about afterwards.
    await prisma.activityLog.createMany({
      data: toPublish.map((id) => ({
        userId: session!.user.id,
        action: "publish_lms_course",
        entityType: "LMSCourse",
        entityId: id,
        details: {
          courseTitle:
            readiness.find((r) => r.courseId === id)?.courseTitle ?? null,
          forced: Boolean(force),
        },
      })),
    });

    return NextResponse.json({
      published: toPublish.length,
      skipped: readiness.length - toPublish.length,
      forced: Boolean(force),
    });
  },
  { roles: ["owner", "admin"] },
);
