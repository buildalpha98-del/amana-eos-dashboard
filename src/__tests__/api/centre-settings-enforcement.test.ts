/**
 * Settings → Sign in & out / Staff (2026-10-08): the switches must change
 * what the server does, not just what the page draws.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/notifications/attendance", () => ({
  sendSignInNotification: vi.fn(() => Promise.resolve()),
  sendSignOutNotification: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/room-resolver", () => ({
  requireRoomId: vi.fn(() => Promise.resolve("room-1")),
}));
vi.mock("@/lib/induction", () => ({
  assertUserCleared: vi.fn(() => Promise.resolve()),
}));

import { POST as rollCall } from "@/app/api/attendance/roll-call/route";
import { POST as shiftClockIn } from "@/app/api/roster/shifts/[id]/clock-in/route";
import { POST as shiftClockOut } from "@/app/api/roster/shifts/[id]/clock-out/route";
import { POST as unscheduled } from "@/app/api/roster/unscheduled-clock-in/route";

function settings(appSettings: unknown) {
  prismaMock.service.findUnique.mockResolvedValue({ appSettings });
}

const signIn = (extra: Record<string, unknown> = {}) =>
  createRequest("POST", "/api/attendance/roll-call", {
    body: {
      serviceId: "svc1",
      childId: "c1",
      date: "2026-10-08",
      sessionType: "asc",
      action: "sign_in",
      signedByName: "Sara Ahmed",
      ...extra,
    },
  });

describe("roll-call sign in/out", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(null);
    prismaMock.attendanceRecord.upsert.mockResolvedValue({ id: "a1" });
    prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
    prismaMock.dailyAttendance.upsert.mockResolvedValue({});
  });

  it("refuses a coordinator writing another centre's roll", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "svc-other" });
    settings({});
    const res = await rollCall(signIn());
    expect(res.status).toBe(403);
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it("refuses a named handover without a signature when the centre requires one", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "svc1" });
    settings({ signInOut: { requireSignature: true } });
    const res = await rollCall(signIn());
    expect(res.status).toBe(400);
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it("accepts it with a signature", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "svc1" });
    settings({ signInOut: { requireSignature: true } });
    const res = await rollCall(signIn({ signature: "data:image/png;base64,AAAA" }));
    expect(res.status).toBe(200);
  });

  it("never asks for one when the setting is off (today's default)", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "svc1" });
    settings({});
    const res = await rollCall(signIn());
    expect(res.status).toBe(200);
  });
});

describe("phone clock-in switch", () => {
  const ctx = { params: Promise.resolve({ id: "shift-1" }) };

  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    mockSession({ id: "u1", name: "E", role: "staff", serviceId: "svc1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue({
      id: "shift-1", userId: "u1", serviceId: "svc1", actualStart: null, actualEnd: null,
    });
    prismaMock.rosterShift.update.mockResolvedValue({ id: "shift-1" });
  });

  it("refuses clock-in from a phone at a kiosk-only centre", async () => {
    settings({ staff: { phoneClockIn: false } });
    const res = await shiftClockIn(createRequest("POST", "/api/roster/shifts/shift-1/clock-in"), ctx as never);
    expect(res.status).toBe(403);
    expect(prismaMock.rosterShift.update).not.toHaveBeenCalled();
  });

  it("refuses clock-out too — clocking out from home is the case that matters", async () => {
    settings({ staff: { phoneClockIn: false } });
    prismaMock.rosterShift.findUnique.mockResolvedValue({
      id: "shift-1", userId: "u1", serviceId: "svc1", actualStart: new Date(), actualEnd: null,
    });
    const res = await shiftClockOut(createRequest("POST", "/api/roster/shifts/shift-1/clock-out"), ctx as never);
    expect(res.status).toBe(403);
  });

  it("refuses an unscheduled clock-in", async () => {
    settings({ staff: { phoneClockIn: false } });
    const res = await unscheduled(createRequest("POST", "/api/roster/unscheduled-clock-in", { body: {} }));
    expect(res.status).toBe(403);
  });

  it("allows clock-in by default", async () => {
    settings({});
    const res = await shiftClockIn(createRequest("POST", "/api/roster/shifts/shift-1/clock-in"), ctx as never);
    expect(res.status).toBe(200);
  });
});
