/**
 * The centre-day endpoint behind the educator / coordinator landing page.
 *
 * The rules worth pinning: an educator can only see their own centre,
 * only the centre's ENABLED programmes appear (an unnamed spare room is
 * not a room), "in care" means signed in and not signed out, and a staff
 * member is only "not checked in" once their shift has actually started.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

import { GET } from "@/app/api/services/[id]/dashboard/route";

const ctx = (id = "svc-1") => ({ params: Promise.resolve({ id }) });
const req = () => createRequest("GET", "/api/services/svc-1/dashboard");

/**
 * A shift window that always contains "now", and one that has not started yet.
 *
 * These are only meaningful against a known clock. The suite used to run at
 * whatever the wall time happened to be, so between 23:58 and 23:59 the
 * "LATER" shift had in fact started and the endpoint correctly reported its
 * staff member as not-checked-in — failing the test for two minutes every day.
 * Every test here pins the clock to FIXED_NOW instead; a case that cares about
 * a different hour sets its own time explicitly.
 */
const ALL_DAY = { shiftStart: "00:00", shiftEnd: "23:59" };
const LATER = { shiftStart: "23:58", shiftEnd: "23:59" };

/** Midday, far from any shift boundary in these fixtures. */
const FIXED_NOW = new Date("2026-08-31T12:00:00");

function setup(overrides: Record<string, unknown> = {}) {
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.service.findUnique.mockResolvedValue({
    id: "svc-1",
    name: "Amana at Riverbank",
    code: "RVB",
    capacity: 60,
    // Only "extra1" is named — extra2..4 are unnamed spares.
    sessionTimes: { extra1: { label: "Pupil Free Day" } },
    ...(overrides.service as object),
  });
  prismaMock.attendanceRecord.findMany.mockResolvedValue(
    (overrides.attendance as unknown[]) ?? [],
  );
  prismaMock.booking.findMany.mockResolvedValue(
    (overrides.bookings as unknown[]) ?? [],
  );
  prismaMock.responsiblePersonEntry.findMany.mockResolvedValue(
    (overrides.rp as unknown[]) ?? [],
  );
  prismaMock.rosterShift.findMany.mockResolvedValue(
    (overrides.shifts as unknown[]) ?? [],
  );
  prismaMock.dailyChecklist.findMany.mockResolvedValue(
    (overrides.checklists as unknown[]) ?? [],
  );
  prismaMock.medicationAdministration.count.mockResolvedValue(2);
  prismaMock.booking.count.mockResolvedValue(3);
  prismaMock.incidentRecord.count.mockResolvedValue(0);
  prismaMock.complianceCertificate.count.mockResolvedValue(1);
  prismaMock.shiftHandover.count.mockResolvedValue(0);
}

describe("GET /api/services/[id]/dashboard", () => {
  beforeEach(() => {
    // shouldAdvanceTime keeps async/await working while Date is frozen.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("an educator at another centre is refused", async () => {
    mockSession({
      id: "u-1",
      name: "Educator",
      role: "staff",
      serviceId: "svc-OTHER",
    });
    setup();
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
  });

  it("lists the three core programmes plus named extras only", async () => {
    mockSession({ id: "u-1", name: "Ed", role: "staff", serviceId: "svc-1" });
    setup();
    const body = await (await GET(req(), ctx())).json();
    const keys = body.programmes.map((p: { key: string }) => p.key);
    expect(keys).toEqual(["bsc", "asc", "vc", "extra1"]);
    // The centre's own name for the extra room, not the slot code.
    expect(
      body.programmes.find((p: { key: string }) => p.key === "extra1").name,
    ).toBe("Pupil Free Day");
  });

  it("counts in-care as signed in and not signed out", async () => {
    mockSession({ id: "u-1", name: "Ed", role: "staff", serviceId: "svc-1" });
    setup({
      attendance: [
        {
          childId: "k1",
          sessionType: "asc",
          status: "present",
          signInTime: new Date(),
          signOutTime: null,
          child: { id: "k1", firstName: "Amira", surname: "Doe" },
        },
        {
          // Collected already — not on the floor.
          childId: "k2",
          sessionType: "asc",
          status: "present",
          signInTime: new Date(),
          signOutTime: new Date(),
          child: { id: "k2", firstName: "Abdul", surname: "Doe" },
        },
        {
          childId: "k3",
          sessionType: "asc",
          status: "absent",
          signInTime: null,
          signOutTime: null,
          child: { id: "k3", firstName: "Zara", surname: "Khan" },
        },
      ],
      bookings: [
        { childId: "k1", sessionType: "asc", type: "permanent", status: "confirmed" },
        { childId: "k2", sessionType: "asc", type: "casual", status: "confirmed" },
        { childId: "k3", sessionType: "asc", type: "permanent", status: "confirmed" },
      ],
    });
    const body = await (await GET(req(), ctx())).json();
    const asc = body.programmes.find((p: { key: string }) => p.key === "asc");
    expect(asc.inCare).toBe(1);
    expect(asc.wentHome).toBe(1);
    expect(asc.absent).toBe(1);
    expect(asc.booked).toBe(3);
    expect(asc.casual).toBe(1);
    // Only the child actually on the floor is named.
    expect(asc.children).toEqual([{ id: "k1", name: "Amira Doe" }]);
    expect(body.totals.inCare).toBe(1);
  });

  it("only flags staff as not-checked-in once their shift has started", async () => {
    mockSession({ id: "u-1", name: "Ed", role: "staff", serviceId: "svc-1" });
    setup({
      shifts: [
        {
          id: "s-late",
          staffName: "Sarah",
          role: "educator",
          sessionType: "asc",
          ...ALL_DAY,
          actualStart: null,
          actualEnd: null,
          user: null,
        },
        {
          id: "s-tonight",
          staffName: "Yusuf",
          role: "educator",
          sessionType: "asc",
          ...LATER,
          actualStart: null,
          actualEnd: null,
          user: null,
        },
        {
          id: "s-on",
          staffName: "Mirna",
          role: "coordinator",
          sessionType: "asc",
          ...ALL_DAY,
          actualStart: new Date(),
          actualEnd: null,
          user: { id: "u-2", name: "Mirna K", avatar: null },
        },
      ],
    });
    const body = await (await GET(req(), ctx())).json();
    expect(body.staff.notCheckedIn.map((s: { name: string }) => s.name)).toEqual([
      "Sarah",
    ]);
    // Clocked in and not out → on the floor, under their account name.
    expect(body.staff.onDuty.map((s: { name: string }) => s.name)).toEqual([
      "Mirna K",
    ]);
    expect(body.staff.rosteredToday).toBe(3);
  });

  /**
   * The 23:58-23:59 window that used to break this file. Once that shift HAS
   * started, its staff member genuinely is not-checked-in — the endpoint was
   * always right here; only the test's dependence on wall time was wrong.
   */
  it("flags a late shift as not-checked-in once the clock passes its start", async () => {
    vi.setSystemTime(new Date("2026-08-31T23:58:30"));
    mockSession({ id: "u-1", name: "Ed", role: "staff", serviceId: "svc-1" });
    setup({
      shifts: [
        {
          id: "s-tonight",
          staffName: "Yusuf",
          role: "educator",
          sessionType: "asc",
          ...LATER,
          actualStart: null,
          actualEnd: null,
          user: null,
        },
      ],
    });
    const body = await (await GET(req(), ctx())).json();
    expect(body.staff.notCheckedIn.map((s: { name: string }) => s.name)).toEqual([
      "Yusuf",
    ]);
  });

  it("surfaces the responsible person per programme", async () => {
    mockSession({ id: "u-1", name: "Ed", role: "staff", serviceId: "svc-1" });
    setup({
      rp: [
        { sessionType: "asc", personName: "Mirna K", personRole: "Coordinator" },
      ],
    });
    const body = await (await GET(req(), ctx())).json();
    const asc = body.programmes.find((p: { key: string }) => p.key === "asc");
    const bsc = body.programmes.find((p: { key: string }) => p.key === "bsc");
    expect(asc.leader).toBe("Mirna K");
    // Not set is null, so the UI can prompt rather than invent a name.
    expect(bsc.leader).toBeNull();
  });

  it("counts an open checklist as outstanding, a completed one as done", async () => {
    mockSession({ id: "u-1", name: "Ed", role: "staff", serviceId: "svc-1" });
    setup({
      checklists: [
        { id: "c1", sessionType: "bsc", status: "completed", items: [] },
        { id: "c2", sessionType: "asc", status: "in_progress", items: [] },
        { id: "c3", sessionType: "vc", status: "pending", items: [] },
      ],
    });
    const body = await (await GET(req(), ctx())).json();
    expect(body.attention.checklistsOutstanding).toBe(2);
  });

  it("404s for a service that doesn't exist", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    setup();
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
  });
});
