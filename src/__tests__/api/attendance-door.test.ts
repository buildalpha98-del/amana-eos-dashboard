/**
 * Roll-call writes behind the door screen (staff-UX Round 3, 2026-10-09):
 *  - "note" saves a note and nothing else (it used to re-send sign_in,
 *    moving the sign-in time and re-notifying the parent);
 *  - undo / absent clear who handed over, with the times;
 *  - bulk sign-in records who did it and notifies parents only when asked.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 })),
}));
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
const notify = vi.hoisted(() => ({
  sendSignInNotification: vi.fn(() => Promise.resolve()),
  sendSignOutNotification: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/notifications/attendance", () => notify);

import { POST } from "@/app/api/attendance/roll-call/route";
import { POST as BULK } from "@/app/api/attendance/roll-call/bulk/route";

const base = { serviceId: "svc1", childId: "c1", date: "2026-10-09", sessionType: "asc" };

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  mockSession({ id: "u1", name: "Educator", role: "owner", serviceId: "svc1" });
  prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
  prismaMock.dailyAttendance.upsert.mockResolvedValue({});
  prismaMock.attendanceRecord.upsert.mockImplementation((args: { create: { childId: string } }) =>
    Promise.resolve({ id: `rec-${args.create.childId}` }),
  );
});

describe("note", () => {
  it("writes only the note — no new sign-in time, no parent message", async () => {
    prismaMock.attendanceRecord.findUnique.mockResolvedValue({ id: "rec-c1" });
    prismaMock.attendanceRecord.update.mockResolvedValue({ id: "rec-c1" });
    const res = await POST(
      createRequest("POST", "/api/attendance/roll-call", { body: { ...base, action: "note", notes: "Left jumper" } }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.attendanceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notes: "Left jumper" } }),
    );
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
    expect(notify.sendSignInNotification).not.toHaveBeenCalled();
  });

  it("refuses a note for a child with no record yet", async () => {
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/attendance/roll-call", { body: { ...base, action: "note", notes: "x" } }),
    );
    expect(res.status).toBe(400);
  });
});

describe("undo and absent clear the hand-over", () => {
  for (const action of ["undo", "mark_absent"] as const) {
    it(`${action} clears who signed in / out`, async () => {
      await POST(createRequest("POST", "/api/attendance/roll-call", { body: { ...base, action } }));
      const { update } = prismaMock.attendanceRecord.upsert.mock.calls[0][0];
      expect(update).toMatchObject({
        signedInByName: null,
        signedOutByName: null,
        signedInSignature: null,
        signedOutSignature: null,
      });
    });
  }
});

describe("bulk from the door", () => {
  const items = ["c1", "c2"].map((childId) => ({
    childId,
    date: "2026-10-09",
    sessionType: "asc",
    action: "sign_in",
    signedByName: "Collected from class by educators",
  }));

  it("records who did the hand-over and tells the parents", async () => {
    const res = await BULK(
      createRequest("POST", "/api/attendance/roll-call/bulk", { body: { serviceId: "svc1", notify: true, items } }),
    );
    expect(res.status).toBe(200);
    const { update } = prismaMock.attendanceRecord.upsert.mock.calls[0][0];
    expect(update).toMatchObject({ signedInByName: "Collected from class by educators", signedInMethod: "staff" });
    expect(notify.sendSignInNotification).toHaveBeenCalledTimes(2);
  });

  it("stays silent without notify (weekly-grid backfill)", async () => {
    await BULK(createRequest("POST", "/api/attendance/roll-call/bulk", { body: { serviceId: "svc1", items } }));
    expect(notify.sendSignInNotification).not.toHaveBeenCalled();
  });
});

describe("serviceTodayISO", () => {
  it("is the Sydney date, not the UTC one, on a school morning", async () => {
    const { serviceTodayISO } = await import("@/lib/timezone");
    // 7:30am AEDT on Fri 9 Oct = 20:30 UTC on Thu 8 Oct.
    expect(serviceTodayISO(new Date("2026-10-08T20:30:00Z"))).toBe("2026-10-09");
  });
});

describe("getLocalDateParts", () => {
  it("reads Sydney midnight as hour 0, not 24", async () => {
    const { getLocalDateParts } = await import("@/lib/timezone");
    expect(getLocalDateParts(new Date("2026-10-08T13:00:00Z")).hour).toBe(0);
  });
});
