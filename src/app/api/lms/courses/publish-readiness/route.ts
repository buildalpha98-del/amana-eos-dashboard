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
import { assessTrackDrafts, publishCourses } from "@/lib/course-publish";

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

export const GET = withApiAuth(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const trackParam = params.get("track") ?? "essential";
    if (!(TRACKS as readonly string[]).includes(trackParam)) {
      throw ApiError.badRequest(`Unknown track "${trackParam}"`);
    }
    const track = trackParam as Track;

    const { readiness, courseIds } = await assessTrackDrafts(track);

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
      courseIds.length === 0
        ? 0
        : await prisma.lMSEnrollment.count({
            where: {
              status: { not: "completed" },
              user: { active: true },
              courseId: { in: courseIds },
            },
          });

    return NextResponse.json({
      track,
      courses: readiness,
      impact: {
        draftCourses: courseIds.length,
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

    const existing = await prisma.lMSCourse.count({
      where: { id: { in: courseIds }, deleted: false },
    });
    if (existing === 0) throw ApiError.notFound("No courses found");

    const outcome = await publishCourses({
      courseIds,
      force,
      actorUserId: session!.user.id,
    });

    if (!outcome.ok) {
      // 409 rather than 400: the request is well-formed, the state isn't
      // ready. Returned rather than thrown so the blockers travel with
      // it — the UI needs to show exactly what to fix, not a bare
      // refusal the admin has to go hunting to explain.
      const { blocked } = outcome;
      return NextResponse.json(
        {
          error: `${blocked.length} ${blocked.length === 1 ? "course is" : "courses are"} not ready to publish`,
          blocked,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(outcome.result);
  },
  /**
   * Matches GET, and matches the per-course publish button in the LMS
   * tab. Narrowing the CHECKED path to a subset of who can publish
   * anyway just pushes people to the unchecked one — head_office could
   * see this panel and get a 403, while admin could publish freely from
   * the other screen and never see it.
   */
  { roles: ["owner", "head_office", "admin"] },
);
