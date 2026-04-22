import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Mock rate-limit so 429s do not interfere.
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));

// Mock logger.
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

// Mock attendance notifications so the route does not reach the email layer.
vi.mock("@/lib/notifications/attendance", () => ({
  sendSignInNotification: vi.fn(() => Promise.resolve()),
  sendSignOutNotification: vi.fn(() => Promise.resolve()),
}));

// Import AFTER mocks.
import { POST } from "@/app/api/attendance/roll-call/route";

describe("POST /api/attendance/roll-call — DST boundary parsing", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
    prismaMock.dailyAttendance.upsert.mockResolvedValue({});
  });

  it("stores AttendanceRecord.date on the requested calendar day at UTC midnight across the AEDT→AEST DST boundary (2026-04-06)", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    prismaMock.attendanceRecord.upsert.mockResolvedValue({
      id: "att-1",
      childId: "c1",
      serviceId: "svc1",
      date: new Date(Date.UTC(2026, 3, 6)),
      sessionType: "bsc",
      status: "present",
    });

    const res = await POST(
      createRequest("POST", "/api/attendance/roll-call", {
        body: {
          serviceId: "svc1",
          childId: "c1",
          date: "2026-04-06",
          sessionType: "bsc",
          action: "sign_in",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.attendanceRecord.upsert).toHaveBeenCalledOnce();

    const upsertArgs = prismaMock.attendanceRecord.upsert.mock.calls[0][0];

    // The `where` key contains the composite unique key with date
    const whereDate = upsertArgs.where
      .childId_serviceId_date_sessionType.date as Date;
    expect(whereDate).toBeInstanceOf(Date);
    expect(whereDate.toISOString().startsWith("2026-04-06")).toBe(true);
    expect(whereDate.toISOString()).toBe("2026-04-06T00:00:00.000Z");

    // The `create` payload should also hit the right UTC day
    const createDate = upsertArgs.create.date as Date;
    expect(createDate.toISOString().startsWith("2026-04-06")).toBe(true);
    expect(createDate.toISOString()).toBe("2026-04-06T00:00:00.000Z");
  });

  it("rejects a malformed date string with 400", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    const res = await POST(
      createRequest("POST", "/api/attendance/roll-call", {
        body: {
          serviceId: "svc1",
          childId: "c1",
          date: "not-a-date",
          sessionType: "bsc",
          action: "sign_in",
        },
      }),
    );

    expect(res.status).toBe(400);
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
  });
});
