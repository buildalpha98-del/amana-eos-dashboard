/**
 * Rooms reach a family as records.
 *
 * Stage 2 of docs/rooms-migration-plan.md. The parent booking form used
 * to build its options by enumerating the seven enum slots and looking
 * each one up in the centre's JSON, which is why an eighth room could
 * never be offered to a family. This route now sends the rooms
 * themselves, and the properties worth holding are the ones that keep
 * families out of trouble: no staff-only room, no retired room, and
 * never an empty list where the centre plainly has rooms.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

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

const mockParentPayload = {
  email: "parent@test.com",
  name: "Test Parent",
  enrolmentIds: ["enr-1"],
};

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth:
    (handler: (req: Request, ctx: unknown) => unknown) =>
    async (req: Request, routeContext?: unknown) =>
      handler(req, {
        ...((routeContext as object) ?? {}),
        parent: mockParentPayload,
      }),
}));

import { GET } from "@/app/api/parent/centres/route";

const call = async () => {
  const res = await GET(
    createRequest("GET", "/api/parent/centres"),
    undefined as never,
  );
  return res.json();
};

const room = (over: Record<string, unknown> = {}) => ({
  id: "r-asc",
  serviceId: "svc-1",
  legacyKey: "asc",
  name: "Amana Afternoons",
  startTime: "15:00",
  endTime: "18:30",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
    { serviceId: "svc-1", childRecords: [] },
  ]);
  prismaMock.service.findMany.mockResolvedValue([
    {
      id: "svc-1",
      name: "Amana Riverwood",
      code: "RIV",
      address: "1 Test St",
      suburb: "Riverwood",
      state: "NSW",
      postcode: "2210",
      phone: null,
      email: null,
      content: null,
      casualBookingSettings: {
        asc: { enabled: true, days: ["mon", "tue"] },
      },
      sessionTimes: {
        asc: { label: "Amana Afternoons", start: "15:00", end: "18:30" },
      },
    },
  ]);
  prismaMock.room.findMany.mockResolvedValue([room()]);
  prismaMock.document.findMany.mockResolvedValue([]);
});

describe("GET /api/parent/centres — rooms", () => {
  it("sends the centre's rooms as records", async () => {
    const body = await call();
    expect(body.centres[0].rooms).toEqual([
      {
        id: "r-asc",
        legacyKey: "asc",
        name: "Amana Afternoons",
        startTime: "15:00",
        endTime: "18:30",
      },
    ]);
  });

  it("asks the database for neither retired nor staff-only rooms", async () => {
    // Filtered here rather than in the booking form: a family should
    // never be offered either, and a filter the caller has to remember
    // is a filter that will eventually be forgotten.
    await call();
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where).toMatchObject({ archivedAt: null, staffOnly: false });
  });

  it("keeps the centre's own room order", async () => {
    await call();
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
    };
    expect(arg.orderBy[0]).toEqual({ sortOrder: "asc" });
  });

  it("no longer ships the raw sessionTimes JSON", async () => {
    // The whole point of Stage 2 is that callers stop reaching past the
    // room records into the JSON. Leaving it on the payload is an open
    // invitation to do exactly that.
    const body = await call();
    expect(body.centres[0]).not.toHaveProperty("sessionTimes");
  });

  it("still gates casual bookings on what the centre enabled", async () => {
    // Rooms and casual-booking settings are separate objects that drift.
    // Sending every room doesn't widen what's bookable — the form
    // intersects the two, and this route still reports the enabled set.
    const body = await call();
    expect(body.centres[0].casualSessions).toEqual(["asc"]);
  });
});

describe("GET /api/parent/centres — no room records", () => {
  it("derives rooms rather than showing a family nothing", async () => {
    // Every service write path syncs rooms and the Stage 0 backfill
    // covered the rest, so this shouldn't happen. But the sync swallows
    // its failures by design, and the cost of being wrong is a booking
    // form with no programmes on it and no explanation.
    prismaMock.room.findMany.mockResolvedValue([]);
    const body = await call();
    const names = body.centres[0].rooms.map((r: { name: string }) => r.name);
    expect(names).toContain("Amana Afternoons");
    expect(body.centres[0].rooms.length).toBeGreaterThan(0);
  });

  it("marks a derived room as having no record", async () => {
    // Honest about what it is. A synthetic id would resolve to nothing
    // the moment anything tried to use it.
    prismaMock.room.findMany.mockResolvedValue([]);
    const body = await call();
    expect(body.centres[0].rooms[0].id).toBeNull();
  });

  it("leaves retired and staff-only rooms out of the fallback too", async () => {
    prismaMock.room.findMany.mockResolvedValue([]);
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: "svc-1",
        name: "Amana Riverwood",
        code: "RIV",
        address: null,
        suburb: null,
        state: null,
        postcode: null,
        phone: null,
        email: null,
        content: null,
        casualBookingSettings: {},
        sessionTimes: {
          bsc: { label: "Rise and Shine", start: "06:30", end: "09:00" },
          asc: { label: "Old Room", start: "15:00", end: "18:30", disabled: true },
          vc: { label: "Staff Room", start: "07:00", end: "18:00", staffOnly: true },
        },
      },
    ]);
    const body = await call();
    expect(
      body.centres[0].rooms.map((r: { legacyKey: string }) => r.legacyKey),
    ).toEqual(["bsc"]);
  });
});
