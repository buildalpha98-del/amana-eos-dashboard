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

const acquireCronLock = vi.fn();
vi.mock("@/lib/cron-guard", () => ({
  acquireCronLock: (name: string, period: string) =>
    acquireCronLock(name, period),
}));

const getOrgSettings = vi.fn();
vi.mock("@/lib/org-settings", () => ({
  getOrgSettings: () => getOrgSettings(),
}));

import { GET } from "@/app/api/cron/scorecard-watchdog/route";

const ORIGINAL_ENV = { ...process.env };

const entry = (onTrack: boolean, weeksAgo: number) => ({
  value: 10,
  onTrack,
  weekOf: new Date(Date.now() - weeksAgo * 7 * 86_400_000),
});

function measurable(overrides: Record<string, unknown> = {}) {
  return {
    id: "meas-1",
    title: "Occupancy %",
    goalValue: 85,
    goalDirection: "above",
    unit: "%",
    ownerId: "u-owner",
    serviceId: "svc-1",
    entries: [entry(false, 1), entry(false, 2), entry(false, 3)],
    ...overrides,
  };
}

const authed = () =>
  createRequest("GET", "/api/cron/scorecard-watchdog", {
    headers: { authorization: "Bearer test-cron-secret" },
  });

describe("/api/cron/scorecard-watchdog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    acquireCronLock.mockResolvedValue({ acquired: true });
    getOrgSettings.mockResolvedValue({ eos: { measurableOffTrackWeeks: 3 } });
    prismaMock.measurable.findMany.mockResolvedValue([measurable()]);
    prismaMock.issue.findFirst.mockResolvedValue(null);
    prismaMock.issue.create.mockResolvedValue({ id: "i-new" });
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("401s without the secret", async () => {
    const res = await GET(createRequest("GET", "/api/cron/scorecard-watchdog"));
    expect(res.status).toBe(401);
  });

  it("raises a high short-term issue after N consecutive off-track weeks", async () => {
    const res = await GET(authed());
    const body = await res.json();
    expect(body.raised).toBe(1);

    const arg = prismaMock.issue.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data.title).toBe("Scorecard off-track 3w: Occupancy %");
    expect(arg.data.priority).toBe("high");
    expect(arg.data.category).toBe("short_term");
    expect(arg.data.measurableId).toBe("meas-1");
    expect(arg.data.ownerId).toBe("u-owner");
    expect(arg.data.serviceId).toBe("svc-1");

    // owner notified in-app
    const notif = prismaMock.userNotification.createMany.mock.calls[0][0] as {
      data: Array<{ userId: string; type: string }>;
    };
    expect(notif.data[0].userId).toBe("u-owner");
    expect(notif.data[0].type).toBe("scorecard_watchdog");
  });

  it("respects the configured week count", async () => {
    getOrgSettings.mockResolvedValue({ eos: { measurableOffTrackWeeks: 4 } });
    // only 3 off-track entries → below the 4-week bar
    const res = await GET(authed());
    expect((await res.json()).raised).toBe(0);
  });

  it("skips measurables with fewer than N entries", async () => {
    prismaMock.measurable.findMany.mockResolvedValue([
      measurable({ entries: [entry(false, 1), entry(false, 2)] }),
    ]);
    const res = await GET(authed());
    expect((await res.json()).raised).toBe(0);
  });

  it("skips when any of the last N weeks was on track", async () => {
    prismaMock.measurable.findMany.mockResolvedValue([
      measurable({ entries: [entry(false, 1), entry(true, 2), entry(false, 3)] }),
    ]);
    const res = await GET(authed());
    expect((await res.json()).raised).toBe(0);
  });

  it("skips while a NON-DELETED open policing issue exists (re-arms on solve)", async () => {
    prismaMock.issue.findFirst.mockResolvedValue({ id: "i-open" });
    const res = await GET(authed());
    expect((await res.json()).raised).toBe(0);

    const where = (prismaMock.issue.findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(where.measurableId).toBe("meas-1");
    expect(where.deleted).toBe(false);
    expect(where.status).toEqual({ in: ["open", "in_discussion"] });
  });
});
