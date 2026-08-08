import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "@/lib/logger";
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
  it("swallows a createMany failure (logged, never thrown) — a ledger hiccup must not fail a dispatched send", async () => {
    db.marketingSendRecipient.createMany.mockRejectedValueOnce(
      new Error("db down"),
    );
    await expect(
      recordMarketingSends(db as never, [{ email: "a@b.c" }], {
        source: "campaign",
      }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

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
    const args = (db.marketingSendRecipient.createMany.mock.calls as unknown[][])[0][0] as unknown as {
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

    const args = (db.marketingSendRecipient.createMany.mock.calls as unknown[][])[0][0] as unknown as {
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
    await getFrequencyCapped(db as never, ["A@Example.com", "b@example.com"], {
      now: NOW,
    });

    expect(db.marketingSendRecipient.groupBy).toHaveBeenCalledTimes(1);
    const args = (db.marketingSendRecipient.groupBy.mock.calls as unknown[][])[0][0] as unknown as {
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
      { now: NOW },
    );

    expect(capped).toEqual(new Set(["at-cap@example.com", "over@example.com"]));
  });

  it("does not cap an email one send under the cap", async () => {
    db.marketingSendRecipient.groupBy.mockResolvedValue([
      { email: "a@example.com", _count: MARKETING_EMAIL_WEEKLY_CAP - 1 },
    ]);

    const capped = await getFrequencyCapped(db as never, ["a@example.com"], {
      now: NOW,
    });
    expect(capped.size).toBe(0);
  });

  it("returns an empty set with NO query for empty input", async () => {
    const capped = await getFrequencyCapped(db as never, [], { now: NOW });
    expect(capped.size).toBe(0);
    expect(db.marketingSendRecipient.groupBy).not.toHaveBeenCalled();
  });

  it("exports the documented constants", () => {
    expect(MARKETING_EMAIL_WEEKLY_CAP).toBe(3);
    expect(CAP_WINDOW_DAYS).toBe(7);
  });
});

describe("getFrequencyCapped — opts.cap override (org-configurable cap)", () => {
  const NOW = new Date("2026-08-08T10:00:00.000Z");

  it("caps against a custom cap (boundary: count == custom cap)", async () => {
    db.marketingSendRecipient.groupBy.mockResolvedValue([
      { email: "at-custom@example.com", _count: 5 },
      { email: "under-custom@example.com", _count: 4 },
    ]);

    const capped = await getFrequencyCapped(
      db as never,
      ["at-custom@example.com", "under-custom@example.com"],
      { cap: 5, now: NOW },
    );

    expect(capped).toEqual(new Set(["at-custom@example.com"]));
  });

  it("a custom cap ABOVE the default un-caps an email the default would block", async () => {
    db.marketingSendRecipient.groupBy.mockResolvedValue([
      { email: "a@example.com", _count: MARKETING_EMAIL_WEEKLY_CAP },
    ]);

    const capped = await getFrequencyCapped(db as never, ["a@example.com"], {
      cap: MARKETING_EMAIL_WEEKLY_CAP + 1,
      now: NOW,
    });
    expect(capped.size).toBe(0);
  });

  it("defaults to MARKETING_EMAIL_WEEKLY_CAP when opts is omitted entirely", async () => {
    db.marketingSendRecipient.groupBy.mockResolvedValue([
      { email: "a@example.com", _count: MARKETING_EMAIL_WEEKLY_CAP },
    ]);

    const capped = await getFrequencyCapped(db as never, ["a@example.com"]);
    expect(capped).toEqual(new Set(["a@example.com"]));
  });

  it("defaults the cap when opts carries only `now` (window still honoured)", async () => {
    db.marketingSendRecipient.groupBy.mockResolvedValue([
      { email: "a@example.com", _count: MARKETING_EMAIL_WEEKLY_CAP },
    ]);

    const capped = await getFrequencyCapped(db as never, ["a@example.com"], {
      now: NOW,
    });
    expect(capped).toEqual(new Set(["a@example.com"]));

    const args = (db.marketingSendRecipient.groupBy.mock.calls as unknown[][])[0][0] as unknown as {
      where: { sentAt: { gte: Date } };
    };
    expect(args.where.sentAt.gte).toEqual(
      new Date(NOW.getTime() - CAP_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    );
  });
});
