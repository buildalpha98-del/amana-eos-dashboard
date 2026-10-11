import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { mockArrivalRecords } from "../helpers/attendance-arrival-mock";
import type { AttendanceRecord } from "@prisma/client";
import { attendanceRevision } from "@/lib/attendance-revision";
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

// Defensive mock — bulk route does NOT call these, but a transitive import
// might pull them in. Keep as no-ops so nothing fires email during tests.
vi.mock("@/lib/notifications/attendance", () => ({
  sendSignInNotification: vi.fn(),
  sendSignOutNotification: vi.fn(),
}));

// Import AFTER mocks.
import { POST } from "@/app/api/attendance/roll-call/bulk/route";

function post(body: unknown) {
  return createRequest("POST", "/api/attendance/roll-call/bulk", {
    body: body as Record<string, unknown>,
  });
}

describe("POST /api/attendance/roll-call/bulk", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.child.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);
    mockSession({ id: "u1", name: "Admin", role: "owner", serviceId: "svc1" });
    // Shared prisma-mock handles $transaction callback form by passing the proxy
    // itself as `tx`, so `tx.model.method` routes to the same mock as `prisma.model.method`.
    prismaMock.attendanceRecord.upsert.mockImplementation(
      (args: { create: { childId: string } }) =>
        Promise.resolve({ id: `rec-${args.create.childId}` }),
    );
    prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
    prismaMock.dailyAttendance.upsert.mockResolvedValue({});
    mockArrivalRecords();
  });

  it("401 without session", async () => {
    mockNoSession();
    const res = await POST(post({ serviceId: "svc1", items: [] }));
    expect(res.status).toBe(401);
  });

  it("400 when items empty", async () => {
    const res = await POST(post({ serviceId: "svc1", items: [] }));
    expect(res.status).toBe(400);
  });

  it("400 when items > 100", async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({
      childId: `c${i}`,
      date: "2026-04-24",
      sessionType: "bsc" as const,
      action: "sign_in" as const,
    }));
    const res = await POST(post({ serviceId: "svc1", items }));
    expect(res.status).toBe(400);
  });

  it("400 on invalid action", async () => {
    const res = await POST(
      post({
        serviceId: "svc1",
        items: [
          {
            childId: "c1",
            date: "2026-04-24",
            sessionType: "bsc",
            action: "invalid",
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("200 happy path — 3 items, all succeed", async () => {
    const res = await POST(
      post({
        serviceId: "svc1",
        items: [
          { childId: "c1", date: "2026-04-24", sessionType: "bsc", action: "undo", expectedRevision: null },
          { childId: "c2", date: "2026-04-24", sessionType: "bsc", action: "undo", expectedRevision: null },
          { childId: "c3", date: "2026-04-24", sessionType: "bsc", action: "undo", expectedRevision: null },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(3);
    expect(body.failed).toBe(0);
    expect(prismaMock.attendanceRecord.upsert).toHaveBeenCalledTimes(3);
  });

  it("400 + rollback when the second item fails — no writes after the failing index, no aggregate write", async () => {
    // Second upsert throws. We then assert upsert was called exactly twice
    // (first item succeeded, second threw, loop exits) and — critically —
    // that dailyAttendance.upsert was never called (aggregation runs only
    // after the item loop succeeds; thrown error skips it).
    prismaMock.attendanceRecord.upsert.mockReset();
    prismaMock.attendanceRecord.upsert
      .mockResolvedValueOnce({ id: "rec-c1" })
      .mockImplementationOnce(() => {
        throw new Error("boom");
      });
    const res = await POST(
      post({
        serviceId: "svc1",
        items: [
          { childId: "c1", date: "2026-04-24", sessionType: "bsc", action: "undo", expectedRevision: null },
          { childId: "c2", date: "2026-04-24", sessionType: "bsc", action: "undo", expectedRevision: null },
          { childId: "c3", date: "2026-04-24", sessionType: "bsc", action: "undo", expectedRevision: null }, // must NOT run
        ],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/boom/i);
    // ApiError.badRequest nests details under `.details`, not top-level.
    expect(body.details?.failedIndex).toBe(1);
    expect(prismaMock.attendanceRecord.upsert).toHaveBeenCalledTimes(2); // NOT 3
    expect(prismaMock.dailyAttendance.upsert).not.toHaveBeenCalled();
  });

  it("wraps all writes in $transaction", async () => {
    await POST(
      post({
        serviceId: "svc1",
        items: [
          { childId: "c1", date: "2026-04-24", sessionType: "bsc", action: "undo", expectedRevision: null },
        ],
      }),
    );
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
  describe("overwrites need the version the screen saw", () => {
    const signedIn = {
      id: "rec-c1",
      childId: "c1",
      serviceId: "svc1",
      date: new Date(Date.UTC(2026, 3, 24)),
      sessionType: "bsc" as const,
      status: "present" as const,
      signInTime: new Date("2026-04-23T21:05:00Z"),
    };

    it("book adds a booking but never touches a child already signed in", async () => {
      const rows = mockArrivalRecords([signedIn]);
      const res = await POST(
        post({
          serviceId: "svc1",
          items: [
            { childId: "c1", date: "2026-04-24", sessionType: "bsc", action: "book" },
            { childId: "c2", date: "2026-04-24", sessionType: "bsc", action: "book" },
          ],
        }),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
      const kept = [...rows.values()].find((r) => r.childId === "c1");
      expect(kept).toMatchObject({ status: "present", signInTime: signedIn.signInTime });
      const added = [...rows.values()].find((r) => r.childId === "c2");
      expect(added).toMatchObject({ status: "booked" });
    });

    for (const action of ["undo", "mark_absent"] as const) {
      it(`${action} without a version is refused for the whole batch`, async () => {
        mockArrivalRecords([signedIn]);
        const res = await POST(
          post({
            serviceId: "svc1",
            items: [{ childId: "c1", date: "2026-04-24", sessionType: "bsc", action }],
          }),
        );
        expect(res.status).toBe(409);
        expect((await res.json()).details?.failedIndex).toBe(0);
        expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
        expect(prismaMock.dailyAttendance.upsert).not.toHaveBeenCalled();
      });

      it(`${action} from a stale screen can't erase a sign-in made since`, async () => {
        mockArrivalRecords([signedIn]);
        const res = await POST(
          post({
            serviceId: "svc1",
            items: [{ childId: "c1", date: "2026-04-24", sessionType: "bsc", action, expectedRevision: null }],
          }),
        );
        expect(res.status).toBe(409);
        expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
      });

      it(`${action} applies when the version matches`, async () => {
        mockArrivalRecords([signedIn]);
        const res = await POST(
          post({
            serviceId: "svc1",
            items: [{
              childId: "c1", date: "2026-04-24", sessionType: "bsc", action,
              expectedRevision: attendanceRevision(signedIn as AttendanceRecord),
            }],
          }),
        );
        expect(res.status).toBe(200);
        expect(prismaMock.attendanceRecord.upsert).toHaveBeenCalledTimes(1);
      });
    }
  });
});
