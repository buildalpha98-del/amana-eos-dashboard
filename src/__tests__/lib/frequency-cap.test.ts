import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MARKETING_EMAIL_WEEKLY_CAP,
  CAP_WINDOW_DAYS,
  recordMarketingSends,
  getFrequencyCapped,
} from "@/lib/frequency-cap";

/**
 * The lib takes its db handle as a parameter (no prisma singleton import),
 * so tests drive a minimal structural mock directly.
 */
function makeDb() {
  return {
    marketingSendRecipient: {
      createMany: vi.fn(async () => ({ count: 0 })),
      groupBy: vi.fn(async () => [] as Array<{ email: string; _count: number }>),
    },
  };
}

let db: ReturnType<typeof makeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  db = makeDb();
});

describe("recordMarketingSends", () => {
  it("lowercases emails and writes a SINGLE createMany with source + deliveryLogId", async () => {
    await recordMarketingSends(
      db as never,
      [
        { email: "Parent.A@Example.COM", contactId: "c-1" },
        { email: "b@example.com" },
      ],
      { deliveryLogId: "dl-1", source: "campaign" },
    );

    expect(db.marketingSendRecipient.createMany).toHaveBeenCalledTimes(1);
    const args = db.marketingSendRecipient.createMany.mock.calls[0][0] as unknown as {
      data: Array<Record<string, unknown>>;
    };
    expect(args.data).toEqual([
      {
        email: "parent.a@example.com",
        contactId: "c-1",
        deliveryLogId: "dl-1",
        source: "campaign",
      },
      {
        email: "b@example.com",
        contactId: null,
        deliveryLogId: "dl-1",
        source: "campaign",
      },
    ]);
  });

  it("supports meta without a deliveryLogId (nurture path)", async () => {
    await recordMarketingSends(
      db as never,
      [{ email: "A@b.co", contactId: "c-9" }],
      { source: "nurture" },
    );

    const args = db.marketingSendRecipient.createMany.mock.calls[0][0] as unknown as {
      data: Array<Record<string, unknown>>;
    };
    expect(args.data).toEqual([
      { email: "a@b.co", contactId: "c-9", deliveryLogId: null, source: "nurture" },
    ]);
  });

  it("is a no-op (no query) for empty input", async () => {
    await recordMarketingSends(db as never, [], { source: "cowork" });
    expect(db.marketingSendRecipient.createMany).not.toHaveBeenCalled();
  });
});

describe("getFrequencyCapped", () => {
  const NOW = new Date("2026-08-08T10:00:00.000Z");

  it("issues exactly ONE groupBy over the lowercased emails within the rolling window", async () => {
    await getFrequencyCapped(db as never, ["A@Example.com", "b@example.com"], NOW);

    expect(db.marketingSendRecipient.groupBy).toHaveBeenCalledTimes(1);
    const args = db.marketingSendRecipient.groupBy.mock.calls[0][0] as unknown as {
      by: string[];
      where: { email: { in: string[] }; sentAt: { gte: Date } };
      _count: boolean;
    };
    expect(args.by).toEqual(["email"]);
    expect(args.where.email.in).toEqual(["a@example.com", "b@example.com"]);
    expect(args.where.sentAt.gte).toEqual(
      new Date(NOW.getTime() - CAP_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    );
    expect(args._count).toBe(true);
  });

  it("returns the lowercased set of emails AT or above the cap (boundary: count == cap)", async () => {
    db.marketingSendRecipient.groupBy.mockResolvedValue([
      { email: "at-cap@example.com", _count: MARKETING_EMAIL_WEEKLY_CAP },
      { email: "over@example.com", _count: MARKETING_EMAIL_WEEKLY_CAP + 2 },
      { email: "under@example.com", _count: MARKETING_EMAIL_WEEKLY_CAP - 1 },
    ]);

    const capped = await getFrequencyCapped(
      db as never,
      ["At-Cap@Example.com", "over@example.com", "under@example.com"],
      NOW,
    );

    expect(capped).toEqual(new Set(["at-cap@example.com", "over@example.com"]));
  });

  it("does not cap an email one send under the cap", async () => {
    db.marketingSendRecipient.groupBy.mockResolvedValue([
      { email: "a@example.com", _count: MARKETING_EMAIL_WEEKLY_CAP - 1 },
    ]);

    const capped = await getFrequencyCapped(db as never, ["a@example.com"], NOW);
    expect(capped.size).toBe(0);
  });

  it("returns an empty set with NO query for empty input", async () => {
    const capped = await getFrequencyCapped(db as never, [], NOW);
    expect(capped.size).toBe(0);
    expect(db.marketingSendRecipient.groupBy).not.toHaveBeenCalled();
  });

  it("exports the documented constants", () => {
    expect(MARKETING_EMAIL_WEEKLY_CAP).toBe(3);
    expect(CAP_WINDOW_DAYS).toBe(7);
  });
});
