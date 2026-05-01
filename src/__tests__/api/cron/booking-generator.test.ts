import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
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

const ORIGINAL_ENV = { ...process.env };

describe("/api/cron/booking-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Pin to a Wednesday so day-of-week math is predictable.
    vi.setSystemTime(new Date("2026-05-06T14:00:00Z")); // Wed
    process.env.CRON_SECRET = "test-cron-secret";

    // Cron lock: by default no prior run for this period.
    prismaMock.cronRun.findUnique.mockResolvedValue(null);
    prismaMock.cronRun.create.mockResolvedValue({
      id: "run-1",
      cronName: "booking-generator",
      period: "2026-05-06",
      status: "running",
    });
    prismaMock.cronRun.update.mockResolvedValue({} as never);

    // Default: no children in the DB. Individual tests override.
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.booking.createMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects requests without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/booking-generator/route");
    const res = await GET(
      createRequest("GET", "/api/cron/booking-generator"),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.child.findMany).not.toHaveBeenCalled();
  });

  it("no-ops when the cron has already run for the day", async () => {
    prismaMock.cronRun.findUnique.mockResolvedValue({
      id: "run-old",
      cronName: "booking-generator",
      period: "2026-05-06",
      status: "completed",
      finishedAt: new Date("2026-05-06T12:00:00Z"),
    });

    const { GET } = await import("@/app/api/cron/booking-generator/route");
    const res = await GET(
      createRequest("GET", "/api/cron/booking-generator", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    // Lock-acquisition path returns BEFORE we hit the DB.
    expect(prismaMock.child.findMany).not.toHaveBeenCalled();
    expect(prismaMock.booking.createMany).not.toHaveBeenCalled();
  });

  it("skips children whose status is not active", async () => {
    // Pre-filter happens in the prisma query (where: { status: "active" }) —
    // simulate that by returning only active rows.
    prismaMock.child.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/cron/booking-generator/route");
    const res = await GET(
      createRequest("GET", "/api/cron/booking-generator", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.childrenProcessed).toBe(0);
    expect(body.bookingsCreated).toBe(0);

    // Confirm the where clause filters at the DB.
    const where = prismaMock.child.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("active");
    expect(where.serviceId).toEqual({ not: null });
  });

  it("generates bookings for an active child with permanent ASC Mon/Wed prefs", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      {
        id: "c1",
        serviceId: "svc1",
        bookingPrefs: {
          bookingType: "permanent",
          days: { asc: ["monday", "wednesday"] },
          startDate: "2026-05-01", // before "today"
        },
      },
    ]);

    // The cron passes weeksAhead=2 (HORIZON_DAYS=14 → ceil(14/7)=2).
    // From Wed 2026-05-06 forward, Mon/Wed in the next 2 weeks:
    //   Mon 11, Wed 13, Mon 18 — that's 3 dates. (Today's Wed counts as
    //   start-inclusive; getWeekdayDatesInRange iterates [start, end).)
    prismaMock.booking.createMany.mockResolvedValue({ count: 4 });

    const { GET } = await import("@/app/api/cron/booking-generator/route");
    const res = await GET(
      createRequest("GET", "/api/cron/booking-generator", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.childrenProcessed).toBe(1);
    expect(body.childrenWithPrefs).toBe(1);
    expect(body.bookingsCreated).toBe(4);

    // Confirm createMany was called with skipDuplicates (idempotency).
    const call = prismaMock.booking.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(Array.isArray(call.data)).toBe(true);
    expect(call.data.length).toBeGreaterThan(0);
    // Each generated row must carry the child + service + a permanent type.
    for (const row of call.data) {
      expect(row.childId).toBe("c1");
      expect(row.serviceId).toBe("svc1");
      expect(row.type).toBe("permanent");
      expect(row.status).toBe("confirmed");
    }
  });

  it("skips a child with a casual bookingType (only permanent populates)", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      {
        id: "c1",
        serviceId: "svc1",
        bookingPrefs: {
          bookingType: "casual",
          days: { asc: ["monday", "wednesday"] },
        },
      },
    ]);

    const { GET } = await import("@/app/api/cron/booking-generator/route");
    const res = await GET(
      createRequest("GET", "/api/cron/booking-generator", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.childrenProcessed).toBe(1);
    expect(body.childrenWithPrefs).toBe(0);
    expect(body.bookingsCreated).toBe(0);
    expect(prismaMock.booking.createMany).not.toHaveBeenCalled();
  });

  it("respects a future startDate (no rows for dates before it)", async () => {
    // startDate is 5 days in the future. Generator effectiveStart =
    // max(today, startDate) = startDate, then 2 weeks ahead. Mon 11 is
    // BEFORE startDate(=11)... wait — Mon May 11 IS today + 5 days from
    // a Wed May 6, which equals startDate. The "before startDate" guard
    // is what we want to verify: no dates < 2026-05-11 should appear.
    prismaMock.child.findMany.mockResolvedValue([
      {
        id: "c1",
        serviceId: "svc1",
        bookingPrefs: {
          bookingType: "permanent",
          days: { asc: ["monday", "wednesday"] }, // Wed 6 would otherwise qualify
          startDate: "2026-05-11", // Monday
        },
      },
    ]);
    prismaMock.booking.createMany.mockResolvedValue({ count: 4 });

    const { GET } = await import("@/app/api/cron/booking-generator/route");
    const res = await GET(
      createRequest("GET", "/api/cron/booking-generator", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.childrenWithPrefs).toBe(1);
    expect(body.bookingsCreated).toBe(4);

    // Verify: every generated date is on/after startDate. (Wed 2026-05-06,
    // today, would otherwise have been picked up since it matches the
    // wednesday day-of-week — startDate must filter it out.)
    const start = new Date("2026-05-11T00:00:00Z");
    const data = prismaMock.booking.createMany.mock.calls[0][0].data;
    for (const row of data) {
      expect(new Date(row.date).getTime()).toBeGreaterThanOrEqual(start.getTime());
    }
  });

  it("isolates per-child failures so one bad pref doesn't kill the run", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      {
        id: "good",
        serviceId: "svc1",
        bookingPrefs: {
          bookingType: "permanent",
          days: { asc: ["monday"] },
        },
      },
      {
        id: "bad",
        serviceId: "svc2",
        bookingPrefs: {
          bookingType: "permanent",
          days: { asc: ["monday"] },
        },
      },
    ]);

    // First createMany (for "good") succeeds, second (for "bad") throws.
    prismaMock.booking.createMany
      .mockResolvedValueOnce({ count: 2 })
      .mockRejectedValueOnce(new Error("Connection lost"));

    const { GET } = await import("@/app/api/cron/booking-generator/route");
    const res = await GET(
      createRequest("GET", "/api/cron/booking-generator", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.childrenProcessed).toBe(2);
    expect(body.bookingsCreated).toBe(2); // only the good child's bookings
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].childId).toBe("bad");
  });
});
