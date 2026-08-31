/**
 * Discounts on a generated invoice.
 *
 * The rule Daniel set: a discount is recorded, not applied on its own.
 * So generation reports what's available and only takes it off when
 * asked — and when it does, it does so as its own LINE, because a
 * family reading an invoice should see the full price and what came
 * off it, not a quietly smaller number.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

import { POST } from "@/app/api/billing/statements/generate/route";

const body = (extra: Record<string, unknown> = {}) => ({
  contactId: "c-1",
  serviceId: "svc-1",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-14",
  ...extra,
});

const discount = (over: Record<string, unknown> = {}) => ({
  id: "d-1",
  childId: null,
  sessionType: null,
  kind: "percent",
  value: 50,
  reason: "Staff discount",
  startDate: new Date("2026-01-01"),
  endDate: null,
  ...over,
});

function setup(discounts: unknown[] = []) {
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.centreContact.findUnique.mockResolvedValue({
    id: "c-1",
    email: "a@b.com",
    serviceId: "svc-1",
  });
  // Two $40 sessions for one child, no CCS.
  prismaMock.booking.findMany.mockResolvedValue([
    {
      id: "b1",
      childId: "kid-1",
      date: new Date("2026-06-02"),
      sessionType: "asc",
      fee: 40,
      ccsApplied: 0,
      gapFee: 40,
    },
    {
      id: "b2",
      childId: "kid-1",
      date: new Date("2026-06-09"),
      sessionType: "asc",
      fee: 40,
      ccsApplied: 0,
      gapFee: 40,
    },
  ]);
  prismaMock.child.findMany.mockResolvedValue([
    { id: "kid-1", firstName: "Amira", surname: "Khan" },
  ]);
  prismaMock.statementLineItem.findMany.mockResolvedValue([]);
  prismaMock.familyDiscount.findMany.mockResolvedValue(discounts);
  prismaMock.statement.create.mockImplementation((args: never) =>
    Promise.resolve({ id: "st-1", ...(args as { data: object }).data, lineItems: [] }),
  );
}

describe("POST /api/billing/statements/generate — discounts", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
  });

  it("does NOT apply a discount unless asked", async () => {
    setup([discount()]);
    const res = await POST(createRequest("POST", "/x", { body: body() }));
    expect(res.status).toBe(200);
    const out = await res.json();
    // Recorded, not applied — the biller decides.
    expect(out.discountsApplied).toBe(false);
    const data = prismaMock.statement.create.mock.calls[0][0].data;
    expect(data.balance).toBe(80);
    expect(data.lineItems.create).toHaveLength(2);
  });

  it("still REPORTS what's available, so the choice is offered", async () => {
    setup([discount()]);
    const out = await (
      await POST(createRequest("POST", "/x", { body: body() }))
    ).json();
    // 50% of $80.
    expect(out.availableDiscount).toBe(40);
    expect(out.discountReasons).toEqual(["Staff discount"]);
  });

  it("applies it as its own line when asked", async () => {
    setup([discount()]);
    const res = await POST(
      createRequest("POST", "/x", { body: body({ applyDiscounts: true }) }),
    );
    const out = await res.json();
    expect(out.discountsApplied).toBe(true);
    const data = prismaMock.statement.create.mock.calls[0][0].data;
    // Two sessions plus two discount lines — the family sees the full
    // price and what came off it.
    expect(data.lineItems.create).toHaveLength(4);
    expect(data.balance).toBe(40);
    // Gross stays the real price; the discount is negative gap.
    expect(data.totalFees).toBe(80);
    const discountLine = data.lineItems.create.find(
      (l: { gapAmount: number }) => l.gapAmount < 0,
    );
    expect(discountLine.description).toContain("Staff discount");
  });

  it("only discounts the child it was granted to", async () => {
    setup([discount({ childId: "kid-OTHER" })]);
    const out = await (
      await POST(
        createRequest("POST", "/x", { body: body({ applyDiscounts: true }) }),
      )
    ).json();
    expect(out.availableDiscount).toBe(0);
    const data = prismaMock.statement.create.mock.calls[0][0].data;
    expect(data.balance).toBe(80);
  });

  it("reports nothing when the family has no discounts", async () => {
    setup([]);
    const out = await (
      await POST(createRequest("POST", "/x", { body: body() }))
    ).json();
    expect(out.availableDiscount).toBe(0);
    expect(out.discountReasons).toEqual([]);
  });
});
