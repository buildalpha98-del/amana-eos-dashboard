/**
 * The roll opens for a room, not for one of three slots.
 *
 * Stage 2 of docs/rooms-migration-plan.md. Both roll-call handlers used
 * to carry a literal `["bsc","asc","vc"]` — a whitelist on GET and a
 * `z.enum` on POST. The consequence wasn't cosmetic: the write paths
 * have resolved and stored a correct `roomId` since Stage 1, so a centre
 * could have real attendance recorded against an extra room and then be
 * refused when it tried to open that room's roll.
 *
 * What's asserted here is that the ROOM decides — a slot this centre
 * doesn't run is still refused, and now with an answer that says so.
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
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/notifications/attendance", () => ({
  sendSignInNotification: vi.fn(() => Promise.resolve()),
  sendSignOutNotification: vi.fn(() => Promise.resolve()),
}));

import { GET } from "@/app/api/attendance/roll-call/route";

const call = (sessionType: string) =>
  GET(
    createRequest(
      "GET",
      `/api/attendance/roll-call?serviceId=svc-1&date=2026-08-12&sessionType=${sessionType}`,
    ),
    undefined as never,
  );

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.booking.findMany.mockResolvedValue([]);
  prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
  prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
  prismaMock.room.findUnique.mockResolvedValue({
    id: "room-extra1",
    name: "Homework Club",
    archivedAt: null,
  });
  mockSession({ id: "u-1", name: "Director", role: "owner" });
});

describe("GET /api/attendance/roll-call — any room, not three slots", () => {
  it("opens the roll for a room the enum called an extra", async () => {
    // The case that was impossible. Attendance could already exist
    // against this room; the roll simply refused to show it.
    expect((await call("extra1")).status).toBe(200);
  });

  it("still opens for the core programmes", async () => {
    expect((await call("asc")).status).toBe(200);
  });

  it("asks for the room by (service, slot), not by slot alone", async () => {
    // Two centres both have an "extra1". Looking one up without the
    // service would open the wrong centre's roll.
    await call("extra1");
    const arg = prismaMock.room.findUnique.mock.calls[0][0] as {
      where: { serviceId_legacyKey: { serviceId: string; legacyKey: string } };
    };
    expect(arg.where.serviceId_legacyKey).toEqual({
      serviceId: "svc-1",
      legacyKey: "extra1",
    });
  });

  it("404s for a slot this centre doesn't run", async () => {
    // Not a 400 any more: the value is a real session type, it just
    // isn't a room here. Saying "must be bsc, asc or vc" would be
    // actively wrong at a centre running four rooms.
    prismaMock.room.findUnique.mockResolvedValue(null);
    const res = await call("extra4");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/isn't a room at this centre/i);
  });

  it("400s on something that isn't a session type at all", async () => {
    const res = await call("lunchtime");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not a session type/i);
  });

  it("filters bookings and records by that slot", async () => {
    await call("extra1");
    const bookingWhere = (
      prismaMock.booking.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      }
    ).where;
    expect(bookingWhere).toMatchObject({
      serviceId: "svc-1",
      sessionType: "extra1",
    });
  });
});

describe("GET /api/attendance/roll-call — naming the room", () => {
  it("returns the room, so a caller can say whose roll this is", async () => {
    // The read path has never handed back the roomId the write path has
    // been storing since Stage 1. Now it does, with the name attached.
    const body = await (await call("extra1")).json();
    expect(body.room).toEqual({
      id: "room-extra1",
      name: "Homework Club",
      retired: false,
    });
  });

  it("says when the room is retired rather than hiding it", async () => {
    // A retired room's roll still has to open — its historical
    // attendance is a regulatory record. Flagging it beats either
    // refusing or pretending it's current.
    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-old",
      name: "Old Room",
      archivedAt: new Date("2026-01-01"),
    });
    const body = await (await call("extra2")).json();
    expect(body.room.retired).toBe(true);
  });

  it("keeps returning the records and summary alongside", async () => {
    const body = await (await call("asc")).json();
    expect(body).toHaveProperty("records");
    expect(body.summary).toMatchObject({ total: 0, present: 0 });
  });
});
