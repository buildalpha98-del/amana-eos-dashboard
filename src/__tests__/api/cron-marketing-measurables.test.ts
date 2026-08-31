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

import { GET } from "@/app/api/cron/marketing-measurables/route";
import { acquireCronLock } from "@/lib/cron-guard";

function authed() {
  return createRequest("GET", "/api/cron/marketing-measurables", {
    headers: { authorization: "Bearer test-secret" },
  });
}

/**
 * Expected weekOf — MUST mirror the auto-measurables computation byte-for-byte
 * (the @@unique([measurableId, weekOf]) key duplicates otherwise).
 */
function expectedWeekOf(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const thisMonday = new Date(now);
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  thisMonday.setDate(now.getDate() + mondayOffset);
  thisMonday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  return lastMonday;
}

function upsertArgFor(measurableId: string) {
  const call = prismaMock.measurableEntry.upsert.mock.calls.find(
    (c: Array<{ where: { measurableId_weekOf: { measurableId: string } } }>) =>
      c[0].where.measurableId_weekOf.measurableId === measurableId,
  );
  return call?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  // Sunday 2026-08-09 20:45 UTC — the real cron slot ("45 20 * * 0").
  vi.setSystemTime(new Date("2026-08-09T20:45:00.000Z"));

  prismaMock.measurable.findMany.mockResolvedValue([]);
  prismaMock.creativeRequest.findMany.mockResolvedValue([]);
  prismaMock.emailEvent.groupBy.mockResolvedValue([]);
  prismaMock.qrScan.count.mockResolvedValue(0);
  prismaMock.parentEnquiry.count.mockResolvedValue(0);
  prismaMock.measurableEntry.upsert.mockResolvedValue({});
});

afterAll(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/marketing-measurables", () => {
  it("401 when CRON_SECRET wrong", async () => {
    const res = await GET(
      createRequest("GET", "/api/cron/marketing-measurables", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.measurable.findMany).not.toHaveBeenCalled();
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
    expect(prismaMock.measurable.findMany).not.toHaveBeenCalled();
  });

  it("completes with zero populated when no measurables match", async () => {
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.populated).toBe(0);
    expect(prismaMock.measurableEntry.upsert).not.toHaveBeenCalled();
    expect(guardComplete).toHaveBeenCalledTimes(1);

    // Fetch is NARROW title-substring matching, case-insensitive.
    const findArg = prismaMock.measurable.findMany.mock.calls[0][0];
    expect(findArg.where.OR).toEqual(
      expect.arrayContaining([
        { title: { contains: "creative request", mode: "insensitive" } },
        { title: { contains: "design request", mode: "insensitive" } },
        { title: { contains: "turnaround", mode: "insensitive" } },
        { title: { contains: "email open", mode: "insensitive" } },
        { title: { contains: "qr scan", mode: "insensitive" } },
        { title: { contains: "marketing enquir", mode: "insensitive" } },
      ]),
    );
  });

  it("populates all five metrics with correct values, weekOf, and upsert args", async () => {
    prismaMock.measurable.findMany.mockResolvedValue([
      // Mixed-case titles prove case-insensitive matching.
      { id: "m-ontime", title: "Creative Requests On-Time %", serviceId: null, ownerId: "u1", goalValue: 90, goalDirection: "above" },
      { id: "m-turn", title: "Design REQUEST Turnaround (business days)", serviceId: null, ownerId: "u1", goalValue: 5, goalDirection: "below" },
      { id: "m-opens", title: "Weekly Email Opens", serviceId: null, ownerId: "u2", goalValue: 100, goalDirection: "above" },
      { id: "m-qr", title: "QR Scans — flyers", serviceId: "svc-1", ownerId: "u2", goalValue: 50, goalDirection: "above" },
      { id: "m-enq", title: "Marketing Enquiries", serviceId: "svc-1", ownerId: "u3", goalValue: 10, goalDirection: "above" },
    ]);
    prismaMock.creativeRequest.findMany.mockResolvedValue([
      // On-time: delivered Aug 5 <= due Aug 6. Turnaround Mon 3rd → Wed 5th = 2 business days.
      {
        createdAt: new Date("2026-08-03T00:00:00.000Z"),
        deliveredAt: new Date("2026-08-05T00:00:00.000Z"),
        dueDate: new Date("2026-08-06T00:00:00.000Z"),
        pausedMs: 0,
      },
      // Late: effective due = Aug 5 + 1d pause = Aug 6 < delivered Aug 7.
      // Turnaround Fri 31 Jul → Fri 7 Aug = 7 calendar − 2 weekend − 1 paused = 4 business days.
      {
        createdAt: new Date("2026-07-31T00:00:00.000Z"),
        deliveredAt: new Date("2026-08-07T00:00:00.000Z"),
        dueDate: new Date("2026-08-05T00:00:00.000Z"),
        pausedMs: 24 * 60 * 60 * 1000,
      },
    ]);
    prismaMock.emailEvent.groupBy.mockResolvedValue([
      { type: "opened", email: "a@example.com" },
      { type: "opened", email: "b@example.com" },
    ]);
    prismaMock.qrScan.count.mockResolvedValue(42);
    prismaMock.parentEnquiry.count.mockResolvedValue(12);

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.populated).toBe(5);
    expect(prismaMock.measurableEntry.upsert).toHaveBeenCalledTimes(5);
    expect(guardComplete).toHaveBeenCalledTimes(1);

    const weekOf = expectedWeekOf();

    // On-time %: 1 of 2 delivered on time → 50, below goal 90 → off track.
    const ontime = upsertArgFor("m-ontime");
    expect(ontime.where.measurableId_weekOf.weekOf.getTime()).toBe(weekOf.getTime());
    expect(ontime.create.weekOf.getTime()).toBe(weekOf.getTime());
    expect(ontime.create.value).toBe(50);
    expect(ontime.create.onTrack).toBe(false);
    expect(ontime.create.enteredById).toBe("u1");
    expect(ontime.create.notes).toBe("Auto-populated from marketing hub data");
    expect(ontime.update).toEqual({
      value: 50,
      onTrack: false,
      notes: "Auto-populated from marketing hub data",
    });

    // Turnaround: avg(2, 4) = 3 business days, <= goal 5 (below) → on track.
    const turn = upsertArgFor("m-turn");
    expect(turn.create.value).toBe(3);
    expect(turn.create.onTrack).toBe(true);

    // Unique opens: 2 distinct emails, below goal 100 → off track.
    const opens = upsertArgFor("m-opens");
    expect(opens.create.value).toBe(2);
    expect(opens.create.onTrack).toBe(false);
    const groupArg = prismaMock.emailEvent.groupBy.mock.calls[0][0];
    expect(groupArg.by).toEqual(["type", "email"]);
    expect(groupArg.where.type).toBe("opened");
    expect(groupArg.where.createdAt.gte).toBeInstanceOf(Date);

    // QR scans: 42, below goal 50 → off track; scoped to the measurable's service.
    const qr = upsertArgFor("m-qr");
    expect(qr.create.value).toBe(42);
    expect(qr.create.onTrack).toBe(false);
    const qrWhere = prismaMock.qrScan.count.mock.calls[0][0].where;
    expect(qrWhere.qrCode).toEqual({ serviceId: "svc-1" });
    expect(qrWhere.scannedAt.gte).toBeInstanceOf(Date);

    // Enquiries: 12 >= goal 10 → on track; scoped + deleted excluded.
    const enq = upsertArgFor("m-enq");
    expect(enq.create.value).toBe(12);
    expect(enq.create.onTrack).toBe(true);
    expect(enq.create.enteredById).toBe("u3");
    const enqWhere = prismaMock.parentEnquiry.count.mock.calls[0][0].where;
    expect(enqWhere.deleted).toBe(false);
    expect(enqWhere.serviceId).toBe("svc-1");
    expect(enqWhere.createdAt.gte).toBeInstanceOf(Date);
  });

  it("does not scope QR/enquiry counts when the measurable has no serviceId", async () => {
    prismaMock.measurable.findMany.mockResolvedValue([
      { id: "m-qr", title: "QR scans", serviceId: null, ownerId: "u1", goalValue: 1, goalDirection: "above" },
      { id: "m-enq", title: "marketing enquiries", serviceId: null, ownerId: "u1", goalValue: 1, goalDirection: "above" },
    ]);
    prismaMock.qrScan.count.mockResolvedValue(3);
    prismaMock.parentEnquiry.count.mockResolvedValue(4);

    await GET(authed());
    expect(prismaMock.qrScan.count.mock.calls[0][0].where.qrCode).toBeUndefined();
    expect(prismaMock.parentEnquiry.count.mock.calls[0][0].where.serviceId).toBeUndefined();
  });

  it("skips request metrics entirely when nothing was delivered this week", async () => {
    prismaMock.measurable.findMany.mockResolvedValue([
      { id: "m-ontime", title: "Creative request on-time %", serviceId: null, ownerId: "u1", goalValue: 90, goalDirection: "above" },
      { id: "m-turn", title: "Design request turnaround", serviceId: null, ownerId: "u1", goalValue: 5, goalDirection: "below" },
    ]);
    prismaMock.creativeRequest.findMany.mockResolvedValue([]);

    const res = await GET(authed());
    const data = await res.json();
    // An empty week isn't 100% or 0% — no entry at all.
    expect(data.populated).toBe(0);
    expect(prismaMock.measurableEntry.upsert).not.toHaveBeenCalled();
    expect(guardComplete).toHaveBeenCalledTimes(1);
  });

  it("ignores a 'turnaround' measurable without request/design in the title", async () => {
    prismaMock.measurable.findMany.mockResolvedValue([
      { id: "m-x", title: "Occupancy turnaround", serviceId: null, ownerId: "u1", goalValue: 5, goalDirection: "below" },
    ]);

    const res = await GET(authed());
    const data = await res.json();
    expect(data.populated).toBe(0);
    expect(prismaMock.measurableEntry.upsert).not.toHaveBeenCalled();
    expect(prismaMock.creativeRequest.findMany).not.toHaveBeenCalled();
  });

  it("fails the guard and 500s when a query throws", async () => {
    prismaMock.measurable.findMany.mockRejectedValue(new Error("db down"));
    const res = await GET(authed());
    expect(res.status).toBe(500);
    expect(guardFail).toHaveBeenCalledTimes(1);
  });
});
