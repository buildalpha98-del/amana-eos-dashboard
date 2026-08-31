/**
 * What a service's rooms SHOULD be, given its JSON.
 *
 * This is the whole of Stage 0's correctness: the shadow table is only
 * as good as this derivation, and nothing reads it yet to catch a
 * mistake. The cases that matter are the ones where a room exists but
 * the JSON doesn't obviously say so — an unconfigured core programme, a
 * retired room, an extra slot whose name was cleared after it had
 * bookings.
 */
import { describe, it, expect } from "vitest";
import { desiredRooms, roomKeys } from "@/lib/rooms-mapping";
import type { SessionTimes } from "@/lib/service-settings";

describe("roomKeys", () => {
  it("gives the three core programmes even for an empty service", () => {
    // Absence from the JSON means "not customised", not "doesn't exist".
    // Every centre runs before school, after school and vacation care.
    expect(roomKeys(null)).toEqual(["bsc", "asc", "vc"]);
    expect(roomKeys({})).toEqual(["bsc", "asc", "vc"]);
  });

  it("includes an extra slot that has been configured", () => {
    const st: SessionTimes = {
      extra1: { label: "Homework Club", start: "15:00", end: "17:00" },
    };
    expect(roomKeys(st)).toContain("extra1");
  });

  it("keeps a configured extra whose label was later cleared", () => {
    // This is the case that would strand records. `activeSessionKeys`
    // drops it — correctly, since an unnamed slot shouldn't appear on a
    // booking form — but bookings may already reference the key, and
    // they need a room to belong to.
    const st = {
      extra2: { label: "", start: "15:00", end: "17:00" },
    } as SessionTimes;
    expect(roomKeys(st)).toContain("extra2");
  });

  it("keeps a disabled room", () => {
    // Retired, not deleted. Its historical attendance still points here.
    const st: SessionTimes = {
      extra1: { label: "Old Room", start: "15:00", end: "17:00", disabled: true },
    };
    expect(roomKeys(st)).toContain("extra1");
  });

  it("leaves untouched extra slots out", () => {
    expect(roomKeys({})).not.toContain("extra1");
  });
});

describe("desiredRooms — names", () => {
  it("uses the centre's label", () => {
    const st: SessionTimes = {
      asc: { label: "Sunset Club", start: "15:00", end: "18:30" },
    };
    expect(desiredRooms(st).find((r) => r.legacyKey === "asc")?.name).toBe(
      "Sunset Club",
    );
  });

  it("falls back to the Amana default for an unconfigured core room", () => {
    // Staff say "Rise and Shine", never "BSC".
    expect(desiredRooms(null).find((r) => r.legacyKey === "bsc")?.name).toBe(
      "Rise and Shine",
    );
  });

  it("never produces a nameless room", () => {
    // An unnamed extra reads as its slot code, which looks unfinished —
    // better than a blank row nobody can identify.
    const st = { extra3: { label: "", start: "", end: "" } } as SessionTimes;
    const room = desiredRooms(st).find((r) => r.legacyKey === "extra3");
    expect(room?.name).toBe("extra3");
  });
});

describe("desiredRooms — hours", () => {
  it("carries the configured times", () => {
    const st: SessionTimes = {
      bsc: { label: "Early", start: "06:00", end: "08:45" },
    };
    const room = desiredRooms(st).find((r) => r.legacyKey === "bsc");
    expect(room?.startTime).toBe("06:00");
    expect(room?.endTime).toBe("08:45");
  });

  it("uses the default hours for an unconfigured core room", () => {
    const room = desiredRooms(null).find((r) => r.legacyKey === "vc");
    expect(room?.startTime).toBe("07:00");
    expect(room?.endTime).toBe("18:00");
  });

  it("leaves an extra slot's hours null rather than empty strings", () => {
    // "" would read as a configured value; null says "not set".
    const st = { extra1: { label: "New", start: "", end: "" } } as SessionTimes;
    const room = desiredRooms(st).find((r) => r.legacyKey === "extra1");
    expect(room?.startTime).toBeNull();
    expect(room?.endTime).toBeNull();
  });
});

describe("desiredRooms — the rest of the definition", () => {
  const st: SessionTimes = {
    asc: {
      label: "Afternoons",
      start: "15:00",
      end: "18:30",
      capacity: 45,
      ratio: "1:15",
      description: "Main hall",
      minAgeYears: 5,
      maxAgeYears: 12,
      staffOnly: true,
    },
  };

  it("carries the photo across to the room record", () => {
    const withPhoto: SessionTimes = {
      asc: {
        label: "Afternoons",
        start: "15:00",
        end: "18:30",
        photoUrl: "https://abc.public.blob.vercel-storage.com/room.jpg",
      },
    };
    const room = desiredRooms(withPhoto).find((r) => r.legacyKey === "asc");
    expect(room?.photoUrl).toBe(
      "https://abc.public.blob.vercel-storage.com/room.jpg",
    );
  });

  it("leaves the photo null when there isn't one", () => {
    expect(desiredRooms(null)[0].photoUrl).toBeNull();
  });

  it("carries capacity, ratio, description and age range", () => {
    const room = desiredRooms(st).find((r) => r.legacyKey === "asc");
    expect(room).toMatchObject({
      capacity: 45,
      ratio: "1:15",
      description: "Main hall",
      minAgeYears: 5,
      maxAgeYears: 12,
      staffOnly: true,
    });
  });

  it("leaves unset optionals null, not zero", () => {
    // A room with no capacity set is unlimited-by-service-default, not
    // a room that holds nobody.
    const room = desiredRooms(null).find((r) => r.legacyKey === "asc");
    expect(room?.capacity).toBeNull();
    expect(room?.ratio).toBeNull();
    expect(room?.minAgeYears).toBeNull();
  });

  it("defaults staffOnly to false rather than undefined", () => {
    expect(desiredRooms(null)[0].staffOnly).toBe(false);
  });

  it("reports disabled so the caller can date the retirement", () => {
    const disabled: SessionTimes = {
      vc: { label: "Holidays", start: "07:00", end: "18:00", disabled: true },
    };
    const room = desiredRooms(disabled).find((r) => r.legacyKey === "vc");
    expect(room?.disabled).toBe(true);
    // The mapping stays pure — it reports the state, it doesn't invent
    // a timestamp for it.
    expect(room).not.toHaveProperty("archivedAt");
  });
});

describe("desiredRooms — ordering and stability", () => {
  it("orders core programmes first, then extras", () => {
    const st: SessionTimes = {
      extra1: { label: "Homework", start: "15:00", end: "17:00" },
    };
    expect(desiredRooms(st).map((r) => r.legacyKey)).toEqual([
      "bsc",
      "asc",
      "vc",
      "extra1",
    ]);
  });

  it("numbers sortOrder by position", () => {
    const st: SessionTimes = {
      extra2: { label: "Club", start: "15:00", end: "17:00" },
    };
    expect(desiredRooms(st).map((r) => r.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it("is a pure function of the JSON", () => {
    // What makes the sync idempotent and the reconciliation meaningful:
    // same input, same rooms, no clock and no randomness in the answer.
    const st: SessionTimes = {
      bsc: { label: "Early", start: "06:30", end: "09:00" },
    };
    expect(desiredRooms(st)).toEqual(desiredRooms(st));
  });

  it("gives exactly three rooms for a brand-new service", () => {
    expect(desiredRooms(null)).toHaveLength(3);
  });
});
