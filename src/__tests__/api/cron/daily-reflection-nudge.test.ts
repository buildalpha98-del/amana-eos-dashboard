import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});
vi.mock("@/lib/notifications/sendEmail", () => ({
  sendNotificationEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/push/webPush", () => ({
  isWebPushConfigured: vi.fn(() => true),
  sendPush: vi.fn(() => Promise.resolve()),
}));

import { sendNotificationEmail } from "@/lib/notifications/sendEmail";
import { sendPush } from "@/lib/push/webPush";

const ORIGINAL_ENV = { ...process.env };

describe("/api/cron/daily-reflection-nudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Tuesday 07:00 UTC = 5pm AEST
    vi.setSystemTime(new Date("2026-07-07T07:00:00Z"));
    process.env.CRON_SECRET = "test-cron-secret";

    prismaMock.cronRun.findUnique.mockResolvedValue(null);
    prismaMock.cronRun.create.mockResolvedValue({
      id: "run-1",
      cronName: "daily-reflection-nudge",
      status: "running",
    });
    prismaMock.cronRun.update.mockResolvedValue({});

    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.staffReflection.count.mockResolvedValue(0);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.pushSubscription.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  it("401 without cron secret", async () => {
    const { GET } = await import("@/app/api/cron/daily-reflection-nudge/route");
    const res = await GET(createRequest("GET", "/api/cron/daily-reflection-nudge"));
    expect(res.status).toBe(401);
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("skips when the lock is already held", async () => {
    prismaMock.cronRun.findUnique.mockResolvedValue({
      id: "run-old",
      status: "completed",
    });
    const { GET } = await import("@/app/api/cron/daily-reflection-nudge/route");
    const res = await GET(
      createRequest("GET", "/api/cron/daily-reflection-nudge", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("nudges only services with no daily reflection today", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { id: "s-done", name: "Sunny OSHC" },
      { id: "s-missing", name: "Moon OSHC" },
    ]);
    prismaMock.staffReflection.count.mockImplementation(({ where }: { where: { serviceId: string } }) =>
      Promise.resolve(where.serviceId === "s-done" ? 1 : 0),
    );
    prismaMock.user.findMany.mockImplementation(({ where }: { where: { serviceId: string } }) =>
      Promise.resolve(
        where.serviceId === "s-missing"
          ? [
              { id: "u1", name: "Edu One", email: "one@amana.test" },
              { id: "u2", name: "Edu Two", email: "two@amana.test" },
            ]
          : [],
      ),
    );
    prismaMock.pushSubscription.findMany.mockImplementation(({ where }: { where: { userId?: { in?: string[] } } }) =>
      Promise.resolve(
        where.userId?.in?.includes("u1")
          ? [{ id: "ps1", userId: "u1", endpoint: "https://push", p256dh: "k", auth: "a" }]
          : [],
      ),
    );

    const { GET } = await import("@/app/api/cron/daily-reflection-nudge/route");
    const res = await GET(
      createRequest("GET", "/api/cron/daily-reflection-nudge", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.servicesChecked).toBe(2);
    expect(body.servicesMissing).toBe(1);
    expect(sendNotificationEmail).toHaveBeenCalledTimes(2);
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "one@amana.test",
        type: "daily_reflection_nudge",
      }),
    );
    // only u1 has a push subscription
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when every service reflected today", async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: "s1", name: "Sunny" }]);
    prismaMock.staffReflection.count.mockResolvedValue(2);

    const { GET } = await import("@/app/api/cron/daily-reflection-nudge/route");
    const res = await GET(
      createRequest("GET", "/api/cron/daily-reflection-nudge", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await res.json();
    expect(body.servicesMissing).toBe(0);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });
});
