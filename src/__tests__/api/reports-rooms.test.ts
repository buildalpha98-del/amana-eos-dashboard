/**
 * Reports count rooms, not three slots.
 *
 * Stage 2 of docs/rooms-migration-plan.md. Both of these already had
 * the right data — `Booking.roomId` and `AttendanceRecord.roomId` have
 * been NOT NULL since Stage 1 — and both threw it away:
 *
 * - the bookings report grouped by `sessionType` and then re-projected
 *   the result through a literal `["bsc","asc","vc"]`, discarding rooms
 *   the query had already counted;
 * - the attendance report ran that same literal and shipped
 *   `st.toUpperCase()` as the label, so a centre's fourth room was
 *   absent and the rest were named by their filing code.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { _clearRoomNameCache } from "@/lib/room-names";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

import { GET as BOOKINGS } from "@/app/api/reports/bookings/route";
import { GET as ATTENDANCE } from "@/app/api/reports/attendance/route";

const RANGE = "dateFrom=2026-08-01&dateTo=2026-08-31";

const ROOMS = [
  { id: "room-asc", name: "Amana Afternoons" },
  { id: "room-x", name: "Homework Club" },
];

beforeEach(() => {
  _clearUserActiveCache();
  _clearRoomNameCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.room.findMany.mockResolvedValue(ROOMS);
  prismaMock.booking.count.mockResolvedValue(0);
  prismaMock.booking.findMany.mockResolvedValue([]);
  prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
  mockSession({ id: "u-1", name: "Admin", role: "admin" });
});

describe("GET /api/reports/bookings — counted by room", () => {
  beforeEach(() => {
    prismaMock.booking.groupBy.mockImplementation((args: unknown) => {
      const by = (args as { by: string[] }).by;
      if (by.includes("roomId")) {
        return Promise.resolve([
          { roomId: "room-asc", _count: 40 },
          { roomId: "room-x", _count: 7 },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  it("groups by room rather than by slot", async () => {
    await BOOKINGS(
      createRequest("GET", `/api/reports/bookings?${RANGE}`),
      undefined as never,
    );
    const grouped = (
      prismaMock.booking.groupBy.mock.calls as Array<[{ by: string[] }]>
    ).map((c) => c[0].by);
    expect(grouped).toContainEqual(["roomId"]);
    expect(grouped).not.toContainEqual(["sessionType"]);
  });

  it("keeps a room the enum never knew about", async () => {
    // The bug: the query already counted it, and the re-projection
    // through the literal three threw it away.
    const body = await (
      await BOOKINGS(
        createRequest("GET", `/api/reports/bookings?${RANGE}`),
        undefined as never,
      )
    ).json();
    expect(body.bySessionType["Homework Club"]).toBe(7);
  });

  it("names rooms rather than shouting slot codes", async () => {
    const body = await (
      await BOOKINGS(
        createRequest("GET", `/api/reports/bookings?${RANGE}`),
        undefined as never,
      )
    ).json();
    expect(body.bySessionType["Amana Afternoons"]).toBe(40);
    expect(body.bySessionType).not.toHaveProperty("ASC");
  });

  it("sums rooms that share a name across centres", async () => {
    // A group report asking "how many Amana Afternoons bookings" wants
    // one number. Twelve identically-named bars answer nothing.
    prismaMock.room.findMany.mockResolvedValue([
      { id: "room-a", name: "Amana Afternoons" },
      { id: "room-b", name: "Amana Afternoons" },
    ]);
    prismaMock.booking.groupBy.mockResolvedValue([
      { roomId: "room-a", _count: 10 },
      { roomId: "room-b", _count: 5 },
    ]);

    const body = await (
      await BOOKINGS(
        createRequest("GET", `/api/reports/bookings?${RANGE}`),
        undefined as never,
      )
    ).json();
    expect(body.bySessionType["Amana Afternoons"]).toBe(15);
  });
});

describe("GET /api/reports/attendance — counted by room", () => {
  beforeEach(() => {
    prismaMock.booking.groupBy.mockImplementation((args: unknown) => {
      const by = (args as { by: string[] }).by;
      if (by.includes("roomId")) {
        return Promise.resolve([
          { roomId: "room-asc", _count: 30 },
          { roomId: "room-x", _count: 4 },
        ]);
      }
      return Promise.resolve([]);
    });
    prismaMock.attendanceRecord.findMany.mockResolvedValue([
      { roomId: "room-asc", signInTime: new Date(), signOutTime: null },
      { roomId: "room-x", signInTime: new Date(), signOutTime: null },
    ]);
  });

  const call = async () =>
    (
      await ATTENDANCE(
        createRequest("GET", `/api/reports/attendance?${RANGE}`),
        undefined as never,
      )
    ).json();

  it("includes a room the literal three left out", async () => {
    const body = await call();
    const homework = body.bySessionType.find(
      (r: { sessionType: string }) => r.sessionType === "Homework Club",
    );
    expect(homework).toMatchObject({ expected: 4, signedIn: 1 });
  });

  it("names the room instead of upper-casing the slot", async () => {
    const body = await call();
    const names = body.bySessionType.map(
      (r: { sessionType: string }) => r.sessionType,
    );
    expect(names).toContain("Amana Afternoons");
    expect(names).not.toContain("ASC");
  });

  it("takes one grouped query, not one per room", async () => {
    // The shape it replaces ran a count per session; per room that
    // scales with however many rooms a centre adds.
    await call();
    expect(prismaMock.booking.count).toHaveBeenCalledTimes(1);
  });

  it("keeps the whole-report totals intact", async () => {
    const body = await call();
    expect(body.totalSignedIn).toBe(2);
  });
});
