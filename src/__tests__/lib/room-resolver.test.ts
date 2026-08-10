/**
 * The dual-key resolver.
 *
 * What has to hold: a lookup failure never fails the write it decorates
 * (sessionType is still the key every read uses, so a null roomId is a
 * degraded shadow, not a broken record), and the cache never serves one
 * service's room to another.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  resolveRoomId,
  resolveRoomIds,
  stampRoomIds,
  roomKeys,
  _clearRoomCache,
} from "@/lib/room-resolver";
import { logger } from "@/lib/logger";

beforeEach(() => {
  vi.clearAllMocks();
  _clearRoomCache();
  prismaMock.room.findUnique.mockResolvedValue({ id: "room-asc" });
  prismaMock.room.findMany.mockResolvedValue([
    { id: "room-bsc", legacyKey: "bsc" },
    { id: "room-asc", legacyKey: "asc" },
  ]);
});

describe("resolveRoomId", () => {
  it("returns the room for a service and slot", async () => {
    expect(await resolveRoomId("svc-1", "asc")).toBe("room-asc");
  });

  it("looks up on the unique pair, not a scan", async () => {
    await resolveRoomId("svc-1", "asc");
    expect(prismaMock.room.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          serviceId_legacyKey: { serviceId: "svc-1", legacyKey: "asc" },
        },
      }),
    );
  });

  it("returns null for a slot with no room, without throwing", async () => {
    // A real answer, not an error: the write must still succeed, because
    // sessionType is still the key every read uses.
    prismaMock.room.findUnique.mockResolvedValue(null);
    expect(await resolveRoomId("svc-1", "extra4")).toBeNull();
  });

  it("returns null rather than throwing when the lookup fails", async () => {
    // Throwing here would turn a degraded shadow into a family unable to
    // book. The backfill repairs the null later.
    prismaMock.room.findUnique.mockRejectedValue(new Error("db down"));
    expect(await resolveRoomId("svc-1", "asc")).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it("returns null for missing inputs without a query", async () => {
    expect(await resolveRoomId(null, "asc")).toBeNull();
    expect(await resolveRoomId("svc-1", null)).toBeNull();
    expect(prismaMock.room.findUnique).not.toHaveBeenCalled();
  });
});

describe("resolveRoomId — caching", () => {
  it("queries once for repeated lookups", async () => {
    await resolveRoomId("svc-1", "asc");
    await resolveRoomId("svc-1", "asc");
    expect(prismaMock.room.findUnique).toHaveBeenCalledTimes(1);
  });

  it("caches misses too", async () => {
    // Otherwise the service already in trouble — one with an
    // unresolvable slot — pays a query on every single write.
    prismaMock.room.findUnique.mockResolvedValue(null);
    await resolveRoomId("svc-1", "extra4");
    await resolveRoomId("svc-1", "extra4");
    expect(prismaMock.room.findUnique).toHaveBeenCalledTimes(1);
  });

  it("keys by service as well as slot", async () => {
    // The failure this prevents is filing one centre's attendance under
    // another centre's room.
    prismaMock.room.findUnique.mockImplementation((args: unknown) => {
      const { where } = args as {
        where: { serviceId_legacyKey: { serviceId: string } };
      };
      return Promise.resolve({
        id: `room-${where.serviceId_legacyKey.serviceId}`,
      });
    });

    expect(await resolveRoomId("svc-1", "asc")).toBe("room-svc-1");
    expect(await resolveRoomId("svc-2", "asc")).toBe("room-svc-2");
  });
});

describe("resolveRoomIds", () => {
  it("resolves a set of slots in one query", async () => {
    const map = await resolveRoomIds("svc-1", ["bsc", "asc"]);
    expect(map.get("bsc")).toBe("room-bsc");
    expect(map.get("asc")).toBe("room-asc");
    expect(prismaMock.room.findMany).toHaveBeenCalledTimes(1);
  });

  it("deduplicates the slots it asks for", async () => {
    await resolveRoomIds("svc-1", ["asc", "asc", "asc"]);
    const arg = prismaMock.room.findMany.mock.calls[0][0] as {
      where: { legacyKey: { in: string[] } };
    };
    expect(arg.where.legacyKey.in).toEqual(["asc"]);
  });

  it("maps an unmatched slot to null rather than omitting it", async () => {
    // A caller doing `map.get(slot) ?? null` would cope either way, but
    // an absent key and a null one mean different things to a reader.
    const map = await resolveRoomIds("svc-1", ["asc", "extra4"]);
    expect(map.get("extra4")).toBeNull();
  });

  it("survives a failed query", async () => {
    prismaMock.room.findMany.mockRejectedValue(new Error("db down"));
    const map = await resolveRoomIds("svc-1", ["asc"]);
    expect(map.get("asc")).toBeNull();
  });

  it("returns nulls without a query when there is no service", async () => {
    const map = await resolveRoomIds(null, ["asc"]);
    expect(map.get("asc")).toBeNull();
    expect(prismaMock.room.findMany).not.toHaveBeenCalled();
  });
});

describe("roomKeys", () => {
  it("returns both halves together", async () => {
    // Spreading one helper is what stops a call site writing one key
    // without the other.
    expect(await roomKeys("svc-1", "asc")).toEqual({
      sessionType: "asc",
      roomId: "room-asc",
    });
  });
});

describe("stampRoomIds", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    childId: "c-1",
    serviceId: "svc-1",
    date: new Date("2026-08-10"),
    sessionType: "asc" as const,
    ...over,
  });

  it("adds a room to every generated row", async () => {
    const out = await stampRoomIds([row(), row({ childId: "c-2" })]);
    expect(out.every((r) => r.roomId === "room-asc")).toBe(true);
  });

  it("keeps the original fields", async () => {
    const [out] = await stampRoomIds([row()]);
    expect(out).toMatchObject({ childId: "c-1", sessionType: "asc" });
  });

  it("resolves per service when rows span centres", async () => {
    // A generator run covering two services must not file both under
    // the first one's rooms.
    prismaMock.room.findMany.mockImplementation((args: unknown) => {
      const { where } = args as { where: { serviceId: string } };
      return Promise.resolve([
        { id: `room-${where.serviceId}`, legacyKey: "asc" },
      ]);
    });

    const out = await stampRoomIds([row(), row({ serviceId: "svc-2" })]);
    expect(out[0].roomId).toBe("room-svc-1");
    expect(out[1].roomId).toBe("room-svc-2");
  });

  it("is a no-op on an empty list, with no query", async () => {
    expect(await stampRoomIds([])).toEqual([]);
    expect(prismaMock.room.findMany).not.toHaveBeenCalled();
  });
});
