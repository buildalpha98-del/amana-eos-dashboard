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
import { PATCH, DELETE } from "@/app/api/timesheet-entries/[id]/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const makeEntry = (parentStatus: string, over: Record<string, unknown> = {}) => ({
  id: "entry-1",
  timesheetId: "ts-1",
  userId: "staff-1",
  date: new Date("2026-04-15"),
  shiftStart: new Date("2026-04-15T08:00:00"),
  shiftEnd: new Date("2026-04-15T16:00:00"),
  breakMinutes: 30,
  totalHours: 7.5,
  shiftType: "shift_bsc",
  notes: null,
  isOvertime: false,
  payRate: null,
  timesheet: { status: parentStatus },
  ...over,
});

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("PATCH /api/timesheet-entries/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("PATCH", "/api/timesheet-entries/entry-1", {
      body: { notes: "updated" },
    });
    const res = await PATCH(req, ctx("entry-1"));

    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-approver role", async () => {
    mockSession({ id: "user-1", name: "Coord", role: "member" });

    const req = createRequest("PATCH", "/api/timesheet-entries/entry-1", {
      body: { notes: "updated" },
    });
    const res = await PATCH(req, ctx("entry-1"));

    expect(res.status).toBe(403);
  });

  it("returns 400 on an invalid shift type", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "owner" });

    const req = createRequest("PATCH", "/api/timesheet-entries/entry-1", {
      body: { shiftType: "night_shift" },
    });
    const res = await PATCH(req, ctx("entry-1"));

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown entry", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "owner" });

    prismaMock.timesheetEntry.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/timesheet-entries/nope", {
      body: { notes: "updated" },
    });
    const res = await PATCH(req, ctx("nope"));

    expect(res.status).toBe(404);
  });

  it.each(["approved", "exported_to_xero"])(
    "returns 409 when the parent sheet is %s",
    async (parentStatus) => {
      mockSession({ id: "user-1", name: "Admin", role: "owner" });

      prismaMock.timesheetEntry.findUnique.mockResolvedValue(
        makeEntry(parentStatus),
      );

      const req = createRequest("PATCH", "/api/timesheet-entries/entry-1", {
        body: { notes: "updated" },
      });
      const res = await PATCH(req, ctx("entry-1"));

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe(
        "Entries can't be changed on an approved or exported timesheet",
      );
      expect(prismaMock.timesheetEntry.update).not.toHaveBeenCalled();
    },
  );

  it("updates an entry on a submitted sheet and recalculates hours", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "owner" });

    prismaMock.timesheetEntry.findUnique.mockResolvedValue(makeEntry("submitted"));
    prismaMock.timesheetEntry.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...makeEntry("submitted"),
          ...data,
          user: { id: "staff-1", name: "Staff", email: "s@x.com" },
        }),
    );

    const req = createRequest("PATCH", "/api/timesheet-entries/entry-1", {
      body: {
        shiftStart: "2026-04-15T09:00:00",
        shiftEnd: "2026-04-15T17:00:00",
        breakMinutes: 60,
      },
    });
    const res = await PATCH(req, ctx("entry-1"));

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.timesheetEntry.update.mock.calls[0][0];
    expect(updateArgs.data.totalHours).toBe(7); // 8h shift minus 60min break
  });
});

describe("DELETE /api/timesheet-entries/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("DELETE", "/api/timesheet-entries/entry-1");
    const res = await DELETE(req, ctx("entry-1"));

    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown entry", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "owner" });

    prismaMock.timesheetEntry.findUnique.mockResolvedValue(null);

    const req = createRequest("DELETE", "/api/timesheet-entries/nope");
    const res = await DELETE(req, ctx("nope"));

    expect(res.status).toBe(404);
  });

  it.each(["approved", "exported_to_xero"])(
    "returns 409 when the parent sheet is %s",
    async (parentStatus) => {
      mockSession({ id: "user-1", name: "Admin", role: "owner" });

      prismaMock.timesheetEntry.findUnique.mockResolvedValue(
        makeEntry(parentStatus),
      );

      const req = createRequest("DELETE", "/api/timesheet-entries/entry-1");
      const res = await DELETE(req, ctx("entry-1"));

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe(
        "Entries can't be changed on an approved or exported timesheet",
      );
      expect(prismaMock.timesheetEntry.delete).not.toHaveBeenCalled();
    },
  );

  it("deletes an entry on a draft sheet", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "owner" });

    prismaMock.timesheetEntry.findUnique.mockResolvedValue(makeEntry("ts_draft"));
    prismaMock.timesheetEntry.delete.mockResolvedValue(makeEntry("ts_draft"));

    const req = createRequest("DELETE", "/api/timesheet-entries/entry-1");
    const res = await DELETE(req, ctx("entry-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(prismaMock.timesheetEntry.delete).toHaveBeenCalledWith({
      where: { id: "entry-1" },
    });
  });
});
