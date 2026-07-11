import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

const verifyCronSecret = vi.fn();
const acquireCronLock = vi.fn();
vi.mock("@/lib/cron-guard", () => ({
  verifyCronSecret: (req: unknown) => verifyCronSecret(req),
  acquireCronLock: (name: string, period: string) =>
    acquireCronLock(name, period),
}));

const sendTrainingReminders = vi.fn();
vi.mock("@/lib/training-compliance", () => ({
  sendTrainingReminders: () => sendTrainingReminders(),
}));

describe("/api/cron/training-reminders", () => {
  const complete = vi.fn().mockResolvedValue(undefined);
  const fail = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronSecret.mockReturnValue(null);
    acquireCronLock.mockResolvedValue({ acquired: true, complete, fail });
    sendTrainingReminders.mockResolvedValue({
      staffReminded: 3,
      overdueCourses: 4,
      emailsSent: 4,
      emailsSuppressed: 0,
    });
  });

  it("rejects requests without the cron secret", async () => {
    verifyCronSecret.mockReturnValue({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { GET } = await import("@/app/api/cron/training-reminders/route");
    const res = await GET(createRequest("GET", "/api/cron/training-reminders"));
    expect(res.status).toBe(401);
    expect(acquireCronLock).not.toHaveBeenCalled();
    expect(sendTrainingReminders).not.toHaveBeenCalled();
  });

  it("no-ops when the lock is not acquired", async () => {
    acquireCronLock.mockResolvedValue({ acquired: false, reason: "ran already" });
    const { GET } = await import("@/app/api/cron/training-reminders/route");
    const res = await GET(
      createRequest("GET", "/api/cron/training-reminders", {
        headers: { authorization: "Bearer test" },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBe(true);
    expect(sendTrainingReminders).not.toHaveBeenCalled();
  });

  it("sends reminders and completes the lock with the result", async () => {
    const { GET } = await import("@/app/api/cron/training-reminders/route");
    const res = await GET(
      createRequest("GET", "/api/cron/training-reminders", {
        headers: { authorization: "Bearer test" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staffReminded).toBe(3);
    expect(body.overdueCourses).toBe(4);
    expect(complete).toHaveBeenCalledWith({
      staffReminded: 3,
      overdueCourses: 4,
      emailsSent: 4,
      emailsSuppressed: 0,
    });
    expect(acquireCronLock).toHaveBeenCalledWith("training-reminders", "weekly");
  });

  it("fails the lock and 500s when the send throws", async () => {
    sendTrainingReminders.mockRejectedValue(new Error("smtp down"));
    const { GET } = await import("@/app/api/cron/training-reminders/route");
    const res = await GET(
      createRequest("GET", "/api/cron/training-reminders", {
        headers: { authorization: "Bearer test" },
      }),
    );
    expect(res.status).toBe(500);
    expect(fail).toHaveBeenCalled();
  });
});
