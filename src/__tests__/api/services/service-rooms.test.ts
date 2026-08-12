/**
 * The first Stage 2 read: rooms as records rather than enum slots.
 *
 * The property that matters is what this route DOESN'T do — it never
 * enumerates SESSION_KEYS. A caller rendering its output shows however
 * many rooms a centre has, which is the whole difference between seven
 * fixed slots and a room someone can add.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../../helpers/auth-mock";
import { createRequest } from "../../helpers/request";
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

import { GET } from "@/app/api/services/[id]/rooms/route";

const paramsOf = (id: string) => ({ params: Promise.resolve({ id }) });

const room = (over: Record<string, unknown> = {}) => ({
  id: "r-1",
  name: "Amana Afternoons",
  legacyKey: "asc",
  startTime: "15:00",
  endTime: "18:30",
  capacity: 45,
  ratio: "1:15",
  description: null,
  minAgeYears: null,
  maxAgeYears: null,
  photoUrl: null,
  staffOnly: false,
  archivedAt: null,
  sortOrder: 1,
  ...over,
});

const call = (qs = "", id = "svc-1") =>
  GET(createRequest("GET", `/api/services/${id}/rooms${qs}`), paramsOf(id));

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.service.findUnique.mockResolvedValue({
    id: "svc-1",
    sessionTimes: {
      asc: {
        label: "Amana Afternoons",
        start: "15:00",
        end: "18:30",
        fees: [
          { id: "f-1", name: "Full session", amountCents: 4500 },
          { id: "f-2", name: "Archived rate", amountCents: 4000, archived: true },
        ],
      },
    },
  });
  prismaMock.room.findMany.mockResolvedValue([room()]);
  mockSession({ id: "u-1", name: "Coordinator", role: "member" });
});

describe("GET /api/services/[id]/rooms", () => {
  it("401s when unauthenticated", async () => {
    mockNoSession();
    expect((await call()).status).toBe(401);
  });

  it("404s for a service that doesn't exist", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("returns rooms as records, with no reference to the seven slots", async () => {
    const body = await (await call()).json();
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0]).toMatchObject({
      id: "r-1",
      name: "Amana Afternoons",
      capacity: 45,
      ratio: "1:15",
    });
  });

  it("keeps the legacy key on the payload", async () => {
    // A caller writing a booking still needs the slot until Stage 4
    // drops the sessionType columns, and this is the one place it can
    // get it without going back to the JSON.
    const body = await (await call()).json();
    expect(body.rooms[0].legacyKey).toBe("asc");
  });

  it("orders by the room's own sort order", async () => {
    await call();
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
    };
    expect(arg.orderBy[0]).toEqual({ sortOrder: "asc" });
  });
});

describe("GET /api/services/[id]/rooms — scope", () => {
  it("hides retired rooms by default", async () => {
    // Nothing forward-looking should offer a room that's been retired.
    await call();
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where).toMatchObject({ serviceId: "svc-1", archivedAt: null });
  });

  it("can ask for only the retired ones", async () => {
    await call("?scope=retired");
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      where: { archivedAt: unknown };
    };
    expect(arg.where.archivedAt).toEqual({ not: null });
  });

  it("can ask for everything", async () => {
    await call("?scope=all");
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where).not.toHaveProperty("archivedAt");
  });

  it("400s on a scope that isn't one, rather than ignoring it", async () => {
    // A silently-dropped filter means an unfiltered list gets read as
    // filtered — here, retired rooms shown as if they were bookable.
    expect((await call("?scope=everything")).status).toBe(400);
  });
});

describe("GET /api/services/[id]/rooms — fees", () => {
  it("attaches the room's fees from the JSON that still owns them", async () => {
    const body = await (await call()).json();
    expect(body.rooms[0].fees).toHaveLength(1);
    expect(body.rooms[0].fees[0].name).toBe("Full session");
  });

  it("leaves archived tiers out", async () => {
    // Every caller of this is asking "what can this room be charged at",
    // and an archived rate is precisely one that shouldn't be offered.
    const body = await (await call()).json();
    expect(body.rooms[0].fees.map((f: { id: string }) => f.id)).not.toContain(
      "f-2",
    );
  });

  it("sends retired tiers separately, so a linked one can still be named", async () => {
    // Dropping an archived tier entirely blanks the picker on anything
    // already linked to it, and the next save silently unlinks a live
    // price. It goes in its own field so nothing can mistake it for an
    // option worth offering.
    const body = await (await call()).json();
    expect(body.rooms[0].archivedFees).toHaveLength(1);
    expect(body.rooms[0].archivedFees[0].id).toBe("f-2");
  });

  it("gives a room with no legacy key no fees rather than guessing", async () => {
    // Fees are still keyed by the enum slot. A room the enum never knew
    // about genuinely has none yet — that's Stage 3's RoomFee table.
    prismaMock.room.findMany.mockResolvedValue([
      room({ id: "r-new", name: "Homework Club", legacyKey: null }),
    ]);
    const body = await (await call()).json();
    expect(body.rooms[0].fees).toEqual([]);
  });
});
