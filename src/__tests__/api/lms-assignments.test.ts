import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import { GET, PATCH } from "@/app/api/lms/assignments/route";
import { POST as BULK } from "@/app/api/lms/assignments/bulk/route";

/** An enrolment on a PUBLISHED essential course — counted in compliance. */
const publishedRow = {
  id: "e-1",
  status: "enrolled",
  dueDate: null,
  enrolledAt: new Date("2026-08-01"),
  completedAt: null,
  user: { id: "u-2", name: "Aisha", email: "a@x.com", role: "staff" },
  course: {
    id: "c-1",
    title: "Child Safety & You",
    track: "essential",
    status: "published",
    isRequired: false,
    _count: { modules: 7 },
  },
  _count: { moduleProgress: 0 },
};

/** The case that caused the bug: assigned, visible to the learner, DRAFT. */
const draftRow = {
  ...publishedRow,
  id: "e-2",
  course: { ...publishedRow.course, id: "c-2", title: "The Amana Way", status: "draft" },
  _count: { moduleProgress: 3 },
};

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true } as never);
  mockSession({ id: "u-1", name: "Jayden", role: "admin", serviceId: null });
});

describe("GET /api/lms/assignments", () => {
  it("returns draft-course assignments, flagged as not counted", async () => {
    // This is the whole point: an educator sees these in My Training,
    // and before this endpoint no admin view showed them at all.
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([draftRow] as never);

    const res = await GET(createRequest("GET", "/api/lms/assignments"), {} as never);
    const body = await res.json();

    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0].course.status).toBe("draft");
    expect(body.assignments[0].countedInCompliance).toBe(false);
  });

  it("marks a published required course as counted", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([publishedRow] as never);
    const res = await GET(createRequest("GET", "/api/lms/assignments"), {} as never);
    const body = await res.json();
    expect(body.assignments[0].countedInCompliance).toBe(true);
  });

  it("excludes deleted courses but not draft ones", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([] as never);
    await GET(createRequest("GET", "/api/lms/assignments"), {} as never);

    const where = prismaMock.lMSEnrollment.findMany.mock.calls[0][0].where;
    expect(where.course.deleted).toBe(false);
    expect(where.course.status).toBeUndefined();
  });

  it("computes progress from completed modules", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([draftRow] as never);
    const res = await GET(createRequest("GET", "/api/lms/assignments"), {} as never);
    const body = await res.json();
    // 3 of 7 modules
    expect(body.assignments[0].progressPct).toBe(43);
  });

  it("does not divide by zero for a course with no modules", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      { ...publishedRow, course: { ...publishedRow.course, _count: { modules: 0 } } },
    ] as never);
    const res = await GET(createRequest("GET", "/api/lms/assignments"), {} as never);
    const body = await res.json();
    expect(body.assignments[0].progressPct).toBe(0);
  });

  it("filters by track when asked", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([] as never);
    await GET(
      createRequest("GET", "/api/lms/assignments?track=essential"),
      {} as never,
    );
    const where = prismaMock.lMSEnrollment.findMany.mock.calls[0][0].where;
    expect(where.course.track).toBe("essential");
  });

  it("filters by role when asked", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([] as never);
    await GET(createRequest("GET", "/api/lms/assignments?role=staff"), {} as never);
    const where = prismaMock.lMSEnrollment.findMany.mock.calls[0][0].where;
    expect(where.user.role).toBe("staff");
  });

  it("rejects an unknown track rather than ignoring it", async () => {
    // A silently-ignored filter is worse than an error: the admin reads
    // an unfiltered list as filtered and concludes the wrong thing.
    const res = await GET(
      createRequest("GET", "/api/lms/assignments?track=nonsense"),
      {} as never,
    );
    expect(res.status).toBe(400);
    expect(prismaMock.lMSEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown role rather than ignoring it", async () => {
    const res = await GET(
      createRequest("GET", "/api/lms/assignments?role=wizard"),
      {} as never,
    );
    expect(res.status).toBe(400);
  });

  it("only includes active users", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([] as never);
    await GET(createRequest("GET", "/api/lms/assignments"), {} as never);
    const where = prismaMock.lMSEnrollment.findMany.mock.calls[0][0].where;
    expect(where.user.active).toBe(true);
  });
});

describe("PATCH /api/lms/assignments", () => {
  it("sets a due date", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue({ id: "e-1" } as never);
    prismaMock.lMSEnrollment.update.mockResolvedValue({
      id: "e-1",
      dueDate: new Date("2026-09-01"),
    } as never);

    const res = await PATCH(
      createRequest("PATCH", "/api/lms/assignments", {
        body: { enrollmentId: "e-1", dueDate: "2026-09-01" },
      }),
      {} as never,
    );

    expect(res.status).toBe(200);
    expect(prismaMock.lMSEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e-1" } }),
    );
  });

  it("clears a due date when passed null", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue({ id: "e-1" } as never);
    prismaMock.lMSEnrollment.update.mockResolvedValue({
      id: "e-1",
      dueDate: null,
    } as never);

    await PATCH(
      createRequest("PATCH", "/api/lms/assignments", {
        body: { enrollmentId: "e-1", dueDate: null },
      }),
      {} as never,
    );

    expect(prismaMock.lMSEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dueDate: null } }),
    );
  });

  it("404s for an assignment that doesn't exist", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue(null as never);
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/assignments", {
        body: { enrollmentId: "nope", dueDate: null },
      }),
      {} as never,
    );
    expect(res.status).toBe(404);
  });

  it("rejects a date that isn't a date", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue({ id: "e-1" } as never);
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/assignments", {
        body: { enrollmentId: "e-1", dueDate: "not-a-date" },
      }),
      {} as never,
    );
    expect(res.status).toBe(400);
    expect(prismaMock.lMSEnrollment.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/lms/assignments/bulk", () => {
  it("removes the selected assignments and logs one row each", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      {
        id: "e-1",
        status: "enrolled",
        user: { id: "u-2", name: "Aisha" },
        course: { id: "c-1", title: "Child Safety" },
      },
      {
        id: "e-2",
        status: "in_progress",
        user: { id: "u-3", name: "Omar" },
        course: { id: "c-1", title: "Child Safety" },
      },
    ] as never);
    prismaMock.lMSEnrollment.deleteMany.mockResolvedValue({ count: 2 } as never);
    prismaMock.activityLog.createMany.mockResolvedValue({ count: 2 } as never);

    const res = await BULK(
      createRequest("POST", "/api/lms/assignments/bulk", {
        body: { enrollmentIds: ["e-1", "e-2"] },
      }),
      {} as never,
    );
    const body = await res.json();

    expect(body.removed).toBe(2);
    // One log row per removal — "who took this off whom" can't be
    // answered by a single row saying "removed 2".
    expect(prismaMock.activityLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([]) }),
    );
    expect(
      prismaMock.activityLog.createMany.mock.calls[0][0].data,
    ).toHaveLength(2);
  });

  it("keeps completed enrolments — they are training records", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      {
        id: "e-1",
        status: "completed",
        user: { id: "u-2", name: "Aisha" },
        course: { id: "c-1", title: "Child Safety" },
      },
    ] as never);

    const res = await BULK(
      createRequest("POST", "/api/lms/assignments/bulk", {
        body: { enrollmentIds: ["e-1"] },
      }),
      {} as never,
    );
    const body = await res.json();

    expect(body.removed).toBe(0);
    expect(body.skippedCompleted).toBe(1);
    expect(prismaMock.lMSEnrollment.deleteMany).not.toHaveBeenCalled();
  });

  it("reports ids that no longer exist rather than failing the batch", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      {
        id: "e-1",
        status: "enrolled",
        user: { id: "u-2", name: "Aisha" },
        course: { id: "c-1", title: "Child Safety" },
      },
    ] as never);
    prismaMock.lMSEnrollment.deleteMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.activityLog.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await BULK(
      createRequest("POST", "/api/lms/assignments/bulk", {
        body: { enrollmentIds: ["e-1", "gone"] },
      }),
      {} as never,
    );
    const body = await res.json();

    expect(body.removed).toBe(1);
    expect(body.notFound).toBe(1);
  });

  it("rejects an empty selection", async () => {
    const res = await BULK(
      createRequest("POST", "/api/lms/assignments/bulk", {
        body: { enrollmentIds: [] },
      }),
      {} as never,
    );
    expect(res.status).toBe(400);
  });
});
