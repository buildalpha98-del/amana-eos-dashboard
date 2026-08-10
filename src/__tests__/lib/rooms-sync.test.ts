/**
 * Writing and checking the shadow table.
 *
 * Two properties carry Stage 0: the sync converges (it runs on every
 * deploy and after every settings save, so a non-idempotent one would
 * churn or duplicate), and the reconciliation actually catches drift —
 * because nothing reads these rows yet, so nothing else will notice.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  syncRoomsFromSessionTimes,
  syncRoomsQuietly,
  reconcileRooms,
  backfillRooms,
} from "@/lib/rooms";
import { logger } from "@/lib/logger";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.room.findMany.mockResolvedValue([]);
  prismaMock.room.create.mockResolvedValue({ id: "r-new" });
  prismaMock.room.update.mockResolvedValue({ id: "r-1" });
});

describe("syncRoomsFromSessionTimes — first run", () => {
  it("creates the three core rooms for an unconfigured service", async () => {
    const res = await syncRoomsFromSessionTimes("svc-1", null);
    expect(res.created).toBe(3);
    expect(res.updated).toBe(0);
    expect(prismaMock.room.create).toHaveBeenCalledTimes(3);
  });

  it("stamps the service and the legacy key on each", async () => {
    await syncRoomsFromSessionTimes("svc-1", null);
    const keys = prismaMock.room.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { legacyKey: string } }).data.legacyKey,
    );
    expect(keys).toEqual(["bsc", "asc", "vc"]);
    expect(prismaMock.room.create.mock.calls[0][0].data.serviceId).toBe("svc-1");
  });

  it("dates the retirement of a room that arrives disabled", async () => {
    await syncRoomsFromSessionTimes("svc-1", {
      vc: { label: "Holidays", start: "07:00", end: "18:00", disabled: true },
    });
    const vc = prismaMock.room.create.mock.calls.find(
      (c: unknown[]) =>
        (c[0] as { data: { legacyKey: string } }).data.legacyKey === "vc",
    );
    expect(vc?.[0].data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("syncRoomsFromSessionTimes — running again", () => {
  const existing = [
    { id: "r-bsc", legacyKey: "bsc", archivedAt: null },
    { id: "r-asc", legacyKey: "asc", archivedAt: null },
    { id: "r-vc", legacyKey: "vc", archivedAt: null },
  ];

  it("updates rather than duplicating", async () => {
    // It runs on every deploy. A second pass that created rows again
    // would break the unique constraint at best and duplicate at worst.
    prismaMock.room.findMany.mockResolvedValue(existing);
    const res = await syncRoomsFromSessionTimes("svc-1", null);
    expect(res.created).toBe(0);
    expect(res.updated).toBe(3);
    expect(prismaMock.room.create).not.toHaveBeenCalled();
  });

  it("adds only the room that is new", async () => {
    prismaMock.room.findMany.mockResolvedValue(existing);
    const res = await syncRoomsFromSessionTimes("svc-1", {
      extra1: { label: "Homework Club", start: "15:00", end: "17:00" },
    });
    expect(res.created).toBe(1);
    expect(prismaMock.room.create.mock.calls[0][0].data.legacyKey).toBe(
      "extra1",
    );
  });
});

describe("syncRoomsFromSessionTimes — the retirement timestamp", () => {
  it("keeps the original date when a room stays retired", async () => {
    // Re-stamping on every sync would make "when did this room close"
    // read as today, forever — the question it exists to answer would
    // be answered wrongly by the act of asking it.
    const closed = new Date("2026-03-01T00:00:00.000Z");
    prismaMock.room.findMany.mockResolvedValue([
      { id: "r-vc", legacyKey: "vc", archivedAt: closed },
    ]);

    await syncRoomsFromSessionTimes("svc-1", {
      vc: { label: "Holidays", start: "07:00", end: "18:00", disabled: true },
    });

    const call = prismaMock.room.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { where: { id: string } }).where.id === "r-vc",
    );
    expect((call?.[0] as { data: { archivedAt: Date } }).data.archivedAt).toBe(
      closed,
    );
  });

  it("clears it when a room is brought back", async () => {
    prismaMock.room.findMany.mockResolvedValue([
      { id: "r-vc", legacyKey: "vc", archivedAt: new Date() },
    ]);
    await syncRoomsFromSessionTimes("svc-1", null);
    const call = prismaMock.room.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { where: { id: string } }).where.id === "r-vc",
    );
    expect(
      (call?.[0] as { data: { archivedAt: Date | null } }).data.archivedAt,
    ).toBeNull();
  });
});

describe("syncRoomsFromSessionTimes — orphans", () => {
  it("reports a room the JSON no longer describes", async () => {
    prismaMock.room.findMany.mockResolvedValue([
      { id: "r-e1", legacyKey: "extra1", archivedAt: null },
    ]);
    const res = await syncRoomsFromSessionTimes("svc-1", null);
    expect(res.orphaned).toBe(1);
  });

  it("never deletes one", async () => {
    // It may have attendance recorded against it; the row is the only
    // description of what those records referred to.
    prismaMock.room.findMany.mockResolvedValue([
      { id: "r-e1", legacyKey: "extra1", archivedAt: null },
    ]);
    await syncRoomsFromSessionTimes("svc-1", null);
    expect(prismaMock.room.delete).not.toHaveBeenCalled();
    expect(prismaMock.room.deleteMany).not.toHaveBeenCalled();
  });
});

describe("syncRoomsQuietly", () => {
  it("swallows a failure so the settings save still stands", async () => {
    // The JSON write has already succeeded and IS the truth. A drifted
    // shadow is repaired by the next backfill; a rolled-back save is a
    // person's work thrown away.
    prismaMock.room.findMany.mockRejectedValue(new Error("db down"));
    await expect(syncRoomsQuietly("svc-1", null)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it("warns about orphans rather than staying silent", async () => {
    prismaMock.room.findMany.mockResolvedValue([
      { id: "r-e1", legacyKey: "extra1", archivedAt: null },
    ]);
    await syncRoomsQuietly("svc-1", null);
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("reconcileRooms", () => {
  const service = (over: Record<string, unknown> = {}) => ({
    id: "svc-1",
    name: "Amana Auburn",
    sessionTimes: null,
    rooms: [
      {
        legacyKey: "bsc", name: "Rise and Shine", startTime: "06:30",
        endTime: "09:00", capacity: null, ratio: null, staffOnly: false,
        archivedAt: null,
      },
      {
        legacyKey: "asc", name: "Amana Afternoons", startTime: "15:00",
        endTime: "18:30", capacity: null, ratio: null, staffOnly: false,
        archivedAt: null,
      },
      {
        legacyKey: "vc", name: "Holiday Quest", startTime: "07:00",
        endTime: "18:00", capacity: null, ratio: null, staffOnly: false,
        archivedAt: null,
      },
    ],
    ...over,
  });

  it("passes a service whose rooms match its JSON", async () => {
    prismaMock.service.findMany.mockResolvedValue([service()]);
    const { clean, rows } = await reconcileRooms();
    expect(clean).toBe(true);
    expect(rows[0]).toMatchObject({ expected: 3, actual: 3, missing: [] });
  });

  it("catches a key with no room behind it", async () => {
    // The silent failure this whole check exists for: nothing reads the
    // table yet, so a missing room produces no error until Stage 2
    // moves a read and the records go invisible.
    prismaMock.service.findMany.mockResolvedValue([
      service({ rooms: service().rooms.slice(0, 2) }),
    ]);
    const { clean, rows } = await reconcileRooms();
    expect(clean).toBe(false);
    expect(rows[0].missing).toEqual(["vc"]);
  });

  it("catches a room whose name has drifted from the JSON", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      service({
        sessionTimes: {
          bsc: { label: "Renamed", start: "06:30", end: "09:00" },
        },
      }),
    ]);
    const { clean, rows } = await reconcileRooms();
    expect(clean).toBe(false);
    expect(rows[0].drifted).toEqual(["bsc"]);
  });

  it("catches a retirement the table missed", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      service({
        sessionTimes: {
          vc: { label: "Holiday Quest", start: "07:00", end: "18:00", disabled: true },
        },
      }),
    ]);
    const { rows } = await reconcileRooms();
    expect(rows[0].drifted).toEqual(["vc"]);
  });

  it("ignores the retirement timestamp itself", async () => {
    // It's ours and has no counterpart in the JSON — comparing it would
    // report drift on every service that has ever retired a room.
    prismaMock.service.findMany.mockResolvedValue([
      service({
        sessionTimes: {
          vc: { label: "Holiday Quest", start: "07:00", end: "18:00", disabled: true },
        },
        rooms: [
          ...service().rooms.slice(0, 2),
          {
            legacyKey: "vc", name: "Holiday Quest", startTime: "07:00",
            endTime: "18:00", capacity: null, ratio: null, staffOnly: false,
            archivedAt: new Date("2020-01-01"),
          },
        ],
      }),
    ]);
    const { clean } = await reconcileRooms();
    expect(clean).toBe(true);
  });

  it("reports an orphan without failing the run", async () => {
    // An orphan is a thing to look at, not a thing that blocks Stage 1
    // — it means a room was configured and later removed, which is
    // legitimate history.
    prismaMock.service.findMany.mockResolvedValue([
      service({
        rooms: [
          ...service().rooms,
          {
            legacyKey: "extra1", name: "Old", startTime: null, endTime: null,
            capacity: null, ratio: null, staffOnly: false, archivedAt: null,
          },
        ],
      }),
    ]);
    const { clean, rows } = await reconcileRooms();
    expect(rows[0].orphaned).toEqual(["extra1"]);
    expect(clean).toBe(true);
  });
});

describe("backfillRooms", () => {
  it("walks every service and totals the work", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1", sessionTimes: null },
      { id: "svc-2", sessionTimes: null },
    ]);
    const res = await backfillRooms();
    expect(res.services).toBe(2);
    expect(res.created).toBe(6); // three core rooms each
  });

  it("is a no-op the second time", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1", sessionTimes: null },
    ]);
    prismaMock.room.findMany.mockResolvedValue([
      { id: "r-1", legacyKey: "bsc", archivedAt: null },
      { id: "r-2", legacyKey: "asc", archivedAt: null },
      { id: "r-3", legacyKey: "vc", archivedAt: null },
    ]);
    const res = await backfillRooms();
    expect(res.created).toBe(0);
    expect(res.updated).toBe(3);
  });
});
