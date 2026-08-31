/**
 * The shared publish path.
 *
 * Publishing an essential course arms the induction gate, so the two
 * things that matter here are: an unfinishable course is refused, and
 * the people the gate applies to get their state recomputed. Both used
 * to be true of the bulk panel only, and false of the per-course button.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const recomputeInductionState = vi.fn();
vi.mock("@/lib/induction", () => ({
  recomputeInductionState: (id: string) => recomputeInductionState(id),
}));

import { publishCourses, assessCoursesById } from "@/lib/course-publish";

/** A course row in the shape the readiness select returns. */
const course = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  title: "Child Safety & You",
  status: "draft",
  modules: [
    {
      id: "m-1",
      title: "Reading",
      type: "document",
      content: "x".repeat(600),
      resourceUrl: null,
      documentId: null,
      _count: { quizQuestions: 0 },
    },
  ],
  ...over,
});

/** A course whose quiz can never be passed — the wall case. */
const wallCourse = () =>
  course({
    id: "c-wall",
    title: "Emergency Procedures",
    modules: [
      {
        id: "m-q",
        title: "Final quiz",
        type: "quiz",
        content: null,
        resourceUrl: null,
        documentId: null,
        _count: { quizQuestions: 0 },
      },
    ],
  });

beforeEach(() => {
  vi.clearAllMocks();
  recomputeInductionState.mockResolvedValue("in_training");
  prismaMock.lMSCourse.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.activityLog.createMany.mockResolvedValue({ count: 1 });
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe("publishCourses — refusing what can't be finished", () => {
  it("refuses a course whose quiz has no questions", async () => {
    prismaMock.lMSCourse.findMany.mockResolvedValue([wallCourse()]);

    const out = await publishCourses({
      courseIds: ["c-wall"],
      actorUserId: "u-admin",
    });

    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected refusal");
    expect(out.blocked[0].courseTitle).toBe("Emergency Procedures");
    expect(out.blocked[0].blockers[0].message).toMatch(/never be passed/i);
  });

  it("writes nothing when it refuses", async () => {
    // A partial publish here would be the worst outcome: the gate armed
    // by a course nobody can finish.
    prismaMock.lMSCourse.findMany.mockResolvedValue([wallCourse()]);

    await publishCourses({ courseIds: ["c-wall"], actorUserId: "u-admin" });

    expect(prismaMock.lMSCourse.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.activityLog.createMany).not.toHaveBeenCalled();
    expect(recomputeInductionState).not.toHaveBeenCalled();
  });

  it("refuses the whole batch when one course is unfit", async () => {
    // Not "publish the good ones and mention the rest" — an admin who
    // asked for seven and got six would reasonably believe the rollout
    // was done.
    prismaMock.lMSCourse.findMany.mockResolvedValue([course(), wallCourse()]);

    const out = await publishCourses({
      courseIds: ["c-1", "c-wall"],
      actorUserId: "u-admin",
    });

    expect(out.ok).toBe(false);
    expect(prismaMock.lMSCourse.updateMany).not.toHaveBeenCalled();
  });

  it("publishes a healthy course", async () => {
    prismaMock.lMSCourse.findMany.mockResolvedValue([course()]);

    const out = await publishCourses({
      courseIds: ["c-1"],
      actorUserId: "u-admin",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected success");
    expect(out.result.published).toBe(1);
    expect(prismaMock.lMSCourse.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "published" } }),
    );
  });
});

describe("publishCourses — force", () => {
  it("publishes despite blockers when forced", async () => {
    prismaMock.lMSCourse.findMany.mockResolvedValue([wallCourse()]);

    const out = await publishCourses({
      courseIds: ["c-wall"],
      force: true,
      actorUserId: "u-admin",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected success");
    expect(out.result.published).toBe(1);
    expect(out.result.forced).toBe(true);
  });

  it("records that it was forced on the audit row", async () => {
    // Someone will ask later why an unfinishable course went live.
    prismaMock.lMSCourse.findMany.mockResolvedValue([wallCourse()]);

    await publishCourses({
      courseIds: ["c-wall"],
      force: true,
      actorUserId: "u-admin",
    });

    const arg = prismaMock.activityLog.createMany.mock.calls[0][0];
    expect(arg.data[0]).toMatchObject({
      userId: "u-admin",
      action: "publish_lms_course",
      entityType: "LMSCourse",
      entityId: "c-wall",
    });
    expect(arg.data[0].details).toMatchObject({ forced: true });
  });
});

describe("publishCourses — induction resync", () => {
  it("recomputes state for gated staff after publishing", async () => {
    // A newly published essential course changes what "ready" means; a
    // stale awaiting_signoff could otherwise be signed off and cleared
    // past a course the person never took.
    prismaMock.lMSCourse.findMany.mockResolvedValue([course()]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "u-1" }, { id: "u-2" }]);

    const out = await publishCourses({
      courseIds: ["c-1"],
      actorUserId: "u-admin",
    });

    expect(recomputeInductionState).toHaveBeenCalledTimes(2);
    expect(recomputeInductionState).toHaveBeenCalledWith("u-1");
    if (!out.ok) throw new Error("expected success");
    expect(out.result.resynced).toBe(2);
  });

  it("only looks at staff the gate can apply to", async () => {
    // Cleared users short-circuit inside the recompute anyway; walking
    // the whole staff list would be a lot of queries for the same answer.
    prismaMock.lMSCourse.findMany.mockResolvedValue([course()]);

    await publishCourses({ courseIds: ["c-1"], actorUserId: "u-admin" });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          inductionStatus: {
            in: ["new_starter", "in_training", "awaiting_signoff"],
          },
        }),
      }),
    );
  });

  it("does not fail the publish when a recompute throws", async () => {
    // The courses ARE published by this point. A 500 here would tell the
    // caller it hadn't happened, and they'd try again.
    prismaMock.lMSCourse.findMany.mockResolvedValue([course()]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "u-1" }, { id: "u-2" }]);
    recomputeInductionState.mockRejectedValueOnce(new Error("boom"));

    const out = await publishCourses({
      courseIds: ["c-1"],
      actorUserId: "u-admin",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected success");
    // The failure is logged and skipped; the other user still resyncs.
    expect(out.result.resynced).toBe(1);
  });

  it("skips the resync entirely when nothing was published", async () => {
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);

    const out = await publishCourses({
      courseIds: ["c-gone"],
      actorUserId: "u-admin",
    });

    expect(out.ok).toBe(true);
    expect(recomputeInductionState).not.toHaveBeenCalled();
  });
});

describe("assessCoursesById", () => {
  it("counts only ACTIVE quiz questions", async () => {
    // An inactive question can't be answered, so a quiz of nothing but
    // inactive ones is as much a wall as an empty one. The filter lives
    // in the select; this asserts it stays there.
    prismaMock.lMSCourse.findMany.mockResolvedValue([course()]);

    await assessCoursesById(["c-1"]);

    const arg = prismaMock.lMSCourse.findMany.mock.calls[0][0];
    expect(arg.select.modules.select._count).toEqual({
      select: { quizQuestions: { where: { active: true } } },
    });
  });

  it("ignores deleted courses", async () => {
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);

    await assessCoursesById(["c-1"]);

    const arg = prismaMock.lMSCourse.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ deleted: false });
  });
});
