import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
  ),
}));

// Mock logger
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

// Import AFTER mocks are set up
import { POST } from "@/app/api/timesheets/generate-from-timeclock/route";

const WEEK_ENDING = "2026-07-05"; // a Sunday
const weekEndingDate = new Date(WEEK_ENDING);

function shift(
  overrides: Partial<{
    id: string;
    userId: string;
    date: Date;
    sessionType: "bsc" | "asc" | "vc";
    actualStart: Date;
    actualEnd: Date;
  }> = {}
) {
  return {
    id: "shift-1",
    userId: "staff-1",
    date: new Date("2026-06-30"),
    sessionType: "bsc" as const,
    actualStart: new Date("2026-06-30T06:55:00Z"),
    actualEnd: new Date("2026-06-30T09:00:00Z"),
    ...overrides,
  };
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.rosterShift.count.mockResolvedValue(0);
  prismaMock.timesheetEntry.findMany.mockResolvedValue([]);
  prismaMock.timesheetEntry.createMany.mockResolvedValue({ count: 0 });
  prismaMock.employmentContract.findMany.mockResolvedValue([]);
  prismaMock.activityLog.create.mockResolvedValue({});
}

function makeRequest(body: unknown = { serviceId: "svc-1", weekEnding: WEEK_ENDING }) {
  return createRequest("POST", "/api/timesheets/generate-from-timeclock", {
    body,
  });
}

describe("POST /api/timesheets/generate-from-timeclock", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for staff role", async () => {
    mockSession({ id: "u-1", name: "Educator", role: "staff" });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(prismaMock.rosterShift.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 with missing serviceId", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await POST(makeRequest({ weekEnding: WEEK_ENDING }));
    expect(res.status).toBe(400);
  });

  it("returns a friendly summary when no clocked shifts exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findMany.mockResolvedValue([]);
    prismaMock.rosterShift.count.mockResolvedValue(2);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.incomplete).toBe(2);
    expect(body.message).toContain("missing a clock-out");
    expect(prismaMock.timesheet.create).not.toHaveBeenCalled();
  });

  it("creates entries priced from the contract in force on the shift date", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findMany.mockResolvedValue([
      shift(), // 2h05m bsc
      shift({
        id: "shift-2",
        sessionType: "asc",
        date: new Date("2026-07-01"),
        actualStart: new Date("2026-07-01T05:00:00Z"),
        actualEnd: new Date("2026-07-01T08:30:00Z"),
      }),
    ]);
    prismaMock.timesheet.findUnique.mockResolvedValue(null);
    prismaMock.timesheet.create.mockResolvedValue({
      id: "ts-new",
      serviceId: "svc-1",
      weekEnding: weekEndingDate,
      status: "ts_draft",
      deleted: false,
    });
    prismaMock.employmentContract.findMany.mockResolvedValue([
      {
        userId: "staff-1",
        payRate: 32.5,
        startDate: new Date("2026-01-01"),
        endDate: null,
      },
    ]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(body.unpriced).toBe(0);
    expect(body.timesheetId).toBe("ts-new");

    const createManyArg = prismaMock.timesheetEntry.createMany.mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(2);
    expect(createManyArg.data[0]).toMatchObject({
      timesheetId: "ts-new",
      userId: "staff-1",
      shiftType: "shift_bsc",
      payRate: 32.5,
      totalHours: 2.08,
      notes: "Generated from timeclock",
    });
    expect(createManyArg.data[1].shiftType).toBe("shift_asc");
    expect(createManyArg.data[1].totalHours).toBe(3.5);
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });

  it("counts unpriced entries when no contract covers the shift date", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findMany.mockResolvedValue([shift()]);
    prismaMock.timesheet.findUnique.mockResolvedValue(null);
    prismaMock.timesheet.create.mockResolvedValue({
      id: "ts-new",
      status: "ts_draft",
      deleted: false,
    });
    prismaMock.employmentContract.findMany.mockResolvedValue([]);

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.unpriced).toBe(1);
    const createManyArg = prismaMock.timesheetEntry.createMany.mock.calls[0][0];
    expect(createManyArg.data[0].payRate).toBe(null);
  });

  it("is idempotent — skips shifts that already have an entry", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const s = shift();
    prismaMock.rosterShift.findMany.mockResolvedValue([s]);
    prismaMock.timesheet.findUnique.mockResolvedValue({
      id: "ts-existing",
      status: "ts_draft",
      deleted: false,
    });
    prismaMock.timesheetEntry.findMany.mockResolvedValue([
      { userId: s.userId, date: s.date, shiftStart: s.actualStart },
    ]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(1);
    expect(prismaMock.timesheetEntry.createMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the timesheet has left draft", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findMany.mockResolvedValue([shift()]);
    prismaMock.timesheet.findUnique.mockResolvedValue({
      id: "ts-approved",
      status: "approved",
      deleted: false,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(prismaMock.timesheetEntry.createMany).not.toHaveBeenCalled();
  });

  it("skips zero-duration shifts instead of writing nonsense rows", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const t = new Date("2026-06-30T06:55:00Z");
    prismaMock.rosterShift.findMany.mockResolvedValue([
      shift({ actualStart: t, actualEnd: t }),
    ]);
    prismaMock.timesheet.findUnique.mockResolvedValue({
      id: "ts-1",
      status: "ts_draft",
      deleted: false,
    });

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(1);
    expect(prismaMock.timesheetEntry.createMany).not.toHaveBeenCalled();
  });
});
