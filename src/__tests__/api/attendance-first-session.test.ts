/**
 * "First day" on the roll call and the sign-in screen.
 *
 * The property that matters: the badge has to stay up for the WHOLE of a
 * child's first day. If it disappeared the moment they were signed in,
 * it would vanish exactly when the next educator walks past — which is
 * the person who most needs to know nobody has met this child before.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));

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

vi.mock("@/lib/notifications/attendance", () => ({
  sendSignInNotification: vi.fn(() => Promise.resolve()),
  sendSignOutNotification: vi.fn(() => Promise.resolve()),
}));

import { GET } from "@/app/api/attendance/roll-call/route";

const CHILD = (id: string, firstName: string) => ({
  id,
  firstName,
  surname: "Test",
  photo: null,
  medicalConditions: [],
  dietaryRequirements: null,
  anaphylaxisActionPlan: false,
  medicationDetails: null,
  medical: null,
  dietary: null,
  yearLevel: null,
  custodyArrangements: null,
  allAboutMe: null,
});

function call(query = "serviceId=svc-1&date=2026-08-04&sessionType=asc") {
  return GET(
    createRequest("GET", `/api/attendance/roll-call?${query}`),
    undefined as never,
  );
}

describe("GET /api/attendance/roll-call — first session flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.booking.findMany.mockResolvedValue([
      { childId: "new-kid", type: "permanent", child: CHILD("new-kid", "Amira") },
      { childId: "old-kid", type: "permanent", child: CHILD("old-kid", "Yusuf") },
    ]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
    prismaMock.attendanceRecord.groupBy.mockResolvedValue([
      { childId: "old-kid", _count: { _all: 12 } },
    ]);
  });

  it("rejects an unauthenticated caller", async () => {
    mockNoSession();
    expect((await call()).status).toBe(401);
  });

  it("flags only the child who has never been signed in before", async () => {
    mockSession({ id: "u-1", name: "Coordinator", role: "owner" });
    const res = await call();
    expect(res.status).toBe(200);

    const body = await res.json();
    const byId = Object.fromEntries(
      body.records.map((r: { childId: string; isFirstSession: boolean }) => [
        r.childId,
        r.isFirstSession,
      ]),
    );
    expect(byId["new-kid"]).toBe(true);
    expect(byId["old-kid"]).toBe(false);
  });

  it("only counts days BEFORE today, so the badge survives the sign-in", async () => {
    mockSession({ id: "u-1", name: "Coordinator", role: "owner" });
    await call();

    const where = (prismaMock.attendanceRecord.groupBy as unknown as {
      mock: { calls: { 0: { where: Record<string, unknown> } }[] };
    }).mock.calls[0][0].where;

    // Without `date: { lt: today }` the child's own sign-in this morning
    // would clear the flag mid-shift, exactly when the next educator
    // needs it.
    expect(where.date).toEqual({ lt: new Date("2026-08-04T00:00:00.000Z") });
    // A booking they were marked absent for is not a session attended.
    expect(where.signInTime).toEqual({ not: null });
  });

  it("skips the lookup entirely when nobody is booked", async () => {
    mockSession({ id: "u-1", name: "Coordinator", role: "owner" });
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue([]);

    const res = await call();
    expect(res.status).toBe(200);
    expect(prismaMock.attendanceRecord.groupBy).not.toHaveBeenCalled();
  });

  it("flags a walk-in with no booking too", async () => {
    mockSession({ id: "u-1", name: "Coordinator", role: "owner" });
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue([
      {
        id: "att-1",
        childId: "walk-in",
        status: "signed_in",
        signInTime: new Date(),
        signOutTime: null,
        signedInBy: null,
        signedOutBy: null,
        absenceReason: null,
        notes: null,
        firstDayPhotoSentAt: null,
        firstDayPhotoUrl: null,
      },
    ]);
    prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
    prismaMock.child.findUnique.mockResolvedValue(CHILD("walk-in", "Zayd"));

    const body = await (await call()).json();
    const walkIn = body.records.find(
      (r: { childId: string }) => r.childId === "walk-in",
    );
    // An unbooked child turning up is MORE likely to be a first session,
    // not less — the flag can't be limited to booked rows.
    expect(walkIn?.isFirstSession).toBe(true);
  });
});
