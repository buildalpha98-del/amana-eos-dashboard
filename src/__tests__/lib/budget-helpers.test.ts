import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

// Must import AFTER the prisma mock is registered
import {
  recalcFinancialsForWeek,
  getMonthlyBudget,
} from "@/lib/budget-helpers";

// ── Helpers ─────────────────────────────────────────────────

/** Returns Monday 00:00 for the week containing the given date. */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── getMonthlyBudget ────────────────────────────────────────

describe("getMonthlyBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns override when service has monthlyPurchaseBudget", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      monthlyPurchaseBudget: 500,
    });

    const result = await getMonthlyBudget("svc-1");

    expect(result).toEqual({ amount: 500, source: "override" });
    expect(prismaMock.service.findUnique).toHaveBeenCalledWith({
      where: { id: "svc-1" },
      select: { monthlyPurchaseBudget: true },
    });
    // Should NOT query orgSettings or attendance when override exists
    expect(prismaMock.orgSettings.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.dailyAttendance.aggregate).not.toHaveBeenCalled();
  });

  it("calculates tier from attendance data", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      monthlyPurchaseBudget: null,
    });
    prismaMock.orgSettings.findUnique.mockResolvedValue({
      purchaseBudgetTiers: [
        { minWeeklyChildren: 50, monthlyBudget: 200 },
        { minWeeklyChildren: 0, monthlyBudget: 100 },
      ],
    });
    // totalAttended = 240, avgWeekly = 240/4 = 60 -> matches 50+ tier
    prismaMock.dailyAttendance.aggregate.mockResolvedValue({
      _sum: { attended: 240 },
    });

    const result = await getMonthlyBudget("svc-2");

    expect(result).toEqual({
      amount: 200,
      source: "tier",
      tierLabel: "50+ children — $200/mo",
    });
  });

  it("returns highest matching tier when multiple tiers qualify", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      monthlyPurchaseBudget: null,
    });
    prismaMock.orgSettings.findUnique.mockResolvedValue({
      purchaseBudgetTiers: [
        { minWeeklyChildren: 0, monthlyBudget: 100 },
        { minWeeklyChildren: 50, monthlyBudget: 200 },
        { minWeeklyChildren: 100, monthlyBudget: 350 },
      ],
    });
    // totalAttended = 600, avgWeekly = 150 -> matches 100+ (highest)
    prismaMock.dailyAttendance.aggregate.mockResolvedValue({
      _sum: { attended: 600 },
    });

    const result = await getMonthlyBudget("svc-3");

    expect(result).toEqual({
      amount: 350,
      source: "tier",
      tierLabel: "100+ children — $350/mo",
    });
  });

  it("falls back to $150 when no tiers defined and orgSettings is null", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      monthlyPurchaseBudget: null,
    });
    // orgSettings returns null -> uses default tiers
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    // avgWeekly = 0, matches default tier { minWeeklyChildren: 0, monthlyBudget: 150 }
    prismaMock.dailyAttendance.aggregate.mockResolvedValue({
      _sum: { attended: null },
    });

    const result = await getMonthlyBudget("svc-4");

    expect(result.amount).toBe(150);
    expect(result.source).toBe("tier");
  });

  it("uses $150 when no attendance data (avgWeekly = 0)", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      monthlyPurchaseBudget: null,
    });
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    prismaMock.dailyAttendance.aggregate.mockResolvedValue({
      _sum: { attended: 0 },
    });

    const result = await getMonthlyBudget("svc-5");

    // Default tiers: [{ minWeeklyChildren: 100, monthlyBudget: 300 }, { minWeeklyChildren: 0, monthlyBudget: 150 }]
    // avgWeekly = 0, matches { minWeeklyChildren: 0 } tier
    expect(result.amount).toBe(150);
    expect(result.source).toBe("tier");
    expect(result.tierLabel).toBe("0+ children — $150/mo");
  });

  it("with empty OrgSettings tiers array falls back to $150", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      monthlyPurchaseBudget: null,
    });
    prismaMock.orgSettings.findUnique.mockResolvedValue({
      purchaseBudgetTiers: [],
    });
    prismaMock.dailyAttendance.aggregate.mockResolvedValue({
      _sum: { attended: 200 },
    });

    const result = await getMonthlyBudget("svc-6");

    // Empty array is falsy-ish but not null — code does `|| [defaults]` only on null/undefined
    // Empty array is truthy, so tiers = []. sortedTiers = []. Loop matches nothing.
    // Fallback: sortedTiers[last] is undefined -> fallback?.monthlyBudget ?? 150
    expect(result.amount).toBe(150);
    expect(result.source).toBe("tier");
    expect(result.tierLabel).toBe("$150/mo (base tier)");
  });
});

// ── recalcFinancialsForWeek ─────────────────────────────────

describe("recalcFinancialsForWeek", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates budget items and upserts FinancialPeriod", async () => {
    prismaMock.budgetItem.aggregate.mockResolvedValue({
      _sum: { amount: 425.5 },
    });
    prismaMock.financialPeriod.upsert.mockResolvedValue({});

    // Wednesday 2026-03-18 -> weekStart = Monday 2026-03-16
    const inputDate = new Date("2026-03-18T10:00:00Z");
    await recalcFinancialsForWeek("svc-1", inputDate);

    const expectedWeekStart = mondayOf(inputDate);
    const expectedWeekEnd = new Date(expectedWeekStart.getTime() + 7 * 86400000);

    // Verify aggregate query covers the correct week
    expect(prismaMock.budgetItem.aggregate).toHaveBeenCalledWith({
      where: {
        serviceId: "svc-1",
        date: { gte: expectedWeekStart, lt: expectedWeekEnd },
      },
      _sum: { amount: true },
    });

    // Verify upsert with correct compound key and amounts
    expect(prismaMock.financialPeriod.upsert).toHaveBeenCalledWith({
      where: {
        serviceId_periodType_periodStart: {
          serviceId: "svc-1",
          periodType: "weekly",
          periodStart: expectedWeekStart,
        },
      },
      update: {
        suppliesCosts: 425.5,
      },
      create: {
        serviceId: "svc-1",
        periodType: "weekly",
        periodStart: expectedWeekStart,
        periodEnd: expectedWeekEnd,
        suppliesCosts: 425.5,
      },
    });
  });

  it("with zero budget items upserts suppliesCosts as 0", async () => {
    prismaMock.budgetItem.aggregate.mockResolvedValue({
      _sum: { amount: null },
    });
    prismaMock.financialPeriod.upsert.mockResolvedValue({});

    const inputDate = new Date("2026-03-16T00:00:00Z"); // already a Monday
    await recalcFinancialsForWeek("svc-2", inputDate);

    // When _sum.amount is null (no rows), totalSpend should be 0
    const upsertCall = prismaMock.financialPeriod.upsert.mock.calls[0][0];
    expect(upsertCall.update.suppliesCosts).toBe(0);
    expect(upsertCall.create.suppliesCosts).toBe(0);
  });
});
