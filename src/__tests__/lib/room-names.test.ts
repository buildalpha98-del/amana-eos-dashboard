/**
 * Naming a room from a row that carries its `roomId`.
 *
 * The read-side counterpart to `room-resolver`. What matters here is
 * mostly what it DOESN'T do — it never touches `Service.sessionTimes`,
 * so a room the enum never knew about can be named — plus the two
 * decisions that would quietly corrupt a report if they went the other
 * way: retired rooms must stay in, and an unnameable room must render
 * something rather than nothing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  roomsForService,
  roomsForServices,
  roomNameMap,
  nameOf,
  _clearRoomNameCache,
} from "@/lib/room-names";

const room = (over: Record<string, unknown> = {}) => ({
  id: "r-asc",
  serviceId: "svc-1",
  name: "Amana Afternoons",
  legacyKey: "asc",
  archivedAt: null,
  ...over,
});

beforeEach(() => {
  _clearRoomNameCache();
  vi.clearAllMocks();
  prismaMock.room.findMany.mockResolvedValue([room()]);
});

describe("roomsForService", () => {
  it("returns the service's rooms", async () => {
    const rooms = await roomsForService("svc-1");
    expect(rooms).toHaveLength(1);
    expect(rooms[0].name).toBe("Amana Afternoons");
  });

  it("keeps retired rooms", async () => {
    // This is the READ path for history. A statement from March whose
    // room has since been retired still has to say which room it was —
    // filtering here would blank it.
    await roomsForService("svc-1");
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where).not.toHaveProperty("archivedAt");
  });

  it("orders by the centre's own sort order", async () => {
    await roomsForService("svc-1");
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
    };
    expect(arg.orderBy[0]).toEqual({ sortOrder: "asc" });
  });

  it("never reads the sessionTimes JSON", async () => {
    // The whole point. A room with no legacy key has no JSON entry to
    // look up, so a report built on the JSON can't include it.
    await roomsForService("svc-1");
    expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
  });

  it("caches, so a report doesn't query per row", async () => {
    await roomsForService("svc-1");
    await roomsForService("svc-1");
    await roomsForService("svc-1");
    expect(prismaMock.room.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("roomsForServices", () => {
  it("takes one query for many services, not one each", async () => {
    // The case this exists for: a group report across twelve centres.
    prismaMock.room.findMany.mockResolvedValue([
      room(),
      room({ id: "r-b", serviceId: "svc-2", name: "Bankstown Afternoons" }),
    ]);

    const map = await roomsForServices(["svc-1", "svc-2"]);
    expect(prismaMock.room.findMany).toHaveBeenCalledTimes(1);
    expect(map.get("svc-1")![0].name).toBe("Amana Afternoons");
    expect(map.get("svc-2")![0].name).toBe("Bankstown Afternoons");
  });

  it("gives a service with no rooms an empty list, not a missing key", async () => {
    // A caller doing `map.get(id)!.find(...)` on a missing key throws.
    // An empty list is the honest answer and it doesn't.
    prismaMock.room.findMany.mockResolvedValue([]);
    const map = await roomsForServices(["svc-1"]);
    expect(map.get("svc-1")).toEqual([]);
  });

  it("caches the empty answer too", async () => {
    // Otherwise the one service already in trouble re-queries on every
    // single row of the report.
    prismaMock.room.findMany.mockResolvedValue([]);
    await roomsForServices(["svc-1"]);
    await roomsForServices(["svc-1"]);
    expect(prismaMock.room.findMany).toHaveBeenCalledTimes(1);
  });

  it("only queries the services it hasn't already got", async () => {
    await roomsForService("svc-1");
    prismaMock.room.findMany.mockClear();
    prismaMock.room.findMany.mockResolvedValue([
      room({ id: "r-b", serviceId: "svc-2" }),
    ]);

    await roomsForServices(["svc-1", "svc-2"]);
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      where: { serviceId: { in: string[] } };
    };
    expect(arg.where.serviceId.in).toEqual(["svc-2"]);
  });

  it("de-duplicates a repeated service id", async () => {
    await roomsForServices(["svc-1", "svc-1", "svc-1"]);
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      where: { serviceId: { in: string[] } };
    };
    expect(arg.where.serviceId.in).toEqual(["svc-1"]);
  });
});

describe("roomNameMap / nameOf", () => {
  it("maps room id to name", async () => {
    const map = await roomNameMap("svc-1");
    expect(map.get("r-asc")).toBe("Amana Afternoons");
  });

  it("names a room the enum never knew about", async () => {
    // No legacyKey means no JSON entry — the case the old
    // roomLabel(times, key) path simply cannot express.
    prismaMock.room.findMany.mockResolvedValue([
      room({ id: "r-new", name: "Homework Club", legacyKey: null }),
    ]);
    const map = await roomNameMap("svc-1");
    expect(nameOf(map, "r-new")).toBe("Homework Club");
  });

  it("falls back rather than rendering blank", async () => {
    // A row from before the Stage 1 backfill, or one whose room was
    // hard-deleted, still has to render. "Unknown room" on a statement
    // line is survivable; an empty cell reads as a bug.
    const map = await roomNameMap("svc-1");
    expect(nameOf(map, "r-gone")).toBe("Unknown room");
  });

  it("treats a null room id as unknown, not as a crash", async () => {
    const map = await roomNameMap("svc-1");
    expect(nameOf(map, null)).toBe("Unknown room");
  });

  it("takes a caller's own fallback", async () => {
    const map = await roomNameMap("svc-1");
    expect(nameOf(map, null, "Whole centre")).toBe("Whole centre");
  });

  it("works off a room list as well as a map", async () => {
    const rooms = await roomsForService("svc-1");
    expect(nameOf(rooms, "r-asc")).toBe("Amana Afternoons");
  });
});
