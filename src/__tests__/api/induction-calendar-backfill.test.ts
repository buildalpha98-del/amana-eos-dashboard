/**
 * Training calendar CRUD, induction pipeline, and backfill launcher.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
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

import { GET as CAL_GET, POST as CAL_POST } from "@/app/api/training-calendar/route";
import { GET as PIPE_GET } from "@/app/api/induction/pipeline/route";
import { POST as BACKFILL } from "@/app/api/induction/backfill/route";

function baseMocks() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    return Promise.resolve({ active: true });
  });
}
beforeEach(baseMocks);

describe("training-calendar CRUD", () => {
  it("403 for a non-admin creating a slot", async () => {
    mockSession({ id: "s1", name: "S", role: "staff" });
    const res = await CAL_POST(
      createRequest("POST", "/api/training-calendar", { body: { month: 2, courseId: "c1" } }),
    );
    expect(res.status).toBe(403);
  });

  it("admin upserts a slot", async () => {
    mockSession({ id: "a1", name: "A", role: "admin" });
    prismaMock.trainingCalendarSlot.upsert.mockResolvedValue({ id: "sl1", month: 2, courseId: "c1", active: true });
    const res = await CAL_POST(
      createRequest("POST", "/api/training-calendar", { body: { month: 2, courseId: "c1" } }),
    );
    expect(res.status).toBe(201);
  });

  it("400 for month out of range", async () => {
    mockSession({ id: "a1", name: "A", role: "admin" });
    const res = await CAL_POST(
      createRequest("POST", "/api/training-calendar", { body: { month: 13, courseId: "c1" } }),
    );
    expect(res.status).toBe(400);
  });

  it("GET lists slots (any authed user)", async () => {
    mockSession({ id: "u1", name: "U", role: "staff" });
    prismaMock.trainingCalendarSlot.findMany.mockResolvedValue([
      { id: "sl1", month: 2, courseId: "c1", active: true, course: { id: "c1", title: "X", status: "draft", track: "monthly" } },
    ]);
    const res = await CAL_GET(createRequest("GET", "/api/training-calendar"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});

describe("induction pipeline", () => {
  it("403 for non-admin", async () => {
    mockSession({ id: "s1", name: "S", role: "staff" });
    const res = await PIPE_GET(createRequest("GET", "/api/induction/pipeline"));
    expect(res.status).toBe(403);
  });

  it("returns rows grouped by status with daysInStage", async () => {
    mockSession({ id: "a1", name: "A", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "u1", name: "New Starter", email: "n@x.com", avatar: null,
        inductionStatus: "in_training", inductionDueDate: new Date(), inductionGraceUntil: null,
        updatedAt: new Date(Date.now() - 3 * 86400000), service: { name: "Centre" },
      },
    ]);
    const res = await PIPE_GET(createRequest("GET", "/api/induction/pipeline"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows[0]).toMatchObject({ status: "in_training", serviceName: "Centre" });
    expect(body.rows[0].daysInStage).toBeGreaterThanOrEqual(2);
  });
});

describe("backfill launcher", () => {
  it("403 for admin (only owner/head_office)", async () => {
    mockSession({ id: "a1", name: "A", role: "admin" });
    const res = await BACKFILL(createRequest("POST", "/api/induction/backfill"));
    expect(res.status).toBe(403);
  });

  it("no-op when no essential courses are published", async () => {
    mockSession({ id: "o1", name: "O", role: "owner" });
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);
    const res = await BACKFILL(createRequest("POST", "/api/induction/backfill"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movedToTraining).toBe(0);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("moves uncompleted cleared staff to in_training with grace + enrols them", async () => {
    mockSession({ id: "o1", name: "O", role: "owner" });
    prismaMock.lMSCourse.findMany.mockResolvedValue([{ id: "ess1" }, { id: "ess2" }]);
    // two cleared candidates
    prismaMock.user.findMany.mockResolvedValue([{ id: "v1" }, { id: "v2" }]);
    // v1 already completed ess1 only (still needs ess2); v2 completed none
    prismaMock.lMSEnrollment.findMany
      .mockResolvedValueOnce([{ userId: "v1", courseId: "ess1" }]) // completed set
      // existing enrolments to dedupe: v1 already has an ess1 row (they completed it)
      .mockResolvedValueOnce([{ userId: "v1", courseId: "ess1" }]);
    prismaMock.lMSEnrollment.create.mockResolvedValue({});

    const res = await BACKFILL(createRequest("POST", "/api/induction/backfill"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movedToTraining).toBe(2);
    // v1 needs ess2 (1) + v2 needs ess1,ess2 (2) = 3 enrolments
    expect(body.enrolled).toBe(3);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });
});
