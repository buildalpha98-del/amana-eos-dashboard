import { describe, it, expect } from "vitest";
import {
  sessionTimesSchema,
  casualBookingSettingsSchema,
  fortnightPatternSchema,
  bookingPrefsSchema,
  roomLabel,
  roomLabelWithTimes,
  roomFees,
  formatTime,
} from "@/lib/service-settings";

// ---------------------------------------------------------------------------
// sessionTimesSchema
// ---------------------------------------------------------------------------

describe("sessionTimesSchema", () => {
  it("accepts a full blob with bsc + asc + vc start/end in HH:MM", () => {
    const parsed = sessionTimesSchema.parse({
      bsc: { start: "07:00", end: "09:00" },
      asc: { start: "15:00", end: "18:30" },
      vc: { start: "08:00", end: "18:00" },
    });
    expect(parsed.bsc?.start).toBe("07:00");
    expect(parsed.asc?.end).toBe("18:30");
    expect(parsed.vc?.start).toBe("08:00");
  });

  it("accepts a partial blob with only one session populated", () => {
    const parsed = sessionTimesSchema.parse({
      asc: { start: "15:00", end: "18:00" },
    });
    expect(parsed.asc?.end).toBe("18:00");
    expect(parsed.bsc).toBeUndefined();
    expect(parsed.vc).toBeUndefined();
  });

  it("accepts an empty object (all sessions optional)", () => {
    const parsed = sessionTimesSchema.parse({});
    expect(parsed).toEqual({});
  });

  it("rejects a non-HH:MM time string like '9:00'", () => {
    expect(() =>
      sessionTimesSchema.parse({
        bsc: { start: "9:00", end: "09:00" },
      }),
    ).toThrow();
  });

  it("rejects a free-text time like '7am'", () => {
    expect(() =>
      sessionTimesSchema.parse({
        asc: { start: "7am", end: "6pm" },
      }),
    ).toThrow();
  });

  it("rejects a missing end field", () => {
    expect(() =>
      sessionTimesSchema.parse({
        bsc: { start: "07:00" } as unknown,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// casualBookingSettingsSchema
// ---------------------------------------------------------------------------

describe("casualBookingSettingsSchema", () => {
  it("accepts a full blob with all 3 session settings", () => {
    const blob = {
      bsc: {
        enabled: true,
        fee: 35,
        spots: 10,
        cutOffHours: 24,
        days: ["mon", "tue", "wed", "thu", "fri"] as const,
      },
      asc: {
        enabled: true,
        fee: 45,
        spots: 15,
        cutOffHours: 12,
        days: ["mon", "wed", "fri"] as const,
      },
      vc: {
        enabled: false,
        fee: 95,
        spots: 20,
        cutOffHours: 48,
        days: ["mon", "tue", "wed", "thu", "fri"] as const,
      },
    };
    const parsed = casualBookingSettingsSchema.parse(blob);
    expect(parsed.bsc?.enabled).toBe(true);
    expect(parsed.asc?.fee).toBe(45);
    expect(parsed.vc?.enabled).toBe(false);
    expect(parsed.bsc?.days).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });

  it("accepts a partial blob (e.g. only ASC enabled)", () => {
    const parsed = casualBookingSettingsSchema.parse({
      asc: {
        enabled: true,
        fee: 45,
        spots: 15,
        cutOffHours: 12,
        days: ["mon", "wed"],
      },
    });
    expect(parsed.asc?.enabled).toBe(true);
    expect(parsed.bsc).toBeUndefined();
    expect(parsed.vc).toBeUndefined();
  });

  it("rejects a negative fee", () => {
    expect(() =>
      casualBookingSettingsSchema.parse({
        asc: {
          enabled: true,
          fee: -5,
          spots: 15,
          cutOffHours: 12,
          days: ["mon"],
        },
      }),
    ).toThrow();
  });

  it("rejects a non-integer spots value", () => {
    expect(() =>
      casualBookingSettingsSchema.parse({
        asc: {
          enabled: true,
          fee: 45,
          spots: 1.5,
          cutOffHours: 12,
          days: ["mon"],
        },
      }),
    ).toThrow();
  });

  it("rejects an unknown day abbreviation", () => {
    expect(() =>
      casualBookingSettingsSchema.parse({
        asc: {
          enabled: true,
          fee: 45,
          spots: 15,
          cutOffHours: 12,
          days: ["monday"],
        },
      }),
    ).toThrow();
  });

  it("rejects a negative cutOffHours", () => {
    expect(() =>
      casualBookingSettingsSchema.parse({
        asc: {
          enabled: true,
          fee: 45,
          spots: 15,
          cutOffHours: -1,
          days: ["mon"],
        },
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// fortnightPatternSchema
// ---------------------------------------------------------------------------

describe("fortnightPatternSchema", () => {
  it("accepts a week1/week2 blob with per-session-type day arrays", () => {
    const parsed = fortnightPatternSchema.parse({
      week1: {
        bsc: ["mon", "wed", "fri"],
        asc: ["mon", "tue", "wed", "thu", "fri"],
      },
      week2: {
        bsc: ["tue", "thu"],
        asc: ["mon", "wed", "fri"],
        vc: ["mon"],
      },
    });
    expect(parsed.week1.bsc).toEqual(["mon", "wed", "fri"]);
    expect(parsed.week2.vc).toEqual(["mon"]);
  });

  it("accepts week1/week2 with empty per-session objects", () => {
    const parsed = fortnightPatternSchema.parse({
      week1: {},
      week2: {},
    });
    expect(parsed.week1).toEqual({});
    expect(parsed.week2).toEqual({});
  });

  it("rejects when week1 is missing", () => {
    expect(() =>
      fortnightPatternSchema.parse({
        week2: { asc: ["mon"] },
      }),
    ).toThrow();
  });

  it("rejects an invalid day abbreviation inside week1", () => {
    expect(() =>
      fortnightPatternSchema.parse({
        week1: { bsc: ["monday"] },
        week2: {},
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// bookingPrefsSchema (passthrough for legacy keys)
// ---------------------------------------------------------------------------

describe("bookingPrefsSchema", () => {
  it("accepts a blob containing fortnightPattern", () => {
    const parsed = bookingPrefsSchema.parse({
      fortnightPattern: {
        week1: { asc: ["mon", "wed", "fri"] },
        week2: { asc: ["tue", "thu"] },
      },
    });
    expect(parsed.fortnightPattern?.week1.asc).toEqual([
      "mon",
      "wed",
      "fri",
    ]);
  });

  it("passes unknown legacy keys through untouched", () => {
    const parsed = bookingPrefsSchema.parse({
      fortnightPattern: {
        week1: { asc: ["mon"] },
        week2: { asc: ["tue"] },
      },
      legacySessionType: "asc",
      legacyDays: ["mon", "wed"],
      legacyBookingType: "permanent",
    });
    expect((parsed as Record<string, unknown>).legacySessionType).toBe("asc");
    expect((parsed as Record<string, unknown>).legacyDays).toEqual([
      "mon",
      "wed",
    ]);
    expect((parsed as Record<string, unknown>).legacyBookingType).toBe(
      "permanent",
    );
  });

  it("accepts an empty object (fortnightPattern optional)", () => {
    const parsed = bookingPrefsSchema.parse({});
    expect(parsed.fortnightPattern).toBeUndefined();
  });

  it("rejects a malformed fortnightPattern", () => {
    expect(() =>
      bookingPrefsSchema.parse({
        fortnightPattern: {
          week1: { asc: ["monday"] },
          week2: {},
        },
      }),
    ).toThrow();
  });
});

describe("rooms — labels, times and fees", () => {
  it("falls back to Amana's own room names when a service hasn't set one", () => {
    // Nobody here says "BSC". An unconfigured centre should still read
    // the way staff and parents speak.
    expect(roomLabel(null, "bsc")).toBe("Rise and Shine");
    expect(roomLabel(null, "asc")).toBe("Amana Afternoons");
    expect(roomLabel({ bsc: { start: "06:30", end: "09:00" } }, "bsc")).toBe(
      "Rise and Shine",
    );
  });

  it("uses the service's own name when set", () => {
    expect(
      roomLabel(
        { bsc: { label: "Sunrise Club", start: "06:30", end: "09:00" } },
        "bsc",
      ),
    ).toBe("Sunrise Club");
  });

  it("formats times the way a parent reads them", () => {
    expect(formatTime("06:30")).toBe("6:30am");
    expect(formatTime("15:00")).toBe("3:00pm");
    expect(formatTime("00:15")).toBe("12:15am");
    expect(formatTime("12:00")).toBe("12:00pm");
    // Blank input must not become "NaN:NaNam" on a booking form.
    expect(formatTime(null)).toBe("");
    expect(formatTime("nonsense")).toBe("");
  });

  it("renders the label parents see on the booking form", () => {
    expect(
      roomLabelWithTimes(
        { asc: { start: "15:00", end: "18:30" } },
        "asc",
      ),
    ).toBe("Amana Afternoons (3:00pm – 6:30pm)");
    // Unconfigured still reads properly, using the defaults.
    expect(roomLabelWithTimes(null, "bsc")).toBe(
      "Rise and Shine (6:30am – 9:00am)",
    );
  });

  it("accepts several fees on one room, each with its own window", () => {
    // A full session and a short session are the same room at different
    // hours — that's why a fee carries times, not just a number.
    const parsed = sessionTimesSchema.safeParse({
      bsc: {
        label: "Rise and Shine",
        start: "06:30",
        end: "09:00",
        fees: [
          { id: "fee-1", name: "Full session", amountCents: 2800 },
          {
            id: "fee-2",
            name: "Short session",
            start: "07:30",
            end: "09:00",
            amountCents: 2000,
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("returns fees cheapest first", () => {
    const fees = roomFees(
      {
        asc: {
          start: "15:00",
          end: "18:30",
          fees: [
            { id: "a", name: "Full", amountCents: 3400 },
            { id: "b", name: "Short", amountCents: 2200 },
          ],
        },
      },
      "asc",
    );
    expect(fees.map((f) => f.name)).toEqual(["Short", "Full"]);
  });

  it("rejects a fee in dollars rather than cents", () => {
    // 28.5 as a float here would round its way into an invoice.
    const parsed = sessionTimesSchema.safeParse({
      bsc: {
        start: "06:30",
        end: "09:00",
        fees: [{ id: "f", name: "Full", amountCents: 28.5 }],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("still accepts the old shape, which had no label or fees", () => {
    const parsed = sessionTimesSchema.safeParse({
      bsc: { start: "06:30", end: "08:45" },
      asc: { start: "15:00", end: "18:00" },
    });
    expect(parsed.success).toBe(true);
  });
});
