/**
 * The completed-training register.
 *
 * The things worth pinning down: it returns COMPLETED rows (the
 * compliance report is the opposite query), the date range covers the
 * whole of its last day, "late" is only claimed when both dates exist,
 * and the summary counts people rather than rows.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../../helpers/auth-mock";
import { createRequest } from "../../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

import { GET } from "@/app/api/lms/training-records/route";

const auburn = { id: "s-1", name: "Amana Auburn" };

const row = (over: Record<string, unknown> = {}) => ({
  id: "e-1",
  completedAt: new Date("2026-07-10T02:00:00.000Z"),
  enrolledAt: new Date("2026-06-01T00:00:00.000Z"),
  dueDate: new Date("2026-07-31T00:00:00.000Z"),
  score: 90,
  user: {
    id: "u-1",
    name: "Aisha Khan",
    email: "a@x.com",
    role: "staff",
    service: auburn,
  },
  course: { id: "c-1", title: "Child Safety", track: "essential" },
  ...over,
});

const call = (qs = "") =>
  GET(createRequest("GET", `/api/lms/training-records${qs}`));

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.lMSEnrollment.findMany.mockResolvedValue([row()]);
  mockSession({ id: "a1", name: "Admin", role: "admin" });
});

describe("GET /api/lms/training-records — access", () => {
  it("401 when unauthenticated", async () => {
    mockNoSession();
    expect((await call()).status).toBe(401);
  });

  it("403 for an educator", async () => {
    // Other people's training records are not staff-visible.
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    expect((await call()).status).toBe(403);
  });
});

describe("GET /api/lms/training-records — what it queries", () => {
  it("asks for completed enrolments, not outstanding ones", async () => {
    // The compliance report is `status: { not: "completed" }`. This is
    // the other half, and nothing else answered it.
    await call();
    const arg = prismaMock.lMSEnrollment.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe("completed");
  });

  it("filters on the staff member's centre", async () => {
    await call("?serviceId=s-1");
    const arg = prismaMock.lMSEnrollment.findMany.mock.calls[0][0];
    expect(arg.where.user).toMatchObject({ active: true, serviceId: "s-1" });
  });

  it("filters by training type", async () => {
    await call("?track=essential");
    const arg = prismaMock.lMSEnrollment.findMany.mock.calls[0][0];
    expect(arg.where.course).toMatchObject({ track: "essential" });
  });

  it("400s on an unknown training type rather than ignoring it", async () => {
    // A silently-dropped filter means an unfiltered list gets read as
    // filtered, and the wrong conclusion drawn about who has what.
    const res = await call("?track=mandatory");
    expect(res.status).toBe(400);
  });

  it("excludes deleted courses and deactivated staff", async () => {
    await call();
    const arg = prismaMock.lMSEnrollment.findMany.mock.calls[0][0];
    expect(arg.where.course).toMatchObject({ deleted: false });
    expect(arg.where.user).toMatchObject({ active: true });
  });
});

describe("GET /api/lms/training-records — the date range", () => {
  it("covers the whole of the last day", async () => {
    // A bare YYYY-MM-DD parses to midnight; an exclusive bound would
    // drop everything completed on the last day someone asked for.
    await call("?from=2026-07-01&to=2026-07-31");
    const arg = prismaMock.lMSEnrollment.findMany.mock.calls[0][0];
    const lte = arg.where.completedAt.lte as Date;
    expect(lte.toISOString()).toBe("2026-07-31T23:59:59.999Z");
    expect((arg.where.completedAt.gte as Date).toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("accepts an open-ended range", async () => {
    await call("?from=2026-07-01");
    const arg = prismaMock.lMSEnrollment.findMany.mock.calls[0][0];
    expect(arg.where.completedAt.gte).toBeInstanceOf(Date);
    expect(arg.where.completedAt.lte).toBeUndefined();
  });

  it("400s on a backwards range", async () => {
    const res = await call("?from=2026-08-01&to=2026-07-01");
    expect(res.status).toBe(400);
  });

  it("400s on a date that isn't one", async () => {
    expect((await call("?from=last%20tuesday")).status).toBe(400);
  });

  it("applies no date filter when neither bound is given", async () => {
    await call();
    const arg = prismaMock.lMSEnrollment.findMany.mock.calls[0][0];
    expect(arg.where.completedAt).toBeUndefined();
  });
});

describe("GET /api/lms/training-records — lateness", () => {
  it("marks a completion after the due date as late", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      row({
        completedAt: new Date("2026-08-05T00:00:00.000Z"),
        dueDate: new Date("2026-07-31T00:00:00.000Z"),
      }),
    ]);
    const body = await (await call()).json();
    expect(body.records[0].completedLate).toBe(true);
    expect(body.summary.late).toBe(1);
  });

  it("says nothing when there was no due date", async () => {
    // Null is "can't tell". Reporting it as on time would be inventing
    // evidence a regulator might rely on.
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      row({ dueDate: null }),
    ]);
    const body = await (await call()).json();
    expect(body.records[0].completedLate).toBeNull();
    expect(body.summary.late).toBe(0);
  });

  it("says nothing when the completion has no date", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      row({ completedAt: null }),
    ]);
    const body = await (await call()).json();
    expect(body.records[0].completedLate).toBeNull();
  });
});

describe("GET /api/lms/training-records — the summary", () => {
  it("counts people, not rows", async () => {
    // One person finishing four courses is one person.
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      row({ id: "e-1", course: { id: "c-1", title: "A", track: "essential" } }),
      row({ id: "e-2", course: { id: "c-2", title: "B", track: "essential" } }),
    ]);
    const body = await (await call()).json();
    expect(body.summary.completions).toBe(2);
    expect(body.summary.staff).toBe(1);
    expect(body.summary.courses).toBe(2);
  });

  it("averages over scored rows only", async () => {
    // A course with no quiz has no score; counting it as zero would
    // drag the average down for doing nothing wrong.
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      row({ id: "e-1", score: 80 }),
      row({ id: "e-2", score: null }),
    ]);
    const body = await (await call()).json();
    expect(body.summary.averageScore).toBe(80);
  });

  it("reports no average when nothing was scored", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([row({ score: null })]);
    const body = await (await call()).json();
    expect(body.summary.averageScore).toBeNull();
  });

  it("counts undated completions so the date filter isn't misread", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      row({ id: "e-1" }),
      row({ id: "e-2", completedAt: null }),
    ]);
    const body = await (await call()).json();
    expect(body.summary.undated).toBe(1);
  });

  it("is empty-safe", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
    const body = await (await call()).json();
    expect(body.records).toEqual([]);
    expect(body.summary).toMatchObject({
      completions: 0,
      staff: 0,
      averageScore: null,
      truncated: false,
    });
  });
});
