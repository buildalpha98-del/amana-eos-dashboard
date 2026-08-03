import { describe, it, expect } from "vitest";
import {
  cardExpiresAt,
  daysUntilExpiry,
  expiryPhrase,
  isExpired,
  reminderDue,
} from "@/lib/card-expiry";

describe("cardExpiresAt", () => {
  it("treats a card as valid through the END of its expiry month", () => {
    // "05/2030" works all through May. Treating it as 1 May would tell a
    // family their card had expired while it was still working.
    expect(cardExpiresAt({ expiryMonth: "05", expiryYear: "2030" })).toEqual(
      new Date("2030-06-01T00:00:00.000Z"),
    );
  });

  it("rolls December over into the next year", () => {
    expect(cardExpiresAt({ expiryMonth: 12, expiryYear: 2029 })).toEqual(
      new Date("2030-01-01T00:00:00.000Z"),
    );
  });

  it("returns null for anything unusable", () => {
    expect(cardExpiresAt({})).toBeNull();
    expect(cardExpiresAt({ expiryMonth: "13", expiryYear: "2030" })).toBeNull();
    expect(cardExpiresAt({ expiryMonth: "05", expiryYear: "30" })).toBeNull();
    expect(cardExpiresAt({ expiryMonth: null, expiryYear: null })).toBeNull();
  });
});

describe("isExpired", () => {
  const now = new Date("2030-05-15T00:00:00.000Z");

  it("is false mid-way through the expiry month", () => {
    expect(isExpired({ expiryMonth: "05", expiryYear: "2030" }, now)).toBe(false);
  });

  it("is true once the month has passed", () => {
    expect(isExpired({ expiryMonth: "04", expiryYear: "2030" }, now)).toBe(true);
  });

  it("treats an unknown expiry as NOT expired", () => {
    // Absence of a date is not evidence the card is dead — emailing on
    // that basis would nag families whose card is fine.
    expect(isExpired({}, now)).toBe(false);
  });
});

describe("reminderDue", () => {
  const now = new Date("2030-05-01T00:00:00.000Z");

  it("sends the 30-day reminder about a month out", () => {
    // Expires 1 June → 31 days away.
    expect(reminderDue({ expiryMonth: "05", expiryYear: "2030" }, [], now)).toBe(
      "30_day",
    );
  });

  it("sends the 7-day reminder in the final week", () => {
    // Card expires end of April, i.e. valid until 1 May. Checked on
    // 27 April → 4 days left, inside the 3-10 day window.
    expect(
      reminderDue(
        { expiryMonth: "04", expiryYear: "2030" },
        [],
        new Date("2030-04-27T00:00:00.000Z"),
      ),
    ).toBe("7_day");
  });

  it("does NOT resend a reminder already sent", () => {
    expect(
      reminderDue({ expiryMonth: "05", expiryYear: "2030" }, ["30_day"], now),
    ).toBeNull();
  });

  it("chases an expired card once, then stops", () => {
    const past = { expiryMonth: "01", expiryYear: "2030" };
    expect(reminderDue(past, [], now)).toBe("expired");
    expect(reminderDue(past, ["expired"], now)).toBeNull();
  });

  it("stays silent in the gap between windows", () => {
    // ~20 days out: past the 30-day window, not yet in the 7-day one.
    // A daily job must not email every day in between.
    expect(
      reminderDue({ expiryMonth: "05", expiryYear: "2030" }, [], new Date("2030-05-12T00:00:00.000Z")),
    ).toBeNull();
  });

  it("stays silent for a card with no expiry, and for bank accounts", () => {
    expect(reminderDue({}, [], now)).toBeNull();
    expect(reminderDue({ expiryMonth: null, expiryYear: null }, [], now)).toBeNull();
  });
});

describe("daysUntilExpiry / expiryPhrase", () => {
  it("counts whole days", () => {
    expect(
      daysUntilExpiry(
        { expiryMonth: "05", expiryYear: "2030" },
        new Date("2030-05-25T00:00:00.000Z"),
      ),
    ).toBe(7);
  });

  it("phrases the urgency naturally", () => {
    expect(expiryPhrase(0)).toBe("has expired");
    expect(expiryPhrase(-5)).toBe("has expired");
    expect(expiryPhrase(1)).toBe("expires tomorrow");
    expect(expiryPhrase(7)).toBe("expires in 7 days");
    expect(expiryPhrase(30)).toBe("expires next month");
  });
});
