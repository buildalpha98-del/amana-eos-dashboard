import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

// Mute the structured logger but preserve helpers that withApiHandler uses.
vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

// Control the cron guard directly (auth + lock).
const verifyCronSecret = vi.fn();
const acquireCronLock = vi.fn();
vi.mock("@/lib/cron-guard", () => ({
  verifyCronSecret: (req: unknown) => verifyCronSecret(req),
  acquireCronLock: (name: string, period: string) =>
    acquireCronLock(name, period),
}));

const ORIGINAL_ENV = { ...process.env };

describe("/api/cron/training-monthly", () => {
  const complete = vi.fn().mockResolvedValue(undefined);
  const fail = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Pin to March 2026 (month 3) — AEST is UTC+11 in March.
    vi.setSystemTime(new Date("2026-03-15T02:00:00Z"));
    process.env.CRON_SECRET = "test-cron-secret";

    // Default: auth passes.
    verifyCronSecret.mockReturnValue(null);
    // Default: lock acquired.
    acquireCronLock.mockResolvedValue({ acquired: true, complete, fail });

    // Sensible empty defaults.
    prismaMock.trainingCalendarSlot.findMany.mockResolvedValue([]);
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
    prismaMock.lMSEnrollment.create.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects requests without the cron secret", async () => {
    verifyCronSecret.mockReturnValue({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("@/app/api/cron/training-monthly/route");
    const res = await GET(createRequest("GET", "/api/cron/training-monthly"));
    expect(res.status).toBe(401);
    expect(acquireCronLock).not.toHaveBeenCalled();
    expect(prismaMock.trainingCalendarSlot.findMany).not.toHaveBeenCalled();
  });

  it("no-ops when the lock is not acquired", async () => {
    acquireCronLock.mockResolvedValue({
      acquired: false,
      reason: "already ran this month",
    });

    const { GET } = await import("@/app/api/cron/training-monthly/route");
    const res = await GET(
      createRequest("GET", "/api/cron/training-monthly", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(prismaMock.trainingCalendarSlot.findMany).not.toHaveBeenCalled();
    expect(prismaMock.lMSEnrollment.create).not.toHaveBeenCalled();
  });

  it("enrols cleared active users into this month's monthly courses, skipping existing", async () => {
    // Two slots for the month, one duplicate courseId.
    prismaMock.trainingCalendarSlot.findMany.mockResolvedValue([
      { courseId: "course-a" },
      { courseId: "course-b" },
    ]);
    // Both resolve to published monthly-track courses.
    prismaMock.lMSCourse.findMany.mockResolvedValue([
      { id: "course-a" },
      { id: "course-b" },
    ]);
    // Two cleared active users.
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-1" },
      { id: "user-2" },
    ]);
    // user-1 already enrolled in course-a — must be skipped.
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      { userId: "user-1", courseId: "course-a" },
    ]);

    const { GET } = await import("@/app/api/cron/training-monthly/route");
    const res = await GET(
      createRequest("GET", "/api/cron/training-monthly", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.month).toBe(3);
    // 2 courses × 2 users = 4, minus 1 pre-existing = 3 new enrollments.
    expect(body.enrolled).toBe(3);
    expect(prismaMock.lMSEnrollment.create).toHaveBeenCalledTimes(3);

    // Query filtered to this month's active slots.
    const slotWhere =
      prismaMock.trainingCalendarSlot.findMany.mock.calls[0][0].where;
    expect(slotWhere.month).toBe(3);
    expect(slotWhere.active).toBe(true);

    // Course query filtered to published + monthly + non-deleted.
    const courseWhere = prismaMock.lMSCourse.findMany.mock.calls[0][0].where;
    expect(courseWhere.status).toBe("published");
    expect(courseWhere.track).toBe("monthly");
    expect(courseWhere.deleted).toBe(false);

    // User query filtered to active + cleared.
    const userWhere = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(userWhere.active).toBe(true);
    expect(userWhere.inductionStatus).toBe("cleared");

    // dueDate is the last day of March (31st).
    const created = prismaMock.lMSEnrollment.create.mock.calls[0][0].data;
    expect(created.status).toBe("enrolled");
    expect(new Date(created.dueDate).getDate()).toBe(31);
    expect(new Date(created.dueDate).getMonth()).toBe(2); // March (0-indexed)

    await Promise.resolve();
    expect(complete).toHaveBeenCalledWith({ enrolled: 3 });
  });
});
