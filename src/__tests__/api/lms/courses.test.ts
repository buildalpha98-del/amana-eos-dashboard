/**
 * LMS course PATCH — the publish/unpublish path used by the admin
 * "Publish" button in LmsCoursesTab.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../../helpers/auth-mock";
import { createRequest } from "../../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { PATCH } from "@/app/api/lms/courses/[id]/route";

const paramsOf = (id: string) => ({ params: Promise.resolve({ id }) });

/** A module a learner can actually work through. */
const goodModule = {
  id: "m-1",
  title: "Reading",
  type: "document",
  content: "x".repeat(600),
  resourceUrl: null,
  documentId: null,
  _count: { quizQuestions: 0 },
};

/** A quiz with nothing to answer — can never be passed. */
const wallModule = {
  id: "m-q",
  title: "Final quiz",
  type: "quiz",
  content: null,
  resourceUrl: null,
  documentId: null,
  _count: { quizQuestions: 0 },
};

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation(() => Promise.resolve({ active: true }));
  // The course exists and is a draft unless a test says otherwise.
  prismaMock.lMSCourse.findUnique.mockResolvedValue({
    status: "draft",
    deleted: false,
  });
  // Readiness assessment: healthy by default.
  prismaMock.lMSCourse.findMany.mockResolvedValue([
    { id: "c1", title: "The Amana Way", status: "draft", modules: [goodModule] },
  ]);
  prismaMock.lMSCourse.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.activityLog.createMany.mockResolvedValue({ count: 1 });
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe("PATCH /api/lms/courses/[id] — publish", () => {
  const publishBody = { status: "published" };

  it("401 when unauthenticated", async () => {
    mockNoSession();
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: publishBody }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a non-admin role (staff)", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: publishBody }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid status value", async () => {
    mockSession({ id: "a1", name: "Admin", role: "admin" });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: { status: "live" } }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(400);
  });

  it("publishes a draft course (admin)", async () => {
    mockSession({ id: "a1", name: "Admin", role: "admin" });
    prismaMock.lMSCourse.update.mockImplementation((args: unknown) => {
      const { where, data } = args as { where: { id: string }; data: Record<string, unknown> };
      return Promise.resolve({
        id: where.id,
        title: "The Amana Way",
        track: "essential",
        ...data,
      });
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: publishBody }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("published");
    expect(prismaMock.lMSCourse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: { status: "published" },
      }),
    );
  });

  it("unpublishes back to draft (head_office)", async () => {
    mockSession({ id: "h1", name: "HO", role: "head_office" });
    prismaMock.lMSCourse.update.mockImplementation((args: unknown) => {
      const { where, data } = args as { where: { id: string }; data: Record<string, unknown> };
      return Promise.resolve({ id: where.id, title: "C2", ...data });
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: { status: "draft" } }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("draft");
  });

  it("404s for a course that doesn't exist", async () => {
    mockSession({ id: "a1", name: "Admin", role: "admin" });
    prismaMock.lMSCourse.findUnique.mockResolvedValue(null);
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/gone", { body: publishBody }),
      paramsOf("gone"),
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/lms/courses/[id] — the readiness gate", () => {
  const publishBody = { status: "published" };

  beforeEach(() => {
    mockSession({ id: "a1", name: "Admin", role: "admin" });
    prismaMock.lMSCourse.findMany.mockResolvedValue([
      {
        id: "c1",
        title: "Emergency Procedures",
        status: "draft",
        modules: [wallModule],
      },
    ]);
  });

  it("409s rather than publishing a course nobody could finish", async () => {
    // This button used to write the status straight through while the
    // bulk panel refused the same change — the safe path was the
    // obscure one.
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: publishBody }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.lMSCourse.update).not.toHaveBeenCalled();
  });

  it("says what is wrong, not just that it refused", async () => {
    // The refusal lands in a toast with nowhere to drill into.
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: publishBody }),
      paramsOf("c1"),
    );
    const body = await res.json();
    expect(body.error).toMatch(/Emergency Procedures/);
    expect(body.error).toMatch(/never be passed/i);
    expect(body.blocked[0].blockers).toHaveLength(1);
  });

  it("publishes anyway when forced", async () => {
    prismaMock.lMSCourse.update.mockResolvedValue({
      id: "c1",
      status: "published",
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", {
        body: { status: "published", force: true },
      }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(200);
  });

  it("never writes `force` to the course row", async () => {
    // It's an instruction to the publish path, not a column.
    prismaMock.lMSCourse.update.mockResolvedValue({ id: "c1" });
    await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", {
        body: { status: "published", force: true },
      }),
      paramsOf("c1"),
    );
    const arg = prismaMock.lMSCourse.update.mock.calls[0][0];
    expect(arg.data).not.toHaveProperty("force");
  });

  it("skips the gate when the course is already published", async () => {
    // Re-saving a live course to edit its title shouldn't re-run the
    // rollout work — or be refused by a blocker that was overridden
    // when it first went live.
    prismaMock.lMSCourse.findUnique.mockResolvedValue({
      status: "published",
      deleted: false,
    });
    prismaMock.lMSCourse.update.mockResolvedValue({ id: "c1", title: "New" });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", {
        body: { title: "New", status: "published" },
      }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.activityLog.createMany).not.toHaveBeenCalled();
  });

  it("leaves unpublishing alone", async () => {
    // Going back to draft disarms the gate; there is nothing to check.
    prismaMock.lMSCourse.update.mockResolvedValue({ id: "c1", status: "draft" });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: { status: "draft" } }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(200);
  });
});
