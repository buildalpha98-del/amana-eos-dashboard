/**
 * Publishing a course, done once.
 *
 * There are two ways to publish — the per-course button in the LMS tab
 * and the bulk panel in Induction — and they had drifted. The bulk path
 * checked readiness, refused a course that could never be completed, and
 * wrote an audit row. The per-course button, which is by far the more
 * discoverable of the two, sent `{ status: "published" }` straight to
 * `prisma.update` with no check at all.
 *
 * That gap mattered because publishing an ESSENTIAL course is not a
 * visibility toggle — it arms the induction gate. A quiz module with no
 * active questions can never be passed, so a learner assigned that
 * course can never complete it, never clear induction, and never clock
 * in, with no error anywhere explaining why. The safe path being the
 * obscure one is how that ends up in production.
 *
 * So both routes now come through here: same assessment, same refusal,
 * same audit row, same induction recompute.
 */
import type { LMSCourseTrack } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assessCourses,
  type CourseReadiness,
  type ReadinessCourse,
} from "@/lib/course-readiness";
import { recomputeInductionState } from "@/lib/induction";
import { logger } from "@/lib/logger";

/**
 * The module fields the readiness check needs, plus the active-question
 * count. Only ACTIVE questions count — a quiz of nothing but inactive
 * ones is just as much a wall as an empty one.
 */
const readinessSelect = {
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
    orderBy: { sortOrder: "asc" as const },
  },
};

/**
 * What the select above returns. Written out rather than inferred: the
 * only thing downstream needs is that these six module fields and the
 * active-question count are present, and spelling that out keeps the
 * readiness mapping honest if the select ever changes.
 */
type LoadedCourse = {
  id: string;
  title: string;
  status: string;
  modules: Array<{
    id: string;
    title: string;
    type: string;
    content: string | null;
    resourceUrl: string | null;
    documentId: string | null;
    _count: { quizQuestions: number };
  }>;
};

const toReadinessCourse = (c: LoadedCourse): ReadinessCourse => ({
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
});

/** Assess every draft course on a track — the pre-flight the panel shows. */
export async function assessTrackDrafts(
  track: LMSCourseTrack,
): Promise<{ readiness: CourseReadiness[]; courseIds: string[] }> {
  const courses = (await prisma.lMSCourse.findMany({
    where: { track, deleted: false, status: "draft" },
    select: readinessSelect,
    orderBy: { sortOrder: "asc" },
  })) as LoadedCourse[];

  return {
    readiness: assessCourses(courses.map(toReadinessCourse)),
    courseIds: courses.map((c) => c.id),
  };
}

/** Assess specific courses by id. */
export async function assessCoursesById(
  courseIds: string[],
): Promise<CourseReadiness[]> {
  const courses = (await prisma.lMSCourse.findMany({
    where: { id: { in: courseIds }, deleted: false },
    select: readinessSelect,
  })) as LoadedCourse[];

  return assessCourses(courses.map(toReadinessCourse));
}

/**
 * Bring induction state back in line after arming the gate.
 *
 * A newly published essential course changes what "ready" means. Someone
 * sitting in `awaiting_signoff` was ready under the old set and may not
 * be under the new one — and if nothing recomputes, a manager can sign
 * off that stale state and clear them past a course they never took.
 * `recomputeInductionState` was written for exactly this (its own
 * comment names "a course published" as a trigger); it just was never
 * called from a publish path.
 *
 * Scoped to users the gate can actually apply to. `cleared` users return
 * immediately from the recompute anyway, so walking the whole staff list
 * would be a lot of queries to reach the same answer.
 *
 * Failures are logged, never thrown: the courses ARE published by this
 * point, and turning a successful publish into a 500 would leave the
 * caller thinking it hadn't happened.
 */
async function resyncGatedUsers(): Promise<number> {
  const gated = await prisma.user.findMany({
    where: {
      active: true,
      inductionStatus: { in: ["new_starter", "in_training", "awaiting_signoff"] },
    },
    select: { id: true },
  });

  let changed = 0;
  for (const u of gated) {
    try {
      await recomputeInductionState(u.id);
      changed += 1;
    } catch (err) {
      logger.warn("Publish: induction recompute failed", {
        userId: u.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return changed;
}

export interface PublishResult {
  published: number;
  skipped: number;
  forced: boolean;
  /** Users whose induction state was re-evaluated after the change. */
  resynced: number;
}

/**
 * Publish courses after checking they can actually be completed.
 *
 * Returns `{ blocked }` instead of a result when something is unfit and
 * `force` wasn't set — the caller turns that into a 409 carrying the
 * blockers, because "not ready" needs to say WHAT to fix, not just no.
 */
export async function publishCourses(opts: {
  courseIds: string[];
  force?: boolean;
  actorUserId: string;
}): Promise<
  { ok: true; result: PublishResult } | { ok: false; blocked: CourseReadiness[] }
> {
  const { courseIds, force, actorUserId } = opts;
  const readiness = await assessCoursesById(courseIds);

  const blocked = readiness.filter((r) => !r.publishable);
  if (blocked.length > 0 && !force) return { ok: false, blocked };

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
      userId: actorUserId,
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

  const resynced = toPublish.length > 0 ? await resyncGatedUsers() : 0;

  return {
    ok: true,
    result: {
      published: toPublish.length,
      skipped: readiness.length - toPublish.length,
      forced: Boolean(force),
      resynced,
    },
  };
}
