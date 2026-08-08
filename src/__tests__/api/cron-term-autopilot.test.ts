import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

const guardComplete = vi.fn(async () => {});
const guardFail = vi.fn(async () => {});
vi.mock("@/lib/cron-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-guard")>("@/lib/cron-guard");
  return {
    ...actual,
    acquireCronLock: vi.fn(async () => ({
      acquired: true,
      complete: guardComplete,
      fail: guardFail,
    })),
  };
});

import { GET } from "@/app/api/cron/term-autopilot/route";
import { acquireCronLock } from "@/lib/cron-guard";
import { logger } from "@/lib/logger";

function authed() {
  return createRequest("GET", "/api/cron/term-autopilot", {
    headers: { authorization: "Bearer test-secret" },
  });
}

/** Route creativeRequest.count between marker checks and number generation. */
function routeCounts({ packedServiceIds = [] as string[] } = {}) {
  prismaMock.creativeRequest.count.mockImplementation(
    async (args: { where: { purpose?: unknown; serviceId?: string } }) => {
      if (args?.where?.purpose) {
        return packedServiceIds.includes(args.where.serviceId as string) ? 1 : 0;
      }
      return prismaMock.creativeRequest.create.mock.calls.length;
    },
  );
}

function createdData() {
  return prismaMock.creativeRequest.create.mock.calls.map(
    (c: Array<{ data: Record<string, unknown> }>) => c[0].data,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  // Wednesday 1 Jul 2026 — Term 3 2026 starts 21 Jul, inside the 4-week window.
  vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));

  routeCounts();
  prismaMock.creativeRequest.create.mockResolvedValue({ id: "req-x" });
  prismaMock.user.findFirst.mockResolvedValue({ id: "mkt-1" });
  prismaMock.user.findMany.mockResolvedValue([{ id: "mkt-1" }, { id: "mkt-2" }]);
  prismaMock.service.findMany.mockResolvedValue([
    { id: "svc-a", name: "Alpha OSHC" },
    { id: "svc-b", name: "Bravo OSHC" },
  ]);
  prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });
});

afterAll(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/term-autopilot", () => {
  it("401 when CRON_SECRET wrong", async () => {
    const res = await GET(
      createRequest("GET", "/api/cron/term-autopilot", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("idempotent — skipped when guard not acquired", async () => {
    vi.mocked(acquireCronLock).mockResolvedValueOnce({
      acquired: false,
      reason: "already complete",
      complete: async () => {},
      fail: async () => {},
    });
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("skips when no term starts within the next 4 weeks", async () => {
    // Mid-Term-1: next start is Term 2 (28 Apr), ~12 weeks away.
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped).toBe("no-term-window");
    expect(prismaMock.creativeRequest.create).not.toHaveBeenCalled();
    expect(guardComplete).toHaveBeenCalledWith({ skipped: "no-term-window" });
  });

  it("skips with a logged error when no active marketing user exists", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped).toBe("no-marketing-user");
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
    expect(prismaMock.creativeRequest.create).not.toHaveBeenCalled();
    expect(guardComplete).toHaveBeenCalledWith({ skipped: "no-marketing-user" });
  });

  it("happy path: creates a 4-request pack per active service + one digest", async () => {
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.created).toBe(8);
    expect(data.services).toBe(2);

    // Active services only.
    expect(prismaMock.service.findMany.mock.calls[0][0].where).toEqual({
      status: "active",
    });
    // Requester = oldest active marketing user.
    expect(prismaMock.user.findFirst.mock.calls[0][0]).toMatchObject({
      where: { role: "marketing", active: true },
      orderBy: { createdAt: "asc" },
    });

    const rows = createdData();
    expect(rows).toHaveLength(8);
    // Sequential count-based numbers — distinct only because creates are
    // sequential (Promise.all would mint duplicates).
    expect(rows.map((r) => r.requestNumber)).toEqual(
      Array.from({ length: 8 }, (_, i) => `REQ-2026-${String(i + 1).padStart(4, "0")}`),
    );
    for (const row of rows) {
      expect(row.purpose).toMatch(/\n\[auto:term-pack:2026-T3\]$/);
      expect(row.requestedById).toBe("mkt-1");
    }
    expect(rows.slice(0, 4).every((r) => r.serviceId === "svc-a")).toBe(true);
    expect(rows.slice(4).every((r) => r.serviceId === "svc-b")).toBe(true);

    // Due dates clamp: termStart(21 Jul) - 7d = 14 Jul is beyond every type's
    // turnaround floor from 1 Jul, so all eight land a week before term.
    for (const row of rows) {
      expect((row.dueDate as Date).getTime()).toBeGreaterThan(Date.now());
    }

    // ONE digest fan-out, not per-request notifications.
    expect(prismaMock.userNotification.createMany).toHaveBeenCalledTimes(1);
    const { data: notifRows } = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(notifRows).toHaveLength(2);
    expect(notifRows.every((n: { type: string }) => n.type === "term_pack_created")).toBe(true);
    expect(notifRows.every((n: { link: string }) => n.link === "/requests")).toBe(true);

    expect(guardComplete).toHaveBeenCalledWith({ created: 8, services: 2 });
  });

  it("partial resume: a service that already has the marker is skipped, the rest run", async () => {
    routeCounts({ packedServiceIds: ["svc-a"] });

    const res = await GET(authed());
    const data = await res.json();
    expect(data.created).toBe(4);
    expect(data.services).toBe(2);

    const rows = createdData();
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.serviceId === "svc-b")).toBe(true);
    expect(guardComplete).toHaveBeenCalledWith({ created: 4, services: 2 });
  });

  it("skips the digest when every service is already packed", async () => {
    routeCounts({ packedServiceIds: ["svc-a", "svc-b"] });

    const res = await GET(authed());
    const data = await res.json();
    expect(data.created).toBe(0);
    expect(prismaMock.creativeRequest.create).not.toHaveBeenCalled();
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
    expect(guardComplete).toHaveBeenCalledWith({ created: 0, services: 2 });
  });

  it("warns when scheduling from approximate term dates (year outside TERM_TABLE)", async () => {
    // 2030 has no exact table entries (table now runs through 2029) —
    // fallback Term 3 starts 21 Jul 2030.
    vi.setSystemTime(new Date("2030-07-01T00:00:00.000Z"));

    const res = await GET(authed());
    expect(res.status).toBe(200);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "term-autopilot using approximate term dates",
      { year: 2030 },
    );
    const rows = createdData();
    expect(rows.length).toBe(8);
    expect(rows[0].purpose).toMatch(/\n\[auto:term-pack:2030-T3\]$/);
  });

  it("fails the guard and 500s when a query throws", async () => {
    prismaMock.service.findMany.mockRejectedValue(new Error("db down"));
    const res = await GET(authed());
    expect(res.status).toBe(500);
    expect(guardFail).toHaveBeenCalledTimes(1);
  });
});
